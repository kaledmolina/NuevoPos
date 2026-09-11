"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format"
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
  Search, Truck, Plus, Eye, Ban, Package, Trash2, FileText, Filter,
} from "lucide-react"

interface Supplier { id: string; name: string; document?: string | null }
interface Product {
  id: string
  name: string
  barcode: string | null
  sku: string | null
  cost: number
  price: number
  stock: number
  unit: string
}
interface PurchaseItem {
  id: string
  quantity: number
  unitCost: number
  subtotal: number
  expirationDate: string | null
  batch: string | null
  product: { id: string; name: string; unit: string }
}
interface Purchase {
  id: string
  reference: string | null
  supplierId: string | null
  supplier: { name: string } | null
  subtotal: number
  tax: number
  total: number
  status: string
  notes: string | null
  createdAt: string
  items: PurchaseItem[]
}

interface LineItem {
  productId: string
  name: string
  unit: string
  quantity: string
  unitCost: string
  expirationDate: string
  batch: string
}

const STATUS_LABEL: Record<string, string> = {
  recibida: "Recibida",
  pendiente: "Pendiente",
  anulada: "Anulada",
}

function StatusBadge({ status }: { status: string }) {
  if (status === "recibida") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">
        {STATUS_LABEL[status] ?? status}
      </Badge>
    )
  }
  if (status === "pendiente") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
        {STATUS_LABEL[status] ?? status}
      </Badge>
    )
  }
  return <Badge variant="destructive">{STATUS_LABEL[status] ?? status}</Badge>
}

