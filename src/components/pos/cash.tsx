"use client"

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDateTime } from "@/lib/format"
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
  Wallet, Lock, Unlock, Plus, Minus, ArrowDownCircle, ArrowUpCircle,
  Receipt, CheckCircle2, AlertTriangle, History, Eye, Coins, Calculator,
  User, XCircle, Clock, FileText,
} from "lucide-react"

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
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
}

// ---------------------------------------------------------------------------
// Helpers de cálculo (solo efectivo)
// ---------------------------------------------------------------------------
function breakdown(s: CashSession) {
  const ventas = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "venta")
    .reduce((a, t) => a + Number(t.amount), 0)
  const ingresos = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "ingreso")
    .reduce((a, t) => a + Number(t.amount), 0)
  const egresos = (s.transactions ?? [])
    .filter((t) => t.method === "efectivo" && t.type === "egreso")
    .reduce((a, t) => a + Number(t.amount), 0)
  const esperado = Number(s.openingAmount) + ventas + ingresos - egresos
  return { ventas, ingresos, egresos, esperado }
}

function effectiveBalance(s: CashSession): number {
  return breakdown(s).esperado
}

function diferenciaInfo(diff: number) {
  if (Math.abs(diff) < 0.5)
    return { label: "Cuadrado", tone: "ok", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900" }
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
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="h-10 w-10 text-red-500" />
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
            <Wallet className="h-5 w-5 text-primary" /> Caja y arqueo
          </h2>
          <p className="text-sm text-muted-foreground">
            {current
              ? "Sesión abierta · registra movimientos y realiza el cuadre al cerrar"
              : "Gestiona la apertura, cierre y cuadre de caja"}
          </p>
        </div>
        {current ? (
          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Caja abierta
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <Lock className="h-3.5 w-3.5" /> Caja cerrada
          </Badge>
        )}
      </div>

      {/* ===================== SESIÓN ABIERTA ===================== */}
      {current && stats && (
        <>
          {/* Tarjeta resumen */}
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-700 dark:to-emerald-900 text-white">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-50 text-sm">
                      <Unlock className="h-4 w-4" /> Sesión abierta
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emerald-50/90">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {formatDateTime(current.openedAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> {current.openedBy ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-start lg:items-end">
                    <span className="text-emerald-50/80 text-xs uppercase tracking-wide">Saldo en efectivo</span>
                    <span className="text-3xl md:text-4xl font-bold tabular-nums">
                      {formatCurrency(stats.esperado)}
                    </span>
                  </div>
                </div>

                <Separator className="my-4 bg-emerald-400/30" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SummaryStat label="Monto inicial" value={formatCurrency(current.openingAmount)} />
                  <SummaryStat label="Ventas efectivo" value={formatCurrency(stats.ventas)} tone="pos" />
                  <SummaryStat label="Ingresos efectivo" value={formatCurrency(stats.ingresos)} tone="pos" />
                  <SummaryStat label="Egresos efectivo" value={formatCurrency(stats.egresos)} tone="neg" />
                </div>
              </CardContent>
            </div>
          </Card>

          {/* Acciones */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              size="lg"
              className="h-auto py-4 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              onClick={() => openTxDialog("ingreso")}
            >
              <ArrowDownCircle className="h-5 w-5" /> Ingreso
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="h-auto py-4 gap-2"
              onClick={() => openTxDialog("egreso")}
            >
              <ArrowUpCircle className="h-5 w-5" /> Egreso
            </Button>
            <Button
              size="lg"
              className="h-auto py-4 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setCloseForm({ closingAmount: String(stats.esperado), closedBy: current.openedBy ?? "", notes: "" })
                setOpenClose(true)
              }}
            >
              <Calculator className="h-5 w-5" /> Cerrar caja / Arqueo
            </Button>
          </div>

          {/* Movimientos */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-primary" /> Movimientos de la sesión
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {(current.transactions ?? []).length} registros
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(!current.transactions || current.transactions.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Receipt className="h-10 w-10 mb-2 opacity-40" />
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
                                <TypeBadge type={t.type} />
                              </TableCell>
                              <TableCell className="max-w-[16rem]">
                                <span className="text-sm truncate block">{t.concept}</span>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge variant="outline" className="text-xs">
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
                                <span className={t.type === "egreso" ? "text-red-600" : "text-emerald-600"}>
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
        <Card className="border-dashed">
          <CardContent className="p-6 md:p-10 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
              <Wallet className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Caja cerrada</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                No hay una sesión de caja activa. Abre una nueva sesión para registrar ventas y movimientos.
              </p>
            </div>
            <Button size="lg" className="gap-2" onClick={() => setOpenOpen(true)}>
              <Unlock className="h-4 w-4" /> Abrir caja
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===================== HISTORIAL ===================== */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
          <History className="h-4 w-4" /> Historial de sesiones
        </h3>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <History className="h-10 w-10 mb-2 opacity-40" />
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
                      const diffInfo = diff === null ? null : diferenciaInfo(diff)
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
                              <User className="h-3 w-3 text-muted-foreground" />
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
                              <span className="text-emerald-600 font-medium">{formatCurrency(0)}</span>
                            ) : (
                              <span className={diff < 0 ? "text-red-600 font-medium" : "text-amber-600 font-medium"}>
                                {diff < 0 ? "−" : "+"}{formatCurrency(Math.abs(diff))}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {s.status === "abierta" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Abierta
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Lock className="h-3 w-3" /> Cerrada
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); setDetail(s) }}
                            >
                              <Eye className="h-3.5 w-3.5" />
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
              <Unlock className="h-5 w-5 text-primary" /> Abrir caja
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
                <><ArrowDownCircle className="h-5 w-5 text-emerald-600" /> Registrar ingreso</>
              ) : (
                <><ArrowUpCircle className="h-5 w-5 text-red-600" /> Registrar egreso</>
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
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
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
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
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
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"}
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
              <Calculator className="h-5 w-5 text-amber-600" /> Arqueo de caja
            </DialogTitle>
            <DialogDescription>
              Cuenta el efectivo real y compáralo con el monto esperado para cerrar la sesión.
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="space-y-3">
              {/* Resumen del cálculo */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5 text-sm">
                <CalcRow icon={<Coins className="h-4 w-4 text-muted-foreground" />} label="Monto inicial" value={formatCurrency(current?.openingAmount ?? 0)} />
                <CalcRow icon={<ArrowDownCircle className="h-4 w-4 text-emerald-600" />} label="Ventas en efectivo" value={`+ ${formatCurrency(stats.ventas)}`} valueClass="text-emerald-600" />
                <CalcRow icon={<Plus className="h-4 w-4 text-emerald-600" />} label="Ingresos en efectivo" value={`+ ${formatCurrency(stats.ingresos)}`} valueClass="text-emerald-600" />
                <CalcRow icon={<Minus className="h-4 w-4 text-red-600" />} label="Egresos en efectivo" value={`− ${formatCurrency(stats.egresos)}`} valueClass="text-red-600" />
                <Separator />
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold inline-flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" /> Monto esperado
                  </span>
                  <span className="font-bold tabular-nums text-base">{formatCurrency(stats.esperado)}</span>
                </div>
              </div>

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
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : liveDiff < 0 ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
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
              className="bg-amber-600 hover:bg-amber-700 text-white"
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
              <FileText className="h-5 w-5 text-primary" /> Detalle de sesión
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
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Cuadrado
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={`gap-1 ${detail.difference < 0
                      ? "border-red-300 text-red-600 dark:border-red-800"
                      : "border-amber-300 text-amber-600 dark:border-amber-800"}`}
                  >
                    {detail.difference < 0 ? <XCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
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
  label, value, tone,
}: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-emerald-50/70 text-xs">{label}</p>
      <p className={`font-semibold tabular-nums ${tone === "neg" ? "text-red-100" : "text-white"}`}>
        {value}
      </p>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  if (type === "venta")
    return <Badge className="text-xs">Venta</Badge>
  if (type === "ingreso")
    return (
      <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:bg-emerald-950/40">
        Ingreso
      </Badge>
    )
  if (type === "egreso")
    return <Badge variant="destructive" className="text-xs">Egreso</Badge>
  return <Badge variant="outline" className="text-xs">{type}</Badge>
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
