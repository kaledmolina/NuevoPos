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
import { Search, Eye, ShoppingCart, Ban, Calendar, Filter, Printer, Download } from "lucide-react"

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

  const hasActiveFilters = query.trim() !== "" || method !== "all"
  const clearFilters = () => {
    setQuery("")
    setMethod("all")
  }

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

  // Generar HTML del comprobante imprimible
  const buildReceiptHTML = (s: Sale): string => {
    const items = s.items.map((it) => `
      <tr>
        <td style="padding:4px 0;border-bottom:1px dashed #eee">${it.quantity}× ${it.product.name}</td>
        <td style="padding:4px 0;text-align:right;border-bottom:1px dashed #eee">${formatCurrency(it.subtotal)}</td>
      </tr>`).join("")
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${s.invoiceNumber}</title>
    <style>
      *{font-family:monospace;font-size:12px}
      body{max-width:300px;margin:0 auto;padding:16px;color:#000}
      h1{font-size:16px;text-align:center;margin:0 0 4px}
      .center{text-align:center}
      .muted{color:#666;font-size:11px}
      table{width:100%;border-collapse:collapse}
      .tot{font-weight:bold;font-size:14px}
      .line{border-top:1px solid #000;margin:8px 0}
      .row{display:flex;justify-content:space-between}
    </style></head><body>
      <h1>Droguería La Salud</h1>
      <p class="center muted">NIT 900.123.456-7 · Tel +57 310 555 0100<br>Calle 45 # 23-18, Bogotá</p>
      <div class="line"></div>
      <p class="center" style="font-weight:bold">COMPROBANTE DE VENTA</p>
      <div class="row"><span>Factura:</span><span>${s.invoiceNumber}</span></div>
      <div class="row"><span>Fecha:</span><span>${formatDateTime(s.createdAt)}</span></div>
      <div class="row"><span>Cliente:</span><span>${s.client?.name ?? "Genérico"}</span></div>
      <div class="row"><span>Pago:</span><span>${METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</span></div>
      <div class="row"><span>Estado:</span><span>${s.status}</span></div>
      <div class="line"></div>
      <table>${items}</table>
      <div class="line"></div>
      <div class="row"><span>Subtotal:</span><span>${formatCurrency(s.subtotal)}</span></div>
      ${s.discount > 0 ? `<div class="row"><span>Descuento:</span><span>-${formatCurrency(s.discount)}</span></div>` : ""}
      <div class="row tot"><span>TOTAL:</span><span>${formatCurrency(s.total)}</span></div>
      <div class="row"><span>Recibido:</span><span>${formatCurrency(s.amountReceived)}</span></div>
      ${s.change > 0 ? `<div class="row"><span>Cambio:</span><span>${formatCurrency(s.change)}</span></div>` : ""}
      <div class="line"></div>
      <p class="center muted">¡Gracias por su compra!<br>Conserve este comprobante</p>
    </body></html>`
  }

  const printReceipt = (s: Sale) => {
    const w = window.open("", "_blank", "width=380,height=600")
    if (!w) return toast.error("Permite las ventanas emergentes para imprimir")
    w.document.write(buildReceiptHTML(s))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const downloadReceipt = (s: Sale) => {
    const html = buildReceiptHTML(s)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `comprobante-${s.invoiceNumber}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Comprobante descargado")
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

      <div className="flex flex-col gap-2">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por factura o cliente…" className="pl-9 h-10" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scroll-thin">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-[170px] h-10 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pagos</SelectItem>
              <SelectItem value="efectivo">Efectivo</SelectItem>
              <SelectItem value="tarjeta">Tarjeta</SelectItem>
              <SelectItem value="transferencia">Transferencia</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>
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
                    <Calendar className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No se encontraron ventas</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                  <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <Calendar className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">Aún no hay ventas registradas</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primera venta desde el POS</p>
                  <Button size="sm" onClick={() => setView("pos")}><ShoppingCart className="h-4 w-4 mr-1.5" /> Ir a vender</Button>
                </div>
              )
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
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver detalle de venta" onClick={() => setDetail(s)}><Eye className="h-3.5 w-3.5" /></Button>
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
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full">
            {hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <Calendar className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">No se encontraron ventas</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                <Button size="sm" variant="outline" onClick={clearFilters}><Filter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <Calendar className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no hay ventas registradas</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primera venta desde el POS</p>
                <Button size="sm" onClick={() => setView("pos")}><ShoppingCart className="h-4 w-4 mr-1.5" /> Ir a vender</Button>
              </div>
            )}
          </div>
        ) : (
          filtered.map((s) => (
            <Card key={s.id} className={s.status === "anulada" ? "opacity-60" : ""}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold truncate">{s.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.client?.name ?? "Cliente genérico"}</p>
                  </div>
                  <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Ver detalle de venta" onClick={() => setDetail(s)} aria-label="Ver detalle">
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</p>
                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</Badge>
                    <Badge variant={s.status === "completada" ? "default" : "destructive"} className="text-[10px]">
                      {s.status === "completada" ? "Completada" : "Anulada"}
                    </Badge>
                  </div>
                  <p className="text-lg font-bold text-primary leading-none">{formatCurrency(s.total)}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => printReceipt(detail)}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimir
                </Button>
                <Button variant="outline" onClick={() => downloadReceipt(detail)}>
                  <Download className="h-4 w-4 mr-2" /> Descargar
                </Button>
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