export default function PurchasesView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)

  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  const [query, setQuery] = useState("")

  // Diálogo nueva compra
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [supplierId, setSupplierId] = useState<string>("none")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([])
  const [productQuery, setProductQuery] = useState("")

  // Diálogo detalle
  const [detail, setDetail] = useState<Purchase | null>(null)
  const [annulTarget, setAnnulTarget] = useState<Purchase | null>(null)
  const [annulling, setAnnulling] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<Purchase[]>(`/api/purchases?q=${encodeURIComponent(query)}`).catch(() => [] as Purchase[]),
      apiFetch<Supplier[]>("/api/suppliers").catch(() => [] as Supplier[]),
      apiFetch<Product[]>("/api/products").catch(() => [] as Product[]),
    ])
      .then(([p, s, pr]) => {
        setPurchases(p)
        setSuppliers(s)
        setProducts(pr)
      })
      .finally(() => setLoading(false))
  }, [query])

  useEffect(() => { load() }, [load, refreshKey])

  const hasActiveFilters = query.trim() !== ""
  const clearFilters = () => setQuery("")

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    let list = products
    if (q) {
      list = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? "").includes(productQuery.trim()) ||
          (p.sku ?? "").toLowerCase().includes(q)
      )
    }
    return list.slice(0, 50)
  }, [products, productQuery])

  const runningSubtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0
  )

  const periodTotal = purchases
    .filter((p) => p.status !== "anulada")
    .reduce((s, p) => s + p.total, 0)

  const resetForm = () => {
    setSupplierId("none")
    setReference("")
    setNotes("")
    setLines([])
    setProductQuery("")
  }

  const openNew = () => {
    resetForm()
    setOpen(true)
  }

  const addLine = (p: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id)
      if (existing) {
        toast.message(`${p.name} ya está en la compra`, {
          description: "Se incrementó la cantidad en 1.",
        })
        return prev.map((l) =>
          l.productId === p.id
            ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) }
            : l
        )
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          quantity: "1",
          unitCost: String(p.cost || 0),
          expirationDate: "",
          batch: "",
        },
      ]
    })
    setProductQuery("")
    toast.success(`${p.name} agregado`)
  }

  const updateLine = (productId: string, field: keyof LineItem, value: string) => {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, [field]: value } : l))
    )
  }

  const removeLine = (productId: string) => {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  const save = async () => {
    const validLines = lines.filter(
      (l) => Number(l.quantity) > 0 && Number(l.unitCost) >= 0
    )
    if (validLines.length === 0) {
      toast.error("Agrega al menos un producto con cantidad mayor a 0")
      return
    }

    setSaving(true)
    try {
      const payload = {
        reference: reference.trim(),
        supplierId: supplierId === "none" ? null : supplierId,
        notes: notes.trim(),
        items: validLines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
          expirationDate: l.expirationDate || undefined,
          batch: l.batch.trim() || undefined,
        })),
      }
      const created = await apiFetch<Purchase>("/api/purchases", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      toast.success("Compra registrada", {
        description: `Total: ${formatCurrency(created.total)} · Stock actualizado`,
      })
      setOpen(false)
      resetForm()
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const confirmAnnul = async () => {
    if (!annulTarget) return
    setAnnulling(true)
    try {
      await apiFetch(`/api/purchases/${annulTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "anulada" }),
      })
      toast.success("Compra anulada", {
        description: "El stock fue revertido.",
      })
      setAnnulTarget(null)
      setDetail(null)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAnnulling(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Compras
          </h2>
          <p className="text-sm text-muted-foreground">
            {purchases.length} compras registradas · Total del período: {formatCurrency(periodTotal)}
          </p>
        </div>
        <Button size="sm" onClick={openNew} data-tour="purchases-new-btn">
          <Plus className="h-4 w-4 mr-1" /> Nueva compra
        </Button>
      </div>

      {/* Filtro */}
      <div className="relative w-full md:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por referencia o proveedor…"
          className="pl-9 h-10"
        />
      </div>

      {/* Tabla (desktop) */}
      <div className="hidden md:block">
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : purchases.length === 0 ? (
              hasActiveFilters ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <Truck className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No se encontraron compras</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                  <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <Truck className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">Aún no hay compras registradas</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primera compra para actualizar el inventario</p>
                  <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Registrar primera compra</Button>
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                      <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((p) => (
                      <TableRow key={p.id} className={p.status === "anulada" ? "opacity-60" : ""}>
                        <TableCell className="font-mono text-sm font-medium">
                          {p.reference ? (
                            p.reference
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {p.supplier?.name ?? <span className="text-muted-foreground">Sin proveedor</span>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {formatDateTime(p.createdAt)}
                        </TableCell>
                        <TableCell className="text-center text-sm">{p.items.length}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(p.total)}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="Ver detalle de compra"
                            onClick={() => setDetail(p)}
                            aria-label="Ver detalle"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)
        ) : purchases.length === 0 ? (
          <div className="col-span-full">
            {hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <Truck className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">No se encontraron compras</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <Truck className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no hay compras registradas</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primera compra para actualizar el inventario</p>
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> Registrar primera compra</Button>
              </div>
            )}
          </div>
        ) : (
          purchases.map((p) => (
            <Card key={p.id} className={p.status === "anulada" ? "opacity-60" : ""}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold truncate">
                      {p.reference ?? <span className="text-muted-foreground font-sans">Sin ref.</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.supplier?.name ?? "Sin proveedor"}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-10 w-10 shrink-0"
                    title="Ver detalle de compra"
                    onClick={() => setDetail(p)}
                    aria-label="Ver detalle"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono">{p.items.length} items</Badge>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-lg font-bold text-primary leading-none">{formatCurrency(p.total)}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Diálogo nueva compra */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm() }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Nueva compra
            </DialogTitle>
            <DialogDescription>
              Registra una compra a proveedor. El stock y el costo de los productos se actualizarán automáticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Datos generales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Proveedor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sin proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Referencia (factura proveedor)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ej: FAC-2024-001"
                  className="h-9"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones de la compra…"
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <Separator />

            {/* Selector de productos (buscador inline) */}
            <div className="space-y-2">
              <Label className="text-xs">Agregar producto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Buscar producto por nombre o código…"
                  className="pl-9 h-9"
                />
              </div>
              {productQuery.trim() && (
                <div className="rounded-md border max-h-48 overflow-y-auto scroll-thin bg-popover">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      Sin resultados para “{productQuery.trim()}”
                    </div>
                  ) : (
                    filteredProducts.map((p) => {
                      const already = lines.some((l) => l.productId === p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addLine(p)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                        >
                          <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="truncate font-medium">
                              {p.name}
                              {already && (
                                <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1.5">
                                  agregado
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.barcode ?? "Sin código"} · Stock: {p.stock} {p.unit}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatCurrency(p.cost)}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Líneas de la compra */}
            {lines.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No hay productos agregados. Usa el buscador de arriba para añadirlos.
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto scroll-thin pr-1">
                {lines.map((l) => {
                  const sub =
                    (Number(l.quantity) || 0) * (Number(l.unitCost) || 0)
                  return (
                    <div
                      key={l.productId}
                      className="rounded-lg border p-3 space-y-2.5 bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{l.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Unidad: {l.unit}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => removeLine(l.productId)}
                          aria-label="Quitar producto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Cantidad</Label>
                          <Input
                            type="number"
                            min="1"
                            value={l.quantity}
                            onChange={(e) => updateLine(l.productId, "quantity", e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Costo unit.</Label>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={l.unitCost}
                            onChange={(e) => updateLine(l.productId, "unitCost", e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Vencimiento</Label>
                          <Input
                            type="date"
                            value={l.expirationDate}
                            onChange={(e) => updateLine(l.productId, "expirationDate", e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Lote</Label>
                          <Input
                            value={l.batch}
                            onChange={(e) => updateLine(l.productId, "batch", e.target.value)}
                            placeholder="L1234"
                            className="h-8"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <span className="text-sm font-semibold text-primary">
                          Subtotal: {formatCurrency(sub)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Total */}
            <div className="rounded-lg border bg-primary/5 p-3 flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Total compra ({lines.length} producto{lines.length === 1 ? "" : "s"})
              </span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(runningSubtotal)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || lines.length === 0}>
              {saving ? "Guardando…" : "Guardar compra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo detalle */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Detalle de compra {detail?.reference ? `· ${detail.reference}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Proveedor:</span>{" "}
                  {detail.supplier?.name ?? "Sin proveedor"}
                </div>
                <div>
                  <span className="text-muted-foreground">Fecha:</span>{" "}
                  {formatDateTime(detail.createdAt)}
                </div>
                <div>
                  <span className="text-muted-foreground">Estado:</span>{" "}
                  <StatusBadge status={detail.status} />
                </div>
                <div>
                  <span className="text-muted-foreground">Items:</span>{" "}
                  {detail.items.length}
                </div>
              </div>

              {detail.notes && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Notas: </span>
                    {detail.notes}
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-1 max-h-56 overflow-y-auto scroll-thin">
                {detail.items.map((it) => (
                  <div
                    key={it.id}
                    className="flex justify-between items-start gap-2 text-sm py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {it.quantity} × {it.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        @ {formatCurrency(it.unitCost)}
                        {it.batch ? ` · Lote ${it.batch}` : ""}
                        {it.expirationDate ? ` · Vence ${formatDate(it.expirationDate)}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap font-semibold">
                      {formatCurrency(it.subtotal)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(detail.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Impuesto</span>
                  <span>{formatCurrency(detail.tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(detail.total)}</span>
                </div>
              </div>

              {detail.status !== "anulada" && (
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setAnnulTarget(detail)}
                >
                  <Ban className="h-4 w-4 mr-2" /> Anular compra
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar anulación */}
      <AlertDialog
        open={!!annulTarget}
        onOpenChange={(o) => !o && setAnnulTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular esta compra?</AlertDialogTitle>
            <AlertDialogDescription>
              La compra será marcada como anulada y el stock agregado será revertido
              (sin bajar de 0). Esta acción no se puede deshacer.
              {annulTarget?.reference ? ` Referencia: ${annulTarget.reference}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={annulling}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAnnul}
              disabled={annulling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {annulling ? "Anulando…" : "Anular compra"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
