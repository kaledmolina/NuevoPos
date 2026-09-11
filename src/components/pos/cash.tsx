"use client"

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  IconWallet, IconLock, IconLockOpen, IconPlus, IconMinus, IconCircleArrowDown, IconCircleArrowUp,
  IconReceipt2, IconCircleCheck, IconAlertTriangle, IconHistory, IconEye, IconCoins, IconCalculator,
  IconUser, IconCircleX, IconClock, IconFileText, IconCreditCard,
} from "@tabler/icons-react"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface CashTransaction {
  id: string
  cashSessionId: string
  type: string // venta | ingreso | egreso
  amount: number
  concept: string
  method: string // efectivo | tarjeta | transferencia
  reference: string | null
  createdAt: string
}

interface CashSession {
  id: string
  openingAmount: number
  closingAmount: number | null
  expectedAmount: number | null
  difference: number | null
  status: string // abierta | cerrada
  openedAt: string
  closedAt: string | null
  openedBy: string | null
  closedBy: string | null
  notes: string | null
  transactions?: CashTransaction[]
  _count?: { transactions: number }
}

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  credito: "Crédito",
}

// ---------------------------------------------------------------------------
// Helpers de cálculo (efectivo y créditos)
// ---------------------------------------------------------------------------
function breakdown(s: CashSession) {
  const ventasEfectivo = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "venta")
    .reduce((a, t) => a + Number(t.amount), 0)

  const ventasCredito = (s.transactions ?? [])
    .filter((t) => t.method === "credito" && t.type === "venta")
    .reduce((a, t) => a + Number(t.amount), 0)

  const abonosCredito = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "ingreso" && t.concept.toLowerCase().includes("abono"))
    .reduce((a, t) => a + Number(t.amount), 0)

  const otrosIngresos = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "ingreso" && !t.concept.toLowerCase().includes("abono"))
    .reduce((a, t) => a + Number(t.amount), 0)

  const ingresos = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "ingreso")
    .reduce((a, t) => a + Number(t.amount), 0)

  const egresos = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "egreso")
    .reduce((a, t) => a + Number(t.amount), 0)

  // Saldo real en efectivo esperado en caja
  const esperado = Number(s.openingAmount) + ventasEfectivo + ingresos - egresos
  const totalVendidoTurno = ventasEfectivo + ventasCredito

  return {
    ventas: ventasEfectivo,
    ventasEfectivo,
    ventasCredito,
    abonosCredito,
    otrosIngresos,
    ingresos,
    egresos,
    esperado,
    totalVendidoTurno,
  }
}

function effectiveBalance(s: CashSession): number {
  return breakdown(s).esperado
}

