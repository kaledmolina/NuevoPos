"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { ROLE_CONFIG } from "@/lib/permissions"
import {
  formatCurrency, expirationStatus, daysUntil, formatDate,
} from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  Search, Plus, Pencil, Trash2, Package, AlertTriangle, CalendarClock,
  Filter, Download, Tag, X, Check,
} from "lucide-react"

interface Category { id: string; name: string; _count?: { products: number } }
interface Product {
  id: string
  name: string
  barcode: string | null
  sku: string | null
  categoryId: string | null
  category?: { name: string } | null
  description: string | null
  cost: number
  price: number
  stock: number
  minStock: number
  unit: string
  expirationDate: string | null
  batch: string | null
  location: string | null
  active: boolean
}

const emptyForm = {
  name: "", barcode: "", sku: "", categoryId: "", description: "",
  cost: "", price: "", stock: "", minStock: "5", unit: "unidad",
  expirationDate: "", batch: "", location: "",
}

export default function ProductsView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const role = useAppStore((s) => s.role)
  const canEdit = role ? ROLE_CONFIG[role].canEditProducts : false
  const canSeeCosts = role ? ROLE_CONFIG[role].canSeeCosts : false
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [showLow, setShowLow] = useState(false)
  const [showExpiring, setShowExpiring] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // Modal crear categoría rápida (desde el formulario de producto)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)
  // Gestión de categorías
  const [catManageOpen, setCatManageOpen] = useState(false)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState("")
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<Product[]>(`/api/products?q=${encodeURIComponent(query)}`),
      apiFetch<Category[]>("/api/categories"),
    ])
      .then(([p, c]) => { setProducts(p); setCategories(c) })
      .finally(() => setLoading(false))
  }, [query])

  useEffect(() => { load() }, [load, refreshKey])

  const filtered = useMemo(() => {
    let list = products
    if (categoryFilter !== "all") list = list.filter((p) => p.categoryId === categoryFilter)
    if (showLow) list = list.filter((p) => p.stock <= p.minStock)
    if (showExpiring) list = list.filter((p) => {
      const d = daysUntil(p.expirationDate)
      return d !== null && d <= 30
    })
    return list
  }, [products, categoryFilter, showLow, showExpiring])

  const hasActiveFilters = query.trim() !== "" || categoryFilter !== "all" || showLow || showExpiring
  const clearFilters = () => {
    setQuery("")
    setCategoryFilter("all")
    setShowLow(false)
    setShowExpiring(false)
  }

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }
  const openEdit = (p: Product) => {
    setEditing(p)
    setForm({
      name: p.name,
      barcode: p.barcode ?? "",
      sku: p.sku ?? "",
      categoryId: p.categoryId ?? "",
      description: p.description ?? "",
      cost: String(p.cost),
      price: String(p.price),
      stock: String(p.stock),
      minStock: String(p.minStock),
      unit: p.unit,
      expirationDate: p.expirationDate ? new Date(p.expirationDate).toISOString().slice(0, 10) : "",
      batch: p.batch ?? "",
      location: p.location ?? "",
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio")
    setSaving(true)
    try {
      const payload = { ...form, active: true }
      if (editing) {
        await apiFetch(`/api/products/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        toast.success("Producto actualizado")
      } else {
        await apiFetch("/api/products", { method: "POST", body: JSON.stringify(payload) })
        toast.success("Producto creado")
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
      await apiFetch(`/api/products/${deleteId}`, { method: "DELETE" })
      toast.success("Producto eliminado")
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleteId(null)
    }
  }

  // Crear categoría nueva (desde el formulario de producto o desde el gestor)
  const createCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return toast.error("Ingresa un nombre para la categoría")
    setSavingCategory(true)
    try {
      const created = await apiFetch<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      })
      toast.success(`Categoría "${created.name}" creada`)
      const cats = await apiFetch<Category[]>("/api/categories")
      setCategories(cats)
      setForm({ ...form, categoryId: created.id })
      setNewCategoryName("")
      setCatModalOpen(false)
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingCategory(false)
    }
  }

  // Guardar edición de categoría
  const saveEditCategory = async () => {
    const name = editCatName.trim()
    if (!name) return toast.error("Ingresa un nombre")
    if (!editingCatId) return
    try {
      await apiFetch(`/api/categories/${editingCatId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      })
      toast.success("Categoría actualizada")
      setEditingCatId(null)
      setEditCatName("")
      const cats = await apiFetch<Category[]>("/api/categories")
      setCategories(cats)
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Eliminar categoría
  const confirmDeleteCategory = async () => {
    if (!deleteCatId) return
    try {
      await apiFetch(`/api/categories/${deleteCatId}`, { method: "DELETE" })
      toast.success("Categoría eliminada")
      const cats = await apiFetch<Category[]>("/api/categories")
      setCategories(cats)
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleteCatId(null)
    }
  }

  const exportCsv = () => {
    const header = canSeeCosts
      ? ["Nombre", "Código", "Categoría", "Costo", "Precio", "Stock", "Min", "Unidad", "Vencimiento", "Lote", "Ubicación"]
      : ["Nombre", "Código", "Categoría", "Precio", "Stock", "Min", "Unidad", "Vencimiento", "Lote", "Ubicación"]
    const rows = [
      header,
      ...filtered.map((p) => canSeeCosts
        ? [p.name, p.barcode ?? "", p.category?.name ?? "", String(p.cost), String(p.price), String(p.stock), String(p.minStock), p.unit, p.expirationDate ? formatDate(p.expirationDate) : "", p.batch ?? "", p.location ?? ""]
        : [p.name, p.barcode ?? "", p.category?.name ?? "", String(p.price), String(p.stock), String(p.minStock), p.unit, p.expirationDate ? formatDate(p.expirationDate) : "", p.batch ?? "", p.location ?? ""]
      ),
    ]
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "inventario.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalStockValue = canSeeCosts ? filtered.reduce((s, p) => s + p.cost * p.stock, 0) : 0

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header / filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Inventario de productos</h2>
            <p className="text-sm text-muted-foreground">
              {filtered.length} productos{canSeeCosts ? ` · Valor en stock: ${formatCurrency(totalStockValue)}` : ""}
              {!canEdit && <span className="ml-2 text-xs text-muted-foreground">· Solo lectura</span>}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
              <Button variant="outline" size="sm" onClick={() => setCatManageOpen(true)}><Tag className="h-4 w-4 mr-1" /> Categorías</Button>
              <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nuevo producto</Button>
            </div>
          )}
          {!canEdit && (
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Exportar</Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o código…" className="pl-9 h-10" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-thin">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[170px] h-10 shrink-0"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={showLow ? "default" : "outline"} size="sm" className="h-10 shrink-0" onClick={() => setShowLow(!showLow)}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Stock bajo
            </Button>
            <Button variant={showExpiring ? "default" : "outline"} size="sm" className="h-10 shrink-0" onClick={() => setShowExpiring(!showExpiring)}>
              <CalendarClock className="h-3.5 w-3.5 mr-1" /> Por vencer
            </Button>
          </div>
        </div>
      </div>

      {/* Tabla (desktop) */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              hasActiveFilters ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <Package className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No se encontraron productos</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                  <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <Package className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">Aún no tienes productos</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Crea tu primer producto para empezar a vender</p>
                  {canEdit ? (
                    <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Crear primer producto</Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Contacta al administrador para crear productos</p>
                  )}
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="hidden md:table-cell">Categoría</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="hidden lg:table-cell">Vencimiento</TableHead>
                      {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const exp = expirationStatus(p.expirationDate)
                      const low = p.stock <= p.minStock
                      const out = p.stock <= 0
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="font-medium">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.barcode ?? "Sin código"} · {p.unit}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{p.category?.name ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(p.price)}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={out ? "destructive" : low ? "secondary" : "outline"} className="font-mono">
                              {p.stock}
                            </Badge>
                            {low && !out && <p className="text-[10px] text-amber-600 mt-0.5">min {p.minStock}</p>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {p.expirationDate ? (
                              <div>
                                <p className="text-xs">{formatDate(p.expirationDate)}</p>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${exp.variant === "expired" ? "border-red-500 text-red-600" : exp.variant === "soon" ? "border-orange-500 text-orange-600" : ""}`}
                                >
                                  {exp.label}
                                </Badge>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEdit ? (
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar producto" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Eliminar producto" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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

      {/* Tarjetas (móvil) */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full">
            {hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <Package className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">No se encontraron productos</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <Package className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no tienes productos</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Crea tu primer producto para empezar a vender</p>
                {canEdit ? (
                  <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Crear primer producto</Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Contacta al administrador para crear productos</p>
                )}
              </div>
            )}
          </div>
        ) : (
          filtered.map((p) => {
            const exp = expirationStatus(p.expirationDate)
            const low = p.stock <= p.minStock
            const out = p.stock <= 0
            return (
              <Card key={p.id}>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.barcode ?? "Sin código"} · {p.unit}</p>
                    </div>
                    {p.category?.name && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">{p.category.name}</Badge>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Precio</p>
                      <p className="text-lg font-bold text-primary leading-none">{formatCurrency(p.price)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground mb-0.5">Stock</p>
                      <Badge variant={out ? "destructive" : low ? "secondary" : "outline"} className="font-mono">
                        {p.stock}
                      </Badge>
                      {low && !out && <p className="text-[10px] text-amber-600 mt-0.5">min {p.minStock}</p>}
                    </div>
                  </div>
                  {p.expirationDate && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{formatDate(p.expirationDate)}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${exp.variant === "expired" ? "border-red-500 text-red-600" : exp.variant === "soon" ? "border-orange-500 text-orange-600" : ""}`}
                      >
                        {exp.label}
                      </Badge>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex gap-2 pt-1 border-t">
                      <Button size="sm" variant="outline" className="h-10 flex-1" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4 mr-1.5" /> Editar
                      </Button>
                      <Button size="icon" variant="outline" className="h-10 w-10 text-destructive shrink-0" title="Eliminar producto" onClick={() => setDeleteId(p.id)} aria-label="Eliminar producto">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal crear/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle>
            <DialogDescription>{editing ? "Actualiza la información del producto" : "Registra un nuevo producto en el inventario"}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="md:col-span-2">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Acetaminofén 500mg x 10" />
            </div>
            <div>
              <Label>Código de barras</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="770..." />
            </div>
            <div>
              <Label>Categoría</Label>
              <div className="flex gap-2">
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Sin categoría" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setCatModalOpen(true)}
                  title="Crear nueva categoría"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Costo (compra)</Label>
              <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div>
              <Label>Precio de venta</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <Label>Stock actual</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div>
              <Label>Stock mínimo (alerta)</Label>
              <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
            </div>
            <div>
              <Label>Unidad</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["unidad", "caja", "blister", "frasco", "tubo", "botella", "lata", "paquete", "ml", "g", "sobres"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de vencimiento</Label>
              <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
            </div>
            <div>
              <Label>Lote</Label>
              <Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} placeholder="L1234" />
            </div>
            <div>
              <Label>Ubicación</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Estante E1" />
            </div>
            <div className="md:col-span-2">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. El producto se eliminará del inventario.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal crear categoría rápida (desde el formulario de producto) */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Nueva categoría</DialogTitle>
            <DialogDescription>Crea una categoría personalizada para organizar tus productos.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Nombre de la categoría *</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Ej: Cuidado del cabello"
              className="h-10"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && createCategory()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCatModalOpen(false); setNewCategoryName("") }}>Cancelar</Button>
            <Button onClick={createCategory} disabled={savingCategory}>
              {savingCategory ? "Creando…" : <><Plus className="h-4 w-4 mr-1" /> Crear</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal gestionar categorías */}
      <Dialog open={catManageOpen} onOpenChange={setCatManageOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Gestionar categorías</DialogTitle>
            <DialogDescription>Crea, edita o elimina las categorías de productos.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {/* Formulario crear nueva */}
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nombre de nueva categoría"
                className="h-10"
                onKeyDown={(e) => e.key === "Enter" && createCategory()}
              />
              <Button onClick={createCategory} disabled={savingCategory} className="h-10 shrink-0">
                <Plus className="h-4 w-4 mr-1" /> Crear
              </Button>
            </div>
            <Separator />
            {/* Lista de categorías */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto scroll-thin">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No hay categorías creadas.</p>
              )}
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                  {editingCatId === c.id ? (
                    <>
                      <Input
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && saveEditCategory()}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" title="Guardar" onClick={saveEditCategory}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Cancelar" onClick={() => { setEditingCatId(null); setEditCatName("") }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">{c._count?.products ?? 0} producto(s)</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Editar"
                        onClick={() => { setEditingCatId(c.id); setEditCatName(c.name) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        title="Eliminar"
                        onClick={() => setDeleteCatId(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminar categoría */}
      <AlertDialog open={!!deleteCatId} onOpenChange={(o) => !o && setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Si la categoría tiene productos asociados, deberás reasignarlos primero. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
