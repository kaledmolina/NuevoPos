"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
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
import { Switch } from "@/components/ui/switch"
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
  IconTrash,
  IconArrowBackUp,
  IconReceiptRefund,
  IconMinus,
  IconPlus,
  IconPackage,
  IconCheck,
  IconInfoCircle,
} from "@tabler/icons-react"
import {
  type SaleReturn,
  type ReturnReason,
  type RefundMethod,
  RETURN_REASONS_LABELS,
  REFUND_METHODS_LABELS,
  buildReturnReceiptHTML,
} from "@/lib/returns"
import { cn } from "@/lib/utils"

interface SaleItem {
  id: string
  productId?: string
  quantity: number
  unitPrice: number
  subtotal: number
  product: { name: string }
}

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
  const [saleToDelete, setSaleToDelete] = useState<Sale | null>(null)
  const [deletingSale, setDeletingSale] = useState(false)
  const [storeInfo, setStoreInfo] = useState({
    name: "Sistema POS",
    nit: "",
    phone: "",
    address: "",
    message: "¡Gracias por su compra! Conserve este comprobante.",
  })

  // Estado del Sistema de Devoluciones
  const [allReturns, setAllReturns] = useState<SaleReturn[]>([])
  const [loadingReturns, setLoadingReturns] = useState(false)
  const [returnsHistoryOpen, setReturnsHistoryOpen] = useState(false)
  const [returnSearchQuery, setReturnSearchQuery] = useState("")

  // Estado para procesar devolución de una venta seleccionada
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [saleToReturn, setSaleToReturn] = useState<Sale | null>(null)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({})
  const [returnReason, setReturnReason] = useState<ReturnReason>("cambio_producto")
  const [returnReasonDetail, setReturnReasonDetail] = useState("")
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("efectivo")
  const [restockAll, setRestockAll] = useState(true)
  const [processingReturn, setProcessingReturn] = useState(false)

  const fetchReturns = useCallback(async () => {
    try {
      setLoadingReturns(true)
      const data = await apiFetch<SaleReturn[]>("/api/returns")
      if (Array.isArray(data)) {
        setAllReturns(data)
      }
    } catch (err) {
      console.warn("No se pudieron cargar las devoluciones:", err)
    } finally {
      setLoadingReturns(false)
    }
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<Sale[]>("/api/sales?limit=200"),
      apiFetch<Record<string, string>>("/api/settings").catch(() => ({} as Record<string, string>)),
      apiFetch<SaleReturn[]>("/api/returns").catch(() => [] as SaleReturn[]),
    ])
      .then(([s, settings, rets]) => {
        setSales(s)
        if (Array.isArray(rets)) {
          setAllReturns(rets)
        }
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

  // Mapeo rápido de devoluciones por id de venta
  const returnsBySaleId = useMemo(() => {
    const map: Record<string, SaleReturn[]> = {}
    for (const r of allReturns) {
      if (!map[r.saleId]) map[r.saleId] = []
      map[r.saleId].push(r)
    }
    return map
  }, [allReturns])

  // Identificar si una venta provino de un pedido a domicilio
  const isDeliverySale = (s: Sale) => {
    return (
      s.invoiceNumber.startsWith("PED-") ||
      (s.notes && (s.notes.toLowerCase().includes("domicilio") || s.notes.toLowerCase().includes("pedido")))
    )
  }

  // Devoluciones filtradas en el historial de devoluciones
  const filteredReturns = useMemo(() => {
    if (!returnSearchQuery.trim()) return allReturns
    const q = returnSearchQuery.toLowerCase()
    return allReturns.filter(
      (r) =>
        r.returnNumber.toLowerCase().includes(q) ||
        r.saleInvoiceNumber.toLowerCase().includes(q) ||
        r.clientName?.toLowerCase().includes(q) ||
        r.processedBy.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q)
    )
  }, [allReturns, returnSearchQuery])

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

  // Eliminar venta físicamente (útil para limpiar ventas de prueba / demo)
  const executeDeleteSale = async () => {
    if (!saleToDelete) return
    setDeletingSale(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/api/sales/${saleToDelete.id}`, {
        method: "DELETE",
      })
      toast.success(res.message || "Venta eliminada permanentemente")
      load()
      triggerRefresh()
      setDetail(null)
      setSaleToDelete(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingSale(false)
    }
  }

  // Acciones de Devolución
  const openReturnModal = (s: Sale) => {
    setSaleToReturn(s)
    const initialQuantities: Record<string, number> = {}
    s.items.forEach((it) => {
      initialQuantities[it.id] = s.items.length === 1 ? it.quantity : 0
    })
    setReturnQuantities(initialQuantities)
    setReturnReason("cambio_producto")
    setReturnReasonDetail("")
    setRefundMethod(s.paymentMethod === "credito" ? "credito" : "efectivo")
    setRestockAll(true)
    setReturnDialogOpen(true)
  }

  // Cálculo en vivo del monto y cantidad a devolver
  const returnCalculations = useMemo(() => {
    if (!saleToReturn) return { totalQty: 0, totalAmount: 0 }
    let totalQty = 0
    let totalAmount = 0
    for (const it of saleToReturn.items) {
      const q = returnQuantities[it.id] || 0
      if (q > 0) {
        totalQty += q
        totalAmount += q * it.unitPrice
      }
    }
    return { totalQty, totalAmount }
  }, [saleToReturn, returnQuantities])

  // Imprimir comprobante de devolución en formato térmico
  const printReturnReceipt = (ret: SaleReturn) => {
    const html = buildReturnReceiptHTML({
      storeInfo,
      returnData: ret,
    })
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
        toast.error("Permite las ventanas emergentes para imprimir comprobante de devolución")
      }
    }
  }

  // Ejecutar procesamiento de devolución
  const executeProcessReturn = async () => {
    if (!saleToReturn) return
    if (returnCalculations.totalQty <= 0) {
      return toast.error("Selecciona al menos 1 unidad de producto a devolver")
    }

    setProcessingReturn(true)
    try {
      const itemsPayload = saleToReturn.items
        .filter((it) => (returnQuantities[it.id] || 0) > 0)
        .map((it) => ({
          productId: it.productId || it.id,
          productName: it.product.name,
          quantity: returnQuantities[it.id],
          unitPrice: it.unitPrice,
          subtotal: returnQuantities[it.id] * it.unitPrice,
          restock: restockAll,
        }))

      const res = await apiFetch<{ ok: boolean; data: SaleReturn }>("/api/returns", {
        method: "POST",
        body: JSON.stringify({
          saleId: saleToReturn.id,
          items: itemsPayload,
          reason: returnReason,
          reasonDetail: returnReasonDetail.trim() || undefined,
          refundMethod: refundMethod,
          restockAll: restockAll,
          processedBy: loggedUserName || "Cajero",
        }),
      })

      if (res?.data) {
        toast.success(`¡Devolución ${res.data.returnNumber} procesada con éxito!`)
        setReturnDialogOpen(false)
        load()
        fetchReturns()
        triggerRefresh()
        printReturnReceipt(res.data)
      }
    } catch (e) {
      toast.error((e as Error).message || "Error al procesar la devolución")
    } finally {
      setProcessingReturn(false)
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
          <h2 className="text-xl font-bold flex items-center gap-2">
            <IconShoppingCart className="h-5 w-5 text-primary" /> Historial de ventas
          </h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} ventas · Total: {formatCurrency(totalSales)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Botón Historial de Devoluciones */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchReturns()
              setReturnsHistoryOpen(true)
            }}
            className="rounded-xl h-9 text-xs gap-1.5 border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 shadow-2xs font-semibold"
          >
            <IconReceiptRefund className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Devoluciones {allReturns.length > 0 && `(${allReturns.length})`}
          </Button>

          <Button size="sm" onClick={() => setView("pos")} className="rounded-xl h-9 text-xs gap-1">
            <IconShoppingCart className="h-4 w-4 mr-1" /> Nueva venta
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por factura o cliente…"
            className="pl-9 h-10 bg-card rounded-xl text-xs"
          />
        </div>
        <div className="w-full sm:w-[200px] shrink-0">
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full h-10 bg-card rounded-xl text-xs">
              <SelectValue placeholder="Todos los pagos" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">Todos los pagos</SelectItem>
              <SelectItem value="efectivo">Efectivo</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla (desktop) */}
      <div className="hidden md:block">
        <Card className="rounded-2xl border shadow-xs overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
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
                    {filtered.map((s) => {
                      const saleRets = returnsBySaleId[s.id] || []
                      const totalRefunded = saleRets.reduce((acc, r) => acc + r.totalRefunded, 0)
                      const isDevTotal = totalRefunded >= s.total && s.total > 0
                      const isDevParcial = totalRefunded > 0 && !isDevTotal
                      const isDelivery = isDeliverySale(s)

                      return (
                        <TableRow key={s.id} className="hover:bg-muted/20">
                          <TableCell className="font-mono text-xs font-semibold">
                            <div>{s.invoiceNumber}</div>
                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                              {isDelivery && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 font-medium"
                                  title="Venta de pedido a domicilio: registra únicamente el valor de los productos vendidos (sin recargo de transporte)"
                                >
                                  🛵 Domicilio (Solo productos)
                                </Badge>
                              )}
                              {saleRets.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReturnSearchQuery(s.invoiceNumber)
                                    setReturnsHistoryOpen(true)
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all cursor-pointer hover:opacity-80",
                                    isDevTotal
                                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                  )}
                                  title="Ver devolución registrada para esta factura"
                                >
                                  <IconArrowBackUp className="h-2.5 w-2.5" />
                                  {isDevTotal ? "Dev. Total" : "Dev. Parcial"} (-{formatCurrency(totalRefunded)})
                                </button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            <span className="font-medium text-foreground">{s.client?.name ?? "Cliente genérico"}</span>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
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
                          <TableCell className="text-right font-mono font-bold text-sm">
                            {formatCurrency(s.total)}
                            {totalRefunded > 0 && (
                              <span className="block text-[10px] text-rose-600 dark:text-rose-400 font-normal">
                                Reembolsado: -{formatCurrency(totalRefunded)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={s.status === "completada" ? "default" : "destructive"} className="text-xs">
                              {s.status === "completada" ? "Completada" : "Anulada"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Botón Devolución */}
                              {s.status === "completada" && !isDevTotal && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs gap-1 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                  title="Hacer devolución parcial o total de esta venta"
                                  onClick={() => openReturnModal(s)}
                                >
                                  <IconArrowBackUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                  <span className="hidden xl:inline">Devolver</span>
                                </Button>
                              )}

                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Ver detalle de venta" onClick={() => setDetail(s)}>
                                <IconEye className="h-3.5 w-3.5" />
                              </Button>
                              {(role === "superadmin" || canAnnul) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title={role === "superadmin" ? "Eliminar venta demo definitivamente" : "Eliminar venta"}
                                  onClick={() => setSaleToDelete(s)}
                                >
                                  <IconTrash className="h-3.5 w-3.5" />
                                </Button>
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
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
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
          filtered.map((s) => {
            const saleRets = returnsBySaleId[s.id] || []
            const totalRefunded = saleRets.reduce((acc, r) => acc + r.totalRefunded, 0)
            const isDevTotal = totalRefunded >= s.total && s.total > 0
            const isDelivery = isDeliverySale(s)

            return (
              <Card key={s.id} className={cn("rounded-2xl border shadow-2xs", s.status === "anulada" && "opacity-60")}>
                <CardContent className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold truncate">{s.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.client?.name ?? "Cliente genérico"}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.status === "completada" && !isDevTotal && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50"
                          title="Hacer devolución"
                          onClick={() => openReturnModal(s)}
                        >
                          <IconArrowBackUp className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="outline" className="h-8 w-8" title="Ver detalle de venta" onClick={() => setDetail(s)} aria-label="Ver detalle">
                        <IconEye className="h-4 w-4" />
                      </Button>
                      {(role === "superadmin" || canAnnul) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          title={role === "superadmin" ? "Eliminar venta demo definitivamente" : "Eliminar venta"}
                          onClick={() => setSaleToDelete(s)}
                          aria-label="Eliminar venta"
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Badges de Domicilio y Devolución */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isDelivery && (
                      <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30">
                        🛵 Domicilio (Solo productos)
                      </Badge>
                    )}
                    {saleRets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setReturnSearchQuery(s.invoiceNumber)
                          setReturnsHistoryOpen(true)
                        }}
                        className={cn(
                          "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border",
                          isDevTotal
                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                        )}
                      >
                        <IconArrowBackUp className="h-2.5 w-2.5" />
                        {isDevTotal ? "Dev. Total" : "Dev. Parcial"} (-{formatCurrency(totalRefunded)})
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground">{formatDateTime(s.createdAt)}</p>

                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t">
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
                    <p className="text-base font-bold text-primary font-mono">{formatCurrency(s.total)}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Modal Detalle de Venta */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-bold">
              <span>Detalle de venta {detail?.invoiceNumber}</span>
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              {/* Notificación si es venta originada desde pedido a domicilio */}
              {isDeliverySale(detail) && (
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-0.5">
                  <div className="font-bold flex items-center gap-1">
                    <IconInfoCircle className="h-3.5 w-3.5" /> Venta Sincronizada desde Domicilio
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Esta venta contiene exclusivamente el valor de los productos vendidos ({formatCurrency(detail.total)}). El coste del transporte o tarifa de domicilio no infla el total de la venta contable.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{detail.client?.name ?? "Genérico"}</strong></div>
                <div><span className="text-muted-foreground">Fecha:</span> {formatDateTime(detail.createdAt)}</div>
                <div><span className="text-muted-foreground">Pago:</span> {METHOD_LABEL[detail.paymentMethod] || detail.paymentMethod}</div>
                <div><span className="text-muted-foreground">Estado:</span> <strong>{detail.status}</strong></div>
              </div>
              <Separator />
              <div className="space-y-1 max-h-56 overflow-y-auto scroll-thin">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-xs">
                    <span className="truncate pr-2">{it.quantity}× {it.product.name}</span>
                    <span className="whitespace-nowrap font-mono font-medium">{formatCurrency(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />

              {/* Devoluciones registradas sobre esta venta */}
              {returnsBySaleId[detail.id] && returnsBySaleId[detail.id].length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <IconArrowBackUp className="h-3.5 w-3.5" /> Devoluciones Realizadas ({returnsBySaleId[detail.id].length})
                  </span>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {returnsBySaleId[detail.id].map((ret) => (
                      <div key={ret.id} className="p-2 rounded-lg bg-background/90 border text-xs flex items-center justify-between">
                        <div>
                          <p className="font-bold text-foreground">{ret.returnNumber}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDateTime(ret.createdAt)} · {RETURN_REASONS_LABELS[ret.reason] || ret.reason}
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-1.5">
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                            -{formatCurrency(ret.totalRefunded)}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            title="Reimprimir comprobante de devolución"
                            onClick={() => printReturnReceipt(ret)}
                          >
                            <IconPrinter className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.paymentMethod === "credito" ? (
                <div className="space-y-2.5">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
                    {detail.discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span>-{formatCurrency(detail.discount)}</span></div>}
                    <div className="flex justify-between font-bold text-base"><span>Total de venta</span><span className="text-primary font-mono">{formatCurrency(detail.total)}</span></div>
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
                        <span className="text-xs sm:text-sm font-bold text-foreground font-mono">{formatCurrency(detail.total)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20">
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-medium">Abonado</span>
                        <span className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">+{formatCurrency(detail.creditInfo?.paidAmount ?? 0)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-red-500/10 dark:bg-red-950/30 border border-red-500/20">
                        <span className="text-[10px] text-red-700 dark:text-red-400 block font-medium">Debe (Saldo)</span>
                        <span className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 font-mono">{formatCurrency(detail.creditInfo?.pendingBalance ?? detail.total)}</span>
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
                                <p className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">+{formatCurrency(ab.amount)}</p>
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
                  <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary font-mono">{formatCurrency(detail.total)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Recibido</span><span>{formatCurrency(detail.amountReceived)}</span></div>
                  {detail.change > 0 && <div className="flex justify-between text-blue-600"><span>Cambio</span><span>{formatCurrency(detail.change)}</span></div>}
                </div>
              )}

              {/* Botón Devolución desde Detalle */}
              {detail.status === "completada" && (
                <Button
                  variant="outline"
                  className="w-full border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold gap-2"
                  onClick={() => {
                    const d = detail
                    setDetail(null)
                    openReturnModal(d)
                  }}
                >
                  <IconArrowBackUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  Hacer Devolución de Productos de esta Venta
                </Button>
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
              {(role === "superadmin" || canAnnul) && (
                <Button
                  variant="destructive"
                  className="w-full text-xs font-semibold gap-2 shadow-xs"
                  onClick={() => setSaleToDelete(detail)}
                >
                  <IconTrash className="h-4 w-4" /> Eliminar venta permanentemente
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

      {/* Modal para Eliminar Venta Permanentemente (especial para datos de prueba y superadmin) */}
      <AlertDialog open={!!saleToDelete} onOpenChange={(open) => { if (!open && !deletingSale) setSaleToDelete(null) }}>
        <AlertDialogContent className="border-border bg-card shadow-2xl max-w-md rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <IconTrash className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold tracking-tight">
              ¿Eliminar la venta {saleToDelete?.invoiceNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-muted-foreground">
              Esta acción eliminará de forma <strong>definitiva</strong> este registro de venta, sus ítems y movimientos contables asociados. Esta función permite limpiar ventas realizadas con cuentas demo o durante pruebas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-center gap-2 pt-2 sm:justify-center">
            <AlertDialogCancel disabled={deletingSale} className="flex-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingSale}
              onClick={(e) => {
                e.preventDefault()
                executeDeleteSale()
              }}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingSale ? "Eliminando..." : "Sí, eliminar venta"}
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

      {/* Modal 1: Procesar Devolución Robusta de Productos */}
      <Dialog open={returnDialogOpen} onOpenChange={(o) => { if (!o && !processingReturn) setReturnDialogOpen(false) }}>
        <DialogContent className="max-w-lg rounded-2xl p-6">
          <DialogHeader className="space-y-1">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 mb-1">
              <IconArrowBackUp className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Procesar Devolución de Venta
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Factura <span className="font-mono font-bold text-foreground">{saleToReturn?.invoiceNumber}</span> · Cliente:{" "}
              <strong>{saleToReturn?.client?.name ?? "Cliente Genérico"}</strong>
            </p>
          </DialogHeader>

          {saleToReturn && (
            <div className="space-y-4 pt-2">
              {/* Lista de productos para seleccionar cantidad a devolver */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <IconPackage className="h-4 w-4 text-primary" /> Productos a devolver
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allQty: Record<string, number> = {}
                      saleToReturn.items.forEach((it) => {
                        allQty[it.id] = it.quantity
                      })
                      setReturnQuantities(allQty)
                    }}
                    className="text-[11px] text-primary hover:underline font-bold"
                  >
                    Seleccionar todo
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {saleToReturn.items.map((it) => {
                    const currentQty = returnQuantities[it.id] || 0
                    return (
                      <div
                        key={it.id}
                        className={cn(
                          "p-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 transition-all",
                          currentQty > 0
                            ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-950/20"
                            : "bg-card"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground truncate">{it.product.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Precio: {formatCurrency(it.unitPrice)} · Vendidas: {it.quantity} un.
                          </p>
                        </div>

                        {/* Control de cantidad */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            disabled={currentQty <= 0}
                            onClick={() => {
                              setReturnQuantities((prev) => ({
                                ...prev,
                                [it.id]: Math.max(0, currentQty - 1),
                              }))
                            }}
                          >
                            <IconMinus className="h-3 w-3" />
                          </Button>
                          <span className="font-mono font-bold text-xs w-6 text-center">
                            {currentQty}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 rounded-lg"
                            disabled={currentQty >= it.quantity}
                            onClick={() => {
                              setReturnQuantities((prev) => ({
                                ...prev,
                                [it.id]: Math.min(it.quantity, currentQty + 1),
                              }))
                            }}
                          >
                            <IconPlus className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="text-right w-20 shrink-0 font-mono font-bold text-foreground">
                          {formatCurrency(currentQty * it.unitPrice)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Motivo y Observación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Motivo de la Devolución</Label>
                  <Select value={returnReason} onValueChange={(val) => setReturnReason(val as ReturnReason)}>
                    <SelectTrigger className="h-9 text-xs rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs">
                      {Object.entries(RETURN_REASONS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Medio de Reembolso</Label>
                  <Select value={refundMethod} onValueChange={(val) => setRefundMethod(val as RefundMethod)}>
                    <SelectTrigger className="h-9 text-xs rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs">
                      {Object.entries(REFUND_METHODS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Detalle del Motivo u Observaciones</Label>
                <Input
                  value={returnReasonDetail}
                  onChange={(e) => setReturnReasonDetail(e.target.value)}
                  placeholder="Ej. Cambio por talla L / Empaque roto de fábrica..."
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              {/* Switch de reingreso al inventario */}
              <div className="p-3 rounded-xl border bg-muted/30 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-foreground block">
                    Reingresar unidades al inventario (Stock)
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    {restockAll
                      ? "✅ Las unidades devueltas se sumarán automáticamente al stock disponible."
                      : "❌ Baja contable por avería o merma (no aumentará el stock)."}
                  </p>
                </div>
                <Switch
                  checked={restockAll}
                  onCheckedChange={setRestockAll}
                />
              </div>

              {/* Resumen Financiero de la Devolución */}
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block">
                    Total a Reembolsar ({returnCalculations.totalQty} unidades)
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {REFUND_METHODS_LABELS[refundMethod]}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
                    -{formatCurrency(returnCalculations.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={processingReturn}
                  onClick={() => setReturnDialogOpen(false)}
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={processingReturn || returnCalculations.totalQty <= 0}
                  onClick={executeProcessReturn}
                  className="rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-xs"
                >
                  <IconArrowBackUp className="h-4 w-4" />
                  {processingReturn ? "Procesando..." : "Confirmar y Generar Comprobante"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal 2: Historial y Auditoría de Todas las Devoluciones */}
      <Dialog open={returnsHistoryOpen} onOpenChange={setReturnsHistoryOpen}>
        <DialogContent className="max-w-3xl rounded-2xl p-6">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <IconReceiptRefund className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-foreground">
                    Historial de Devoluciones y Reembolsos
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Registro auditable con comprobantes correlativos DEV
                  </p>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 pt-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={returnSearchQuery}
                  onChange={(e) => setReturnSearchQuery(e.target.value)}
                  placeholder="Buscar por # comprobante, factura original, cliente o motivo..."
                  className="pl-9 h-9 text-xs rounded-xl"
                />
              </div>
              {returnSearchQuery && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReturnSearchQuery("")}
                  className="h-9 px-2 text-xs"
                >
                  Limpiar
                </Button>
              )}
            </div>

            {loadingReturns ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Cargando devoluciones...
              </div>
            ) : filteredReturns.length === 0 ? (
              <div className="py-14 text-center space-y-2 border border-dashed rounded-2xl">
                <IconReceiptRefund className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-semibold text-foreground">No se encontraron devoluciones</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {returnSearchQuery
                    ? "No hay devoluciones que coincidan con la búsqueda."
                    : "Aún no se han registrado devoluciones de mercancía en el sistema."}
                </p>
              </div>
            ) : (
              <div className="border rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="text-xs font-bold">Comprobante</TableHead>
                      <TableHead className="text-xs font-bold">Factura</TableHead>
                      <TableHead className="text-xs font-bold">Fecha</TableHead>
                      <TableHead className="text-xs font-bold">Motivo</TableHead>
                      <TableHead className="text-xs font-bold">Reembolso</TableHead>
                      <TableHead className="text-xs font-bold text-right">Monto</TableHead>
                      <TableHead className="text-xs font-bold text-right">Tirilla</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReturns.map((ret) => (
                      <TableRow key={ret.id} className="hover:bg-muted/20 text-xs">
                        <TableCell className="font-mono font-bold text-amber-700 dark:text-amber-400">
                          {ret.returnNumber}
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {ret.saleInvoiceNumber}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDateTime(ret.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          <p className="font-medium truncate">{RETURN_REASONS_LABELS[ret.reason] || ret.reason}</p>
                          {ret.reasonDetail && (
                            <p className="text-[10px] text-muted-foreground truncate italic">"{ret.reasonDetail}"</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {REFUND_METHODS_LABELS[ret.refundMethod]?.split("(")[0]?.trim() || ret.refundMethod}
                          </Badge>
                          <span className="block text-[9px] text-muted-foreground mt-0.5">
                            {ret.restockAll ? "Stock reingresado" : "Baja contable"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                          -{formatCurrency(ret.totalRefunded)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => printReturnReceipt(ret)}
                            className="h-7 px-2 text-xs rounded-lg gap-1"
                            title="Reimprimir comprobante de devolución"
                          >
                            <IconPrinter className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Imprimir</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
