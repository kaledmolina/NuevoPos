"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
  ArrowLeftRight, TrendingUp, TrendingDown, Plus, Pencil,
  Search, Filter, X, Wallet, Scale, CreditCard, ShoppingCart, Check,
  Layers, Banknote
} from "lucide-react"

interface Transaction {
  id: string
  type: "ingreso" | "egreso"
  category: string
  amount: number
  concept: string
  description: string | null
  method: string
  date: string
  cashSessionId: string | null
  createdAt: string
}

interface SaleItem {
  id: string
  quantity: number
  unitPrice: number
  subtotal: number
  product?: { name: string }
}

interface SaleRecord {
  id: string
  invoiceNumber: string
  createdAt: string
  total: number
  subtotal: number
  discount: number
  tax: number
  paymentMethod: string
  amountReceived: number
  change: number
  status: string
  notes: string | null
  client?: { name: string } | null
  items?: SaleItem[]
}

interface CreditMovementRecord {
  id: string
  voucherNumber: string
  type: string
  amount: number
  concept: string
  method: string
  reportedBy: string
  previousBalance: number
  remainingBalance: number
  saleId: string | null
  clientName: string
  createdAt: string
}

export interface CommercialFlowItem {
  id: string
  identifier: string
  type: "venta" | "abono"
  createdAt: string
  clientName: string
  method: string
  detail: string
  amount: number
}

type TypeFilter = "all" | "ingreso" | "egreso"

const INGRESO_PRESETS = [
  "Servicios",
  "Alquiler",
  "Intereses",
  "Aportes de capital",
  "Comisiones",
  "Otros ingresos",
]
const EGRESO_PRESETS = [
  "Servicios públicos",
  "Salarios",
  "Arriendo",
  "Compras operativas",
  "Mantenimiento",
  "Publicidad",
  "Transporte",
  "Otros egresos",
]

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  credito: "Crédito",
}

const TYPE_LABEL: Record<string, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
}

const emptyForm = {
  type: "ingreso" as "ingreso" | "egreso",
  category: "",
  amount: "",
  concept: "",
  description: "",
  method: "efectivo",
  date: new Date().toISOString().slice(0, 10),
}

