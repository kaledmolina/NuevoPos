import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"
import { syncOrderToSale } from "@/lib/order-sale-sync"
import { buildDriverSettlementReport, splitOrderAmounts } from "@/lib/driver-settlement"

export const dynamic = "force-dynamic"

const ALLOWED_READ_ROLES = ["superadmin", "admin", "vendedor", "domiciliario"]
const ALLOWED_SETTLEMENT_ROLES = ["superadmin", "admin", "vendedor"]

// GET /api/cash/driver-settlement
// Resume cuánto debe entregar cada domiciliario (desglosado en Valor Pedidos X + Valor Domicilios Y).
// Un domiciliario solo puede consultar su propio cuadre (session.uid).
export async function GET(req: NextRequest) {
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId, session } = branchAccess

  if (!ALLOWED_READ_ROLES.includes(session.role)) {
    return NextResponse.json(
      { error: "Acceso denegado: no tienes permisos para consultar cuadres de domiciliarios." },
      { status: 403 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const range = searchParams.get("range") || "all"
    const driverId = searchParams.get("driverId")

    const report = await buildDriverSettlementReport({
      session,
      branchId,
      range,
      driverId,
    })

    return NextResponse.json(report)
  } catch (e) {
    console.error("[GET /api/cash/driver-settlement Error]:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/cash/driver-settlement
// Liquida pedidos entregados de un domiciliario: los marca 'pagado', sincroniza ventas,
// registra el efectivo en la sesión de caja activa (si aplica) y guarda el comprobante del cuadre.
export async function POST(req: NextRequest) {
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId, session } = branchAccess

  if (!ALLOWED_SETTLEMENT_ROLES.includes(session.role)) {
    return NextResponse.json(
      { error: "Acceso denegado: solo un humano en caja o administrador puede recibir y confirmar pagos de domiciliarios." },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const orderIds: string[] = Array.isArray(body.orderIds)
      ? body.orderIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      : []

    if (orderIds.length === 0) {
      return NextResponse.json(
        { error: "Selecciona al menos un pedido entregado para realizar el cuadre." },
        { status: 400 }
      )
    }

    const driverId: string | null = body.driverId ? String(body.driverId) : null
    const driverName: string = String(body.driverName || "Domiciliario").trim()
    const settlementMode: "full" | "products_only" =
      body.settlementMode === "products_only" ? "products_only" : "full"
    const verifyNonCash = Boolean(body.verifyNonCash)
    const registerInCash = body.registerInCash !== false
    const notes: string | null = body.notes ? String(body.notes).trim() : null

    const result = await db.$transaction(async (tx) => {
      const orders = await tx.order.findMany({
        where: { id: { in: orderIds } },
        orderBy: { createdAt: "asc" },
      })

      const validOrders = orders.filter((o) => {
        if (o.status === "cancelado") return false
        if (o.paymentStatus === "pagado") return false
        if (session.role !== "superadmin" && session.tenantId && o.tenantId && o.tenantId !== session.tenantId) {
          return false
        }
        if (branchId && o.branchId && o.branchId !== branchId) {
          return false
        }
        return true
      })

      if (validOrders.length === 0) {
        throw new Error("Los pedidos seleccionados ya estaban liquidados o no son válidos para esta sede.")
      }

      let productsTotal = 0
      let deliveryFeeTotal = 0
      let grossTotal = 0
      for (const o of validOrders) {
        const amounts = splitOrderAmounts(o)
        productsTotal += amounts.productsAmount
        deliveryFeeTotal += amounts.deliveryFee
        grossTotal += amounts.total
      }

      const expectedCash = verifyNonCash
        ? 0
        : settlementMode === "products_only"
        ? productsTotal
        : grossTotal

      const parsedReceived =
        body.receivedCash !== undefined && body.receivedCash !== null && String(body.receivedCash).trim() !== ""
          ? Number(body.receivedCash)
          : expectedCash

      if (isNaN(parsedReceived) || parsedReceived < 0) {
        throw new Error("El valor de efectivo recibido debe ser un número válido mayor o igual a 0.")
      }

      const receivedCash = verifyNonCash ? 0 : parsedReceived
      const difference = verifyNonCash ? 0 : receivedCash - expectedCash
      const validIds = validOrders.map((o) => o.id)
      const orderNumbers = validOrders.map((o) => o.orderNumber)
      const now = new Date()

      // 1. Marcar pedidos como PAGADO (y asegurar entregado si alguno se liquida directamente)
      await tx.order.updateMany({
        where: { id: { in: validIds }, paymentStatus: { not: "pagado" } },
        data: {
          paymentStatus: "pagado",
          status: "entregado",
        },
      })

      // Asegurar deliveredAt si no lo tenía
      const missingDeliveredAtIds = validOrders.filter((o) => !o.deliveredAt).map((o) => o.id)
      if (missingDeliveredAtIds.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: missingDeliveredAtIds } },
          data: { deliveredAt: now },
        })
      }

      // 2. Registrar el ingreso físico del efectivo en Caja Abierta + Movimientos Financieros
      const settlementRef = `CUADRE-${Date.now().toString().slice(-6)}`
      let openSessionId: string | null = null
      let registeredInCash = false

      if (!verifyNonCash && registerInCash && receivedCash > 0) {
        const openSession = await tx.cashSession.findFirst({
          where: {
            status: "abierta",
            ...(branchId ? { branchId } : {}),
          },
          orderBy: { openedAt: "desc" },
        })

        if (openSession) {
          openSessionId = openSession.id
          registeredInCash = true

          const modeText = settlementMode === "products_only" ? "Solo Pedidos" : "Pedidos + Domicilios"
          const concept = `Cuadre Domiciliario: ${driverName} (${validOrders.length} ped · ${modeText})`
          const description =
            `${settlementRef} · Pedidos (X): $${productsTotal.toLocaleString("es-CO")} · ` +
            `Domicilios (Y): $${deliveryFeeTotal.toLocaleString("es-CO")} · ` +
            `Esperado: $${expectedCash.toLocaleString("es-CO")} · ` +
            `Recibido: $${receivedCash.toLocaleString("es-CO")}` +
            (notes ? ` · Nota: ${notes}` : "")

          const finTx = await tx.transaction.create({
            data: {
              branchId: branchId || null,
              type: "ingreso",
              category: "Cuadre Domiciliario",
              amount: receivedCash,
              concept,
              description,
              method: "efectivo",
              date: now,
              cashSessionId: openSession.id,
            },
          })

          await tx.cashTransaction.create({
            data: {
              cashSessionId: openSession.id,
              type: "ingreso",
              amount: receivedCash,
              concept,
              method: "efectivo",
              reference: finTx.id,
            },
          })
        }
      }

      const metaObj = {
        settlementRef,
        tenantId: session.tenantId || null,
        branchId: branchId || null,
        driverId,
        driverName,
        orderIds: validIds,
        orderNumbers,
        orderCount: validOrders.length,
        productsTotal,
        deliveryFeeTotal,
        grossTotal,
        settlementMode: verifyNonCash ? "transfer_verification" : settlementMode,
        expectedCash,
        receivedCash,
        difference,
        verifyNonCash,
        cashSessionId: openSessionId,
        registeredInCash,
        notes,
        settledBy: session.name,
        settledAt: now.toISOString(),
      }

      const detail = verifyNonCash
        ? `Verificación de ${validOrders.length} transferencia(s)/tarjeta(s) de ${driverName} por $${grossTotal.toLocaleString("es-CO")}`
        : `Cuadre ${settlementRef} con ${driverName}: ${validOrders.length} pedido(s) | Pedidos: $${productsTotal.toLocaleString("es-CO")} + Domicilios: $${deliveryFeeTotal.toLocaleString("es-CO")} | Recibido en caja: $${receivedCash.toLocaleString("es-CO")}`

      const audit = await tx.auditLog.create({
        data: {
          action: "driver_cash_settlement",
          entityType: "cash",
          entityId: driverId || "external",
          userName: session.name,
          role: session.role,
          detail,
          meta: JSON.stringify(metaObj),
        },
      })

      return {
        validIds,
        settlement: {
          id: audit.id,
          createdAt: audit.createdAt.toISOString(),
          ...metaObj,
        },
      }
    }, { maxWait: 10000, timeout: 30000 })

    // Sincronizar los pedidos ya marcados como 'pagado' hacia Ventas oficiales fuera del lock
    // para evitar expirar el timeout de transacción si el cuadre incluye 50+ pedidos.
    for (const settledId of result.validIds) {
      try {
        await syncOrderToSale(settledId)
      } catch (syncErr) {
        console.warn(`[DriverSettlement] Error sincronizando pedido ${settledId} a Sale:`, syncErr)
      }
    }

    return NextResponse.json({
      ok: true,
      message: verifyNonCash
        ? `${result.settlement.orderCount} pedido(s) por transferencia verificados y marcados como pagados.`
        : `¡Cuadre confirmado! ${result.settlement.orderCount} pedido(s) liquidados y ${result.settlement.registeredInCash ? "registrados en la caja activa." : "marcados como pagados."}`,
      settlement: result.settlement,
    })
  } catch (e) {
    console.error("[POST /api/cash/driver-settlement Error]:", e)
    const msg = (e as Error).message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
