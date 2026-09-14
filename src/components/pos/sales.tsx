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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  IconSearch,
  IconEye,
  IconShoppingCart,
  IconBan,
  IconCalendar,
  IconFilter,
  IconPrinter,
  IconDownload,
  IconAlertTriangle,
  IconCreditCard,
  IconCirclePlus,
  IconCircleCheck,
  IconClock,
} from "@tabler/icons-react"

interface SaleItem { id: string; quantity: number; unitPrice: number; subtotal: number; product: { name: string } }

export interface SaleCreditAbono {
  id: string
  voucherNumber: string
  amount: number
  method: string
  reportedBy: string
  createdAt: string
  concept: string
}

export interface SaleCreditInfo {
  isCredit: boolean
  totalSale: number
  initialPayment: number
  paidAmount: number
  pendingBalance: number
  status: "pagada" | "parcial" | "pendiente"
  accountBalance: number
  creditLimit: number
  availableCredit: number
  abonos: SaleCreditAbono[]
}

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
  clientId?: string | null
  client?: { id?: string; name: string; document?: string; phone?: string } | null
  items: SaleItem[]
  creditInfo?: SaleCreditInfo | null
}

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo", credito: "Crédito",
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
  const [storeInfo, setStoreInfo] = useState({
    name: "Sistema POS",
    nit: "",
    phone: "",
    address: "",
    message: "¡Gracias por su compra! Conserve este comprobante.",
  })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<Sale[]>("/api/sales?limit=200"),
      apiFetch<Record<string, string>>("/api/settings").catch(() => ({} as Record<string, string>)),
    ])
      .then(([s, settings]) => {
        setSales(s)
        if (settings) {
          setStoreInfo({
            name: settings.store_name || "Sistema POS",
            nit: settings.store_nit || "",
            phone: settings.store_phone || "",
            address: settings.store_address || "",
            message: settings.receipt_message || "¡Gracias por su compra! Conserve este comprobante.",
          })
        }
      })
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

  const loggedUserName = useAppStore((s) => s.userName)
  const [saleToAnnul, setSaleToAnnul] = useState<Sale | null>(null)
  const [annulling, setAnnulling] = useState(false)

  // Estado para registrar abono directo
  const [abonoSale, setAbonoSale] = useState<Sale | null>(null)
  const [abonoAmount, setAbonoAmount] = useState("")
  const [abonoMethod, setAbonoMethod] = useState("efectivo")
  const [abonoConcept, setAbonoConcept] = useState("")
  const [savingAbono, setSavingAbono] = useState(false)

  const openAbonoModal = (s: Sale) => {
    setAbonoSale(s)
    const pending = s.creditInfo?.pendingBalance ?? s.total
    setAbonoAmount(String(pending))
    setAbonoConcept(`Abono a factura ${s.invoiceNumber}`)
    setAbonoMethod("efectivo")
  }

  const executeSaveAbono = async () => {
    if (!abonoSale) return
    const cId = abonoSale.clientId || abonoSale.client?.id
    if (!cId) return toast.error("La venta no tiene cliente asociado para registrar el abono")
    const amt = Number(abonoAmount)
    if (!amt || amt <= 0) return toast.error("Ingresa un monto válido mayor a 0")
    const maxAllowed = abonoSale.creditInfo?.pendingBalance ?? abonoSale.total
    if (amt > maxAllowed) {
      return toast.error(`El monto ($${amt.toLocaleString("es-CO")}) supera el saldo pendiente ($${maxAllowed.toLocaleString("es-CO")}).`)
    }
    setSavingAbono(true)
    try {
      await apiFetch("/api/credit/abono", {
        method: "POST",
        body: JSON.stringify({
          clientId: cId,
          amount: amt,
          concept: abonoConcept.trim() || `Abono a factura #${abonoSale.invoiceNumber}`,
          method: abonoMethod,
          saleId: abonoSale.id,
          reportedBy: loggedUserName || "Cajero",
        }),
      })
      toast.success(`Abono de ${formatCurrency(amt)} registrado exitosamente`)
      setAbonoSale(null)
      const freshSales = await apiFetch<Sale[]>("/api/sales?limit=200")
      setSales(freshSales)
      const freshDetail = freshSales.find((s) => s.id === abonoSale.id)
      if (freshDetail) setDetail(freshDetail)
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingAbono(false)
    }
  }

  const annul = (s: Sale) => {
    setSaleToAnnul(s)
  }

  const executeAnnul = async () => {
    if (!saleToAnnul) return
    setAnnulling(true)
    try {
      await apiFetch(`/api/sales/${saleToAnnul.id}`, { method: "PATCH", body: JSON.stringify({ status: "anulada" }) })
      toast.success(`Venta ${saleToAnnul.invoiceNumber} anulada correctamente`)
      load()
      triggerRefresh()
      setDetail(null)
      setSaleToAnnul(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAnnulling(false)
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
      <h1>${storeInfo.name}</h1>
      <p class="center muted">${storeInfo.nit ? `NIT/Doc: ${storeInfo.nit} · ` : ""}${storeInfo.phone ? `Tel: ${storeInfo.phone}` : ""}<br>${storeInfo.address}</p>
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
      ${s.paymentMethod === "credito" ? `
      <div class="line"></div>
      <p class="center" style="font-weight:bold;margin:4px 0">INFORMACIÓN DE CRÉDITO</p>
      <div class="row"><span>Modalidad:</span><span>Venta a Crédito</span></div>
      <div class="row" style="color:#16a34a"><span>Total abonado:</span><span>+${formatCurrency(s.creditInfo?.paidAmount ?? 0)}</span></div>
      <div class="row tot" style="color:#b91c1c"><span>SALDO PENDIENTE:</span><span>${formatCurrency(s.creditInfo?.pendingBalance ?? s.total)}</span></div>
      <div class="row"><span>Estado crédito:</span><span style="font-weight:bold">${s.creditInfo?.status === "pagada" ? "PAGADO / AL DÍA" : (s.creditInfo?.status === "parcial" ? "ABONO PARCIAL" : "PENDIENTE DE PAGO")}</span></div>
      ${s.creditInfo?.accountBalance !== undefined ? `<div class="row muted"><span>Deuda total cliente:</span><span>${formatCurrency(s.creditInfo.accountBalance)}</span></div>` : ""}
      ` : `
      <div class="row"><span>Recibido:</span><span>${formatCurrency(s.amountReceived)}</span></div>
      ${s.change > 0 ? `<div class="row"><span>Cambio:</span><span>${formatCurrency(s.change)}</span></div>` : ""}
      `}
      <div class="line"></div>
      <p class="center muted">${storeInfo.message}</p>
    </body></html>`
  }

  const printReceipt = (s: Sale) => {
    const html = buildReceiptHTML(s)
    const printFrame = document.createElement("iframe")
    printFrame.style.position = "fixed"
    printFrame.style.right = "0"
    printFrame.style.bottom = "0"
    printFrame.style.width = "0"
    printFrame.style.height = "0"
    printFrame.style.border = "0"
    document.body.appendChild(printFrame)

    const frameDoc = printFrame.contentWindow?.document
    if (frameDoc) {
      frameDoc.open()
      frameDoc.write(html)
      frameDoc.close()
      setTimeout(() => {
        try {
          printFrame.contentWindow?.focus()
          printFrame.contentWindow?.print()
        } catch {
          const w = window.open("", "_blank", "width=380,height=600")
          if (w) {
            w.document.write(html)
            w.document.close()
            w.focus()
            setTimeout(() => w.print(), 250)
          }
        } finally {
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame)
            }
          }, 1500)
        }
      }, 250)
    } else {
      const w = window.open("", "_blank", "width=380,height=600")
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => w.print(), 250)
      } else {
        toast.error("Permite las ventanas emergentes para imprimir")
      }
    }
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
          <h2 className="text-xl font-bold flex items-center gap-2"><IconShoppingCart className="h-5 w-5 text-primary" /> Historial de ventas</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} ventas · Total: {formatCurrency(totalSales)}</p>
        </div>
        <Button size="sm" onClick={() => setView("pos")}><IconShoppingCart className="h-4 w-4 mr-1" /> Nueva venta</Button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por factura o cliente…"
            className="pl-9 h-10 bg-card"
          />
        </div>
        <div className="w-full sm:w-[200px] shrink-0">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full h-10 bg-card">
              <SelectValue placeholder="Todos los pagos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pagos</SelectItem>
              <SelectItem value="efectivo">Efectivo</SelectItem>
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
                    <IconCalendar className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">No se encontraron ventas</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                  <Button size="sm" variant="outline" onClick={clearFilters}><IconFilter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <IconCalendar className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium">Aún no hay ventas registradas</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primera venta desde el POS</p>
                  <Button size="sm" onClick={() => setView("pos")}><IconShoppingCart className="h-4 w-4 mr-1.5" /> Ir a vender</Button>
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
                        <TableCell>
                          {s.paymentMethod === "credito" && s.creditInfo ? (
                            s.creditInfo.status === "pagada" ? (
                              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                                Crédito · Pagado
                              </Badge>
                            ) : s.creditInfo.status === "parcial" ? (
                              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium">
                                Crédito · Debe {formatCurrency(s.creditInfo.pendingBalance)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30 font-medium">
                                Crédito · Debe {formatCurrency(s.creditInfo.pendingBalance)}
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="text-xs">{METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(s.total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={s.status === "completada" ? "default" : "destructive"} className="text-xs">
                            {s.status === "completada" ? "Completada" : "Anulada"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver detalle de venta" onClick={() => setDetail(s)}><IconEye className="h-3.5 w-3.5" /></Button>
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
                  <IconCalendar className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">No se encontraron ventas</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Prueba con otros filtros de búsqueda</p>
                <Button size="sm" variant="outline" onClick={clearFilters}><IconFilter className="h-4 w-4 mr-1.5" /> Limpiar filtros</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                  <IconCalendar className="h-7 w-7" />
                </div>
                <p className="text-sm font-medium">Aún no hay ventas registradas</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Registra tu primera venta desde el POS</p>
                <Button size="sm" onClick={() => setView("pos")}><IconShoppingCart className="h-4 w-4 mr-1.5" /> Ir a vender</Button>
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
                    <IconEye className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</p>
                <div className="flex items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {s.paymentMethod === "credito" && s.creditInfo ? (
                      s.creditInfo.status === "pagada" ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                          Crédito · Pagado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium">
                          Crédito · Debe {formatCurrency(s.creditInfo.pendingBalance)}
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod}</Badge>
                    )}
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
              {detail.paymentMethod === "credito" ? (
                <div className="space-y-2.5">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
                    {detail.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span>-{formatCurrency(detail.discount)}</span></div>}
                    <div className="flex justify-between font-bold text-base"><span>Total de venta</span><span className="text-primary">{formatCurrency(detail.total)}</span></div>
                  </div>

                  {/* Tarjeta de Estado Financiero del Crédito */}
                  <div className="rounded-xl border p-3 space-y-2.5 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-1.5">
                        <IconCreditCard className="h-3.5 w-3.5 text-primary" /> Venta a Crédito
                      </span>
                      {detail.creditInfo?.status === "pagada" ? (
                        <Badge className="text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                          <IconCircleCheck className="h-3 w-3" /> Pagado / Al día
                        </Badge>
                      ) : detail.creditInfo?.status === "parcial" ? (
                        <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium">
                          Abono parcial
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 font-medium">
                          Pendiente de pago
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-dashed">
                      <div className="p-2 rounded-lg bg-background/70 border">
                        <span className="text-[10px] text-muted-foreground block">Total Venta</span>
                        <span className="text-xs sm:text-sm font-bold text-foreground">{formatCurrency(detail.total)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20">
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-medium">Abonado</span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(detail.creditInfo?.paidAmount ?? 0)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-red-500/10 dark:bg-red-950/30 border border-red-500/20">
                        <span className="text-[10px] text-red-700 dark:text-red-400 block font-medium">Debe (Saldo)</span>
                        <span className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(detail.creditInfo?.pendingBalance ?? detail.total)}</span>
                      </div>
                    </div>

                    {detail.creditInfo && detail.creditInfo.accountBalance > 0 && (
                      <div className="text-[11px] text-muted-foreground flex items-center justify-between px-0.5 pt-0.5">
                        <span>Deuda total del cliente en la tienda:</span>
                        <span className="font-semibold text-foreground">{formatCurrency(detail.creditInfo.accountBalance)}</span>
                      </div>
                    )}

                    {/* Historial de abonos de esta venta */}
                    {detail.creditInfo && detail.creditInfo.abonos.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t">
                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                          <span className="flex items-center gap-1"><IconClock className="h-3.5 w-3.5" /> Abonos registrados ({detail.creditInfo.abonos.length})</span>
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto scroll-thin">
                          {detail.creditInfo.abonos.map((ab) => (
                            <div key={ab.id} className="flex items-center justify-between p-1.5 rounded-md bg-background/90 border text-xs">
                              <div>
                                <p className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatCurrency(ab.amount)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatDateTime(ab.createdAt)} · {ab.reportedBy}</p>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className="text-[9px] uppercase">{ab.method}</Badge>
                                <span className="text-[9px] text-muted-foreground block font-mono">{ab.voucherNumber}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Botón rápido para abonar */}
                    {detail.status === "completada" && (detail.creditInfo?.pendingBalance ?? detail.total) > 0 && (
                      <Button
                        size="sm"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                        onClick={() => openAbonoModal(detail)}
                      >
                        <IconCirclePlus className="h-4 w-4 mr-1.5" /> Registrar abono a esta factura
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
                  {detail.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span>-{formatCurrency(detail.discount)}</span></div>}
                  <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">{formatCurrency(detail.total)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Recibido</span><span>{formatCurrency(detail.amountReceived)}</span></div>
                  {detail.change > 0 && <div className="flex justify-between text-blue-600"><span>Cambio</span><span>{formatCurrency(detail.change)}</span></div>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => printReceipt(detail)}>
                  <IconPrinter className="h-4 w-4 mr-2" /> Imprimir
                </Button>
                <Button variant="outline" onClick={() => downloadReceipt(detail)}>
                  <IconDownload className="h-4 w-4 mr-2" /> Descargar
                </Button>
              </div>
              {detail.status === "completada" && canAnnul && (
                <Button variant="outline" className="w-full text-destructive" onClick={() => annul(detail)}>
                  <IconBan className="h-4 w-4 mr-2" /> Anular venta
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Moderno para Anular Venta */}
      <AlertDialog open={!!saleToAnnul} onOpenChange={(open) => { if (!open && !annulling) setSaleToAnnul(null) }}>
        <AlertDialogContent className="border-border bg-card shadow-2xl max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <IconAlertTriangle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold tracking-tight">
              ¿Anular la venta {saleToAnnul?.invoiceNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-muted-foreground">
              Esta acción revertirá la transacción y el stock de los productos vendidos será devuelto al inventario automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-center gap-2 pt-2 sm:justify-center">
            <AlertDialogCancel disabled={annulling} className="flex-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={annulling}
              onClick={(e) => {
                e.preventDefault()
                executeAnnul()
              }}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {annulling ? "Anulando..." : "Sí, anular venta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal para Registrar Abono directo desde el detalle de la venta */}
      <Dialog open={!!abonoSale} onOpenChange={(o) => { if (!o && !savingAbono) setAbonoSale(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconCreditCard className="h-5 w-5 text-emerald-600" />
              Registrar abono · Factura {abonoSale?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {abonoSale && (
            <div className="space-y-4 pt-1">
              <div className="rounded-xl border bg-muted/40 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-semibold text-foreground">{abonoSale.client?.name ?? "Cliente"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total de la factura:</span>
                  <span className="font-medium">{formatCurrency(abonoSale.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abonado hasta ahora:</span>
                  <span className="text-emerald-600 font-semibold">+{formatCurrency(abonoSale.creditInfo?.paidAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-dashed">
                  <span className="text-muted-foreground">Saldo pendiente:</span>
                  <span className="text-red-600 dark:text-red-400">{formatCurrency(abonoSale.creditInfo?.pendingBalance ?? abonoSale.total)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label className="text-xs font-semibold">Monto a abonar</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-primary px-1.5 font-medium hover:bg-primary/10"
                    onClick={() => setAbonoAmount(String(abonoSale.creditInfo?.pendingBalance ?? abonoSale.total))}
                  >
                    Pagar total saldo
                  </Button>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={abonoAmount}
                  onChange={(e) => setAbonoAmount(e.target.value)}
                  className="font-bold text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Método de pago</Label>
                  <Select value={abonoMethod} onValueChange={setAbonoMethod}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Concepto</Label>
                  <Input
                    className="h-9 text-xs"
                    value={abonoConcept}
                    onChange={(e) => setAbonoConcept(e.target.value)}
                    placeholder="Ej. Abono parcial"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" disabled={savingAbono} onClick={() => setAbonoSale(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={savingAbono || !Number(abonoAmount)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  onClick={executeSaveAbono}
                >
                  {savingAbono ? "Registrando..." : "Confirmar abono"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
