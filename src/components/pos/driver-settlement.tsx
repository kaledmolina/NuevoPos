"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  IconMotorbike,
  IconWallet,
  IconCoins,
  IconCheck,
  IconCircleCheck,
  IconAlertTriangle,
  IconCircleX,
  IconCalculator,
  IconReceipt2,
  IconPrinter,
  IconHistory,
  IconSearch,
  IconRefresh,
  IconBrandTelegram,
  IconClock,
  IconBuildingStore,
  IconCreditCard,
  IconPackage,
  IconX,
  IconLoader2,
  IconLock,
} from "@tabler/icons-react"

export interface SettlementOrderSummary {
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

export interface DriverSettlementRecord {
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
}

export interface DriverSettlementApiResponse {
  ok: boolean
  openSession: {
    id: string
    openedAt: string
    openedBy: string | null
    openingAmount: number
  } | null
  branch: {
    id: string
    name: string
    address: string | null
    phone: string | null
    tenantName: string
  } | null
  summary: {
    totalUnsettledCashOrders: number
    totalUnsettledProductsAmount: number
    totalUnsettledDeliveryFees: number
    totalUnsettledGrossAmount: number
    totalUnsettledNonCashOrders: number
    totalUnsettledNonCashAmount: number
    totalInTransitOrders: number
    totalInTransitAmount: number
    driversWithDebtCount: number
  }
  drivers: DriverSettlementBucket[]
  history: DriverSettlementRecord[]
}

export function DriverSettlementView({
  onSettled,
  compactHeader = false,
}: {
  onSettled?: () => void
  compactHeader?: boolean
}) {
  const activeBranch = useAppStore((s) => s.activeBranch)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)

