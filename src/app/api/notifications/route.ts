import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { daysUntil } from "@/lib/format"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export interface SystemNotification {
  id: string
  type: "out_of_stock" | "low_stock" | "expired" | "expiring_soon" | "cash_closed" | "credit_overdue"
  severity: "critical" | "warning" | "info"
  title: string
  description: string
  targetView: "products" | "cash" | "credit"
  count?: number
  timestamp: string
}

export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    const { branchId } = branchAccess

    const branchFilter = branchId ? { branchId } : {}

    const now = new Date()

    const [products, openSession, creditAccounts] = await Promise.all([
      db.product.findMany({
        where: { active: true, ...branchFilter },
        select: {
          id: true,
          name: true,
          stock: true,
          minStock: true,
          unit: true,
          expirationDate: true,
        },
      }),
      db.cashSession.findFirst({
        where: { status: "abierta", ...branchFilter },
      }),
      db.creditAccount.findMany({
        where: {
          active: true,
          balance: { gt: 0 },
          ...(branchId ? { client: { branchId } } : {}),
        },
        include: {
          client: {
            select: { name: true },
          },
        },
      }),
    ])

    const notifications: SystemNotification[] = []

    // 1. Productos agotados (Stock 0 o negativo)
    const outOfStock = products.filter((p) => p.stock <= 0)
    if (outOfStock.length > 0) {
      notifications.push({
        id: "out-of-stock-summary",
        type: "out_of_stock",
        severity: "critical",
        title: `${outOfStock.length} ${outOfStock.length === 1 ? "producto agotado" : "productos agotados"}`,
        description:
          outOfStock.length === 1
            ? `"${outOfStock[0].name}" no tiene unidades disponibles.`
            : `Ej: "${outOfStock[0].name}" y ${outOfStock.length - 1} más sin unidades.`,
        targetView: "products",
        count: outOfStock.length,
        timestamp: now.toISOString(),
      })
    }

    // 2. Productos con stock bajo (Stock <= minStock y > 0)
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.minStock)
    if (lowStock.length > 0) {
      notifications.push({
        id: "low-stock-summary",
        type: "low_stock",
        severity: "warning",
        title: `${lowStock.length} ${lowStock.length === 1 ? "producto con stock bajo" : "productos con stock bajo"}`,
        description:
          lowStock.length === 1
            ? `"${lowStock[0].name}" tiene ${lowStock[0].stock} ${lowStock[0].unit}(s) (mínimo ${lowStock[0].minStock}).`
            : `Ej: "${lowStock[0].name}" (${lowStock[0].stock} de ${lowStock[0].minStock} mín.) y otros.`,
        targetView: "products",
        count: lowStock.length,
        timestamp: now.toISOString(),
      })
    }

    // 3. Productos vencidos
    const expired = products.filter((p) => {
      const d = daysUntil(p.expirationDate)
      return d !== null && d < 0
    })
    if (expired.length > 0) {
      notifications.push({
        id: "expired-summary",
        type: "expired",
        severity: "critical",
        title: `${expired.length} ${expired.length === 1 ? "producto vencido" : "productos vencidos"}`,
        description:
          expired.length === 1
            ? `"${expired[0].name}" ya venció. Retíralo del inventario para evitar ventas no permitidas.`
            : `Hay ${expired.length} productos vencidos listos para descarte o devolución.`,
        targetView: "products",
        count: expired.length,
        timestamp: now.toISOString(),
      })
    }

    // 4. Productos por vencer en los próximos 30 días
    const expiringSoon = products.filter((p) => {
      const d = daysUntil(p.expirationDate)
      return d !== null && d >= 0 && d <= 30
    })
    if (expiringSoon.length > 0) {
      notifications.push({
        id: "expiring-soon-summary",
        type: "expiring_soon",
        severity: "warning",
        title: `${expiringSoon.length} ${expiringSoon.length === 1 ? "producto por vencer" : "productos por vencer"}`,
        description:
          expiringSoon.length === 1
            ? `"${expiringSoon[0].name}" vence pronto. Considera promocionarlo.`
            : `${expiringSoon.length} productos vencen en menos de 30 días.`,
        targetView: "products",
        count: expiringSoon.length,
        timestamp: now.toISOString(),
      })
    }

    // 5. Caja cerrada durante operación
    if (!openSession) {
      notifications.push({
        id: "cash-closed",
        type: "cash_closed",
        severity: "info",
        title: "Caja registradora cerrada",
        description: "No hay una sesión de caja abierta en esta sede. Abre caja para registrar transacciones y arqueos.",
        targetView: "cash",
        timestamp: now.toISOString(),
      })
    }

    // 6. Cuentas por cobrar activas (Deudas pendientes de clientes)
    if (creditAccounts.length > 0) {
      const totalDebt = creditAccounts.reduce((acc, a) => acc + a.balance, 0)
      notifications.push({
        id: "credit-summary",
        type: "credit_overdue",
        severity: "info",
        title: `${creditAccounts.length} ${creditAccounts.length === 1 ? "cliente con saldo pendiente" : "clientes con saldo pendiente"}`,
        description: `Total de cartera pendiente por cobrar: $${totalDebt.toLocaleString("es-CO")}.`,
        targetView: "credit",
        count: creditAccounts.length,
        timestamp: now.toISOString(),
      })
    }

    return NextResponse.json({
      ok: true,
      notifications,
      count: notifications.length,
      criticalCount: notifications.filter((n) => n.severity === "critical").length,
      warningCount: notifications.filter((n) => n.severity === "warning").length,
      infoCount: notifications.filter((n) => n.severity === "info").length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Error al cargar notificaciones: " + (error as Error).message },
      { status: 500 }
    )
  }
}
