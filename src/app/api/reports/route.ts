import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { daysUntil } from "@/lib/format"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

// Reportes y analítica del sistema POS de droguería.
// GET /api/reports?range=7|30|90 (días, por defecto 30)
export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    const { branchId } = branchAccess

    const { searchParams } = new URL(req.url)
    const rawRange = Number(searchParams.get("range") ?? 30)
    const days = [7, 30, 90].includes(rawRange) ? rawRange : 30
    const branchFilter = branchId ? { branchId } : {}

    // Ventana de tiempo: desde hace (days-1) días a las 00:00 hasta hoy 23:59:59
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    start.setHours(0, 0, 0, 0)

    // Cargamos todo lo necesario en paralelo
    const [sales, saleItems, purchases, transactions, products] = await Promise.all([
      db.sale.findMany({
        where: { createdAt: { gte: start, lte: end }, status: "completada", ...branchFilter },
        include: { client: true },
      }),
      db.saleItem.findMany({
        where: { sale: { createdAt: { gte: start, lte: end }, status: "completada", ...branchFilter } },
        include: { product: { include: { category: true } } },
      }),
      db.purchase.findMany({
        where: { createdAt: { gte: start, lte: end }, ...branchFilter },
      }),
      db.transaction.findMany({
        where: { date: { gte: start, lte: end }, ...branchFilter },
      }),
      db.product.findMany({ where: branchFilter }),
    ])

    // ---------- KPIs principales ----------
    const totalSales = sales.reduce((s, x) => s + x.total, 0)
    const salesCount = sales.length
    const avgTicket = salesCount > 0 ? totalSales / salesCount : 0
    const totalProfit = saleItems.reduce(
      (s, it) => s + (it.unitPrice - it.unitCost) * it.quantity,
      0
    )
    const totalPurchases = purchases.reduce((s, p) => s + p.total, 0)
    const totalIncome = transactions
      .filter((t) => t.type === "ingreso")
      .reduce((s, t) => s + t.amount, 0)
    const totalExpenses = transactions
      .filter((t) => t.type === "egreso")
      .reduce((s, t) => s + t.amount, 0)

    // ---------- Ventas por día / semana ----------
    const salesByDay: { date: string; total: number; count: number }[] = []
    if (days === 7) {
      // Diario para 7 días
      for (let i = 6; i >= 0; i--) {
        const dStart = new Date()
        dStart.setHours(0, 0, 0, 0)
        dStart.setDate(dStart.getDate() - i)
        const dEnd = new Date(dStart)
        dEnd.setDate(dEnd.getDate() + 1)
        const daySales = sales.filter((s) => {
          const created = new Date(s.createdAt)
          return created >= dStart && created < dEnd
        })
        salesByDay.push({
          date: dStart.toLocaleDateString("es-CO", {
            weekday: "short",
            day: "2-digit",
          }),
          total: daySales.reduce((sum, x) => sum + x.total, 0),
          count: daySales.length,
        })
      }
    } else {
      // Buckets semanales para 30 / 90 días
      const weeks = Math.ceil(days / 7)
      for (let w = weeks - 1; w >= 0; w--) {
        const wEnd = new Date()
        wEnd.setHours(23, 59, 59, 999)
        wEnd.setDate(wEnd.getDate() - w * 7)
        const wStart = new Date(wEnd)
        wStart.setDate(wStart.getDate() - 6)
        wStart.setHours(0, 0, 0, 0)
        // No retroceder más allá del inicio del rango
        if (wStart < start) wStart.setTime(start.getTime())
        const wSales = sales.filter((s) => {
          const created = new Date(s.createdAt)
          return created >= wStart && created <= wEnd
        })
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
        salesByDay.push({
          date: `${fmt(wStart)}-${fmt(wEnd)}`,
          total: wSales.reduce((sum, x) => sum + x.total, 0),
          count: wSales.length,
        })
      }
    }

    // ---------- Ventas por categoría ----------
    const catMap = new Map<string, { name: string; total: number; qty: number }>()
    for (const it of saleItems) {
      const name = it.product.category?.name ?? "Sin categoría"
      const cur = catMap.get(name) || { name, total: 0, qty: 0 }
      cur.total += it.subtotal
      cur.qty += it.quantity
      catMap.set(name, cur)
    }
    let salesByCategory = [...catMap.values()].sort((a, b) => b.total - a.total)
    if (salesByCategory.length > 6) {
      const top = salesByCategory.slice(0, 6)
      const otros = salesByCategory.slice(6).reduce(
        (acc, c) => {
          acc.total += c.total
          acc.qty += c.qty
          return acc
        },
        { name: "Otros", total: 0, qty: 0 }
      )
      salesByCategory = [...top, otros]
    }

    // ---------- Métodos de pago ----------
    const pmMap = new Map<string, { method: string; total: number; count: number }>()
    for (const s of sales) {
      const cur = pmMap.get(s.paymentMethod) || {
        method: s.paymentMethod,
        total: 0,
        count: 0,
      }
      cur.total += s.total
      cur.count += 1
      pmMap.set(s.paymentMethod, cur)
    }
    const salesByPaymentMethod = [...pmMap.values()].sort((a, b) => b.total - a.total)

    // ---------- Top productos ----------
    const prodMap = new Map<
      string,
      { name: string; qty: number; total: number; profit: number }
    >()
    for (const it of saleItems) {
      const cur = prodMap.get(it.productId) || {
        name: it.product.name,
        qty: 0,
        total: 0,
        profit: 0,
      }
      cur.qty += it.quantity
      cur.total += it.subtotal
      cur.profit += (it.unitPrice - it.unitCost) * it.quantity
      prodMap.set(it.productId, cur)
    }
    const topProducts = [...prodMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8)

    // ---------- Resumen de inventario ----------
    const stockUnits = products.reduce((s, p) => s + p.stock, 0)
    const stockCostValue = products.reduce((s, p) => s + p.cost * p.stock, 0)
    const stockRetailValue = products.reduce((s, p) => s + p.price * p.stock, 0)
    const lowStockCount = products.filter((p) => p.stock <= p.minStock).length
    let expiredCount = 0
    let expiringCount = 0
    for (const p of products) {
      const d = daysUntil(p.expirationDate)
      if (d === null) continue
      if (d < 0) expiredCount++
      else if (d <= 30) expiringCount++
    }

    // ---------- Mejores clientes ----------
    const clientMap = new Map<
      string,
      { name: string; total: number; count: number }
    >()
    for (const s of sales) {
      if (!s.client) continue
      const cur = clientMap.get(s.client.id) || {
        name: s.client.name,
        total: 0,
        count: 0,
      }
      cur.total += s.total
      cur.count += 1
      clientMap.set(s.client.id, cur)
    }
    const bestClients = [...clientMap.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    return NextResponse.json({
      range: days,
      totalSales,
      salesCount,
      avgTicket,
      totalProfit,
      totalPurchases,
      totalIncome,
      totalExpenses,
      salesByDay,
      salesByCategory,
      salesByPaymentMethod,
      topProducts,
      inventorySummary: {
        totalProducts: products.length,
        stockUnits,
        stockCostValue,
        stockRetailValue,
        lowStockCount,
        expiredCount,
        expiringCount,
      },
      bestClients,
    })
  } catch (e) {
    console.error("[reports] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