  const [data, setData] = useState<DriverSettlementApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [range, setRange] = useState<"all" | "today" | "yesterday" | "7d">("all")
  const [driverSearch, setDriverSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending")

  // Modal de cuadre de efectivo para un domiciliario
  const [activeDriver, setActiveDriver] = useState<DriverSettlementBucket | null>(null)
  const [modalMode, setModalMode] = useState<"cash" | "non_cash">("cash")
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [orderSearch, setOrderSearch] = useState("")
  const [settlementPolicy, setSettlementPolicy] = useState<"full" | "products_only">("full")
  const [receivedCashInput, setReceivedCashInput] = useState("")
  const [registerInCash, setRegisterInCash] = useState(true)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Comprobante recién generado (para imprimir tirilla tras liquidar)
  const [completedReceipt, setCompletedReceipt] = useState<DriverSettlementRecord | null>(null)

  // Modal de detalle de pedidos en ruta (solo lectura)
  const [inTransitDriver, setInTransitDriver] = useState<DriverSettlementBucket | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const branchQuery = activeBranch?.id ? `&branchId=${encodeURIComponent(activeBranch.id)}` : ""
      const res = await apiFetch<DriverSettlementApiResponse>(
        `/api/cash/driver-settlement?range=${range}${branchQuery}`
      )
      setData(res)
    } catch (e) {
      setError((e as Error).message || "Error al cargar el cuadre de domiciliarios")
    } finally {
      setLoading(false)
    }
  }, [activeBranch?.id, range])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const filteredDrivers = useMemo(() => {
    if (!data?.drivers) return []
    const q = driverSearch.trim().toLowerCase()
    if (!q) return data.drivers
    return data.drivers.filter(
      (d) =>
        d.driverName.toLowerCase().includes(q) ||
        (d.driverPhone && d.driverPhone.toLowerCase().includes(q)) ||
        (d.telegramUsername && d.telegramUsername.toLowerCase().includes(q))
    )
  }, [data?.drivers, driverSearch])

  const driversWithPendingAction = useMemo(
    () =>
      filteredDrivers.filter(
        (d) => d.unsettledCashCount > 0 || d.unsettledNonCashCount > 0 || d.inTransitCount > 0
      ),
    [filteredDrivers]
  )

  const driversUpToDate = useMemo(
    () =>
      filteredDrivers.filter(
        (d) => d.unsettledCashCount === 0 && d.unsettledNonCashCount === 0 && d.inTransitCount === 0
      ),
    [filteredDrivers]
  )

  // Abrir modal de cuadre en efectivo
  const openCashSettlementModal = (driver: DriverSettlementBucket) => {
    setActiveDriver(driver)
    setModalMode("cash")
    const ids = driver.unsettledCashOrders.map((o) => o.id)
    setSelectedOrderIds(ids)
    setOrderSearch("")
    setSettlementPolicy("full")
    setReceivedCashInput(String(driver.unsettledCashGrossTotal))
    setRegisterInCash(Boolean(data?.openSession))
    setNotes("")
    setCompletedReceipt(null)
  }

  // Abrir modal de verificación de transferencias/tarjetas
  const openNonCashModal = (driver: DriverSettlementBucket) => {
    setActiveDriver(driver)
    setModalMode("non_cash")
    const ids = driver.unsettledNonCashOrders.map((o) => o.id)
    setSelectedOrderIds(ids)
    setOrderSearch("")
    setSettlementPolicy("full")
    setReceivedCashInput("0")
    setRegisterInCash(false)
    setNotes("")
    setCompletedReceipt(null)
  }

  // Pedidos mostrados dentro del modal activo
  const modalOrdersList = useMemo(() => {
    if (!activeDriver) return []
    const source =
      modalMode === "cash"
        ? activeDriver.unsettledCashOrders
        : activeDriver.unsettledNonCashOrders
    const q = orderSearch.trim().toLowerCase()
    if (!q) return source
    return source.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.deliveryAddress && o.deliveryAddress.toLowerCase().includes(q))
    )
  }, [activeDriver, modalMode, orderSearch])

  // Cálculo en vivo según pedidos seleccionados en el modal
  const selectionTotals = useMemo(() => {
    if (!activeDriver) {
      return { count: 0, totalAvailable: 0, productsTotal: 0, deliveryFeeTotal: 0, grossTotal: 0, expectedCash: 0 }
    }
    const source =
      modalMode === "cash"
        ? activeDriver.unsettledCashOrders
        : activeDriver.unsettledNonCashOrders
    const selectedSet = new Set(selectedOrderIds)
    const selectedOrders = source.filter((o) => selectedSet.has(o.id))

    const productsTotal = selectedOrders.reduce((acc, o) => acc + o.productsAmount, 0)
    const deliveryFeeTotal = selectedOrders.reduce((acc, o) => acc + o.deliveryFee, 0)
    const grossTotal = selectedOrders.reduce((acc, o) => acc + o.total, 0)
    const expectedCash =
      modalMode === "non_cash"
        ? 0
        : settlementPolicy === "products_only"
        ? productsTotal
        : grossTotal

    return {
      count: selectedOrders.length,
      totalAvailable: source.length,
      productsTotal,
      deliveryFeeTotal,
      grossTotal,
      expectedCash,
    }
  }, [activeDriver, modalMode, selectedOrderIds, settlementPolicy])

  // Si cambia la selección o la política de cobro, actualizar el input recibido automáticamente
  // solo si aún coincide o antes de editar manualmente — más práctico: helper explícito al cambiar política o selección
  const syncReceivedInputWithExpected = (nextIds: string[], nextPolicy: "full" | "products_only") => {
    if (!activeDriver || modalMode === "non_cash") return
    const selectedSet = new Set(nextIds)
    const selected = activeDriver.unsettledCashOrders.filter((o) => selectedSet.has(o.id))
    const pTotal = selected.reduce((a, o) => a + o.productsAmount, 0)
    const gTotal = selected.reduce((a, o) => a + o.total, 0)
    const nextExpected = nextPolicy === "products_only" ? pTotal : gTotal
    setReceivedCashInput(String(nextExpected))
  }

  const toggleOrderSelection = (orderId: string) => {
    const next = selectedOrderIds.includes(orderId)
      ? selectedOrderIds.filter((id) => id !== orderId)
      : [...selectedOrderIds, orderId]
    setSelectedOrderIds(next)
    syncReceivedInputWithExpected(next, settlementPolicy)
  }

  const toggleSelectAllOrders = () => {
    if (!activeDriver) return
    const source =
      modalMode === "cash"
        ? activeDriver.unsettledCashOrders
        : activeDriver.unsettledNonCashOrders
    if (selectedOrderIds.length === source.length) {
      setSelectedOrderIds([])
      syncReceivedInputWithExpected([], settlementPolicy)
    } else {
      const allIds = source.map((o) => o.id)
      setSelectedOrderIds(allIds)
      syncReceivedInputWithExpected(allIds, settlementPolicy)
    }
  }

  const liveReceived = Number(receivedCashInput) || 0
  const liveDiff = liveReceived - selectionTotals.expectedCash

  const handleConfirmSettlement = async () => {
    if (!activeDriver) return
    if (selectedOrderIds.length === 0) {
      return toast.error("Selecciona al menos un pedido para liquidar.")
    }
    if (modalMode === "cash") {
      const parsed = Number(receivedCashInput)
      if (receivedCashInput.trim() === "" || isNaN(parsed) || parsed < 0) {
        return toast.error("Ingresa un valor válido de efectivo recibido.")
      }
    }

    setSubmitting(true)
    try {
      const branchQuery = activeBranch?.id ? `?branchId=${encodeURIComponent(activeBranch.id)}` : ""
      const res = await apiFetch<{
        ok: boolean
        message: string
        settlement: DriverSettlementRecord
      }>(`/api/cash/driver-settlement${branchQuery}`, {
        method: "POST",
        body: JSON.stringify({
          driverId: activeDriver.driverId,
          driverName: activeDriver.driverName,
          orderIds: selectedOrderIds,
          settlementMode: settlementPolicy,
          receivedCash: modalMode === "non_cash" ? 0 : Number(receivedCashInput),
          verifyNonCash: modalMode === "non_cash",
          registerInCash: modalMode === "cash" && registerInCash,
          notes: notes.trim() || null,
        }),
      })

      toast.success(res.message || "Cuadre confirmado con éxito")
      setCompletedReceipt(res.settlement)
      await loadData()
      triggerRefresh()
      onSettled?.()
    } catch (e) {
      toast.error((e as Error).message || "No se pudo completar el cuadre")
    } finally {
      setSubmitting(false)
    }
  }

  // Imprimir tirilla / comprobante de cuadre de caja con domiciliario
  const handlePrintReceipt = (rec: DriverSettlementRecord) => {
    const printWin = window.open("", "_blank", "width=420,height=680")
    if (!printWin) return

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")

    const modeLabel =
      rec.settlementMode === "products_only"
        ? "Solo Productos (Repartidor retiene envíos)"
        : rec.settlementMode === "transfer_verification"
        ? "Verificación de Transferencias / Tarjetas"
        : "Entrega Completa (Productos + Domicilios)"

    const diffText =
      Math.abs(rec.difference) < 0.5
        ? "CUADRADO EXACTO ($0)"
        : rec.difference < 0
        ? `FALTANTE: -${formatCurrency(Math.abs(rec.difference))}`
        : `SOBRANTE: +${formatCurrency(rec.difference)}`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comprobante ${escapeHtml(rec.settlementRef)}</title>
          <style>
            body { font-family: monospace; font-size: 12px; margin: 14px; color: #000; }
            h2, h3, p { margin: 3px 0; text-align: center; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .bold { font-weight: bold; }
            .box { border: 1px solid #000; padding: 6px; margin: 6px 0; border-radius: 4px; }
            .sign { margin-top: 26px; display: flex; justify-content: space-between; gap: 16px; }
            .sign div { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 4px; font-size: 11px; }
          </style>
        </head>
        <body>
          <h2>${escapeHtml(data?.branch?.tenantName || "CUADRE DE DOMICILIARIO")}</h2>
          <p>${escapeHtml(data?.branch?.name || "Sede Principal")}</p>
          <p class="bold">${escapeHtml(rec.settlementRef)}</p>
          <p>${escapeHtml(formatDateTime(rec.settledAt || rec.createdAt))}</p>
          <div class="line"></div>

          <div class="box">
            <div class="row"><span>Domiciliario:</span><span class="bold">${escapeHtml(rec.driverName)}</span></div>
            <div class="row"><span>Recibido por:</span><span>${escapeHtml(rec.settledBy)}</span></div>
            <div class="row"><span>Pedidos liquidados:</span><span class="bold">${rec.orderCount}</span></div>
          </div>

          <div class="row"><span>Modalidad:</span><span>${escapeHtml(modeLabel)}</span></div>
          <div class="line"></div>

          <div class="row"><span>Valor en Pedidos (X):</span><span class="bold">${escapeHtml(formatCurrency(rec.productsTotal))}</span></div>
          <div class="row"><span>Valor en Domicilios (Y):</span><span class="bold">${escapeHtml(formatCurrency(rec.deliveryFeeTotal))}</span></div>
          <div class="row"><span>Total Bruto (X + Y):</span><span>${escapeHtml(formatCurrency(rec.grossTotal))}</span></div>
          <div class="line"></div>

          <div class="row bold"><span>ESPERADO EN CAJA:</span><span>${escapeHtml(formatCurrency(rec.expectedCash))}</span></div>
          <div class="row bold" style="font-size:14px;"><span>EFECTIVO RECIBIDO:</span><span>${escapeHtml(formatCurrency(rec.receivedCash))}</span></div>
          <div class="row bold"><span>ESTADO:</span><span>${escapeHtml(diffText)}</span></div>

          ${rec.notes ? `<div class="line"></div><p style="text-align:left;">Nota: ${escapeHtml(rec.notes)}</p>` : ""}

          ${
            Array.isArray(rec.orderNumbers) && rec.orderNumbers.length > 0
              ? `<div class="line"></div><p style="text-align:left;font-size:10px;word-break:break-word;">Ordenes (${rec.orderNumbers.length}): ${rec.orderNumbers.map(escapeHtml).join(", ")}</p>`
              : ""
          }

          <div class="sign">
            <div>Firma Domiciliario</div>
            <div>Firma Cajero / Admin</div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `
    printWin.document.write(html)
    printWin.document.close()
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="rounded-2xl border">
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <IconAlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData} className="rounded-xl">
            Reintentar
          </Button>
        </CardContent>
      </Card>
    )
  }

  const summary = data?.summary

  return (
    <div className="space-y-4">
      {/* Barra superior: contexto de sede, caja y filtro de periodo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {!compactHeader ? (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                <IconMotorbike className="h-5 w-5 text-primary" />
                Cuadre de Caja con Domiciliarios
              </h3>
              {data?.branch?.name && (
                <Badge variant="outline" className="text-[11px] gap-1 font-medium">
                  <IconBuildingStore className="h-3 w-3 text-primary" />
                  {data.branch.name}
                </Badge>
              )}
              {data?.openSession ? (
                <Badge className="text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 gap-1 font-semibold">
                  <IconCircleCheck className="h-3 w-3" />
                  Caja Abierta (Ingresa directo al arqueo)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px] text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 gap-1">
                  <IconLock className="h-3 w-3" />
                  Caja Cerrada (Solo liquida pedidos)
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Desglose exacto por repartidor: cuánto debe entregar por valor en pedidos (X) y por domicilios (Y) antes de marcar como pagado.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {data?.openSession ? (
              <Badge className="text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 gap-1 font-semibold">
                <IconCircleCheck className="h-3 w-3" />
                Caja Abierta · Ingresará al arqueo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[11px] text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 gap-1">
                <IconLock className="h-3 w-3" />
                Caja Cerrada · Solo marca pagados
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[165px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">Todos sin liquidar</SelectItem>
              <SelectItem value="today">Solo de hoy</SelectItem>
              <SelectItem value="yesterday">Solo de ayer</SelectItem>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-9 rounded-xl text-xs gap-1.5"
          >
            <IconRefresh className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPI Strip: X en pedidos, Y en domicilios, Total X+Y, En ruta */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="rounded-2xl border bg-primary text-primary-foreground shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-full gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-primary-foreground/85 uppercase tracking-wider">
                  Efectivo Total a Recibir
                </span>
                <IconCoins className="h-4 w-4 text-primary-foreground/85 shrink-0" />
              </div>
              <div>
                <p className="text-2xl font-extrabold tabular-nums tracking-tight">
                  {formatCurrency(summary.totalUnsettledGrossAmount)}
                </p>
                <p className="text-[11px] text-primary-foreground/85 mt-0.5">
                  {summary.totalUnsettledCashOrders} entrega(s) en {summary.driversWithDebtCount} repartidor(es)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border bg-card shadow-xs">
            <CardContent className="p-4 flex flex-col justify-between h-full gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Valor en Pedidos (X)
                </span>
                <IconPackage className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {formatCurrency(summary.totalUnsettledProductsAmount)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Valor mercancía / productos
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border bg-card shadow-xs">
            <CardContent className="p-4 flex flex-col justify-between h-full gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Valor en Domicilios (Y)
                </span>
                <IconMotorbike className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {formatCurrency(summary.totalUnsettledDeliveryFees)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Tarifas de envío cobradas
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border bg-card shadow-xs">
            <CardContent className="p-4 flex flex-col justify-between h-full gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  En Ruta / Por Verificar
                </span>
                <IconClock className="h-4 w-4 text-amber-500 shrink-0" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {formatCurrency(summary.totalInTransitAmount)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {summary.totalInTransitOrders} en camino · {summary.totalUnsettledNonCashOrders} transf. sin verificar
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sub-navegación y buscador */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-card p-2.5 rounded-2xl border shadow-2xs">
        <div className="inline-flex rounded-xl bg-muted p-1 gap-1 self-start">
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer",
              activeTab === "pending"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <IconCalculator className="h-3.5 w-3.5" />
            Pendientes por Cuadrar
            {(summary?.totalUnsettledCashOrders ?? 0) > 0 && (
              <Badge className="h-4 px-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold">
                {summary?.totalUnsettledCashOrders}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer",
              activeTab === "history"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <IconHistory className="h-3.5 w-3.5" />
            Historial de Cuadres ({data?.history?.length || 0})
          </button>
        </div>

        {activeTab === "pending" && (
          <div className="relative w-full sm:w-64">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              placeholder="Buscar domiciliario..."
              className="pl-8 pr-8 h-8 text-xs rounded-xl bg-background"
            />
            {driverSearch && (
              <button
                type="button"
                aria-label="Limpiar búsqueda de domiciliario"
                onClick={() => setDriverSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ==================== PESTAÑA 1: PENDIENTES POR CUADRAR ==================== */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {driversWithPendingAction.length === 0 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="p-8 flex flex-col items-center text-center gap-2.5">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <IconCircleCheck className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-foreground">
                  ¡Todo al día con los domiciliarios!
                </h4>
                <p className="text-xs text-muted-foreground max-w-md">
                  No hay entregas contraentrega pendientes por cuadrar en caja en este momento. Cuando un repartidor entregue pedidos, aquí verás exactamente cuánto debe entregar por mercancía (X) y por domicilios (Y).
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {driversWithPendingAction.map((d) => {
                const hasCashDebt = d.unsettledCashCount > 0
                return (
                  <Card
                    key={d.driverKey}
                    className={cn(
                      "rounded-2xl border transition-colors shadow-xs",
                      hasCashDebt
                        ? "border-amber-500/40 bg-card"
                        : "border-border bg-card/80"
                    )}
                  >
                    <CardContent className="p-4 space-y-3.5">
                      {/* Encabezado del domiciliario */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border",
                              hasCashDebt
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                : "bg-muted text-foreground border-border"
                            )}
                          >
                            <IconMotorbike className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-sm font-bold text-foreground truncate">
                                {d.driverName}
                              </h4>
                              {d.telegramConnected && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4 border-sky-500/30 text-sky-700 dark:text-sky-400 bg-sky-500/10 gap-0.5"
                                >
                                  <IconBrandTelegram className="h-2.5 w-2.5" /> Telegram
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {d.driverPhone ? `Tel: ${d.driverPhone}` : d.isStaffDomiciliario ? "Repartidor registrado" : "Conductor asignado"}
                              {d.settledTodayCount > 0 && (
                                <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-medium">
                                  · {d.settledTodayCount} liquidado(s) hoy ({formatCurrency(d.settledTodayGrossTotal)})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {hasCashDebt ? (
                          <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-[11px] font-bold shrink-0">
                            {d.unsettledCashCount} {d.unsettledCashCount === 1 ? "pedido" : "pedidos"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            Sin efectivo pendiente
                          </Badge>
                        )}
                      </div>

                      {/* Desglose Pedidos (X) + Domicilios (Y) = Total (X + Y) */}
                      {hasCashDebt && (
                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/60">
                          <div className="p-2 rounded-lg bg-background border border-border/60">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block truncate">
                              Pedidos (X)
                            </span>
                            <span className="text-sm sm:text-base font-bold tabular-nums text-foreground">
                              {formatCurrency(d.unsettledCashProductsTotal)}
                            </span>
                          </div>

                          <div className="p-2 rounded-lg bg-background border border-border/60">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground block truncate">
                              Domicilios (Y)
                            </span>
                            <span className="text-sm sm:text-base font-bold tabular-nums text-foreground">
                              {formatCurrency(d.unsettledCashDeliveryTotal)}
                            </span>
                          </div>

                          <div className="p-2 rounded-lg bg-primary/10 border border-primary/25">
                            <span className="text-[10px] uppercase font-bold text-primary block truncate">
                              Total a Entregar
                            </span>
                            <span className="text-sm sm:text-base font-extrabold tabular-nums text-primary">
                              {formatCurrency(d.unsettledCashGrossTotal)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Referencias secundarias (Transferencias o En Ruta) */}
                      {(d.unsettledNonCashCount > 0 || d.inTransitCount > 0) && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          {d.unsettledNonCashCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-medium">
                              <IconCreditCard className="h-3.5 w-3.5 shrink-0" />
                              {d.unsettledNonCashCount} transferencia/tarjeta por verificar ({formatCurrency(d.unsettledNonCashTotal)})
                            </span>
                          )}
                          {d.inTransitCount > 0 && (
                            <button
                              type="button"
                              onClick={() => setInTransitDriver(d)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-muted-foreground hover:text-foreground border border-border font-medium cursor-pointer transition-colors"
                            >
                              <IconClock className="h-3.5 w-3.5 shrink-0" />
                              {d.inTransitCount} aún en ruta ({formatCurrency(d.inTransitTotal)})
                            </button>
                          )}
                        </div>
                      )}

                      {/* Botones de acción */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-border/60">
                        {d.unsettledNonCashCount > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openNonCashModal(d)}
                            className="h-9 rounded-xl text-xs gap-1.5 border-sky-500/30 text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 active:scale-[0.96] transition-transform duration-150"
                          >
                            <IconCreditCard className="h-3.5 w-3.5" />
                            Verificar {d.unsettledNonCashCount} Transf.
                          </Button>
                        )}

                        {hasCashDebt && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openCashSettlementModal(d)}
                            className="h-9 rounded-xl text-xs font-bold gap-1.5 shadow-xs active:scale-[0.96] transition-transform duration-150"
                          >
                            <IconCalculator className="h-4 w-4" />
                            Cuadrar y Recibir {formatCurrency(d.unsettledCashGrossTotal)}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Domiciliarios al día (0 pendientes) */}
          {driversUpToDate.length > 0 && (
            <Card className="rounded-2xl border bg-muted/20">
              <CardHeader className="py-3 px-4 border-b border-border/50">
                <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <IconCircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Domiciliarios al día ({driversUpToDate.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 flex flex-wrap gap-2">
                {driversUpToDate.map((d) => (
                  <div
                    key={d.driverKey}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background border text-xs"
                  >
                    <IconMotorbike className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{d.driverName}</span>
                    {d.settledTodayCount > 0 ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                        {d.settledTodayCount} liquidado(s) hoy · {formatCurrency(d.settledTodayGrossTotal)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin entregas pendientes</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ==================== PESTAÑA 2: HISTORIAL DE CUADRES ==================== */}
      {activeTab === "history" && (
        <Card className="rounded-2xl border overflow-hidden shadow-xs">
          <CardHeader className="border-b py-3.5 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <IconReceipt2 className="h-4 w-4 text-primary" />
              Cuadres de Caja Registrados
            </CardTitle>
            <CardDescription className="text-xs">
              Registro auditable de cada entrega de efectivo recibida por cajeros o administradores.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!data?.history || data.history.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-1.5">
                <IconHistory className="h-9 w-9 mx-auto opacity-40" />
                <p className="text-sm font-medium">Aún no hay cuadres registrados</p>
                <p className="text-xs">Cuando recibas el efectivo de un domiciliario aparecerá aquí su comprobante.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs">Comprobante / Fecha</TableHead>
                      <TableHead className="text-xs">Domiciliario</TableHead>
                      <TableHead className="text-xs text-center">Pedidos</TableHead>
                      <TableHead className="text-xs text-right">Pedidos (X)</TableHead>
                      <TableHead className="text-xs text-right">Domicilios (Y)</TableHead>
                      <TableHead className="text-xs text-right">Recibido</TableHead>
                      <TableHead className="text-xs text-center">Estado</TableHead>
                      <TableHead className="text-xs">Recibió</TableHead>
                      <TableHead className="text-xs text-right">Imprimir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.history.map((h) => {
                      const diff = Number(h.difference || 0)
                      return (
                        <TableRow key={h.id} className="hover:bg-muted/20">
                          <TableCell className="text-xs whitespace-nowrap">
                            <span className="font-mono font-bold text-foreground block">{h.settlementRef}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDateTime(h.settledAt || h.createdAt)}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-bold text-foreground block">{h.driverName}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {h.settlementMode === "products_only"
                                ? "Solo productos (retuvo envíos)"
                                : h.settlementMode === "transfer_verification"
                                ? "Verificación transferencias"
                                : "Entrega completa (X + Y)"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-center font-bold tabular-nums">
                            {h.orderCount}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono tabular-nums">
                            {formatCurrency(h.productsTotal)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono tabular-nums">
                            {formatCurrency(h.deliveryFeeTotal)}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold tabular-nums text-foreground">
                            {formatCurrency(h.receivedCash)}
                          </TableCell>
                          <TableCell className="text-center">
                            {h.verifyNonCash ? (
                              <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-700 dark:text-sky-300">
                                Verificado
                              </Badge>
                            ) : Math.abs(diff) < 0.5 ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 text-[10px]">
                                Cuadrado
                              </Badge>
                            ) : diff < 0 ? (
                              <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive tabular-nums">
                                Faltante {formatCurrency(Math.abs(diff))}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 tabular-nums">
                                Sobrante +{formatCurrency(diff)}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {h.settledBy}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintReceipt(h)}
                              className="h-8 w-8 rounded-lg"
                              title="Imprimir comprobante de cuadre"
                            >
                              <IconPrinter className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== MODAL: LIQUIDAR / CUADRAR DOMICILIARIO ==================== */}
      <Dialog
        open={Boolean(activeDriver)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDriver(null)
            setCompletedReceipt(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl p-5 sm:p-6">
          {activeDriver && !completedReceipt && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  {modalMode === "non_cash" ? (
                    <>
                      <IconCreditCard className="h-5 w-5 text-sky-600" />
                      Verificar Transferencias / Tarjetas — {activeDriver.driverName}
                    </>
                  ) : (
                    <>
                      <IconCalculator className="h-5 w-5 text-primary" />
                      Cuadre de Caja — {activeDriver.driverName}
                    </>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {modalMode === "non_cash"
                    ? "Confirma los pedidos pagados por transferencia o datáfono ya verificados en cuenta. Estos NO suman efectivo a la caja."
                    : "Revisa los pedidos entregados, verifica el efectivo que entrega el domiciliario y confirma para marcarlos como Pagados."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-1">
                {/* Selector de modalidad si es cuadre en efectivo */}
                {modalMode === "cash" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">¿Qué entrega el domiciliario en caja?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSettlementPolicy("full")
                          syncReceivedInputWithExpected(selectedOrderIds, "full")
                        }}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-colors active:scale-[0.98] cursor-pointer",
                          settlementPolicy === "full"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-foreground">
                            Entrega Completa (Pedidos + Domicilios)
                          </span>
                          <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
                            X + Y
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Entrega todo lo recaudado: mercancía ({formatCurrency(selectionTotals.productsTotal)}) + envíos ({formatCurrency(selectionTotals.deliveryFeeTotal)}).
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSettlementPolicy("products_only")
                          syncReceivedInputWithExpected(selectedOrderIds, "products_only")
                        }}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-colors active:scale-[0.98] cursor-pointer",
                          settlementPolicy === "products_only"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-foreground">
                            Solo Pedidos (Retiene sus domicilios)
                          </span>
                          <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
                            Solo X
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          El repartidor conserva {formatCurrency(selectionTotals.deliveryFeeTotal)} de envíos y entrega {formatCurrency(selectionTotals.productsTotal)} en caja.
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Tarjeta resumen live de X, Y y Esperado */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl border bg-muted/30">
                  <div className="p-2.5 rounded-xl bg-background border">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Seleccionados
                    </span>
                    <span className="text-base font-bold tabular-nums text-foreground">
                      {selectionTotals.count} / {selectionTotals.totalAvailable} ped
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-background border">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Pedidos (X)
                    </span>
                    <span className="text-base font-bold tabular-nums text-foreground">
                      {formatCurrency(selectionTotals.productsTotal)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-background border">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                      Domicilios (Y)
                    </span>
                    <span className="text-base font-bold tabular-nums text-foreground">
                      {formatCurrency(selectionTotals.deliveryFeeTotal)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-primary text-primary-foreground">
                    <span className="text-[10px] uppercase font-bold text-primary-foreground/85 block">
                      {modalMode === "non_cash" ? "Total a Verificar" : "Debe Entregar"}
                    </span>
                    <span className="text-base font-extrabold tabular-nums">
                      {formatCurrency(
                        modalMode === "non_cash"
                          ? selectionTotals.grossTotal
                          : selectionTotals.expectedCash
                      )}
                    </span>
                  </div>
                </div>

                {/* Lista interactiva de pedidos incluidos */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <Label className="text-xs font-semibold">
                      Pedidos entregados incluidos en este cuadre
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={orderSearch}
                          onChange={(e) => setOrderSearch(e.target.value)}
                          placeholder="Filtrar # orden o cliente..."
                          className="h-7 pl-7 text-[11px] rounded-lg w-44"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={toggleSelectAllOrders}
                        className="h-7 text-[11px] rounded-lg px-2.5"
                      >
                        {selectedOrderIds.length === selectionTotals.totalAvailable
                          ? "Ninguno"
                          : "Todos"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <div className="max-h-52 overflow-y-auto scroll-thin">
                      <Table>
                        <TableHeader className="bg-muted/40 sticky top-0 z-10">
                          <TableRow>
                            <TableHead className="w-9 text-center"></TableHead>
                            <TableHead className="text-[11px]">Orden</TableHead>
                            <TableHead className="text-[11px]">Cliente / Entrega</TableHead>
                            <TableHead className="text-[11px] text-right">Pedidos (X)</TableHead>
                            <TableHead className="text-[11px] text-right">Domicilio (Y)</TableHead>
                            <TableHead className="text-[11px] text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {modalOrdersList.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                No hay pedidos que coincidan con el filtro
                              </TableCell>
                            </TableRow>
                          ) : (
                            modalOrdersList.map((o) => {
                              const checked = selectedOrderIds.includes(o.id)
                              return (
                                <TableRow
                                  key={o.id}
                                  onClick={() => toggleOrderSelection(o.id)}
                                  className={cn(
                                    "cursor-pointer transition-colors",
                                    checked ? "bg-primary/5 hover:bg-primary/10" : "opacity-60 hover:opacity-100"
                                  )}
                                >
                                  <TableCell className="text-center py-2">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {}}
                                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary pointer-events-none"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2 font-mono text-[11px] font-bold whitespace-nowrap">
                                    {o.orderNumber}
                                    <span className="block text-[9px] font-sans font-normal text-muted-foreground capitalize">
                                      {o.paymentMethod}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-2 text-xs max-w-[180px]">
                                    <p className="font-medium truncate text-foreground">{o.customerName}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                      {o.deliveredAt ? formatDateTime(o.deliveredAt) : formatDateTime(o.createdAt)}
                                    </p>
                                  </TableCell>
                                  <TableCell className="py-2 text-right font-mono text-[11px] tabular-nums">
                                    {formatCurrency(o.productsAmount)}
                                  </TableCell>
                                  <TableCell className="py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                    {formatCurrency(o.deliveryFee)}
                                  </TableCell>
                                  <TableCell className="py-2 text-right font-mono text-xs font-bold tabular-nums">
                                    {formatCurrency(o.total)}
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>

                {/* Conteo físico y diferencia (solo en modo efectivo) */}
                {modalMode === "cash" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs font-semibold">
                          Efectivo físico entregado por el domiciliario *
                        </Label>
                        <button
                          type="button"
                          onClick={() => setReceivedCashInput(String(selectionTotals.expectedCash))}
                          className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                        >
                          Monto exacto ({formatCurrency(selectionTotals.expectedCash)})
                        </button>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={receivedCashInput}
                        onChange={(e) => setReceivedCashInput(e.target.value)}
                        placeholder="0"
                        className="h-10 text-base font-bold font-mono tabular-nums rounded-xl"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Resultado del Conteo</Label>
                      <div
                        className={cn(
                          "h-10 px-3 rounded-xl border flex items-center justify-between text-xs font-bold",
                          Math.abs(liveDiff) < 0.5
                            ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                            : liveDiff < 0
                            ? "bg-rose-50/70 dark:bg-rose-950/30 border-destructive/40 text-destructive"
                            : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-500/30 text-amber-700 dark:text-amber-300"
                        )}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {Math.abs(liveDiff) < 0.5 ? (
                            <IconCircleCheck className="h-4 w-4 shrink-0" />
                          ) : liveDiff < 0 ? (
                            <IconCircleX className="h-4 w-4 shrink-0" />
                          ) : (
                            <IconAlertTriangle className="h-4 w-4 shrink-0" />
                          )}
                          {Math.abs(liveDiff) < 0.5
                            ? "Cuadrado exacto"
                            : liveDiff < 0
                            ? "Faltante en entrega"
                            : "Sobrante en entrega"}
                        </span>
                        <span className="font-mono tabular-nums text-sm">
                          {liveDiff > 0 ? "+" : ""}
                          {formatCurrency(liveDiff)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Integración con caja activa + notas */}
                <div className="space-y-2.5">
                  {modalMode === "cash" && data?.openSession ? (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/25 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={registerInCash}
                        onChange={(e) => setRegisterInCash(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <div className="text-xs">
                        <p className="font-semibold text-foreground">
                          Sumar {formatCurrency(liveReceived)} a la sesión de Caja abierta actual
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Registrará automáticamente el ingreso en Caja y Arqueo e Ingresos/Egresos para que el cierre de caja cuadre exacto.
                        </p>
                      </div>
                    </label>
                  ) : modalMode === "cash" ? (
                    <div className="p-3 rounded-xl border bg-amber-500/5 border-amber-500/25 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                      <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        No hay una caja abierta en esta sede. Puedes liquidar los pedidos para marcarlos como <strong>Pagados</strong> y guardar el comprobante del cuadre, pero no se sumará a ninguna sesión de caja física.
                      </span>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Observaciones del cuadre (opcional)</Label>
                    <Textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej. Entregado completo en billetes y monedas / Se verificó Nequi..."
                      className="text-xs rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveDriver(null)}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting || selectionTotals.count === 0}
                  onClick={handleConfirmSettlement}
                  className="rounded-xl text-xs font-bold gap-1.5 shadow-xs active:scale-[0.96] transition-transform duration-150"
                >
                  {submitting ? (
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconCheck className="h-4 w-4" />
                  )}
                  {modalMode === "non_cash"
                    ? `Confirmar ${selectionTotals.count} Transferencia(s) Pagadas`
                    : `Confirmar Cuadre y Marcar ${selectionTotals.count} Pagados`}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Vista de Comprobante Listo tras Liquidar */}
          {activeDriver && completedReceipt && (
            <div className="space-y-4 py-2">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <IconCircleCheck className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  ¡Cuadre Confirmado y Liquidado!
                </h3>
                <p className="text-xs text-muted-foreground max-w-md">
                  Se marcaron <strong>{completedReceipt.orderCount} pedido(s)</strong> de{" "}
                  <strong>{completedReceipt.driverName}</strong> como{" "}
                  <strong>Pagados</strong> y se sincronizaron en Ventas.
                </p>
              </div>

              <div className="rounded-2xl border bg-muted/30 p-4 space-y-2 text-xs max-w-md mx-auto">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comprobante:</span>
                  <span className="font-mono font-bold text-foreground">{completedReceipt.settlementRef}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Pedidos (X):</span>
                  <span className="font-mono font-bold tabular-nums">{formatCurrency(completedReceipt.productsTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Domicilios (Y):</span>
                  <span className="font-mono font-bold tabular-nums">{formatCurrency(completedReceipt.deliveryFeeTotal)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-extrabold text-foreground">
                  <span>Efectivo recibido en Caja:</span>
                  <span className="font-mono tabular-nums text-primary">{formatCurrency(completedReceipt.receivedCash)}</span>
                </div>
              </div>

              <DialogFooter className="gap-2 justify-center sm:justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePrintReceipt(completedReceipt)}
                  className="rounded-xl text-xs gap-1.5"
                >
                  <IconPrinter className="h-4 w-4" />
                  Imprimir Comprobante
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setActiveDriver(null)
                    setCompletedReceipt(null)
                  }}
                  className="rounded-xl text-xs font-bold"
                >
                  Listo
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL INFORMATIVO: PEDIDOS AÚN EN RUTA ==================== */}
      <Dialog open={Boolean(inTransitDriver)} onOpenChange={(o) => !o && setInTransitDriver(null)}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconClock className="h-5 w-5 text-amber-500" />
              Pedidos Aún en Ruta — {inTransitDriver?.driverName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Estos pedidos todavía no han sido marcados como entregados al cliente, por eso aún no se cobran en el cuadre de caja.
            </DialogDescription>
          </DialogHeader>

          {inTransitDriver && (
            <div className="max-h-72 overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-xs">Orden</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inTransitDriver.inTransitOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs font-bold">{o.orderNumber}</TableCell>
                      <TableCell className="text-xs">
                        <p className="font-medium">{o.customerName}</p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{o.deliveryAddress}</p>
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        <Badge variant="outline" className="text-[10px]">{o.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold tabular-nums">
                        {formatCurrency(o.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInTransitDriver(null)} className="rounded-xl text-xs">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
