import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"
import { syncOrderToSale } from "@/lib/order-sale-sync"

export const dynamic = "force-dynamic"

const ALLOWED_SETTLEMENT_ROLES = ["superadmin", "admin", "vendedor"]

function isCashPaymentMethod(method?: string | null): boolean {
  const m = (method || "contraentrega").toLowerCase().trim()
  if (!m) return true
  return m === "efectivo" || m === "contraentrega" || m.includes("efectivo") || m.includes("contra")
}

function splitOrderAmounts(order: { total: number; deliveryFee: number }) {
  const total = Math.max(0, Number(order.total || 0))
  const deliveryFee = Math.min(total, Math.max(0, Number(order.deliveryFee || 0)))
  const productsAmount = Math.max(0, total - deliveryFee)
  return { total, deliveryFee, productsAmount }
}

function getDateRangeStart(range: string): Date | null {
  const now = new Date()
  if (range === "today") {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (range === "yesterday") {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (range === "7d") {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    d.setHours(0, 0, 0, 0)
    return d
  }
  return null
}

// GET /api/cash/driver-settlement
// Resume cuánto debe entregar cada domiciliario (desglosado en Valor Pedidos X + Valor Domicilios Y)
export async function GET(req: NextRequest) {
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId, session } = branchAccess

  if (!ALLOWED_SETTLEMENT_ROLES.includes(session.role)) {
    return NextResponse.json(
      { error: "Acceso denegado: solo el personal de caja o administrador puede consultar cuadres de caja." },
      { status: 403 }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const range = searchParams.get("range") || "all"
    const rangeStart = getDateRangeStart(range)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const endOfYesterday = new Date(startOfToday)

    // 1. Sesión de caja abierta y datos de la sede para comprobantes
    const [openSession, branchInfo, staffUsers] = await Promise.all([
      db.cashSession.findFirst({
        where: {
          status: "abierta",
          ...(branchId ? { branchId } : {}),
        },
        orderBy: { openedAt: "desc" },
        select: { id: true, openedAt: true, openedBy: true, openingAmount: true },
      }),
      branchId
        ? db.branch.findUnique({
            where: { id: branchId },
            select: {
              id: true,
              name: true,
              address: true,
              phone: true,
              tenant: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve(null),
      db.user.findMany({
        where: {
          active: true,
          role: "domiciliario",
          ...(session.role !== "superadmin" && session.tenantId ? { tenantId: session.tenantId } : {}),
        },
        select: {
          id: true,
          name: true,
          phone: true,
          telegramUsername: true,
          telegramChatId: true,
          allowedBranchIds: true,
        },
        orderBy: { name: "asc" },
      }),
    ])

    // Filtrar domiciliarios asignados a la sede activa
    const branchDrivers = staffUsers.filter((u) => {
      if (!branchId) return true
      try {
        const allowed: string[] = JSON.parse(u.allowedBranchIds || "[]")
        return allowed.length === 0 || allowed.includes(branchId)
      } catch {
        return true
      }
    })

    // 2. Consultar todos los pedidos no cancelados de la sede que estén sin liquidar O sean de hoy
    const tenantCondition =
      session.role !== "superadmin" && session.tenantId
        ? { OR: [{ tenantId: session.tenantId }, { branch: { tenantId: session.tenantId } }] }
        : {}

    const branchCondition = branchId
      ? { OR: [{ branchId }, { branchId: null }] }
      : {}

    const orders = await db.order.findMany({
      where: {
        AND: [
          tenantCondition,
          branchCondition,
          { status: { not: "cancelado" } },
          {
            OR: [
              { paymentStatus: { not: "pagado" } },
              { deliveredAt: { gte: startOfToday } },
              { updatedAt: { gte: startOfToday } },
            ],
          },
        ],
      },
      include: {
        items: { select: { id: true, productName: true, quantity: true } },
      },
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }],
    })

    // Mapa para agrupar por repartidor
    type OrderSummary = {
      id: string
      orderNumber: string
      customerName: string
      customerPhone: string
      deliveryAddress: string | null
      paymentMethod: string
      paymentStatus: string
      status: string
      productsAmount: number
      deliveryFee: number
      total: number
      deliveredAt: string | null
      createdAt: string
      itemsCount: number
      isCash: boolean
    }

    type DriverBucket = {
      driverKey: string
      driverId: string | null
      driverName: string
      driverPhone: string | null
      telegramUsername: string | null
      telegramConnected: boolean
      isStaffDomiciliario: boolean
      unsettledCashOrders: OrderSummary[]
      unsettledCashCount: number
      unsettledCashProductsTotal: number
      unsettledCashDeliveryTotal: number
      unsettledCashGrossTotal: number
      unsettledNonCashOrders: OrderSummary[]
      unsettledNonCashCount: number
      unsettledNonCashProductsTotal: number
      unsettledNonCashDeliveryTotal: number
      unsettledNonCashTotal: number
      inTransitOrders: OrderSummary[]
      inTransitCount: number
      inTransitTotal: number
      settledTodayCount: number
      settledTodayProductsTotal: number
      settledTodayDeliveryTotal: number
      settledTodayGrossTotal: number
    }

    const driverMap = new Map<string, DriverBucket>()
    const staffById = new Map(branchDrivers.map((d) => [d.id, d]))

    const ensureBucket = (
      key: string,
      opts: {
        driverId: string | null
        driverName: string
        driverPhone?: string | null
        telegramUsername?: string | null
        telegramConnected?: boolean
        isStaffDomiciliario?: boolean
      }
    ): DriverBucket => {
      const existing = driverMap.get(key)
      if (existing) return existing
      const created: DriverBucket = {
        driverKey: key,
        driverId: opts.driverId,
        driverName: opts.driverName,
        driverPhone: opts.driverPhone || null,
        telegramUsername: opts.telegramUsername || null,
        telegramConnected: Boolean(opts.telegramConnected),
        isStaffDomiciliario: Boolean(opts.isStaffDomiciliario),
        unsettledCashOrders: [],
        unsettledCashCount: 0,
        unsettledCashProductsTotal: 0,
        unsettledCashDeliveryTotal: 0,
        unsettledCashGrossTotal: 0,
        unsettledNonCashOrders: [],
        unsettledNonCashCount: 0,
        unsettledNonCashProductsTotal: 0,
        unsettledNonCashDeliveryTotal: 0,
        unsettledNonCashTotal: 0,
        inTransitOrders: [],
        inTransitCount: 0,
        inTransitTotal: 0,
        settledTodayCount: 0,
        settledTodayProductsTotal: 0,
        settledTodayDeliveryTotal: 0,
        settledTodayGrossTotal: 0,
      }
      driverMap.set(key, created)
      return created
    }

    // Sembrar todos los domiciliarios registrados de la sede
    for (const d of branchDrivers) {
      ensureBucket(`driver:${d.id}`, {
        driverId: d.id,
        driverName: d.name,
        driverPhone: d.phone,
        telegramUsername: d.telegramUsername,
        telegramConnected: Boolean(d.telegramChatId),
        isStaffDomiciliario: true,
      })
    }

    for (const o of orders) {
      const refDate = o.deliveredAt ? new Date(o.deliveredAt) : new Date(o.createdAt)

      // Aplicar filtro de fecha sobre pedidos por liquidar si corresponde
      if (o.paymentStatus !== "pagado" && rangeStart) {
        if (range === "yesterday") {
          if (refDate < rangeStart || refDate >= endOfYesterday) continue
        } else if (refDate < rangeStart) {
          continue
        }
      }

      const staffMatch = o.deliveryDriverId ? staffById.get(o.deliveryDriverId) : undefined
      const key = o.deliveryDriverId
        ? `driver:${o.deliveryDriverId}`
        : o.deliveryDriverName
        ? `name:${o.deliveryDriverName.trim().toLowerCase()}`
        : "unassigned"

      const bucket = ensureBucket(key, {
        driverId: o.deliveryDriverId || null,
        driverName: staffMatch?.name || o.deliveryDriverName || "Sin Conductor Asignado",
        driverPhone: staffMatch?.phone || o.deliveryDriverPhone || null,
        telegramUsername: staffMatch?.telegramUsername || null,
        telegramConnected: Boolean(staffMatch?.telegramChatId),
        isStaffDomiciliario: Boolean(staffMatch),
      })

      const { total, deliveryFee, productsAmount } = splitOrderAmounts(o)
      const isCash = isCashPaymentMethod(o.paymentMethod)

      const summary: OrderSummary = {
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        deliveryAddress: o.deliveryAddress,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        status: o.status,
        productsAmount,
        deliveryFee,
        total,
        deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
        createdAt: o.createdAt.toISOString(),
        itemsCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
        isCash,
      }

      if (o.paymentStatus === "pagado") {
        // Contar solo si fue entregado/actualizado hoy para referencia del turno
        const settledRef = o.deliveredAt ? new Date(o.deliveredAt) : new Date(o.updatedAt)
        if (settledRef >= startOfToday && (o.deliveryDriverId || o.deliveryDriverName)) {
          bucket.settledTodayCount += 1
          bucket.settledTodayProductsTotal += productsAmount
          bucket.settledTodayDeliveryTotal += deliveryFee
          bucket.settledTodayGrossTotal += total
        }
        continue
      }

      if (o.status === "entregado") {
        if (isCash) {
          bucket.unsettledCashOrders.push(summary)
          bucket.unsettledCashCount += 1
          bucket.unsettledCashProductsTotal += productsAmount
          bucket.unsettledCashDeliveryTotal += deliveryFee
          bucket.unsettledCashGrossTotal += total
        } else {
          bucket.unsettledNonCashOrders.push(summary)
          bucket.unsettledNonCashCount += 1
          bucket.unsettledNonCashProductsTotal += productsAmount
          bucket.unsettledNonCashDeliveryTotal += deliveryFee
          bucket.unsettledNonCashTotal += total
        }
      } else {
        // Aún en tienda / preparación / en camino
        bucket.inTransitOrders.push(summary)
        bucket.inTransitCount += 1
        bucket.inTransitTotal += total
      }
    }

    // Construir lista final filtrando "unassigned" si está totalmente en cero
    const drivers = Array.from(driverMap.values())
      .filter((d) => {
        if (d.driverKey === "unassigned") {
          return d.unsettledCashCount > 0 || d.unsettledNonCashCount > 0 || d.inTransitCount > 0
        }
        return true
      })
      .sort((a, b) => {
        if (b.unsettledCashGrossTotal !== a.unsettledCashGrossTotal) {
          return b.unsettledCashGrossTotal - a.unsettledCashGrossTotal
        }
        if (b.unsettledCashCount !== a.unsettledCashCount) {
          return b.unsettledCashCount - a.unsettledCashCount
        }
        if (b.inTransitCount !== a.inTransitCount) {
          return b.inTransitCount - a.inTransitCount
        }
        return a.driverName.localeCompare(b.driverName)
      })

    const summary = {
      totalUnsettledCashOrders: drivers.reduce((acc, d) => acc + d.unsettledCashCount, 0),
      totalUnsettledProductsAmount: drivers.reduce((acc, d) => acc + d.unsettledCashProductsTotal, 0),
      totalUnsettledDeliveryFees: drivers.reduce((acc, d) => acc + d.unsettledCashDeliveryTotal, 0),
      totalUnsettledGrossAmount: drivers.reduce((acc, d) => acc + d.unsettledCashGrossTotal, 0),
      totalUnsettledNonCashOrders: drivers.reduce((acc, d) => acc + d.unsettledNonCashCount, 0),
      totalUnsettledNonCashAmount: drivers.reduce((acc, d) => acc + d.unsettledNonCashTotal, 0),
      totalInTransitOrders: drivers.reduce((acc, d) => acc + d.inTransitCount, 0),
      totalInTransitAmount: drivers.reduce((acc, d) => acc + d.inTransitTotal, 0),
      driversWithDebtCount: drivers.filter((d) => d.unsettledCashCount > 0).length,
    }

    // 3. Historial reciente de cuadres de caja realizados
    const rawLogs = await db.auditLog.findMany({
      where: { action: "driver_cash_settlement" },
      orderBy: { createdAt: "desc" },
      take: 60,
    })

    const history = rawLogs
      .map((log) => {
        try {
          const meta = log.meta ? JSON.parse(log.meta) : {}
          return {
            id: log.id,
            createdAt: log.createdAt.toISOString(),
            settledBy: log.userName,
            detail: log.detail || "",
            ...meta,
          }
        } catch {
          return null
        }
      })
      .filter((item): item is Record<string, any> => {
        if (!item) return false
        if (session.role !== "superadmin" && session.tenantId && item.tenantId && item.tenantId !== session.tenantId) {
          return false
        }
        if (branchId && item.branchId && item.branchId !== branchId) {
          return false
        }
        return true
      })

    return NextResponse.json({
      ok: true,
      openSession,
      branch: branchInfo
        ? {
            id: branchInfo.id,
            name: branchInfo.name,
            address: branchInfo.address,
            phone: branchInfo.phone,
            tenantName: branchInfo.tenant?.name || "OmniPOS",
          }
        : null,
      summary,
      drivers,
      history,
    })
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
