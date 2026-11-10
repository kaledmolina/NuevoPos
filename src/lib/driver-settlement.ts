import { db } from "@/lib/db"
import type { SessionPayload } from "@/lib/auth"

export function isCashPaymentMethod(method?: string | null): boolean {
  const m = (method || "contraentrega").toLowerCase().trim()
  if (!m) return true
  return (
    m === "efectivo" ||
    m === "contraentrega" ||
    m.includes("efectivo") ||
    m.includes("contra")
  )
}

export function splitOrderAmounts(order: { total: number; deliveryFee: number }) {
  const total = Math.max(0, Number(order.total || 0))
  const deliveryFee = Math.min(total, Math.max(0, Number(order.deliveryFee || 0)))
  const productsAmount = Math.max(0, total - deliveryFee)
  return { total, deliveryFee, productsAmount }
}

export function getDateRangeStart(range: string): Date | null {
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

export interface SettlementOrderSummary {
  id: string
  orderNumber: string
  customerName: string
  customerPhone: string
  deliveryAddress: string | null
  deliveryLatitude: number | null
  deliveryLongitude: number | null
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

export interface DriverSettlementBucket {
  driverKey: string
  driverId: string | null
  driverName: string
  driverPhone: string | null
  telegramUsername: string | null
  telegramConnected: boolean
  isStaffDomiciliario: boolean
  unsettledCashOrders: SettlementOrderSummary[]
  unsettledCashCount: number
  unsettledCashProductsTotal: number
  unsettledCashDeliveryTotal: number
  unsettledCashGrossTotal: number
  unsettledNonCashOrders: SettlementOrderSummary[]
  unsettledNonCashCount: number
  unsettledNonCashProductsTotal: number
  unsettledNonCashDeliveryTotal: number
  unsettledNonCashTotal: number
  inTransitOrders: SettlementOrderSummary[]
  inTransitCount: number
  inTransitTotal: number
  settledTodayCount: number
  settledTodayProductsTotal: number
  settledTodayDeliveryTotal: number
  settledTodayGrossTotal: number
}

export interface DriverSettlementHistoryItem {
  id: string
  settlementRef: string
  createdAt: string
  settledBy: string
  settledAt?: string
  driverId: string | null
  driverName: string
  orderCount: number
  orderNumbers: string[]
  productsTotal: number
  deliveryFeeTotal: number
  grossTotal: number
  settlementMode: "full" | "products_only" | "transfer_verification"
  expectedCash: number
  receivedCash: number
  difference: number
  verifyNonCash?: boolean
  registeredInCash?: boolean
  notes?: string | null
  detail?: string
}

export async function buildDriverSettlementReport(params: {
  session: SessionPayload
  branchId: string | null
  range?: string
  driverId?: string | null
}) {
  const { session, branchId, range = "all", driverId = null } = params
  const isDriverSelf = session.role === "domiciliario"
  const scopedDriverId = isDriverSelf ? session.uid : driverId?.trim() || null

  const rangeStart = getDateRangeStart(range)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const endOfYesterday = new Date(startOfToday)

  // 1. Sesión de caja abierta, sede y repartidores
  const [openSessionRaw, branchInfo, staffUsers] = await Promise.all([
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
        ...(isDriverSelf ? { id: session.uid } : { role: "domiciliario" }),
        ...(session.role !== "superadmin" && session.tenantId
          ? { tenantId: session.tenantId }
          : {}),
        ...(!isDriverSelf && scopedDriverId ? { id: scopedDriverId } : {}),
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

  // Si consulta un domiciliario, ocultamos la base exacta en gaveta (openingAmount = 0)
  const openSession = openSessionRaw
    ? {
        ...openSessionRaw,
        openingAmount: isDriverSelf ? 0 : openSessionRaw.openingAmount,
      }
    : null

  const branchDrivers = staffUsers.filter((u) => {
    if (!branchId) return true
    if (isDriverSelf && u.id === session.uid) return true
    try {
      const allowed: string[] = JSON.parse(u.allowedBranchIds || "[]")
      return allowed.length === 0 || allowed.includes(branchId)
    } catch {
      return true
    }
  })

  // 2. Pedidos no cancelados de la sede sin liquidar o de hoy
  const tenantCondition =
    session.role !== "superadmin" && session.tenantId
      ? { OR: [{ tenantId: session.tenantId }, { branch: { tenantId: session.tenantId } }] }
      : {}

  const branchCondition = branchId ? { OR: [{ branchId }, { branchId: null }] } : {}

  const driverCondition = scopedDriverId ? { deliveryDriverId: scopedDriverId } : {}

  const orders = await db.order.findMany({
    where: {
      AND: [
        tenantCondition,
        branchCondition,
        driverCondition,
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

  const driverMap = new Map<string, DriverSettlementBucket>()
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
  ): DriverSettlementBucket => {
    const existing = driverMap.get(key)
    if (existing) return existing
    const created: DriverSettlementBucket = {
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

  // Garantizar bucket propio aunque no aparezca en staffUsers (ej. superadmin o cambio de rol)
  if (isDriverSelf && !driverMap.has(`driver:${session.uid}`)) {
    ensureBucket(`driver:${session.uid}`, {
      driverId: session.uid,
      driverName: session.name,
      isStaffDomiciliario: true,
    })
  }

  for (const o of orders) {
    const refDate = o.deliveredAt ? new Date(o.deliveredAt) : new Date(o.createdAt)

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

    const summary: SettlementOrderSummary = {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      deliveryAddress: o.deliveryAddress,
      deliveryLatitude: o.deliveryLatitude ?? null,
      deliveryLongitude: o.deliveryLongitude ?? null,
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
      bucket.inTransitOrders.push(summary)
      bucket.inTransitCount += 1
      bucket.inTransitTotal += total
    }
  }

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

  const rawLogs = await db.auditLog.findMany({
    where: { action: "driver_cash_settlement" },
    orderBy: { createdAt: "desc" },
    take: 80,
  })

  const history = rawLogs
    .map((log): (DriverSettlementHistoryItem & { tenantId?: string | null; branchId?: string | null }) | null => {
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
    .filter((item): item is DriverSettlementHistoryItem & { tenantId?: string | null; branchId?: string | null } => {
      if (!item) return false
      if (
        session.role !== "superadmin" &&
        session.tenantId &&
        item.tenantId &&
        item.tenantId !== session.tenantId
      ) {
        return false
      }
      if (branchId && item.branchId && item.branchId !== branchId) {
        return false
      }
      if (isDriverSelf) {
        return (
          item.driverId === session.uid ||
          (!item.driverId &&
            typeof item.driverName === "string" &&
            item.driverName.trim().toLowerCase() === session.name.trim().toLowerCase())
        )
      }
      if (scopedDriverId && item.driverId !== scopedDriverId) {
        return false
      }
      return true
    })

  return {
    ok: true,
    isDriverSelf,
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
    mySettlement: isDriverSelf ? drivers[0] || null : scopedDriverId ? drivers[0] || null : null,
    history,
  }
}