function diferenciaInfo(diff: number) {
  if (Math.abs(diff) < 0.5)
    return { label: "Cuadrado", tone: "ok", color: "text-blue-600", bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900" }
  if (diff < 0)
    return { label: `Faltante ${formatCurrency(Math.abs(diff))}`, tone: "bad", color: "text-red-600", bg: "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900" }
  return { label: `Sobrante ${formatCurrency(diff)}`, tone: "warn", color: "text-amber-600", bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900" }
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function CashView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)

  const [current, setCurrent] = useState<CashSession | null>(null)
  const [history, setHistory] = useState<CashSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Diálogos
  const [openOpen, setOpenOpen] = useState(false)
  const [openTx, setOpenTx] = useState(false)
  const [openClose, setOpenClose] = useState(false)
  const [detail, setDetail] = useState<CashSession | null>(null)

  // Formularios
  const [openForm, setOpenForm] = useState({ openingAmount: "", openedBy: "" })
  const [txForm, setTxForm] = useState({
    type: "ingreso" as "ingreso" | "egreso",
    amount: "",
    concept: "",
    method: "efectivo",
    reference: "",
  })
  const [closeForm, setCloseForm] = useState({
    closingAmount: "",
    closedBy: "",
    notes: "",
  })

  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch<CashSession | null>("/api/cash"),
      apiFetch<CashSession[]>("/api/cash/history"),
    ])
      .then(([c, h]) => {
        setCurrent(c ?? null)
        setHistory(h ?? [])
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Derivados de la sesión abierta
  const stats = useMemo(() => {
    if (!current) return null
    const b = breakdown(current)
    return b
  }, [current])

  // Diferencia en vivo del arqueo
  const liveDiff = useMemo(() => {
    if (!stats) return 0
    const declarado = parseFloat(closeForm.closingAmount) || 0
    return declarado - stats.esperado
  }, [stats, closeForm.closingAmount])

  // -------------------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------------------
  const openCash = async () => {
    const monto = parseFloat(openForm.openingAmount)
    if (isNaN(monto) || monto < 0)
      return toast.error("Ingresa un monto inicial válido")
    if (!openForm.openedBy.trim())
      return toast.error("Indica el responsable de apertura")
    setSaving(true)
    try {
      await apiFetch("/api/cash", {
        method: "POST",
        body: JSON.stringify({ openingAmount: monto, openedBy: openForm.openedBy.trim() }),
      })
      toast.success("Caja abierta correctamente")
      setOpenOpen(false)
      setOpenForm({ openingAmount: "", openedBy: "" })
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openTxDialog = (type: "ingreso" | "egreso") => {
    setTxForm({ type, amount: "", concept: "", method: "efectivo", reference: "" })
    setOpenTx(true)
  }

  const saveTx = async () => {
    const monto = parseFloat(txForm.amount)
    if (isNaN(monto) || monto <= 0)
      return toast.error("Ingresa un monto válido mayor a cero")
    if (!txForm.concept.trim())
      return toast.error("Indica el concepto del movimiento")
    setSaving(true)
    try {
      await apiFetch("/api/cash/transaction", {
        method: "POST",
        body: JSON.stringify({
          type: txForm.type,
          amount: monto,
          concept: txForm.concept.trim(),
          method: txForm.method,
          reference: txForm.reference.trim() || null,
        }),
      })
      toast.success(txForm.type === "ingreso" ? "Ingreso registrado" : "Egreso registrado")
      setOpenTx(false)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const closeCash = async () => {
    if (!current) return
    const declarado = parseFloat(closeForm.closingAmount)
    if (isNaN(declarado) || declarado < 0)
      return toast.error("Ingresa el monto contado (declarado)")
    if (!closeForm.closedBy.trim())
      return toast.error("Indica el responsable del cierre")
    setSaving(true)
    try {
      await apiFetch("/api/cash/close", {
        method: "POST",
        body: JSON.stringify({
          id: current.id,
          closingAmount: declarado,
          closedBy: closeForm.closedBy.trim(),
          notes: closeForm.notes.trim() || null,
        }),
      })
      toast.success("Caja cerrada · Arqueo realizado")
      setOpenClose(false)
      setCloseForm({ closingAmount: "", closedBy: "", notes: "" })
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading && !current && history.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card className="border-border">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <IconAlertTriangle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Reintentar</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <IconWallet className="h-5 w-5 text-primary" /> Caja y arqueo
          </h2>
          <p className="text-sm text-muted-foreground">
            {current
              ? "Sesión abierta · registra movimientos y realiza el cuadre al cerrar"
              : "Gestiona la apertura, cierre y cuadre de caja"}
          </p>
        </div>
        {current ? (
          <Badge className="bg-primary hover:bg-primary text-primary-foreground gap-1 rounded-full px-3 py-1 shadow-xs">
            <IconCircleCheck className="h-3.5 w-3.5" /> Caja abierta
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 rounded-full px-3 py-1">
            <IconLock className="h-3.5 w-3.5" /> Caja cerrada
          </Badge>
        )}
      </div>

      {/* ===================== SESIÓN ABIERTA ===================== */}
      {current && stats && (
        <>
          {/* Tarjeta resumen de la sesión */}
          <Card className="overflow-hidden rounded-2xl shadow-xs border bg-card text-card-foreground">
            <CardContent className="p-4 md:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/70">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="flex h-2 w-2 rounded-full bg-primary" />
                    <span>Sesión de caja activa</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <IconClock className="h-3.5 w-3.5" /> Apertura: {formatDateTime(current.openedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <IconUser className="h-3.5 w-3.5" /> Responsable: {current.openedBy ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-start sm:items-end">
                  <span className="text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
                    Saldo en efectivo esperado
                  </span>
                  <span className="text-3xl md:text-4xl font-extrabold text-foreground tabular-nums tracking-tight">
                    {formatCurrency(stats.esperado)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <SummaryStat label="Monto inicial" value={formatCurrency(current.openingAmount)} />
                <SummaryStat label="Ventas efectivo" value={formatCurrency(stats.ventasEfectivo)} />
                <SummaryStat label="Abonos crédito (+)" value={formatCurrency(stats.abonosCredito)} />
                <SummaryStat label="Otros ingresos (+)" value={formatCurrency(stats.otrosIngresos)} />
                <SummaryStat label="Egresos efectivo (−)" value={formatCurrency(stats.egresos)} isNegative />
                <SummaryStat label="Ventas crédito (Turno)" value={formatCurrency(stats.ventasCredito)} isCredit />
              </div>
            </CardContent>
          </Card>

          {/* Acciones de Caja */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-tour="cash-movement-actions">
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl text-sm font-semibold gap-2 border-border hover:bg-muted/80"
              onClick={() => openTxDialog("ingreso")}
              data-tour="cash-income-btn"
            >
              <IconCircleArrowDown className="h-4 w-4 text-primary" /> Registrar Ingreso
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-xl text-sm font-semibold gap-2 border-border hover:bg-muted/80 text-foreground"
              onClick={() => openTxDialog("egreso")}
              data-tour="cash-expense-btn"
            >
              <IconCircleArrowUp className="h-4 w-4 text-rose-500" /> Registrar Egreso
            </Button>
            <Button
              size="lg"
              className="h-12 rounded-xl text-sm font-semibold gap-2 shadow-sm"
              onClick={() => {
                setCloseForm({ closingAmount: String(stats.esperado), closedBy: current.openedBy ?? "", notes: "" })
                setOpenClose(true)
              }}
              data-tour="cash-close-btn"
            >
              <IconCalculator className="h-4 w-4" /> Cerrar caja / Realizar Arqueo
            </Button>
          </div>

          {/* Movimientos */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconReceipt2 className="h-4 w-4 text-primary" /> Movimientos de la sesión
                </CardTitle>
                <Badge variant="outline" className="text-xs font-normal">
                  {(current.transactions ?? []).length} registros
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(!current.transactions || current.transactions.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconReceipt2 className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">Aún no hay movimientos en esta sesión</p>
                  <p className="text-xs">Las ventas y los ingresos/egresos aparecerán aquí</p>
                </div>
              ) : (
                <div className="max-h-[28rem] overflow-y-auto scroll-thin">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead className="w-[110px]">Tipo</TableHead>
                          <TableHead>Concepto</TableHead>
                          <TableHead className="hidden sm:table-cell">Método</TableHead>
                          <TableHead className="hidden md:table-cell">Referencia</TableHead>
                          <TableHead className="hidden sm:table-cell whitespace-nowrap">Fecha</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(current.transactions ?? [])]
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                          .map((t) => (
                            <TableRow key={t.id}>
                              <TableCell>
                                <TypeBadge type={t.type} method={t.method} concept={t.concept} />
                              </TableCell>
                              <TableCell className="max-w-[16rem]">
                                <span className="text-sm truncate block font-medium">{t.concept}</span>
                                {t.method === "credito" && (
                                  <span className="text-[10px] text-muted-foreground font-medium block">
                                    Cuenta por cobrar (No suma a caja física)
                                  </span>
                                )}
                                {t.type === "ingreso" && t.concept?.toLowerCase().includes("abono") && (
                                  <span className="text-[10px] text-primary font-medium block">
                                    Recaudo de cartera en efectivo
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-xs capitalize font-normal">
                                  {METHOD_LABEL[t.method] ?? t.method}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                                {t.reference ?? "—"}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                                {formatDateTime(t.createdAt)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                <span className={t.type === "egreso" ? "text-rose-600 dark:text-rose-400" : "text-foreground"}>
                                  {t.type === "egreso" ? "−" : "+"}{formatCurrency(t.amount)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ===================== CAJA CERRADA ===================== */}
      {!current && (
        <Card className="border-dashed" data-tour="cash-open-card">
          <CardContent className="p-6 md:p-10 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <IconWallet className="h-8 w-8 text-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Caja cerrada</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No hay una sesión de caja activa. Abre una nueva sesión para registrar ventas y movimientos.
              </p>
            </div>
            <Button size="lg" className="gap-2" onClick={() => setOpenOpen(true)} data-tour="cash-open-btn">
              <IconLockOpen className="h-4 w-4" /> Abrir caja
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===================== HISTORIAL ===================== */}
      <div className="space-y-2" data-tour="cash-history-card">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <IconHistory className="h-4 w-4" /> Historial de sesiones
        </h3>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <IconHistory className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No hay sesiones registradas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Apertura</TableHead>
                      <TableHead className="hidden sm:table-cell">Responsable</TableHead>
                      <TableHead className="text-right">Inicial</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Esperado</TableHead>
                      <TableHead className="text-right">Cierre</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((s) => {
                      const diff = s.difference ?? null
                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setDetail(s)}
                        >
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDateTime(s.openedAt)}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            <span className="inline-flex items-center gap-1">
                              <IconUser className="h-3 w-3 text-muted-foreground" />
                              {s.openedBy ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(s.openingAmount)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums hidden md:table-cell">
                            {s.expectedAmount != null ? formatCurrency(s.expectedAmount) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {s.closingAmount != null ? formatCurrency(s.closingAmount) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {diff === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : Math.abs(diff) < 0.5 ? (
                              <span className="text-primary font-medium">{formatCurrency(0)}</span>
                            ) : (
                              <span className={diff < 0 ? "text-rose-600 font-medium" : "text-amber-600 font-medium"}>
                                {diff < 0 ? "−" : "+"}{formatCurrency(Math.abs(diff))}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {s.status === "abierta" ? (
                              <Badge className="bg-primary hover:bg-primary text-primary-foreground text-xs gap-1">
                                <IconCircleCheck className="h-3 w-3" /> Abierta
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <IconLock className="h-3 w-3" /> Cerrada
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Ver detalle de sesión"
                              onClick={(e) => { e.stopPropagation(); setDetail(s) }}
                              aria-label="Ver detalle de sesión"
                            >
                              <IconEye className="h-3.5 w-3.5" />
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
      </div>

      {/* ===================== DIALOG: ABRIR CAJA ===================== */}
      <Dialog open={openOpen} onOpenChange={setOpenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconLockOpen className="h-5 w-5 text-primary" /> Abrir caja
            </DialogTitle>
            <DialogDescription>
              Registra el monto inicial en efectivo y el responsable de la sesión.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto inicial (efectivo) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={openForm.openingAmount}
                onChange={(e) => setOpenForm({ ...openForm, openingAmount: e.target.value })}
                placeholder="0"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">Base de efectivo con la que inicia el turno.</p>
            </div>
            <div>
              <Label>Responsable *</Label>
              <Input
                value={openForm.openedBy}
                onChange={(e) => setOpenForm({ ...openForm, openedBy: e.target.value })}
                placeholder="Nombre del cajero"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenOpen(false)}>Cancelar</Button>
            <Button onClick={openCash} disabled={saving}>
              {saving ? "Abriendo…" : "Abrir caja"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: INGRESO / EGRESO ===================== */}
      <Dialog open={openTx} onOpenChange={setOpenTx}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {txForm.type === "ingreso" ? (
                <><IconCircleArrowDown className="h-5 w-5 text-primary" /> Registrar ingreso</>
              ) : (
                <><IconCircleArrowUp className="h-5 w-5 text-rose-500" /> Registrar egreso</>
              )}
            </DialogTitle>
            <DialogDescription>
              {txForm.type === "ingreso"
                ? "Adiciona efectivo u otro medio a la caja (ej: adelanto, pago de servicio)."
                : "Retira efectivo u otro medio de la caja (ej: pago a proveedor, gasto menor)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto *</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                placeholder="0"
                autoFocus
              />
            </div>
            <div>
              <Label>Concepto *</Label>
              <Input
                value={txForm.concept}
                onChange={(e) => setTxForm({ ...txForm, concept: e.target.value })}
                placeholder={txForm.type === "ingreso" ? "Ej: Adelanto de efectivo" : "Ej: Pago a proveedor"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Método</Label>
                <Select
                  value={txForm.method}
                  onValueChange={(v) => setTxForm({ ...txForm, method: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Referencia</Label>
                <Input
                  value={txForm.reference}
                  onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>
            {txForm.method !== "efectivo" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <IconAlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Los movimientos no efectivo no afectan el saldo de efectivo ni el arqueo.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenTx(false)}>Cancelar</Button>
            <Button
              onClick={saveTx}
              disabled={saving}
              className={txForm.type === "ingreso"
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
            >
              {saving ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: ARQUEO / CIERRE ===================== */}
      <Dialog open={openClose} onOpenChange={setOpenClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconCalculator className="h-5 w-5 text-primary" /> Arqueo de caja
            </DialogTitle>
            <DialogDescription>
              Cuenta el efectivo real y compáralo con el monto esperado para cerrar la sesión.
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="space-y-3">
              {/* Resumen del cálculo */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
                <CalcRow icon={<IconCoins className="h-4 w-4 text-muted-foreground" />} label="Monto inicial" value={formatCurrency(current?.openingAmount ?? 0)} />
                <CalcRow icon={<IconCircleArrowDown className="h-4 w-4 text-primary" />} label="Ventas en efectivo (+)" value={`+ ${formatCurrency(stats.ventasEfectivo)}`} valueClass="text-primary font-semibold" />
                {stats.abonosCredito > 0 && (
                  <CalcRow icon={<IconPlus className="h-4 w-4 text-primary" />} label="Abonos a crédito recibidos (+)" value={`+ ${formatCurrency(stats.abonosCredito)}`} valueClass="text-primary font-semibold" />
                )}
                {stats.otrosIngresos > 0 && (
                  <CalcRow icon={<IconPlus className="h-4 w-4 text-primary" />} label="Otros ingresos en efectivo (+)" value={`+ ${formatCurrency(stats.otrosIngresos)}`} valueClass="text-primary font-semibold" />
                )}
                <CalcRow icon={<IconMinus className="h-4 w-4 text-rose-500" />} label="Egresos en efectivo (−)" value={`− ${formatCurrency(stats.egresos)}`} valueClass="text-rose-600 font-semibold" />
                <Separator />
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold inline-flex items-center gap-2">
                    <IconCoins className="h-4 w-4 text-primary" /> Total efectivo esperado (a contar)
                  </span>
                  <span className="font-bold tabular-nums text-base">{formatCurrency(stats.esperado)}</span>
                </div>
              </div>

              {/* Bloque informativo de ventas a crédito */}
              {stats.ventasCredito > 0 && (
                <div className="rounded-lg border bg-muted/40 p-2.5 flex items-center justify-between text-xs text-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <IconCreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Ventas a crédito del turno (por cobrar):</span>
                  </span>
                  <span className="font-bold tabular-nums text-sm shrink-0">{formatCurrency(stats.ventasCredito)}</span>
                </div>
              )}

              {/* Input declarado */}
              <div>
                <Label>Monto contado (declarado) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={closeForm.closingAmount}
                  onChange={(e) => setCloseForm({ ...closeForm, closingAmount: e.target.value })}
                  placeholder="0"
                  className="text-lg font-semibold"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Efectivo físico contado al cerrar.
                </p>
              </div>

              {/* Diferencia en vivo */}
              <div className={`rounded-lg border p-3 flex items-center justify-between ${diferenciaInfo(liveDiff).bg}`}>
                <div className="flex items-center gap-2">
                  {Math.abs(liveDiff) < 0.5 ? (
                    <IconCircleCheck className="h-5 w-5 text-primary" />
                  ) : liveDiff < 0 ? (
                    <IconCircleX className="h-5 w-5 text-destructive" />
                  ) : (
                    <IconAlertTriangle className="h-5 w-5 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">Diferencia</span>
                </div>
                <div className="text-right">
                  <div className={`font-bold tabular-nums ${diferenciaInfo(liveDiff).color}`}>
                    {liveDiff > 0 ? "+" : ""}{formatCurrency(liveDiff)}
                  </div>
                  <div className={`text-xs ${diferenciaInfo(liveDiff).color}`}>
                    {diferenciaInfo(liveDiff).label}
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <Label>Responsable del cierre *</Label>
                <Input
                  value={closeForm.closedBy}
                  onChange={(e) => setCloseForm({ ...closeForm, closedBy: e.target.value })}
                  placeholder="Nombre de quien cierra"
                />
              </div>
              <div>
                <Label>Notas (opcional)</Label>
                <Textarea
                  value={closeForm.notes}
                  onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Observaciones sobre el cuadre, faltantes, sobrantes…"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenClose(false)}>Cancelar</Button>
            <Button
              onClick={closeCash}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving ? "Cerrando…" : "Confirmar cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== DIALOG: DETALLE HISTORIAL ===================== */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconFileText className="h-5 w-5 text-primary" /> Detalle de sesión
            </DialogTitle>
            <DialogDescription>
              {detail && formatDateTime(detail.openedAt)}
              {detail?.closedAt ? ` → ${formatDateTime(detail.closedAt)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <DetailItem label="Responsable apertura" value={detail.openedBy ?? "—"} />
                <DetailItem label="Responsable cierre" value={detail.closedBy ?? "—"} />
                <DetailItem label="Monto inicial" value={formatCurrency(detail.openingAmount)} />
                <DetailItem label="Monto contado" value={detail.closingAmount != null ? formatCurrency(detail.closingAmount) : "—"} />
                <DetailItem label="Monto esperado" value={detail.expectedAmount != null ? formatCurrency(detail.expectedAmount) : "—"} />
                <DetailItem label="N° movimientos" value={String(detail._count?.transactions ?? 0)} />
              </div>

              <Separator />

              {/* Diferencia */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Diferencia</span>
                {detail.difference == null ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : Math.abs(detail.difference) < 0.5 ? (
                  <Badge className="bg-primary hover:bg-primary text-primary-foreground gap-1">
                    <IconCircleCheck className="h-3.5 w-3.5" /> Cuadrado
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={`gap-1 ${detail.difference < 0
                      ? "border-destructive/30 text-destructive"
                      : "border-amber-300 text-amber-600 dark:border-amber-800"}`}
                  >
                    {detail.difference < 0 ? <IconCircleX className="h-3.5 w-3.5" /> : <IconAlertTriangle className="h-3.5 w-3.5" />}
                    {detail.difference < 0 ? "Faltante " : "Sobrante "}
                    {formatCurrency(Math.abs(detail.difference))}
                  </Badge>
                )}
              </div>

              {detail.notes && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notas</p>
                  <p className="whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                Esta sesión reportó <strong className="text-foreground">{detail._count?.transactions ?? 0}</strong> movimientos.
                {detail.status === "abierta" && " La sesión sigue abierta."}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------
function SummaryStat({
  label, value, isNegative, isCredit,
}: { label: string; value: string; isNegative?: boolean; isCredit?: boolean }) {
  return (
    <div className="bg-muted/40 p-3 rounded-xl border border-border/60 flex flex-col justify-between">
      <p className="text-muted-foreground text-[10px] uppercase font-semibold tracking-wider truncate mb-1">
        {label}
      </p>
      <p className={cn(
        "font-bold text-sm sm:text-base tabular-nums truncate",
        isNegative ? "text-rose-600 dark:text-rose-400" : isCredit ? "text-primary" : "text-foreground"
      )}>
        {value}
      </p>
    </div>
  )
}

function TypeBadge({ type, method, concept }: { type: string; method?: string; concept?: string }) {
  if (type === "venta") {
    if (method === "credito") {
      return (
        <Badge variant="outline" className="text-[11px] font-normal border-border">
          Venta Crédito
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
        Venta Efectivo
      </Badge>
    )
  }
  if (type === "ingreso") {
    const isAbono = concept?.toLowerCase().includes("abono")
    return (
      <Badge variant="outline" className="text-[11px] font-normal text-foreground">
        {isAbono ? "Abono Crédito" : "Ingreso"}
      </Badge>
    )
  }
  if (type === "egreso") {
    return (
      <Badge variant="outline" className="text-[11px] font-medium text-rose-600 dark:text-rose-400 border-rose-500/30">
        Egreso
      </Badge>
    )
  }
  return <Badge variant="outline" className="text-[11px]">{type}</Badge>
}

function CalcRow({
  icon, label, value, valueClass,
}: { icon: ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className={`tabular-nums ${valueClass ?? ""}`}>{value}</span>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
