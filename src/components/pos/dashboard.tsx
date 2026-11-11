"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"
import { formatCurrency, formatCurrencyCompact, formatNumber, expirationStatus, daysUntil, formatDateTime } from "@/lib/format"
import { useAppStore } from "@/lib/store"
import { ROLE_CONFIG } from "@/lib/permissions"
import type { DriverSettlementApiResponse } from "@/components/pos/driver-settlement"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  IconCurrencyDollar,
  IconShoppingCart,
  IconBoxSeam,
  IconPackage,
  IconAlertTriangle,
  IconCalendarTime,
  IconTrendingUp,
  IconTrendingDown,
  IconWallet,
  IconArrowRight,
  IconArrowUpRight,
  IconActivity,
  IconMotorbike,
  IconTruckDelivery,
  IconCalculator,
  IconCoins,
  IconMapPin,
  IconBrandGoogleMaps,
  IconHistory,
  IconBuildingStore,
  IconCircleCheck,
} from "@tabler/icons-react"
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts"

interface DashboardData {
  totalToday: number
  totalMonth: number
  countToday: number
  stockValue: number
  retailValue: number
  lowStock: { id: string; name: string; stock: number; minStock: number }[]
  expiringSoon: { id: string; name: string; expirationDate: string | null }[]
  expired: { id: string; name: string; expirationDate: string | null }[]
  incomeMonth: number
  expenseMonth: number
  cashOpen: boolean
  cashBalance: number
  cashMovements: number
  recentSales: { id: string; invoiceNumber: string; total: number; createdAt: string; client?: { name: string } | null }[]
  salesByDay: { date: string; total: number }[]
  topProducts: { name: string; qty: number; total: number }[]
  totalProducts: number
}

interface DriverOrderLite {
  id: string
  orderNumber: string
  customerName: string
  customerPhone: string
  deliveryAddress: string | null
  deliveryLatitude?: number | null
  deliveryLongitude?: number | null
  deliveryDriverId?: string | null
  total: number
  deliveryFee: number
  paymentMethod: string
  paymentStatus: string
  status: string
  createdAt: string
}

interface DriverDashboardState {
  orders: DriverOrderLite[]
  counts: {
    available: number
    active: number
    delivered: number
    unsettled: number
  }
  settlement: DriverSettlementApiResponse | null
}