export default function FinanceView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)

  const [items, setItems] = useState<Transaction[]>([])
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [abonos, setAbonos] = useState<CreditMovementRecord[]>([])
  const [creditDebt, setCreditDebt] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Botones independientes para sumar ventas en efectivo y a crédito
  const [includeCashSales, setIncludeCashSales] = useState(false)
  const [includeCreditSales, setIncludeCreditSales] = useState(false)
  const hasSalesIncluded = includeCashSales || includeCreditSales

  const [activeTab, setActiveTab] = useState<string>("movimientos")

  // Filtros
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  // Modal crear/editar movimiento manual
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (typeFilter !== "all") params.set("type", typeFilter)
    if (from) params.set("from", new Date(from).toISOString())
    if (to) params.set("to", new Date(to).toISOString())
    if (query.trim()) params.set("q", query.trim())
    const qs = params.toString()
    return `/api/transactions${qs ? `?${qs}` : ""}`
  }, [typeFilter, from, to, query])

  const loadSalesAndAbonos = useCallback(async () => {
    setSalesLoading(true)
    try {
      const salesParams = new URLSearchParams()
      salesParams.set("status", "completada")
      salesParams.set("limit", "1000")
      if (from) salesParams.set("from", new Date(from).toISOString())
      if (to) salesParams.set("to", new Date(to).toISOString())

      const abonoParams = new URLSearchParams()
      abonoParams.set("type", "abono")
      if (from) abonoParams.set("from", new Date(from).toISOString())
      if (to) abonoParams.set("to", new Date(to).toISOString())

      const [salesRes, abonosRes] = await Promise.all([
        apiFetch<SaleRecord[]>(`/api/sales?${salesParams.toString()}`).catch(() => []),
        apiFetch<CreditMovementRecord[]>(`/api/credit/movements?${abonoParams.toString()}`).catch(() => []),
      ])
      setSales((salesRes || []).filter((s) => s.status !== "anulada"))
      setAbonos(abonosRes || [])
    } catch {
      setSales([])
      setAbonos([])
    } finally {
      setSalesLoading(false)
    }
  }, [from, to])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch<Transaction[]>(buildUrl()),
      apiFetch<Array<{ balance: number }>>("/api/credit").catch(() => []),
    ])
      .then(([txs, credits]) => {
        setItems(txs)
        const debt = (credits || []).reduce((acc, c) => acc + (c.balance || 0), 0)
        setCreditDebt(debt)
      })
      .catch((e) => {
        setError((e as Error).message)
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [buildUrl])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  useEffect(() => {
    if (hasSalesIncluded) {
      loadSalesAndAbonos()
    }
  }, [hasSalesIncluded, loadSalesAndAbonos, refreshKey])

  // Totales de ventas directas y abonos comerciales
  const commercialTotals = useMemo(() => {
    let salesCash = 0
    let salesCredit = 0
    let countCashSales = 0
    let countCreditSales = 0
    for (const s of sales) {
      if (s.paymentMethod === "credito") {
        salesCredit += s.total
        countCreditSales++
      } else {
        salesCash += s.total
        countCashSales++
      }
    }

    let abonosCash = 0
    let countAbonos = 0
    for (const a of abonos) {
      if (a.method === "efectivo") {
        abonosCash += a.amount
        countAbonos++
      }
    }

    const totalCashCollected = salesCash + abonosCash

    return {
      salesCash,
      salesCredit,
      countCashSales,
      countCreditSales,
      abonosCash,
      countAbonos,
      totalCashCollected,
      countCashEntries: countCashSales + countAbonos,
    }
  }, [sales, abonos])

  // Totales de movimientos manuales y balance según botones activos
  const totals = useMemo(() => {
    let manualIngresos = 0
    let manualEgresos = 0
    for (const it of items) {
      if (it.type === "ingreso") manualIngresos += it.amount
      else manualEgresos += it.amount
    }
    const addedCash = includeCashSales ? commercialTotals.totalCashCollected : 0
    const addedCredit = includeCreditSales ? commercialTotals.salesCredit : 0
    const totalIngresos = manualIngresos + addedCash + addedCredit
    const balance = totalIngresos - manualEgresos
    return {
      manualIngresos,
      manualEgresos,
      totalIngresos,
      egresos: manualEgresos,
      balance,
      addedCash,
      addedCredit,
    }
  }, [items, includeCashSales, includeCreditSales, commercialTotals])

  // Lista unificada de flujos comerciales (ventas + abonos) según filtros activos
  const activeCommercialList = useMemo<CommercialFlowItem[]>(() => {
    const list: CommercialFlowItem[] = []

    if (includeCashSales) {
      for (const s of sales) {
        if (s.paymentMethod !== "credito") {
          const totalItems = s.items?.reduce((acc, it) => acc + it.quantity, 0) || 1
          list.push({
            id: s.id,
            identifier: `#${s.invoiceNumber}`,
            type: "venta",
            createdAt: s.createdAt,
            clientName: s.client?.name || "Cliente General",
            method: "efectivo",
            detail: `Venta directa en efectivo (${totalItems} ${totalItems === 1 ? "item" : "items"})`,
            amount: s.total,
          })
        }
      }
      for (const a of abonos) {
        if (a.method === "efectivo") {
          list.push({
            id: a.id,
            identifier: a.voucherNumber,
            type: "abono",
            createdAt: a.createdAt,
            clientName: a.clientName,
            method: "efectivo",
            detail: `Abono a crédito recibido (${a.concept})`,
            amount: a.amount,
          })
        }
      }
    }

    if (includeCreditSales) {
      for (const s of sales) {
        if (s.paymentMethod === "credito") {
          const totalItems = s.items?.reduce((acc, it) => acc + it.quantity, 0) || 1
          list.push({
            id: s.id,
            identifier: `#${s.invoiceNumber}`,
            type: "venta",
            createdAt: s.createdAt,
            clientName: s.client?.name || "Cliente Crédito",
            method: "credito",
            detail: `Venta a crédito otorgada (${totalItems} ${totalItems === 1 ? "item" : "items"})`,
            amount: s.total,
          })
        }
      }
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [sales, abonos, includeCashSales, includeCreditSales])

  const hasActiveFilters = typeFilter !== "all" || from !== "" || to !== "" || query.trim() !== ""

  const clearFilters = () => {
    setTypeFilter("all")
    setFrom("")
    setTo("")
    setQuery("")
  }

  const openNew = (type: "ingreso" | "egreso") => {
    setEditing(null)
    setForm({
      ...emptyForm,
      type,
      category: "",
      date: new Date().toISOString().slice(0, 10),
    })
    setOpen(true)
  }

  const openEdit = (t: Transaction) => {
    setEditing(t)
    setForm({
      type: t.type,
      category: t.category,
      amount: String(t.amount),
      concept: t.concept,
      description: t.description ?? "",
      method: t.method,
      date: new Date(t.date).toISOString().slice(0, 10),
    })
    setOpen(true)
  }

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const save = async () => {
    const amount = Number(form.amount)
    if (!form.concept.trim()) {
      toast.error("El concepto es obligatorio")
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("El monto debe ser mayor a 0")
      return
    }
    if (!form.category.trim()) {
      toast.error("La categoría es obligatoria")
      return
    }

    setSaving(true)
    try {
      const payload = {
        type: form.type,
        category: form.category.trim(),
        amount,
        concept: form.concept.trim(),
        description: form.description.trim() || null,
        method: form.method,
        date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
      }
      if (editing) {
        await apiFetch(`/api/transactions/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        toast.success("Movimiento actualizado")
      } else {
        await apiFetch("/api/transactions", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        toast.success(
          form.type === "ingreso" ? "Ingreso registrado" : "Egreso registrado"
        )
      }
      setOpen(false)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const categoryPresets = form.type === "ingreso" ? INGRESO_PRESETS : EGRESO_PRESETS

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Ingresos y Egresos
          </h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando movimientos…" : (
              hasSalesIncluded
                ? `${items.length} movimientos manuales + ${activeCommercialList.length} flujos comerciales incluidos`
                : `${items.length} movimiento${items.length === 1 ? "" : "s"} contables independientes`
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-tour="finance-actions">
          {/* Botón 1: Sumar ventas efectivo */}
          <Button
            size="sm"
            variant={includeCashSales ? "default" : "outline"}
            onClick={() => {
              const next = !includeCashSales
              setIncludeCashSales(next)
              if (next) {
                toast.success("Ventas y abonos en efectivo sumados al balance")
              } else {
                toast.info("Ventas y abonos en efectivo excluidos")
              }
            }}
            className={
              includeCashSales
                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm font-medium border-primary rounded-xl"
                : "border-primary/40 text-primary hover:bg-primary/10 rounded-xl"
            }
          >
            {includeCashSales ? (
              <>
                <Check className="h-4 w-4 mr-1.5" /> Ventas efectivo sumadas
              </>
            ) : (
              <>
                <Banknote className="h-4 w-4 mr-1.5" /> Sumar ventas efectivo
              </>
            )}
          </Button>

          {/* Botón 2: Sumar ventas crédito */}
          <Button
            size="sm"
            variant={includeCreditSales ? "default" : "outline"}
            onClick={() => {
              const next = !includeCreditSales
              setIncludeCreditSales(next)
              if (next) {
                toast.success("Ventas a crédito sumadas al balance")
              } else {
                toast.info("Ventas a crédito excluidas")
              }
            }}
            className={
              includeCreditSales
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-sm font-medium border-amber-600 rounded-xl"
                : "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-xl"
            }
          >
            {includeCreditSales ? (
              <>
                <Check className="h-4 w-4 mr-1.5" /> Ventas crédito sumadas
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-1.5" /> Sumar ventas crédito
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => openNew("ingreso")}
            className="text-primary border-primary/40 hover:bg-primary/10 rounded-xl"
          >
            <Plus className="h-4 w-4 mr-1" /> Nuevo ingreso
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openNew("egreso")}
            className="text-rose-700 border-rose-300 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900 dark:hover:bg-rose-950 rounded-xl"
          >
            <TrendingDown className="h-4 w-4 mr-1" /> Nuevo egreso
          </Button>
        </div>
      </div>

      {/* Banner informativo cuando hay ventas sumadas */}
      {hasSalesIncluded && (
        <Card className="border-primary/20 bg-primary/5 rounded-2xl">
          <CardContent className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-foreground">
              <Layers className="h-4 w-4 text-primary shrink-0" />
              <span>
                <strong>Modo consolidado activo:</strong>{" "}
                {includeCashSales && includeCreditSales
                  ? "Sumando ventas y abonos en efectivo, más ventas a crédito al balance general."
                  : includeCashSales
                  ? "Sumando ventas en efectivo y abonos a créditos al balance general."
                  : "Sumando únicamente ventas a crédito al balance general."}{" "}
                Las cuentas y gastos manuales se conservan independientes.
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              {includeCashSales && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 rounded-full">
                  Efectivo: +{formatCurrency(commercialTotals.totalCashCollected)} ({commercialTotals.countCashEntries} movs)
                </Badge>
              )}
              {includeCreditSales && (
                <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-300 rounded-full">
                  Crédito: +{formatCurrency(commercialTotals.salesCredit)} ({commercialTotals.countCreditSales} ventas)
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tarjetas de resumen */}
      <div
        data-tour="finance-summary-cards"
        className={`grid grid-cols-1 sm:grid-cols-2 ${
          includeCashSales && includeCreditSales ? "lg:grid-cols-5" : hasSalesIncluded ? "lg:grid-cols-4 sm:grid-cols-2" : "lg:grid-cols-4"
        } gap-3`}
      >
        {/* Ingresos manuales / operativos */}
        <Card className="border-border/80 rounded-2xl shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {hasSalesIncluded ? "Ingresos Totales" : "Total Ingresos"}
              </p>
              <p className="text-2xl font-bold text-primary truncate">
                {formatCurrency(totals.totalIngresos)}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {!hasSalesIncluded
                  ? "Cuentas e ingresos manuales"
                  : includeCashSales && includeCreditSales
                  ? `Manual: ${formatCurrency(totals.manualIngresos)} + Efectivo + Crédito`
                  : includeCashSales
                  ? `Manual: ${formatCurrency(totals.manualIngresos)} + Efectivo (${formatCurrency(commercialTotals.totalCashCollected)})`
                  : `Manual: ${formatCurrency(totals.manualIngresos)} + Crédito (${formatCurrency(commercialTotals.salesCredit)})`}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        {/* Tarjeta Ventas en Efectivo (si botón activo) */}
        {includeCashSales && (
          <Card className="border-primary/30 bg-primary/5 rounded-2xl shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-primary flex items-center gap-1 font-semibold">
                  <Banknote className="h-3 w-3 text-primary" /> Cobros Efectivo
                </p>
                <p className="text-2xl font-bold text-primary truncate">
                  {formatCurrency(commercialTotals.totalCashCollected)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {commercialTotals.countCashSales} ventas + {commercialTotals.countAbonos} abonos
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Banknote className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tarjeta Ventas a Crédito (si botón activo) */}
        {includeCreditSales && (
          <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10 rounded-2xl shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-300 flex items-center gap-1 font-semibold">
                  <CreditCard className="h-3 w-3 text-amber-600" /> Ventas Crédito
                </p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 truncate">
                  {formatCurrency(commercialTotals.salesCredit)}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {commercialTotals.countCreditSales} ventas a crédito
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Egresos */}
        <Card className="border-rose-200 dark:border-rose-900/50 rounded-2xl shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1 font-semibold">
                <TrendingDown className="h-3 w-3 text-rose-600" /> Total Egresos
              </p>
              <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 truncate">
                {formatCurrency(totals.egresos)}
              </p>
              <p className="text-[10px] text-muted-foreground">Gastos y compras operativas</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
          </CardContent>
        </Card>

        {/* Balance */}
        <Card className={`rounded-2xl shadow-xs ${totals.balance >= 0 ? "border-primary/30" : "border-rose-200 dark:border-rose-900/50"}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1 font-semibold">
                <Scale className="h-3 w-3" /> {hasSalesIncluded ? "Balance Consolidado" : "Balance Neto"}
              </p>
              <p
                className={`text-2xl font-bold truncate ${
                  totals.balance > 0
                    ? "text-primary"
                    : totals.balance < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground"
                }`}
              >
                {totals.balance < 0 ? "−" : ""}
                {formatCurrency(Math.abs(totals.balance))}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {hasSalesIncluded ? "Ingresos consolidados − Egresos" : "Ingresos manuales − Egresos"}
              </p>
            </div>
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                totals.balance >= 0
                  ? "bg-primary/10"
                  : "bg-rose-100 dark:bg-rose-950/50"
              }`}
            >
              <Wallet
                className={`h-5 w-5 ${
                  totals.balance >= 0
                    ? "text-primary"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cartera por cobrar */}
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10 rounded-2xl shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-amber-800 dark:text-amber-400 flex items-center gap-1">
                <CreditCard className="h-3 w-3 text-amber-600" /> Cartera por cobrar
              </p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 truncate">
                {formatCurrency(creditDebt)}
              </p>
              <p className="text-[10px] text-muted-foreground">Créditos activos pendientes</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
              <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por concepto o categoría…"
            className="pl-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
          <SelectTrigger className="w-[150px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ingreso">Ingresos</SelectItem>
            <SelectItem value="egreso">Egresos</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[150px]"
            aria-label="Desde"
          />
          <span className="text-muted-foreground text-xs">→</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[150px]"
            aria-label="Hasta"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {/* Pestañas cuando las ventas están incluidas */}
      {hasSalesIncluded ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="movimientos" className="flex items-center gap-1.5">
              <ArrowLeftRight className="h-4 w-4" />
              Movimientos Manuales ({items.length})
            </TabsTrigger>
            <TabsTrigger value="ventas" className="flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Flujos Comerciales Sumados ({activeCommercialList.length})
            </TabsTrigger>
          </TabsList>

          {/* Contenido pestaña movimientos */}
          <TabsContent value="movimientos" className="mt-3">
            <TransactionsTable
              items={items}
              loading={loading}
              error={error}
              hasActiveFilters={hasActiveFilters}
              clearFilters={clearFilters}
              openNew={openNew}
              openEdit={openEdit}
              load={load}
            />
          </TabsContent>

          {/* Contenido pestaña ventas / comercial */}
          <TabsContent value="ventas" className="mt-3">
            <CommercialFlowTable items={activeCommercialList} loading={salesLoading} />
          </TabsContent>
        </Tabs>
      ) : (
        <TransactionsTable
          items={items}
          loading={loading}
          error={error}
          hasActiveFilters={hasActiveFilters}
          clearFilters={clearFilters}
          openNew={openNew}
          openEdit={openEdit}
          load={load}
        />
      )}

      {/* Modal crear/editar movimiento manual */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? (
                <Pencil className="h-4 w-4 text-primary" />
              ) : form.type === "ingreso" ? (
                <TrendingUp className="h-4 w-4 text-blue-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              {editing
                ? "Editar movimiento manual"
                : form.type === "ingreso"
                ? "Nuevo ingreso manual"
                : "Nuevo egreso manual"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Actualiza los datos del movimiento financiero independiente"
                : "Registra un ingreso o gasto administrativo independiente de las ventas"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setField("type", v as "ingreso" | "egreso")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Monto (COP) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Categoría *</Label>
              <Input
                list="category-presets"
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                placeholder="Escriba o elija una categoría…"
              />
              <datalist id="category-presets">
                {categoryPresets.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground mt-1">
                Sugerencias: {categoryPresets.join(", ")}
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label>Concepto *</Label>
              <Input
                value={form.concept}
                onChange={(e) => setField("concept", e.target.value)}
                placeholder="Ej: Pago de arriendo del local"
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Descripción (opcional)</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Detalles adicionales del movimiento…"
              />
            </div>

            <div>
              <Label>Método de pago</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setField("method", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Subcomponente: Tabla de movimientos financieros manuales
function TransactionsTable({
  items,
  loading,
  error,
  hasActiveFilters,
  clearFilters,
  openNew,
  openEdit,
  load,
}: {
  items: Transaction[]
  loading: boolean
  error: string | null
  hasActiveFilters: boolean
  clearFilters: () => void
  openNew: (type: "ingreso" | "egreso") => void
  openEdit: (t: Transaction) => void
  load: () => void
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>
              Reintentar
            </Button>
          </div>
        ) : items.length === 0 ? (
          hasActiveFilters ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                <ArrowLeftRight className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium">No se encontraron movimientos</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
              <Button size="sm" variant="outline" onClick={clearFilters}>
                <Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                <ArrowLeftRight className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium">Aún no hay movimientos manuales</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Registra ingresos o gastos independientes de las ventas (arriendos, servicios, salarios...)
              </p>
              <Button size="sm" onClick={() => openNew("ingreso")}>
                <Plus className="h-4 w-4 mr-1.5" /> Registrar primer ingreso
              </Button>
            </div>
          )
        ) : (
          <>
            {/* Tabla desktop */}
            <div className="hidden md:block overflow-x-auto max-h-[60vh] overflow-y-auto scroll-thin">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[120px]">Fecha</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead className="hidden md:table-cell">Categoría</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="hidden sm:table-cell w-[120px]">Método</TableHead>
                    <TableHead className="text-right w-[140px]">Monto</TableHead>
                    <TableHead className="text-right w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((t) => {
                    const isIngreso = t.type === "ingreso"
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(t.date)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              isIngreso
                                ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                                : "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
                            }
                          >
                            {isIngreso ? (
                              <TrendingUp className="h-3 w-3 mr-0.5" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-0.5" />
                            )}
                            {TYPE_LABEL[t.type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {t.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{t.concept}</div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]">
                              {t.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary" className="text-xs font-normal">
                            {METHOD_LABEL[t.method] ?? t.method}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold whitespace-nowrap ${
                            isIngreso
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isIngreso ? "+" : "−"}
                          {formatCurrency(t.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Editar movimiento"
                              onClick={() => openEdit(t)}
                              aria-label="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Tarjetas móvil */}
            <div className="md:hidden divide-y divide-border">
              {items.map((t) => {
                const isIngreso = t.type === "ingreso"
                return (
                  <div key={t.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm leading-snug">{t.concept}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(t.date)} · <span className="font-medium text-foreground/80">{t.category}</span> · {METHOD_LABEL[t.method] ?? t.method}
                        </p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground/80 line-clamp-1 mt-0.5">{t.description}</p>
                        )}
                      </div>
                      <span className={`text-base font-bold shrink-0 tabular-nums ${isIngreso ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
                        {isIngreso ? "+" : "−"}{formatCurrency(t.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <Badge
                        variant="outline"
                        className={
                          isIngreso
                            ? "text-[10px] border-blue-300 bg-blue-50 text-blue-700"
                            : "text-[10px] border-red-300 bg-red-50 text-red-700"
                        }
                      >
                        {TYPE_LABEL[t.type]}
                      </Badge>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Subcomponente: Tabla de flujos comerciales (ventas + abonos) sumados
function CommercialFlowTable({ items, loading }: { items: CommercialFlowItem[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
            <ShoppingCart className="h-7 w-7" />
          </div>
          <p className="text-sm font-medium">No hay flujos comerciales en este período</p>
          <p className="text-xs text-muted-foreground mt-1">
            Las ventas y abonos del período seleccionado aparecerán aquí según los botones activados.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Desktop */}
        <div className="hidden md:block overflow-x-auto max-h-[60vh] overflow-y-auto scroll-thin">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[150px]">Documento / Fecha</TableHead>
                <TableHead className="w-[120px]">Tipo</TableHead>
                <TableHead>Cliente / Detalle</TableHead>
                <TableHead className="w-[120px]">Método</TableHead>
                <TableHead className="text-right w-[140px]">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const isCredito = it.method === "credito"
                const isAbono = it.type === "abono"
                return (
                  <TableRow key={`${it.type}-${it.id}`}>
                    <TableCell>
                      <div className="font-mono font-semibold text-sm">{it.identifier}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(it.createdAt)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          isAbono
                            ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                        }
                      >
                        {isAbono ? "Abono Crédito" : "Venta Directa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{it.clientName}</div>
                      <div className="text-xs text-muted-foreground">{it.detail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isCredito
                            ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            : "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                        }
                      >
                        {isCredito ? "Crédito" : "Efectivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-base text-blue-600 dark:text-blue-400">
                      +{formatCurrency(it.amount)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border">
          {items.map((it) => {
            const isCredito = it.method === "credito"
            const isAbono = it.type === "abono"
            return (
              <div key={`${it.type}-${it.id}`} className="p-3.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">{it.identifier}</span>
                    <Badge
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {isAbono ? "Abono" : "Venta"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        isCredito
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-blue-300 bg-blue-50 text-blue-800"
                      }`}
                    >
                      {isCredito ? "Crédito" : "Efectivo"}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground/90 font-medium mt-0.5">
                    {it.clientName}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {it.detail} · {formatDateTime(it.createdAt)}
                  </p>
                </div>
                <div className="text-right font-bold text-base text-blue-600 dark:text-blue-400">
                  +{formatCurrency(it.amount)}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}


