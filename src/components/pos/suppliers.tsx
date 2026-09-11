"use client"

import { useEffect, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatDateTime } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  IconSearch, IconPlus, IconPencil, IconBuilding, IconId, IconPhone, IconFileText, IconFilter,
} from "@tabler/icons-react"

interface Supplier {
  id: string
  name: string
  document: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  createdAt: string
  _count?: { purchases: number }
}

const emptyForm = {
  name: "", document: "", contactName: "", phone: "", email: "", address: "", notes: "",
}

export default function SuppliersView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    apiFetch<Supplier[]>(`/api/suppliers?q=${encodeURIComponent(query)}`)
      .then(setSuppliers)
      .catch(() => toast.error("No se pudieron cargar los proveedores"))
      .finally(() => setLoading(false))
  }, [query])

  useEffect(() => { load() }, [load, refreshKey])

  const hasActiveFilters = query.trim() !== ""
  const clearFilters = () => setQuery("")

  const totalPurchases = suppliers.reduce((s, p) => s + (p._count?.purchases ?? 0), 0)

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }
  const openEdit = (s: Supplier) => {
    setEditing(s)
    setForm({
      name: s.name,
      document: s.document ?? "",
      contactName: s.contactName ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio")
    setSaving(true)
    try {
      const payload = { ...form }
      if (editing) {
        await apiFetch(`/api/suppliers/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        toast.success("Proveedor actualizado")
      } else {
        await apiFetch("/api/suppliers", { method: "POST", body: JSON.stringify(payload) })
        toast.success("Proveedor creado")
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

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header / filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <IconBuilding className="h-5 w-5 text-primary" /> Proveedores
            </h2>
            <p className="text-sm text-muted-foreground">
              {suppliers.length} proveedor(es) · {totalPurchases} compra(s) registradas
            </p>
          </div>
          <Button size="sm" onClick={openNew}>
            <IconPlus className="h-4 w-4 mr-1" /> Nuevo proveedor
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, NIT, contacto o teléfono…"
              className="pl-9 h-10"
            />
          </div>
        </div>
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
            ) : suppliers.length === 0 ? (
              hasActiveFilters ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <IconBuilding className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No se encontraron proveedores</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                  <Button size="sm" variant="outline" onClick={clearFilters}><IconFilter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <IconBuilding className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">Aún no hay proveedores</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primer proveedor para asociarlo a las compras</p>
                  <Button size="sm" onClick={openNew}><IconPlus className="h-4 w-4 mr-1.5" /> Agregar primer proveedor</Button>
                </div>
              )
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Documento</TableHead>
                      <TableHead className="hidden lg:table-cell">Contacto</TableHead>
                      <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                      <TableHead className="text-center">Compras</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((s) => {
                      const purchasesCount = s._count?.purchases ?? 0
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium flex items-center gap-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                                <IconBuilding className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate">{s.name}</p>
                                <p className="text-xs text-muted-foreground md:hidden">
                                  {s.document ?? "Sin NIT"}
                                </p>
                                <p className="text-xs text-muted-foreground lg:hidden">
                                  {s.contactName ?? "Sin contacto"}
                                </p>
                                <p className="text-xs text-muted-foreground sm:hidden">
                                  {s.phone ?? "Sin teléfono"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                            {s.document ?? "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {s.contactName ? (
                              <span className="inline-flex items-center gap-1.5">
                                <IconId className="h-3.5 w-3.5 opacity-60" />
                                {s.contactName}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                            {s.phone ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={purchasesCount > 0 ? "default" : "secondary"} className="font-mono">
                              {purchasesCount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar proveedor" onClick={() => openEdit(s)} aria-label="Editar proveedor">
                                <IconPencil className="h-3.5 w-3.5" />
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
      </div>

      {/* Tarjetas (móvil) */}
      <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)
        ) : suppliers.length === 0 ? (
          <div className="col-span-full">
            {hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <IconBuilding className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">No se encontraron proveedores</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                <Button size="sm" variant="outline" onClick={clearFilters}><IconFilter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <IconBuilding className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no hay proveedores</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primer proveedor para asociarlo a las compras</p>
                <Button size="sm" onClick={openNew}><IconPlus className="h-4 w-4 mr-1.5" /> Agregar primer proveedor</Button>
              </div>
            )}
          </div>
        ) : (
          suppliers.map((s) => {
            const purchasesCount = s._count?.purchases ?? 0
            return (
              <Card key={s.id}>
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                        <IconBuilding className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight truncate">{s.name}</p>
                        <Badge variant={purchasesCount > 0 ? "default" : "secondary"} className="font-mono text-[10px] mt-1">
                          {purchasesCount} compra{purchasesCount === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    {s.document && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconFileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="font-mono">{s.document}</span>
                      </div>
                    )}
                    {s.contactName && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconId className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{s.contactName}</span>
                      </div>
                    )}
                    {s.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconPhone className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span>{s.phone}</span>
                      </div>
                    )}
                    {!s.document && !s.contactName && !s.phone && (
                      <p className="text-muted-foreground italic">Sin datos de contacto</p>
                    )}
                  </div>
                  <div className="pt-1 border-t">
                    <Button size="sm" variant="outline" className="h-10 w-full" onClick={() => openEdit(s)}>
                      <IconPencil className="h-4 w-4 mr-1.5" /> Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal crear/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconBuilding className="h-5 w-5 text-primary" />
              {editing ? "Editar proveedor" : "Nuevo proveedor"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Actualiza la información del proveedor"
                : "Registra un nuevo proveedor en el sistema"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2">
              <Label>Nombre / Razón social *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Distribuidora Farmacéutica S.A.S."
              />
            </div>
            <div>
              <Label>NIT / Documento</Label>
              <Input
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                placeholder="900.123.456-7"
              />
            </div>
            <div>
              <Label>Nombre del contacto</Label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="601 234 5678"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="proveedor@correo.com"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Dirección</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Carrera 50 # 25-30, Bodega 4"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Condiciones de pago, plazos de entrega, observaciones, etc."
              />
            </div>
          </div>
          {editing && (
            <p className="text-xs text-muted-foreground">
              Registrado el {formatDateTime(editing.createdAt)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