export default function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [driverData, setDriverData] = useState<DriverDashboardState | null>(null)
  const [loading, setLoading] = useState(true)
  const setView = useAppStore((s) => s.setView)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const role = useAppStore((s) => s.role)
  const userName = useAppStore((s) => s.userName)
  const activeBranch = useAppStore((s) => s.activeBranch)
  const isDriver = role === "domiciliario"
  const canSeeCosts = role ? ROLE_CONFIG[role].canSeeCosts : false

  useEffect(() => {
    let active = true
    setLoading(true)

    if (isDriver) {
      const branchQuery = activeBranch?.id ? `&branchId=${encodeURIComponent(activeBranch.id)}` : ""
      Promise.all([
        apiFetch<{
          ok: boolean
          data?: {
            orders?: DriverOrderLite[]
            counts?: { available: number; active: number; delivered: number; unsettled: number }
          }
        }>(`/api/v1/delivery/orders?pageSize=30${branchQuery}`),
        apiFetch<DriverSettlementApiResponse>(`/api/cash/driver-settlement?range=all${branchQuery}`),
      ])
        .then(([ordersRes, settlementRes]) => {
          if (!active) return
          const orders = ordersRes?.data?.orders || []
          const counts = ordersRes?.data?.counts || {
            available: orders.filter((o) => !o.deliveryDriverId).length,
            active: orders.filter((o) => o.deliveryDriverId && o.status !== "entregado" && o.status !== "cancelado").length,
            delivered: orders.filter((o) => o.deliveryDriverId && o.status === "entregado").length,
            unsettled: orders.filter((o) => o.deliveryDriverId && o.status === "entregado" && o.paymentStatus !== "pagado").length,
          }
          setDriverData({
            orders,
            counts,
            settlement: settlementRes || null,
          })
        })
        .catch(() => {
          if (active) setDriverData(null)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    } else {
      apiFetch<DashboardData>("/api/dashboard")
        .then((res) => {
          if (active) setData(res)
        })
        .catch(() => {
          if (active) setData(null)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    return () => {
      active = false
    }
  }, [refreshKey, isDriver, activeBranch?.id])

  if (isDriver) {
    if (loading || !driverData) {
      return (
        <div className="p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )
    }

    const bucket = driverData.settlement?.mySettlement || driverData.settlement?.drivers?.[0] || null
    const xProducts = bucket?.unsettledCashProductsTotal ?? 0
    const yDelivery = bucket?.unsettledCashDeliveryTotal ?? 0
    const grossToDeliver = bucket?.unsettledCashGrossTotal ?? 0
    const settledTodayGross = bucket?.settledTodayGrossTotal ?? 0
    const settledTodayCount = bucket?.settledTodayCount ?? 0
    const nonCashPendingCount = bucket?.unsettledNonCashCount ?? 0
    const nonCashPendingAmount = bucket?.unsettledNonCashTotal ?? 0
    const cashOpen = Boolean(driverData.settlement?.openSession)
    const history = driverData.settlement?.history || []
    const upcomingOrders = driverData.orders
      .filter((o) => o.status !== "entregado" && o.status !== "cancelado")
      .slice(0, 6)

    return (
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24 lg:pb-8">
        {/* Banner Bienvenida & Acciones Rápidas */}
        <div className="rounded-2xl border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[11px] font-bold gap-1">
                <IconMotorbike className="h-3.5 w-3.5" />
                Resumen del Repartidor
              </Badge>
              {activeBranch && (
                <Badge variant="outline" className="text-[11px] font-semibold gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
                  <IconBuildingStore className="h-3 w-3" />
                  {activeBranch.name}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={
                  cashOpen
                    ? "text-[11px] border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                    : "text-[11px] border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                }
              >
                {cashOpen ? "Caja abierta para recibir cuadres" : "Caja cerrada actualmente"}
              </Badge>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight">
              Hola{userName ? `, ${userName}` : ""} · Tu operación de reparto al día
            </h2>
            <p className="text-xs text-muted-foreground">
              Consulta pedidos libres para tomar, tus envíos en ruta y el monto exacto (Pedidos X + Domicilios Y) a entregar en Caja.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button size="sm" onClick={() => setView("orders")} className="rounded-xl text-xs gap-1.5 font-bold">
              <IconTruckDelivery className="h-4 w-4" />
              Tomar Pedidos ({driverData.counts.available})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setView("driver_settlement")}
              className="rounded-xl text-xs gap-1.5 font-bold"
            >
              <IconCalculator className="h-4 w-4" />
              Mi Cuadre de Caja
            </Button>
          </div>
        </div>

        {/* 4 KPI Cards del Domiciliario */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card
            onClick={() => setView("driver_settlement")}
            className="relative overflow-hidden bg-primary text-primary-foreground border-none rounded-2xl shadow-md cursor-pointer"
          >
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium text-primary-foreground/80 truncate">
                  A Entregar en Caja
                </p>
                <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center text-white shrink-0">
                  <IconCoins className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
                  <span className="sm:hidden">{formatCurrencyCompact(grossToDeliver)}</span>
                  <span className="hidden sm:inline">{formatCurrency(grossToDeliver)}</span>
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 text-white px-2.5 py-0.5 text-[10px] font-semibold">
                  <span>
                    X: {formatCurrencyCompact(xProducts)} + Y: {formatCurrencyCompact(yDelivery)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => setView("orders")}
            className="rounded-2xl border border-border/80 shadow-xs hover:border-primary/40 transition-colors cursor-pointer"
          >
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Disponibles
                </p>
                <div className="h-8 w-8 rounded-full border border-border/80 bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
                  <IconTruckDelivery className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{driverData.counts.available}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                  Sin conductor asignado
                </p>
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => setView("orders")}
            className="rounded-2xl border border-border/80 shadow-xs hover:border-primary/40 transition-colors cursor-pointer"
          >
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Mis Envíos Activos
                </p>
                <div className="h-8 w-8 rounded-full border border-border/80 bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
                  <IconMotorbike className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{driverData.counts.active}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                  En tienda o en camino
                </p>
              </div>
            </CardContent>
          </Card>

          <Card
            onClick={() => setView("driver_settlement")}
            className="rounded-2xl border border-border/80 shadow-xs hover:border-primary/40 transition-colors cursor-pointer"
          >
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                  Liquidado Hoy
                </p>
                <div className="h-8 w-8 rounded-full border border-border/80 bg-muted/40 flex items-center justify-center text-emerald-600 shrink-0">
                  <IconCircleCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
                  <span className="sm:hidden">{formatCurrencyCompact(settledTodayGross)}</span>
                  <span className="hidden sm:inline">{formatCurrency(settledTodayGross)}</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                  {settledTodayCount} pedido(s) liquidados
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dos Columnas: Próximas Entregas + Desglose de Cuadre & Historial */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="rounded-2xl shadow-xs border-border/80">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <IconTruckDelivery className="h-4 w-4 text-primary" />
                  Próximas Entregas (Libres & Activas)
                </CardTitle>
                <CardDescription>Toca para ir al portal y tomar o completar pedidos</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView("orders")} className="text-xs">
                Ver todos <IconArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {upcomingOrders.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No hay entregas pendientes o libres en este momento.
                </div>
              ) : (
                upcomingOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-xl border bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs">#{ord.orderNumber}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {!ord.deliveryDriverId ? "Disponible" : ord.status === "en_camino" ? "En Camino" : ord.status}
                        </Badge>
                      </div>
                      <p className="text-xs font-semibold truncate">{ord.customerName}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                        <IconMapPin className="h-3 w-3 shrink-0 text-rose-500" />
                        {ord.deliveryAddress || "Recoger en tienda"}
                      </p>
                      {ord.deliveryLatitude && ord.deliveryLongitude && (
                        <a
                          href={`https://www.google.com/maps?q=${ord.deliveryLatitude},${ord.deliveryLongitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <IconBrandGoogleMaps className="h-3 w-3 text-red-500" />
                          Abrir GPS ↗
                        </a>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-xs">{formatCurrency(ord.total)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{ord.paymentMethod}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-xs border-border/80">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <IconCalculator className="h-4 w-4 text-primary" />
                  Desglose de Cuadre & Liquidaciones
                </CardTitle>
                <CardDescription>Efectivo acumulado sin liquidar (X + Y) y cierres recientes</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView("driver_settlement")} className="text-xs">
                Detalle <IconArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 xs:grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border bg-muted/20 p-2.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Pedidos (X)</p>
                  <p className="font-mono font-black text-sm mt-0.5 tabular-nums">{formatCurrency(xProducts)}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-2.5">
                  <p className="text-[10px] font-semibold text-muted-foreground">Domicilios (Y)</p>
                  <p className="font-mono font-black text-sm mt-0.5 tabular-nums">{formatCurrency(yDelivery)}</p>
                </div>
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5">
                  <p className="text-[10px] font-bold text-amber-800 dark:text-amber-300">Total Caja</p>
                  <p className="font-mono font-black text-sm text-amber-900 dark:text-amber-200 mt-0.5 tabular-nums">
                    {formatCurrency(grossToDeliver)}
                  </p>
                </div>
              </div>

              {nonCashPendingCount > 0 && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-900 dark:text-sky-200">
                  📲 Tienes <strong>{nonCashPendingCount}</strong> entrega(s) por transferencia/tarjeta ({formatCurrency(nonCashPendingAmount)}) pendientes de verificación administrativa.
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <IconHistory className="h-3.5 w-3.5" />
                  Últimos Cuadres en Caja
                </div>
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center border rounded-xl border-dashed">
                    Aún no registras cuadres liquidados en este periodo.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {history.slice(0, 4).map((h) => (
                      <div key={h.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs">
                        <div className="min-w-0">
                          <p className="font-mono font-bold truncate">{h.settlementRef}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {h.orderCount} ped. · Recibió: {h.settledBy} · {formatDateTime(h.settledAt || h.createdAt)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(h.receivedCash)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            X:{formatCurrencyCompact(h.productsTotal)} Y:{formatCurrencyCompact(h.deliveryFeeTotal)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const stats = [
    { label: "Ventas de hoy", value: data.totalToday, sub: `${data.countToday} transacciones`, icon: IconShoppingCart, isHero: true },
    { label: "Ventas del mes", value: data.totalMonth, sub: "Acumulado mensual", icon: IconCurrencyDollar, isHero: false },
    { label: "Valor inventario", value: data.retailValue, sub: canSeeCosts ? `Costo: ${formatCurrencyCompact(data.stockValue)}` : "Valor de venta", icon: IconPackage, isHero: false },
    { label: "Caja actual", value: data.cashBalance, sub: data.cashOpen ? `${data.cashMovements} movimientos` : "Caja cerrada", icon: IconWallet, isHero: false },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* KPIs estilo Donezo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          if (s.isHero) {
            return (
              <Card key={s.label} className="relative overflow-hidden bg-primary text-primary-foreground border-none rounded-2xl shadow-md">
                <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm font-medium text-primary-foreground/80 truncate">{s.label}</p>
                    <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center text-white shrink-0">
                      <IconArrowUpRight className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
                      <span className="sm:hidden">{formatCurrencyCompact(s.value)}</span>
                      <span className="hidden sm:inline">{formatCurrency(s.value)}</span>
                    </p>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 text-white px-2.5 py-0.5 text-[10px] font-semibold">
                      <Icon className="h-3 w-3" />
                      <span>{s.sub}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          }

          return (
            <Card key={s.label} className="relative overflow-hidden bg-card text-card-foreground border border-border/80 rounded-2xl shadow-xs hover:border-primary/40 transition-colors">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">{s.label}</p>
                  <div className="h-8 w-8 rounded-full border border-border/80 bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
                    <IconArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl sm:text-3xl font-extrabold tracking-tight truncate">
                    <span className="sm:hidden">{formatCurrencyCompact(s.value)}</span>
                    <span className="hidden sm:inline">{formatCurrency(s.value)}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1.5 truncate flex items-center gap-1">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                    <span>{s.sub}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Alertas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AlertCard
          title="Stock bajo"
          icon={IconAlertTriangle}
          tone="amber"
          count={data.lowStock.length}
          items={data.lowStock.map((p) => `${p.name} (${p.stock}/${p.minStock})`)}
          onAction={() => setView("products")}
        />
        <AlertCard
          title="Por vencer (30 días)"
          icon={IconCalendarTime}
          tone="orange"
          count={data.expiringSoon.length}
          items={data.expiringSoon.map((p) => `${p.name} — ${expirationStatus(p.expirationDate).label}`)}
          onAction={() => setView("products")}
        />
        <AlertCard
          title="Productos vencidos"
          icon={IconAlertTriangle}
          tone="red"
          count={data.expired.length}
          items={data.expired.map((p) => `${p.name} — vencido hace ${Math.abs(daysUntil(p.expirationDate) ?? 0)}d`)}
          onAction={() => setView("products")}
        />
      </div>

      {/* Gráfico + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-2xl shadow-xs border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold"><IconActivity className="h-4 w-4 text-primary" /> Ventas últimos 7 días</CardTitle>
            <CardDescription>Tendencia de ingresos por día</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesByDay}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.58 0.19 262)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="oklch(0.58 0.19 262)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" />
                  <XAxis dataKey="date" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis className="text-xs" tickLine={false} axisLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12, backgroundColor: "var(--card)" }}
                  />
                  <Area type="monotone" dataKey="total" stroke="oklch(0.58 0.19 262)" strokeWidth={2.5} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-bold"><IconTrendingUp className="h-4 w-4 text-primary" /> Top productos del mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas aún este mes.</p>
            )}
            {data.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.qty} unidades</p>
                  </div>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">{formatCurrency(p.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Finanzas resumen + ventas recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardHeader>
            <CardTitle className="text-base font-bold">Flujo del mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-primary/10 p-3">
              <span className="flex items-center gap-2 text-sm font-medium"><IconTrendingUp className="h-4 w-4 text-primary" /> Ingresos</span>
              <span className="font-bold text-primary">{formatCurrency(data.incomeMonth)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-rose-500/10 p-3">
              <span className="flex items-center gap-2 text-sm font-medium"><IconTrendingDown className="h-4 w-4 text-rose-600" /> Egresos</span>
              <span className="font-bold text-rose-700">{formatCurrency(data.expenseMonth)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/80 p-3 bg-card">
              <span className="text-sm font-medium">Balance neto</span>
              <span className={`font-bold ${data.incomeMonth - data.expenseMonth >= 0 ? "text-primary" : "text-rose-700"}`}>
                {formatCurrency(data.incomeMonth - data.expenseMonth)}
              </span>
            </div>
            <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={() => setView("finance")}>
              Ver ingresos y egresos <IconArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 rounded-2xl shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold">Ventas recientes</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView("sales")}>Ver todas</Button>
          </CardHeader>
          <CardContent className="space-y-1 max-h-80 overflow-y-auto scroll-thin">
            {data.recentSales.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay ventas registradas.</p>
            )}
            {data.recentSales.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <IconBoxSeam className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.client?.name ?? "Cliente genérico"} · {formatDateTime(s.createdAt)}</p>
                  </div>
                </div>
                <span className="font-semibold whitespace-nowrap">{formatCurrency(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Inventario resumen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><IconBoxSeam className="h-4 w-4 text-primary" /> Inventario</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setView("products")}>Gestionar <IconArrowRight className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-primary">{formatNumber(data.totalProducts)}</p>
              <p className="text-xs text-muted-foreground mt-1">Productos activos</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-amber-600">{formatNumber(data.lowStock.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Stock bajo</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-orange-600">{formatNumber(data.expiringSoon.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Por vencer</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-red-600">{formatNumber(data.expired.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Vencidos</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AlertCard({
  title, icon: Icon, tone, count, items, onAction,
}: {
  title: string
  icon: React.ElementType
  tone: "amber" | "orange" | "red"
  count: number
  items: string[]
  onAction: () => void
}) {
  const toneMap = {
    amber: "border-amber-500/30 bg-amber-500/5",
    orange: "border-orange-500/30 bg-orange-500/5",
    red: "border-red-500/30 bg-red-500/5",
  }
  const iconMap = {
    amber: "text-amber-600 bg-amber-500/10",
    orange: "text-orange-600 bg-orange-500/10",
    red: "text-red-600 bg-red-500/10",
  }
  return (
    <Card className={`${toneMap[tone]} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconMap[tone]}`}><Icon className="h-4 w-4" /></span>
            {title}
          </CardTitle>
          <Badge variant={count > 0 ? "destructive" : "secondary"}>{count}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Todo en orden ✓</p>
        ) : (
          <ul className="space-y-1 max-h-28 overflow-y-auto scroll-thin">
            {items.slice(0, 5).map((it, i) => (
              <li key={i} className="text-xs text-muted-foreground truncate">• {it}</li>
            ))}
            {items.length > 5 && <li className="text-xs text-muted-foreground">y {items.length - 5} más…</li>}
          </ul>
        )}
        {count > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 -ml-2 text-xs" onClick={onAction}>
            Ver detalles <IconArrowRight className="h-3 w-3" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
