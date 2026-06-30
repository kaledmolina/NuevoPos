"use client"

import { useEffect, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { ROLE_CONFIG } from "@/lib/permissions"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Search, Eye, ShoppingCart, Ban, Calendar } from "lucide-react"

interface SaleItem { id: string; quantity: number; unitPrice: number; subtotal: number; product: { name: string } }
interface Sale {
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
  items: SaleItem[]
}

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", credito: "Crédito",
}

export default function SalesView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const setView = useAppStore((s) => s.setView)
  const role = useAppStore((s) => s.role)
  const canAnnul = role ? ROLE_CONFIG[role].canAnnulSales : false
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [method, setMethod] = useState("all")
  const [detail, setDetail] = useState<Sale | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    apiFetch<Sale[]>("/api/sales?limit=200")
      .then(setSales)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const filtered = sales.filter((s) => {
    if (method !== "all" && s.paymentMethod !== method) return false
    if (query) {
      const q = query.toLowerCase()
      return s.invoiceNumber.toLowerCase().includes(q) || s.client?.name?.toLowerCase().includes(q)
    }
    return true
  })

  const totalSales = filtered.filter((s) => s.status === "completada").reduce((sum, s) => sum + s.total, 0)

  const annul = async (s: Sale) => {
    if (!confirm(`¿Anular la venta ${s.invoiceNumber}? El stock será devuelto.`)) return
    try {
      await apiFetch(`/api/sales/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: "anulada" }) })
      toast.success("Venta anulada")
      load()
      triggerRefresh()
      setDetail(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> Historial de ventas</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} ventas · Total: {formatCurrency(totalSales)}</p>
        </div>
        <Button size="sm" onClick={() => setView("pos")}><ShoppingCart className="h-4 w-4 mr-1" /> Nueva venta</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por factura o cliente…" className="pl-9 h-9" />
        </div>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pagos</SelectItem>
            <SelectItem value="efectivo">Efectivo</SelectItem>
            <SelectItem value="tarjeta">Tarjeta</SelectItem>
            <SelectItem value="transferencia">Transferencia</SelectItem>
            <SelectItem value="credito">Crédito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Calendar className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No hay ventas registradas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura</TableHead>
                    <TableHead className="hidden md:table-cell">Cliente</TableHead>
                    <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm font-medium">{s.invoiceNumber}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{s.client?.name ?? "Cliente genérico"}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(s.total)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={s.status === "completada" ? "default" : "destructive"} className="text-xs">
                          {s.status === "completada" ? "Completada" : "Anulada"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDetail(s)}><Eye className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de venta {detail?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> {detail.client?.name ?? "Genérico"}</div>
                <div><span className="text-muted-foreground">Fecha:</span> {formatDateTime(detail.createdAt)}</div>
                <div><span className="text-muted-foreground">Pago:</span> {METHOD_LABEL[detail.paymentMethod]}</div>
                <div><span className="text-muted-foreground">Estado:</span> {detail.status}</div>
              </div>
              <Separator />
              <div className="space-y-1 max-h-56 overflow-y-auto scroll-thin">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-sm">
                    <span className="truncate pr-2">{it.quantity}× {it.product.name}</span>
                    <span className="whitespace-nowrap font-medium">{formatCurrency(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
                {detail.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span>-{formatCurrency(detail.discount)}</span></div>}
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">{formatCurrency(detail.total)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Recibido</span><span>{formatCurrency(detail.amountReceived)}</span></div>
                {detail.change > 0 && <div className="flex justify-between text-emerald-600"><span>Cambio</span><span>{formatCurrency(detail.change)}</span></div>}
              </div>
              {detail.status === "completada" && canAnnul && (
                <Button variant="outline" className="w-full text-destructive" onClick={() => annul(detail)}>
                  <Ban className="h-4 w-4 mr-2" /> Anular venta
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
