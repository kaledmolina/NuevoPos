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
  IconSearch,
  IconPlus,
  IconPencil,
  IconTrash,
  IconBoxSeam,
  IconAlertTriangle,
  IconCalendarTime,
  IconFilter,
  IconDownload,
  IconTag,
  IconX,
  IconCheck,
  IconCurrencyDollar,
  IconTrendingUp,
  IconPackage,
  IconEye,
  IconBarcode,
  IconMapPin,
  IconHash,
  IconReceipt2,
} from "@tabler/icons-react"

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
  soldUnits?: number
  totalRevenue?: number
  totalRealProfit?: number
}

const emptyForm = {
  name: "", barcode: "", sku: "", categoryId: "", description: "",
  cost: "", price: "", stock: "", minStock: "5", unit: "unidad",
  expirationDate: "", batch: "", location: "", active: true,
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
  // Modal crear categoría rápida (desde el formulario de producto)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)
  // Gestión de categorías
  const [catManageOpen, setCatManageOpen] = useState(false)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState("")
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [deletingProduct, setDeletingProduct] = useState(false)

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
      active: p.active ?? true,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio")
    setSaving(true)
    try {
      const payload = { ...form, active: form.active }
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

  // Eliminar producto (soporta borrado definitivo para superadmin / demo)
  const confirmDeleteProduct = async (hard: boolean = false) => {
    if (!productToDelete) return
    setDeletingProduct(true)
    try {
      const url = `/api/products/${productToDelete.id}${hard || role === "superadmin" ? "?hard=true" : ""}`
      const res = await apiFetch<{ ok: boolean; message: string }>(url, {
        method: "DELETE",
      })
      toast.success(res.message || "Producto eliminado")
      setProductToDelete(null)
      if (detailProduct?.id === productToDelete.id) setDetailProduct(null)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingProduct(false)
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
  const totalSaleValue = filtered.reduce((s, p) => s + p.price * p.stock, 0)
  const totalProfit = canSeeCosts ? totalSaleValue - totalStockValue : 0
  const totalUnits = filtered.reduce((s, p) => s + p.stock, 0)
  const lowStockCount = filtered.filter((p) => p.stock > 0 && p.stock <= p.minStock).length
  const outOfStockCount = filtered.filter((p) => p.stock <= 0).length

  // Métricas de ventas reales ya consolidadas (Ganancia real obtenida)
  const totalRealSoldUnits = filtered.reduce((s, p) => s + (p.soldUnits ?? 0), 0)
  const totalRealRevenue = filtered.reduce((s, p) => s + (p.totalRevenue ?? 0), 0)
  const totalRealProfit = canSeeCosts ? filtered.reduce((s, p) => s + (p.totalRealProfit ?? 0), 0) : 0

  // Modal Ver Detalle de Producto
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><IconBoxSeam className="h-5 w-5 text-primary" /> Inventario de productos</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} productos · {totalUnits} unidades en stock
            {!canEdit && <span className="ml-2 text-xs text-muted-foreground">· Solo lectura</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><IconDownload className="h-4 w-4 mr-1" /> Exportar</Button>
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCatManageOpen(true)}><IconTag className="h-4 w-4 mr-1" /> Categorías</Button>
              <Button size="sm" onClick={openNew} data-tour="products-new-btn"><IconPlus className="h-4 w-4 mr-1" /> Nuevo producto</Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* Total unidades */}
        <Card className="rounded-xl border shadow-2xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <IconPackage className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium truncate">Unidades en stock</p>
                <p className="text-lg font-bold text-foreground leading-tight">{totalUnits.toLocaleString()}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {outOfStockCount > 0 && (
                    <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">{outOfStockCount} agotados</span>
                  )}
                  {lowStockCount > 0 && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{outOfStockCount > 0 ? "· " : ""}{lowStockCount} bajo</span>
                  )}
                  {outOfStockCount === 0 && lowStockCount === 0 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Todo en orden</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Valor en costo */}
        {canSeeCosts && (
          <Card className="rounded-xl border shadow-2xs">
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <IconCurrencyDollar className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-medium truncate">Costo del inventario</p>
                  <p className="text-lg font-bold text-foreground leading-tight">{formatCurrency(totalStockValue)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Inversión actual en stock</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Valor en venta */}
        <Card className="rounded-xl border shadow-2xs">
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <IconCurrencyDollar className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium truncate">Valor en venta</p>
                <p className="text-lg font-bold text-foreground leading-tight">{formatCurrency(totalSaleValue)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Si se vende todo el stock</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ganancia estimada */}
        {canSeeCosts && (
          <Card className="rounded-xl border shadow-2xs">
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <IconTrendingUp className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground font-medium truncate">Ganancia estimada</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-tight">{formatCurrency(totalProfit)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Margen: {totalSaleValue > 0 ? `${Math.round((totalProfit / totalSaleValue) * 100)}%` : "0%"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ganancia Real Obtenida (Ventas ya cerradas) */}
        {canSeeCosts && (
          <Card className="rounded-xl border shadow-2xs bg-emerald-500/[0.04] border-emerald-500/30 col-span-2 lg:col-span-1">
            <CardContent className="p-3.5 sm:p-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <IconReceipt2 className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 truncate">Ganancia Real Obtenida</p>
                  <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 leading-tight">
                    +{formatCurrency(totalRealProfit)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {totalRealSoldUnits} {totalRealSoldUnits === 1 ? "ud. vendida" : "uds. vendidas"} · {formatCurrency(totalRealRevenue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3" data-tour="products-search-bar">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o código…" className="pl-9 h-10 bg-card" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scroll-thin">
          <div className="w-[180px] shrink-0">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full h-10 bg-card"><IconFilter className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant={showLow ? "default" : "outline"} size="sm" className="h-10 shrink-0 bg-card" onClick={() => setShowLow(!showLow)}>
            <IconAlertTriangle className="h-3.5 w-3.5 mr-1" /> Stock bajo
          </Button>
          <Button variant={showExpiring ? "default" : "outline"} size="sm" className="h-10 shrink-0 bg-card" onClick={() => setShowExpiring(!showExpiring)}>
            <IconCalendarTime className="h-3.5 w-3.5 mr-1" /> Por vencer
          </Button>
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
                    <IconBoxSeam className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No se encontraron productos</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                  <Button size="sm" variant="outline" onClick={clearFilters}><IconFilter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <IconBoxSeam className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">Aún no tienes productos</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Crea tu primer producto para empezar a vender</p>
                  {canEdit ? (
                    <Button size="sm" onClick={openNew}><IconPlus className="h-4 w-4 mr-1.5" /> Crear primer producto</Button>
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
                      {canSeeCosts && (
                        <TableHead className="text-right hidden xl:table-cell">Total Costo</TableHead>
                      )}
                      <TableHead className="text-right hidden lg:table-cell">Total Venta</TableHead>
                      {canSeeCosts && (
                        <>
                          <TableHead className="text-right hidden xl:table-cell">Ganancia Est.</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Ganancia Real</TableHead>
                        </>
                      )}
                      <TableHead className="hidden lg:table-cell">Vencimiento</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => {
                      const exp = expirationStatus(p.expirationDate)
                      const low = p.stock <= p.minStock
                      const out = p.stock <= 0
                      const itemCostTotal = p.cost * p.stock
                      const itemSaleTotal = p.price * p.stock
                      const itemProfit = itemSaleTotal - itemCostTotal
                      const hasSales = (p.soldUnits ?? 0) > 0
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium">{p.name}</span>
                              {!p.active && (
                                <Badge variant="secondary" className="text-[10px] text-muted-foreground">Inactivo</Badge>
                              )}
                            </div>
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
                          {canSeeCosts && (
                            <TableCell className="text-right font-medium text-xs hidden xl:table-cell text-muted-foreground">
                              {formatCurrency(itemCostTotal)}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-semibold text-xs hidden lg:table-cell text-foreground">
                            {formatCurrency(itemSaleTotal)}
                          </TableCell>
                          {canSeeCosts && (
                            <>
                              <TableCell className="text-right font-semibold text-xs hidden xl:table-cell text-emerald-600 dark:text-emerald-400">
                                +{formatCurrency(itemProfit)}
                              </TableCell>
                              <TableCell className="text-right font-bold text-xs hidden md:table-cell">
                                {hasSales ? (
                                  <div>
                                    <span className="text-emerald-700 dark:text-emerald-400">+{formatCurrency(p.totalRealProfit ?? 0)}</span>
                                    <span className="block text-[10px] font-normal text-muted-foreground">
                                      {p.soldUnits} {p.soldUnits === 1 ? "ud." : "uds."}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/60 text-[11px] font-normal">Sin ventas</span>
                                )}
                              </TableCell>
                            </>
                          )}
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
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver detalle" onClick={() => setDetailProduct(p)}><IconEye className="h-3.5 w-3.5" /></Button>
                              {canEdit && (
                                <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar producto" onClick={() => openEdit(p)}><IconPencil className="h-3.5 w-3.5" /></Button>
                              )}
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
                  <IconBoxSeam className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">No se encontraron productos</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                <Button size="sm" variant="outline" onClick={clearFilters}><IconFilter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <IconBoxSeam className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no tienes productos</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Crea tu primer producto para empezar a vender</p>
                {canEdit ? (
                  <Button size="sm" onClick={openNew}><IconPlus className="h-4 w-4 mr-1.5" /> Crear primer producto</Button>
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium leading-tight">{p.name}</p>
                        {!p.active && (
                          <Badge variant="secondary" className="text-[10px] text-muted-foreground">Inactivo</Badge>
                        )}
                      </div>
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
                      <IconCalendarTime className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">{formatDate(p.expirationDate)}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${exp.variant === "expired" ? "border-red-500 text-red-600" : exp.variant === "soon" ? "border-orange-500 text-orange-600" : ""}`}
                      >
                        {exp.label}
                      </Badge>
                    </div>
                  )}
                  {/* Resumen de totales por producto en móvil */}
                  <div className="bg-muted/40 rounded-lg p-2 text-xs space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Total Venta Stock</span>
                        <span className="font-semibold text-foreground">{formatCurrency(p.price * p.stock)}</span>
                      </div>
                      {canSeeCosts ? (
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Ganancia Est. Stock</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency((p.price - p.cost) * p.stock)}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Unidad</span>
                          <span className="font-medium text-muted-foreground">{p.unit}</span>
                        </div>
                      )}
                    </div>
                    {canSeeCosts && (p.soldUnits ?? 0) > 0 && (
                      <div className="pt-1.5 border-t border-border/50 flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Ganancia Real ({p.soldUnits} {p.soldUnits === 1 ? "ud." : "uds."}):</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          +{formatCurrency(p.totalRealProfit ?? 0)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-1 border-t flex gap-2">
                    <Button size="sm" variant="outline" className="h-9 flex-1 text-xs" onClick={() => setDetailProduct(p)}>
                      <IconEye className="h-3.5 w-3.5 mr-1" /> Ver
                    </Button>
                    {canEdit && (
                      <Button size="sm" variant="secondary" className="h-9 flex-1 text-xs" onClick={() => openEdit(p)}>
                        <IconPencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                        title={role === "superadmin" ? "Eliminar producto demo definitivamente" : "Eliminar o desactivar producto"}
                        onClick={() => setProductToDelete(p)}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
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
                  <IconPlus className="h-4 w-4" />
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
              <Label>Unidad de medida</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {[
                    "unidad", "kg", "g", "libra", "litro", "ml", "galón", "metro", "cm", "pulgada",
                    "caja", "paquete", "bolsa", "botella", "lata", "frasco", "tubo", "blister",
                    "sobres", "par", "docena", "rollo", "juego", "bulto", "panal", "combo", "servicio"
                  ].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de vencimiento <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
              <Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
            </div>
            <div>
              <Label>Lote / Referencia <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
              <Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} placeholder="Ej: L1234 / Ref-A" />
            </div>
            <div>
              <Label>Ubicación</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Estante E1" />
            </div>
            <div className="md:col-span-2">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="md:col-span-2 pt-2 border-t">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary"
                />
                <span>Producto activo (disponible en punto de venta y catálogo comercial)</span>
              </label>
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                Desactiva este producto para archivarlo sin alterar el historial contable, ventas pasadas ni compras registradas.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal crear categoría rápida (desde el formulario de producto) */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconTag className="h-4 w-4 text-primary" /> Nueva categoría</DialogTitle>
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
              {savingCategory ? "Creando…" : <><IconPlus className="h-4 w-4 mr-1" /> Crear</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal gestionar categorías */}
      <Dialog open={catManageOpen} onOpenChange={setCatManageOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconTag className="h-4 w-4 text-primary" /> Gestionar categorías</DialogTitle>
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
                <IconPlus className="h-4 w-4 mr-1" /> Crear
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
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" title="Guardar" onClick={saveEditCategory}>
                        <IconCheck className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Cancelar" onClick={() => { setEditingCatId(null); setEditCatName("") }}>
                        <IconX className="h-4 w-4" />
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
                        <IconPencil className="h-3.5 w-3.5" />
                      </Button>
                      {(c._count?.products ?? 0) === 0 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          title="Eliminar categoría vacía"
                          onClick={() => setDeleteCatId(c.id)}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </Button>
                      )}
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

      {/* Confirmar eliminar producto (con soporte para Superadmin / datos de prueba) */}
      <AlertDialog open={!!productToDelete} onOpenChange={(o) => !o && !deletingProduct && setProductToDelete(null)}>
        <AlertDialogContent className="rounded-2xl max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <IconTrash className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center">
              {role === "superadmin" ? "¿Eliminar producto de prueba?" : "¿Eliminar producto?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-xs text-muted-foreground">
              {role === "superadmin" ? (
                <>
                  Estás en modo <strong>Superadministrador</strong>. Esta acción eliminará físicamente <strong>&quot;{productToDelete?.name}&quot;</strong> y todos sus lotes o registros de prueba asociados.
                </>
              ) : (
                <>
                  Se desactivará el producto <strong>&quot;{productToDelete?.name}&quot;</strong> para proteger la integridad histórica de las ventas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-center gap-2 pt-2 sm:justify-center">
            <AlertDialogCancel disabled={deletingProduct} className="flex-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingProduct}
              onClick={(e) => {
                e.preventDefault()
                confirmDeleteProduct(role === "superadmin")
              }}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingProduct ? "Eliminando..." : role === "superadmin" ? "Eliminar permanentemente" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==================== MODAL VER DETALLE DE PRODUCTO ==================== */}
      <Dialog open={!!detailProduct} onOpenChange={(openState) => !openState && setDetailProduct(null)}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden gap-0">
          {detailProduct && (
            <>
              {/* Header con gradiente y nombre */}
              <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-background border-b p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold text-primary border-primary/30 bg-primary/5">
                      {detailProduct.category?.name ?? "Sin Categoría"}
                    </Badge>
                    <DialogTitle className="text-lg font-bold text-foreground leading-tight">
                      {detailProduct.name}
                    </DialogTitle>
                  </div>
                  <Badge variant={detailProduct.active ? "default" : "secondary"} className="shrink-0 text-[10px]">
                    {detailProduct.active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                {detailProduct.description && (
                  <DialogDescription className="text-xs text-muted-foreground line-clamp-2">
                    {detailProduct.description}
                  </DialogDescription>
                )}
              </div>

              {/* Métricas Financieras del Stock (Total Costo, Total Venta, Ganancia) */}
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Balance Financiero de Stock ({detailProduct.stock} {detailProduct.unit}s)
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Tarjeta Total Costo */}
                    {canSeeCosts ? (
                      <div className="rounded-xl border bg-orange-500/5 border-orange-500/20 p-3 space-y-1">
                        <span className="text-[10px] font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
                          <IconCurrencyDollar className="h-3.5 w-3.5" /> Total Costo
                        </span>
                        <p className="text-base font-bold text-orange-950 dark:text-orange-200">
                          {formatCurrency(detailProduct.cost * detailProduct.stock)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatCurrency(detailProduct.cost)} c/u × {detailProduct.stock}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground">Stock actual</span>
                        <p className="text-base font-bold">{detailProduct.stock} {detailProduct.unit}</p>
                      </div>
                    )}

                    {/* Tarjeta Total Venta */}
                    <div className="rounded-xl border bg-primary/5 border-primary/20 p-3 space-y-1">
                      <span className="text-[10px] font-medium text-primary flex items-center gap-1">
                        <IconCurrencyDollar className="h-3.5 w-3.5" /> Total Venta
                      </span>
                      <p className="text-base font-bold text-primary">
                        {formatCurrency(detailProduct.price * detailProduct.stock)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatCurrency(detailProduct.price)} c/u × {detailProduct.stock}
                      </p>
                    </div>
                  </div>

                  {/* Tarjeta Ganancia Estimada */}
                  {canSeeCosts && (
                    <div className="rounded-xl border bg-emerald-500/10 border-emerald-500/30 p-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                          <IconTrendingUp className="h-4 w-4 text-emerald-600" /> Ganancia Estimada en Stock
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Margen unitario: {formatCurrency(detailProduct.price - detailProduct.cost)} por {detailProduct.unit}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                          +{formatCurrency((detailProduct.price - detailProduct.cost) * detailProduct.stock)}
                        </p>
                        <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {detailProduct.price > 0
                            ? `${Math.round(((detailProduct.price - detailProduct.cost) / detailProduct.price) * 100)}% de margen`
                            : "0%"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Sección de Ventas Reales Concretadas y Ganancia Real */}
                  <div className="rounded-xl border bg-emerald-500/[0.04] border-emerald-500/25 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wide">
                        <IconReceipt2 className="h-4 w-4 text-emerald-600" /> Rendimiento Real de Ventas
                      </span>
                      <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                        {detailProduct.soldUnits ?? 0} {(detailProduct.soldUnits ?? 0) === 1 ? "unidad vendida" : "unidades vendidas"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-emerald-500/20">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Recaudo Total Real</span>
                        <p className="font-bold text-foreground">{formatCurrency(detailProduct.totalRevenue ?? 0)}</p>
                      </div>
                      {canSeeCosts ? (
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Ganancia Real Obtenida</span>
                          <p className="font-extrabold text-emerald-700 dark:text-emerald-400">
                            +{(detailProduct.totalRealProfit ?? 0) > 0 ? formatCurrency(detailProduct.totalRealProfit ?? 0) : formatCurrency(0)}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Estado de Ventas</span>
                          <p className="font-medium text-muted-foreground">
                            {(detailProduct.soldUnits ?? 0) > 0 ? "Con ventas activas" : "Sin ventas aún"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Especificaciones y Almacén */}
                <div className="rounded-xl border bg-muted/20 p-3 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>
                      <span className="text-[10px] text-muted-foreground/70 block">Código / Barcode:</span>
                      <span className="font-mono font-medium text-foreground">{detailProduct.barcode || "Sin código de barras"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground/70 block">SKU / Referencia:</span>
                      <span className="font-mono font-medium text-foreground">{detailProduct.sku || "Sin SKU"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground/70 block">Stock Mínimo de Alerta:</span>
                      <span className="font-medium text-foreground">{detailProduct.minStock} {detailProduct.unit}s</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground/70 block">Ubicación física:</span>
                      <span className="font-medium text-foreground">{detailProduct.location || "No asignada"}</span>
                    </div>
                  </div>

                  {(detailProduct.expirationDate || detailProduct.batch) && (
                    <div className="pt-2 border-t flex items-center justify-between text-[11px]">
                      {detailProduct.batch && (
                        <span>Lote: <strong className="text-foreground">{detailProduct.batch}</strong></span>
                      )}
                      {detailProduct.expirationDate && (
                        <span>Vence: <strong className="text-foreground">{formatDate(detailProduct.expirationDate)}</strong></span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer acciones */}
              <div className="border-t p-3.5 bg-muted/20 flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => setDetailProduct(null)}>
                  Cerrar
                </Button>
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                      onClick={() => {
                        const p = detailProduct
                        setProductToDelete(p)
                      }}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                      {role === "superadmin" ? "Eliminar de prueba" : "Eliminar"}
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      className="rounded-xl text-xs gap-1.5 shadow-xs"
                      onClick={() => {
                        const p = detailProduct
                        setDetailProduct(null)
                        openEdit(p)
                      }}
                    >
                      <IconPencil className="h-3.5 w-3.5" /> Editar Producto
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
