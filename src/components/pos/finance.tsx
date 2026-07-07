"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDate } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  ArrowLeftRight, TrendingUp, TrendingDown, Plus, Pencil, Trash2,
  Search, Filter, X, Wallet, Scale,
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

type TypeFilter = "all" | "ingreso" | "egreso"

const INGRESO_PRESETS = ["Servicios", "Alquiler", "Intereses", "Otros ingresos"]
const EGRESO_PRESETS = [
  "Servicios públicos", "Salarios", "Arriendo", "Compras",
  "Mantenimiento", "Otros egresos",
]

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  // Modal crear/editar
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  // Eliminar
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (typeFilter !== "all") params.set("type", typeFilter)
    if (from) params.set("from", new Date(from).toISOString())
    if (to) params.set("to", new Date(to).toISOString())
    if (query.trim()) params.set("q", query.trim())
    const qs = params.toString()
    return `/api/transactions${qs ? `?${qs}` : ""}`
  }, [typeFilter, from, to, query])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    apiFetch<Transaction[]>(buildUrl())
      .then((data) => setItems(data))
      .catch((e) => {
        setError((e as Error).message)
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [buildUrl])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Totales calculados de la lista filtrada actual
  const totals = useMemo(() => {
    let ingresos = 0
    let egresos = 0
    for (const it of items) {
      if (it.type === "ingreso") ingresos += it.amount
      else egresos += it.amount
    }
    return { ingresos, egresos, balance: ingresos - egresos }
  }, [items])

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

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await apiFetch(`/api/transactions/${deleteId}`, { method: "DELETE" })
      toast.success("Movimiento eliminado")
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleteId(null)
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
            {loading ? "Cargando movimientos…" : `${items.length} movimiento${items.length === 1 ? "" : "s"} en el filtro actual`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openNew("ingreso")}
            className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900 dark:hover:bg-emerald-950"
          >
            <TrendingUp className="h-4 w-4 mr-1" /> Nuevo ingreso
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openNew("egreso")}
            className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950"
          >
            <TrendingDown className="h-4 w-4 mr-1" /> Nuevo egreso
          </Button>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Total Ingresos
              </p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 truncate">
                {formatCurrency(totals.ingresos)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Total Egresos
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 truncate">
                {formatCurrency(totals.egresos)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card className={totals.balance >= 0 ? "border-emerald-200 dark:border-emerald-900/50" : "border-red-200 dark:border-red-900/50"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Scale className="h-3 w-3" /> Balance neto
              </p>
              <p
                className={`text-2xl font-bold truncate ${
                  totals.balance > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : totals.balance < 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {totals.balance < 0 ? "−" : ""}
                {formatCurrency(Math.abs(totals.balance))}
              </p>
            </div>
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                totals.balance >= 0
                  ? "bg-emerald-100 dark:bg-emerald-950/50"
                  : "bg-red-100 dark:bg-red-950/50"
              }`}
            >
              <Wallet
                className={`h-5 w-5 ${
                  totals.balance >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              />
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

      {/* Tabla */}
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
                <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <ArrowLeftRight className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no hay movimientos</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primer ingreso o egreso para llevar el control financiero</p>
                <Button size="sm" onClick={() => openNew("ingreso")}><Plus className="h-4 w-4 mr-1.5" /> Registrar primer ingreso</Button>
              </div>
            )
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto scroll-thin">
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
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
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
                          {t.category}
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
                              ? "text-emerald-600 dark:text-emerald-400"
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
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              title="Eliminar movimiento"
                              onClick={() => setDeleteId(t.id)}
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* Modal crear/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing ? (
                <Pencil className="h-4 w-4 text-primary" />
              ) : form.type === "ingreso" ? (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              {editing
                ? "Editar movimiento"
                : form.type === "ingreso"
                ? "Nuevo ingreso"
                : "Nuevo egreso"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Actualiza los datos del movimiento financiero"
                : "Registra un movimiento financiero"}
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
                placeholder="Ej: Pago de servicio de energía"
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
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
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

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El movimiento financiero se eliminará
              permanentemente. Si estaba asociado a una caja abierta, también se
              quitará del arqueo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
