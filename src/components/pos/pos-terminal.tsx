"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { apiFetch } from "@/lib/api"
import { useAppStore, type HeldCart } from "@/lib/store"
import { formatCurrency, expirationStatus, formatDateTime, formatRelativeTime } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  IconSearch, IconPlus, IconMinus, IconTrash, IconShoppingCart, IconScan, IconX, IconCircleCheck,
  IconPrinter, IconPackage, IconDownload, IconPlayerPause, IconPlayerPlay, IconClock, IconUsers, IconArrowsExchange, IconAlertTriangle,
  IconCash, IconCreditCard, IconDeviceMobile, IconFileText, IconChevronDown, IconChevronRight, IconArrowLeft,
} from "@tabler/icons-react"

interface Product {
  id: string
  name: string
  price: number
  cost: number
  stock: number
  unit: string
  barcode: string | null
  categoryId?: string | null
  category?: { id?: string; name: string } | null
  expirationDate: string | null
}

interface Client { id: string; name: string }
interface Sale {
  id: string
  invoiceNumber: string
  total: number
  createdAt: string
  paymentMethod: string
  amountReceived: number
  change: number
  items: { product: { name: string }; quantity: number; unitPrice: number; subtotal: number }[]
}

const PAYMENTS = [
  { value: "efectivo", label: "Efectivo", icon: IconCash },
  { value: "transferencia", label: "Transferencia / Nequi", icon: IconDeviceMobile },
  { value: "tarjeta", label: "Tarjeta", icon: IconCreditCard },
  { value: "credito", label: "Crédito", icon: IconFileText },
]

export default function PosTerminal() {
  const cart = useAppStore((s) => s.cart)
  const addToCart = useAppStore((s) => s.addToCart)
  const updateCartQty = useAppStore((s) => s.updateCartQty)
  const removeFromCart = useAppStore((s) => s.removeFromCart)
  const clearCart = useAppStore((s) => s.clearCart)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const setView = useAppStore((s) => s.setView)

  // Ventas en espera / Cola de clientes
  const heldCarts = useAppStore((s) => s.heldCarts)
  const holdCurrentCart = useAppStore((s) => s.holdCurrentCart)
  const resumeHeldCart = useAppStore((s) => s.resumeHeldCart)
  const deleteHeldCart = useAppStore((s) => s.deleteHeldCart)
  const clearHeldCarts = useAppStore((s) => s.clearHeldCarts)

  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string>("")
  const [payment, setPayment] = useState("efectivo")
  const [received, setReceived] = useState("")
  const [discount, setDiscount] = useState("")
  const [checkingOut, setCheckingOut] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [cartOpenMobile, setCartOpenMobile] = useState(false)

  // Estados de modales para cola y pausar
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [holdNote, setHoldNote] = useState("")
  const [queueOpen, setQueueOpen] = useState(false)
  const [swapConfirmCart, setSwapConfirmCart] = useState<HeldCart | null>(null)
  const [confirmClearQueueOpen, setConfirmClearQueueOpen] = useState(false)

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
      apiFetch<Product[]>("/api/products?active=1"),
      apiFetch<Client[]>("/api/clients"),
      apiFetch<Record<string, string>>("/api/settings").catch(() => ({} as Record<string, string>)),
    ])
      .then(([p, c, settings]) => {
        setProducts(p)
        setClients(c)
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

  useEffect(() => { load() }, [load])

  // Escaneo por código de barras exacto
  useEffect(() => {
    const exact = products.find((p) => p.barcode && p.barcode === query.trim())
    if (exact && exact.stock > 0) {
      addToCart({ productId: exact.id, name: exact.name, price: exact.price, cost: exact.cost, stock: exact.stock, unit: exact.unit })
      toast.success(`${exact.name} agregado`)
      setQuery("")
    }
  }, [query, products, addToCart])

  // Categorías extraídas dinámicamente de los productos disponibles
  const categories = useMemo(() => {
    const map = new Map<string, string>()
    products.forEach((p) => {
      const catId = p.category?.id || p.categoryId
      const catName = p.category?.name
      if (catId && catName && !map.has(catId)) {
        map.set(catId, catName)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [products])

  const filtered = useMemo(() => {
    let list = products
    if (selectedCategory !== "all") {
      list = list.filter((p) => (p.category?.id || p.categoryId) === selectedCategory)
    }
    if (!query.trim()) return list
    const q = query.toLowerCase()
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(query.trim())
    )
  }, [products, query, selectedCategory])

  const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0)
  const disc = Math.min(Number(discount) || 0, subtotal)
  const total = Math.max(0, subtotal - disc)
  // Si en efectivo se deja vacío, se asume pago exacto para acelerar cobro en móvil
  const receivedNum = payment === "efectivo"
    ? (received.trim() === "" ? total : (Number(received) || 0))
    : total
  const change = Math.max(0, receivedNum - total)
  const cartCount = cart.reduce((s, it) => s + it.quantity, 0)

  // Acciones de Poner en Espera (Park Cart)
  const openHoldDialog = () => {
    if (cart.length === 0) return toast.error("El carrito está vacío")
    const selectedClient = clients.find((c) => c.id === clientId)
    setHoldNote(selectedClient ? `Cliente: ${selectedClient.name}` : `Cliente en espera #${heldCarts.length + 1}`)
    setHoldDialogOpen(true)
  }

  const confirmHoldCart = () => {
    if (cart.length === 0) return
    const selectedClient = clients.find((c) => c.id === clientId)
    const held = holdCurrentCart({
      note: holdNote,
      clientId: clientId || undefined,
      clientName: selectedClient?.name,
      discount,
      paymentMethod: payment,
    })
    if (held) {
      toast.success(`Venta de "${held.note}" guardada en espera`, {
        description: "Carrito libre para atender al siguiente cliente.",
      })
      setHoldDialogOpen(false)
      setHoldNote("")
      setClientId("")
      setDiscount("")
      setReceived("")
      setPayment("efectivo")
      setCartOpenMobile(false)
    }
  }

  // Acciones de Reanudar Venta desde la cola
  const handleResumeCart = (held: HeldCart) => {
    if (cart.length > 0) {
      setSwapConfirmCart(held)
      return
    }
    executeResumeCart(held, false)
  }

  const executeResumeCart = (held: HeldCart, holdActiveFirst = false) => {
    if (holdActiveFirst && cart.length > 0) {
      const activeClient = clients.find((c) => c.id === clientId)
      holdCurrentCart({
        note: activeClient ? `Cliente: ${activeClient.name}` : `Venta pausada #${heldCarts.length + 1}`,
        clientId: clientId || undefined,
        clientName: activeClient?.name,
        discount,
        paymentMethod: payment,
      })
    }
    const resumed = resumeHeldCart(held.id)
    if (resumed) {
      setClientId(resumed.clientId || "")
      setDiscount(resumed.discount || "")
      setPayment(resumed.paymentMethod || "efectivo")
      setReceived("")
      setQueueOpen(false)
      setSwapConfirmCart(null)
      toast.success(`Venta de "${resumed.note}" reanudada`)
    }
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error("Agrega productos a la venta")
    if (!receivedNum && payment === "efectivo") return toast.error("Ingresa el monto recibido")
    if (payment === "efectivo" && receivedNum < total) return toast.error("El monto recibido es menor al total")
    setCheckingOut(true)
    try {
      const sale = await apiFetch<Sale>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity, unitPrice: c.price, unitCost: c.cost })),
          clientId: clientId || undefined,
          paymentMethod: payment,
          amountReceived: receivedNum,
          discount: disc,
        }),
      })
      toast.success(`Venta ${sale.invoiceNumber} registrada`, {
        description: `${formatCurrency(sale.total)} · ${sale.paymentMethod}`,
        action: {
          label: "Ver recibo",
          onClick: () => setReceipt(sale),
        },
      })
      setReceipt(sale)
      clearCart()
      setReceived("")
      setDiscount("")
      setClientId("")
      setPayment("efectivo")
      setCartOpenMobile(false)
      triggerRefresh()
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCheckingOut(false)
    }
  }

  // Botones de cabecera de carrito (Cola, En espera, Vaciar)
  const CartHeaderActions = (
    <div className="flex items-center gap-1.5">
      {heldCarts.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setQueueOpen(true)}
          className="h-8 text-xs font-semibold gap-1 px-2.5 bg-sidebar-accent/50 border-border hover:bg-sidebar-accent text-primary"
          title="Ver cola de clientes en espera"
        >
          <IconClock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Cola</span>
          <Badge variant="secondary" className="h-4.5 px-1 text-[10px] ml-0.5 bg-primary/20 text-primary border-none">
            {heldCarts.length}
          </Badge>
        </Button>
      )}
      {cart.length > 0 && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={openHoldDialog}
            className="h-8 text-xs font-medium gap-1 px-2 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
            title="Poner en espera para atender otro cliente"
            data-tour="pos-hold-btn"
          >
            <IconPlayerPause className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">En espera</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="h-8 text-xs text-destructive hover:bg-destructive/10 px-2"
            title="Vaciar carrito"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  )

  // Contenido del carrito (reutilizado en desktop panel + mobile drawer)
  const CartBody = (
    <CardContent className="flex-1 flex flex-col min-h-0 p-0 overflow-y-auto scroll-thin">
      {/* Items del carrito */}
      <div className="px-3 sm:px-4 py-2 shrink-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <IconScan className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm font-medium">El carrito está vacío</p>
            <p className="text-xs text-muted-foreground/80 mt-0.5">Selecciona o escanea productos para comenzar</p>
            {heldCarts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs gap-1.5 border-primary/30 text-primary"
                onClick={() => setQueueOpen(true)}
              >
                <IconClock className="h-3.5 w-3.5" /> Hay {heldCarts.length} venta(s) en espera
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {cart.map((it) => (
                <motion.div
                  key={it.productId}
                  layout
                  initial={{ opacity: 0, x: 20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 rounded-xl border p-2 bg-card shadow-xs"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate leading-tight">{it.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatCurrency(it.price)} <span className="opacity-60">· {it.unit ?? "ud."}</span>
                    </p>
                  </div>
                  {/* Stepper ergonómico para dedos */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 rounded-lg active:scale-95"
                      onClick={() => updateCartQty(it.productId, it.quantity - 1)}
                    >
                      <IconMinus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      className="h-8 w-11 text-center px-0 text-sm font-bold"
                      value={it.quantity}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, it.stock))
                        updateCartQty(it.productId, v)
                      }}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 rounded-lg active:scale-95"
                      onClick={() => updateCartQty(it.productId, Math.min(it.quantity + 1, it.stock))}
                    >
                      <IconPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">{formatCurrency(it.price * it.quantity)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeFromCart(it.productId)}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Métodos de Pago y Datos de Venta */}
      <div className="border-t p-3 sm:p-4 space-y-3 shrink-0 bg-muted/10">
        {/* Selector de Método de Pago por Chips Directos (1 solo toque) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Forma de Pago
            </Label>
            <span className="text-xs font-bold text-primary capitalize">
              {PAYMENTS.find((p) => p.value === payment)?.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENTS.map((p) => {
              const Icon = p.icon
              const isSelected = payment === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPayment(p.value)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20 scale-[1.01]"
                      : "bg-background hover:bg-muted/80 text-foreground border-border active:scale-98"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{p.label.split("/")[0].trim()}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Cliente y Descuento */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] font-medium text-muted-foreground">Cliente</Label>
            <Select value={clientId || "generic"} onValueChange={(v) => setClientId(v === "generic" ? "" : v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Consumidor Final" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Consumidor Final</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-medium text-muted-foreground">Descuento ($)</Label>
            <Input
              className="h-9 text-xs font-medium"
              type="number"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Bloque especial de Efectivo con cambio y billetes rápidos */}
        {payment === "efectivo" && (
          <div className="space-y-2 pt-1 border-t border-dashed">
            <div className="flex items-center justify-between text-xs">
              <Label className="text-[11px] font-semibold text-muted-foreground">Efectivo Recibido</Label>
              {received.trim() !== "" && (
                <button
                  type="button"
                  onClick={() => setReceived("")}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Pago exacto
                </button>
              )}
            </div>

            <div className="relative">
              <Input
                className="h-10 text-base font-bold pl-3 pr-8"
                type="number"
                inputMode="decimal"
                value={received}
                onChange={(e) => setReceived(e.target.value)}
                placeholder={`Exacto: ${formatCurrency(total)}`}
              />
              {received && (
                <button
                  type="button"
                  onClick={() => setReceived("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Sugerencias de billetes rápidos */}
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant={received.trim() === "" || Number(received) === total ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs flex-1 min-w-[70px] px-1 font-semibold"
                onClick={() => setReceived(String(total))}
              >
                Exacto
              </Button>
              {[
                Math.ceil(total / 5000) * 5000,
                Math.ceil(total / 10000) * 10000,
                Math.ceil(total / 20000) * 20000,
                Math.ceil(total / 50000) * 50000,
              ]
                .filter((v, i, a) => v > total && a.indexOf(v) === i)
                .slice(0, 3)
                .map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant={Number(received) === v ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs flex-1 min-w-[70px] px-1 font-semibold"
                    onClick={() => setReceived(String(v))}
                  >
                    {formatCurrency(v)}
                  </Button>
                ))}
            </div>

            {/* Banner de cambio a devolver */}
            {receivedNum > total && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-foreground animate-in fade-in">
                <span className="text-xs font-semibold">Cambio a entregar:</span>
                <span className="text-base font-extrabold text-primary">
                  {formatCurrency(change)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Total + Botón Cobrar pegados al final */}
      <div className="border-t bg-card shrink-0 shadow-xs">
        <div className="px-3 sm:px-4 pt-2.5 pb-1 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {disc > 0 && (
            <div className="flex justify-between text-muted-foreground text-xs">
              <span>Descuento</span>
              <span>-{formatCurrency(disc)}</span>
            </div>
          )}
          <div className="flex justify-between text-base sm:text-lg font-extrabold pt-0.5 border-t border-dashed">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>
        <div className="p-3">
          <Button
            className="w-full h-12 text-base font-bold shadow-md shadow-primary/25 rounded-xl"
            disabled={cart.length === 0 || checkingOut}
            onClick={handleCheckout}
            data-tour="pos-checkout-btn"
          >
            <IconCircleCheck className="h-5 w-5 mr-2" />
            {checkingOut ? "Procesando…" : `Cobrar ${cart.length > 0 ? formatCurrency(total) : ""}`}
          </Button>
        </div>
      </div>
    </CardContent>
  )

  // Generar HTML del comprobante térmico imprimible
  const buildReceiptHTML = (s: Sale): string => {
    const items = s.items
      .map(
        (it) => `
      <tr>
        <td style="padding:4px 0;border-bottom:1px dashed #ddd;word-break:break-word">${it.quantity}× ${it.product.name}</td>
        <td style="padding:4px 0;text-align:right;border-bottom:1px dashed #ddd;white-space:nowrap">${formatCurrency(it.subtotal)}</td>
      </tr>`
      )
      .join("")

    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${s.invoiceNumber}</title>
    <style>
      *{box-sizing:border-box;font-family:monospace,'Courier New',Courier,sans-serif;font-size:12px;margin:0;padding:0}
      body{max-width:300px;margin:0 auto;padding:12px;color:#000;background:#fff}
      h1{font-size:15px;text-align:center;font-weight:bold;margin-bottom:4px}
      .center{text-align:center}
      .muted{color:#555;font-size:11px;line-height:1.3}
      table{width:100%;border-collapse:collapse;margin:6px 0}
      .tot{font-weight:bold;font-size:14px}
      .line{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between;margin:2px 0}
      @media print {
        body{width:100%;max-width:100%;padding:0}
        @page{margin:0;size:80mm auto}
      }
    </style></head><body>
      <h1>${storeInfo.name}</h1>
      <p class="center muted">${storeInfo.nit ? `NIT/Doc: ${storeInfo.nit}<br>` : ""}${storeInfo.phone ? `Tel: ${storeInfo.phone} · ` : ""}${storeInfo.address}</p>
      <div class="line"></div>
      <p class="center" style="font-weight:bold;margin-bottom:4px">COMPROBANTE DE VENTA</p>
      <div class="row"><span>Factura:</span><strong>${s.invoiceNumber}</strong></div>
      <div class="row"><span>Fecha:</span><span>${formatDateTime(s.createdAt)}</span></div>
      <div class="row"><span>Pago:</span><span style="text-transform:capitalize">${s.paymentMethod}</span></div>
      <div class="line"></div>
      <table>${items}</table>
      <div class="line"></div>
      <div className="row tot"><span>TOTAL:</span><span>${formatCurrency(s.total)}</span></div>
      ${s.paymentMethod === "credito" ? `
      <div class="row"><span>Modalidad:</span><strong>Crédito a cuenta</strong></div>
      <div class="row"><span>Saldo adeudado:</span><strong>${formatCurrency(s.total)}</strong></div>
      ` : `
      <div class="row"><span>Recibido:</span><span>${formatCurrency(s.amountReceived)}</span></div>
      ${s.change > 0 ? `<div class="row" style="font-weight:bold"><span>Cambio:</span><span>${formatCurrency(s.change)}</span></div>` : ""}
      `}
      <div class="line"></div>
      <p class="center muted" style="margin-top:6px">${storeInfo.message}</p>
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
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 p-3 sm:p-4 md:p-6 h-full w-full min-w-0 max-w-full pb-28 lg:pb-6">
      {/* Productos */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Banner de cola de espera si hay carritos pausados */}
        {heldCarts.length > 0 && (
          <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs mb-3 text-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <IconUsers className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate font-medium">
                <strong className="font-bold">{heldCarts.length}</strong> {heldCarts.length === 1 ? "cliente en cola de espera" : "clientes en cola de espera"}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs font-bold text-primary hover:bg-primary/20 px-2.5 shrink-0"
              onClick={() => setQueueOpen(true)}
            >
              Gestionar cola →
            </Button>
          </div>
        )}

        <div className="relative mb-2.5 sm:mb-4" data-tour="pos-search-input">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar o escanear código…"
            className="pl-10 h-11 sm:h-12 text-base"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
              <IconX className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Carrusel horizontal de categorías para móvil y desktop */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none w-full min-w-0 max-w-full shrink-0">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 active:scale-95 ${
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground shadow-xs shadow-primary/20"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>Todos</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedCategory === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
              }`}>
                {products.length}
              </span>
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => (p.category?.id || p.categoryId) === cat.id).length
              const isSelected = selectedCategory === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0 active:scale-95 ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs shadow-primary/20"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 pb-4">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 pr-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <IconPackage className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <motion.div
              layout
              className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 pr-2"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((p, i) => {
                  const exp = expirationStatus(p.expirationDate)
                  const out = p.stock <= 0
                  const low = p.stock <= 5
                  const inCartItem = cart.find((it) => it.productId === p.id)
                  const inCartQty = inCartItem?.quantity || 0
                  return (
                    <motion.button
                      key={p.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (out) return toast.error("Producto sin stock")
                        if (exp.variant === "expired") return toast.error("Producto vencido, no se puede vender")
                        addToCart({ productId: p.id, name: p.name, price: p.price, cost: p.cost, stock: p.stock, unit: p.unit })
                        toast.success(`${p.name} agregado`)
                      }}
                      disabled={out}
                      className={`group text-left rounded-xl border p-2.5 sm:p-3 transition-all relative disabled:opacity-50 disabled:cursor-not-allowed ${
                        inCartQty > 0
                          ? "border-primary ring-2 ring-primary/20 bg-primary/[0.03] shadow-sm"
                          : "bg-card hover:border-primary hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground truncate font-medium">
                          {p.category?.name ?? "General"}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {inCartQty > 0 && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground font-bold shadow-xs">
                              x{inCartQty}
                            </Badge>
                          )}
                          <Badge variant={out ? "destructive" : low ? "secondary" : "outline"} className="text-[9px] sm:text-[10px] px-1.5 py-0 shrink-0">
                            {out ? "Agotado" : `${p.stock}`}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
                        {p.name}
                      </p>
                      <div className="flex items-end justify-between mt-2">
                        <span className="text-sm sm:text-base font-extrabold text-primary">{formatCurrency(p.price)}</span>
                        <motion.span
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                            inCartQty > 0
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
                          }`}
                        >
                          <IconPlus className="h-4 w-4" />
                        </motion.span>
                      </div>
                      {exp.variant !== "ok" && (
                        <p className={`text-[9px] sm:text-[10px] mt-1 font-medium ${exp.variant === "expired" ? "text-destructive" : "text-amber-600"}`}>
                          {exp.label}
                        </p>
                      )}
                    </motion.button>
                  )
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </ScrollArea>
      </div>

      {/* Carrito — panel lateral desktop */}
      <div className="hidden lg:flex lg:w-[360px] xl:w-[400px] shrink-0">
        <Card className="flex flex-col w-full h-[calc(100vh-8.5rem)] min-h-[520px]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <IconShoppingCart className="h-4 w-4 text-primary" /> Venta actual
                {cartCount > 0 && <Badge className="ml-1">{cartCount}</Badge>}
              </CardTitle>
              {CartHeaderActions}
            </div>
          </CardHeader>
          {CartBody}
        </Card>
      </div>

      {/* Bottom bar fija en móvil — Dock ergonómico para abrir carrito o pagar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85 shadow-lg pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-2 p-2.5">
          {heldCarts.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 relative border-border text-foreground bg-muted active:scale-95"
              onClick={() => setQueueOpen(true)}
              title="Cola de espera"
            >
              <IconClock className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-extrabold px-1 shadow-xs">
                {heldCarts.length}
              </span>
            </Button>
          )}

          <button
            type="button"
            onClick={() => setCartOpenMobile(true)}
            className={`flex-1 flex items-center justify-between h-12 px-3.5 rounded-xl border transition-all ${
              cart.length > 0
                ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/25 active:scale-[0.99]"
                : "bg-muted/50 text-muted-foreground border-border cursor-pointer hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative">
                <IconShoppingCart className="h-5 w-5 shrink-0" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-background text-primary text-[10px] font-black px-1 border border-primary">
                    {cartCount}
                  </span>
                )}
              </div>
              <div className="text-left min-w-0">
                <span className="text-[11px] opacity-85 block leading-none">
                  {cart.length === 0 ? "Carrito vacío" : `${cartCount} ${cartCount === 1 ? "producto" : "productos"}`}
                </span>
                <span className="text-base font-extrabold tracking-tight block leading-tight">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 font-bold text-xs shrink-0 pl-2">
              <span>{cart.length > 0 ? "Ver carrito / Cobrar" : "Abrir pedido"}</span>
              <IconChevronRight className="h-4 w-4 shrink-0" />
            </div>
          </button>
        </div>
      </div>

      {/* Carrito — drawer móvil rediseñado */}
      <Sheet open={cartOpenMobile} onOpenChange={setCartOpenMobile}>
        <SheetContent side="bottom" showClose={false} className="h-[92vh] max-h-[92vh] p-0 flex flex-col rounded-t-2xl">
          {/* Header móvil con drag handle y botón claro para volver al catálogo */}
          <div className="pt-2.5 pb-2 px-4 flex flex-col items-center border-b bg-muted/20 shrink-0">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mb-2" />
            <div className="w-full flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 -ml-2 text-xs font-bold gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setCartOpenMobile(false)}
              >
                <IconArrowLeft className="h-4 w-4" /> Volver al catálogo
              </Button>
              <div className="flex items-center gap-1">
                {CartHeaderActions}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setCartOpenMobile(false)}
                >
                  <IconX className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          {CartBody}
        </SheetContent>
      </Sheet>

      {/* Modal: Poner venta en espera */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconPlayerPause className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Poner venta en espera
            </DialogTitle>
            <DialogDescription>
              Pausa esta venta para atender a otro cliente de inmediato. Podrás recuperarla y cobrarla en cualquier momento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-xl border bg-muted/40 p-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Productos en carrito:</span>
                <span className="font-bold text-foreground">{cartCount} unidades ({cart.length} ref)</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Total acumulado:</span>
                <span className="text-primary font-bold">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hold-note" className="text-xs">Nombre o referencia del cliente</Label>
              <Input
                id="hold-note"
                value={holdNote}
                onChange={(e) => setHoldNote(e.target.value)}
                placeholder="ej. Don Carlos, Mesa 2, Cliente con camisa azul..."
                className="h-10 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    confirmHoldCart()
                  }
                }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Asigna un nombre descriptivo para identificar rápidamente el carrito al reanudarlo.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmHoldCart} className="gap-1.5">
              <IconPlayerPause className="h-4 w-4" /> Guardar y atender nuevo cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Cola de Ventas en Espera */}
      <Dialog open={queueOpen} onOpenChange={setQueueOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-3 border-b">
            <div className="flex items-center justify-between gap-2">
              <div>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <IconClock className="h-5 w-5 text-primary" />
                  Cola de ventas en espera ({heldCarts.length})
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Selecciona un carrito pausado para recuperarlo y finalizar el cobro.
                </DialogDescription>
              </div>
              {heldCarts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmClearQueueOpen(true)}
                  className="text-xs text-destructive hover:bg-destructive/10 h-7 px-2"
                >
                  Vaciar cola
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-thin">
            {heldCarts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <IconClock className="h-10 w-10 mb-2 opacity-30" />
                <p className="font-semibold text-sm">No hay carritos en espera</p>
                <p className="text-xs max-w-xs mt-1">
                  Usa el botón &quot;En espera&quot; en el carrito cuando un cliente necesite tiempo o desees cobrar a otro en paralelo.
                </p>
              </div>
            ) : (
              heldCarts.map((held) => (
                <div
                  key={held.id}
                  className="rounded-xl border bg-card p-3.5 shadow-xs hover:border-primary/40 transition-colors space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-foreground leading-tight">{held.note}</h4>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
                          {held.itemCount} {held.itemCount === 1 ? "unidad" : "unidades"}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <IconClock className="h-3 w-3" /> {formatRelativeTime(held.createdAt)} · {formatDateTime(held.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-extrabold text-primary">{formatCurrency(held.total)}</span>
                    </div>
                  </div>

                  {/* Preview de items */}
                  <div className="bg-muted/40 rounded-lg p-2 max-h-24 overflow-y-auto scroll-thin text-xs space-y-1">
                    {held.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-muted-foreground text-[11px]">
                        <span className="truncate pr-2">• {it.quantity}× {it.name}</span>
                        <span className="font-mono">{formatCurrency(it.price * it.quantity)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2 border-t border-border/60">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:bg-destructive/10 h-8 px-2.5"
                      onClick={() => {
                        deleteHeldCart(held.id)
                        toast.info(`Venta de "${held.note}" eliminada de la cola`)
                      }}
                    >
                      <IconTrash className="h-3.5 w-3.5 mr-1" /> Descartar
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs font-semibold h-8 px-3 gap-1.5 shadow-xs"
                      onClick={() => handleResumeCart(held)}
                    >
                      <IconPlayerPlay className="h-3.5 w-3.5 fill-current" /> Reanudar y cobrar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="p-3 border-t bg-muted/20">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setQueueOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmación de Reanudación con Carrito no vacío */}
      <Dialog open={!!swapConfirmCart} onOpenChange={(o) => !o && setSwapConfirmCart(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconArrowsExchange className="h-5 w-5 text-primary" />
              El carrito actual tiene productos
            </DialogTitle>
            <DialogDescription>
              Actualmente tienes {cartCount} producto(s) en el carrito ({formatCurrency(total)}).
              ¿Qué deseas hacer para reanudar la venta de &quot;{swapConfirmCart?.note}&quot;?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Button
              className="w-full justify-start h-auto py-2.5 px-3 text-left"
              onClick={() => swapConfirmCart && executeResumeCart(swapConfirmCart, true)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <IconPlayerPause className="h-4 w-4 text-amber-400" /> Pausar venta actual y cargar seleccionada
                </span>
                <span className="text-xs font-normal text-primary-foreground/80">
                  Guarda la venta en curso a la cola de espera para no perder nada.
                </span>
              </div>
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start h-auto py-2.5 px-3 text-left border-destructive/30 hover:bg-destructive/10 text-destructive"
              onClick={() => swapConfirmCart && executeResumeCart(swapConfirmCart, false)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <IconTrash className="h-4 w-4" /> Descartar venta actual y cargar seleccionada
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  Borra el carrito actual e inserta los productos de la venta pausada.
                </span>
              </div>
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSwapConfirmCart(null)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recibo */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col items-center text-center gap-2">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <IconCircleCheck className="h-8 w-8" />
              </motion.div>
              <DialogTitle>¡Venta exitosa!</DialogTitle>
              <DialogDescription className="sr-only">Detalle de la venta realizada</DialogDescription>
            </div>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3">
              <div className="text-center text-sm text-muted-foreground">
                <p className="font-mono font-semibold text-foreground text-base">{receipt.invoiceNumber}</p>
                <p>{formatDateTime(receipt.createdAt)}</p>
              </div>
              <Separator />
              <div className="space-y-1.5 max-h-52 overflow-y-auto scroll-thin">
                {receipt.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="truncate pr-2 font-medium">{it.quantity}× {it.product.name}</span>
                    <span className="font-semibold tabular-nums whitespace-nowrap">{formatCurrency(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-sm bg-muted/40 p-3 rounded-lg">
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">{formatCurrency(receipt.total)}</span></div>
                {receipt.paymentMethod === "credito" ? (
                  <>
                    <div className="flex justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold">
                      <span>Modalidad:</span>
                      <span>Venta a Crédito</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground text-xs">
                      <span>Saldo a cobrar:</span>
                      <span className="font-semibold text-foreground">{formatCurrency(receipt.total)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-muted-foreground text-xs"><span>Recibido ({receipt.paymentMethod})</span><span>{formatCurrency(receipt.amountReceived)}</span></div>
                    {receipt.change > 0 && <div className="flex justify-between text-primary font-bold"><span>Cambio</span><span>{formatCurrency(receipt.change)}</span></div>}
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => receipt && downloadReceipt(receipt)}>
              <IconDownload className="h-4 w-4 mr-1.5" /> Descargar
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => receipt && printReceipt(receipt)}>
              <IconPrinter className="h-4 w-4 mr-1.5" /> Imprimir
            </Button>
            <Button className="flex-1" onClick={() => setReceipt(null)}>
              Nueva venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket imprimible directo para @media print */}
      {receipt && (
        <div className="print-area hidden print:block">
          <h1 style={{ fontSize: "15px", fontWeight: "bold", textAlign: "center", marginBottom: "4px" }}>{storeInfo.name}</h1>
          <p style={{ textAlign: "center", fontSize: "11px", color: "#333", lineHeight: 1.3 }}>
            {storeInfo.nit ? `NIT/Doc: ${storeInfo.nit}<br/>` : ""}{storeInfo.phone ? `Tel: ${storeInfo.phone} · ` : ""}{storeInfo.address}
          </p>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <p style={{ textAlign: "center", fontWeight: "bold", marginBottom: "4px" }}>COMPROBANTE DE VENTA</p>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Factura:</span><strong>{receipt.invoiceNumber}</strong></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Fecha:</span><span>{formatDateTime(receipt.createdAt)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Pago:</span><span style={{ textTransform: "capitalize" }}>{receipt.paymentMethod}</span></div>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "6px 0" }}>
            <tbody>
              {receipt.items.map((it, idx) => (
                <tr key={idx}>
                  <td style={{ padding: "3px 0", borderBottom: "1px dashed #ddd" }}>{it.quantity}× {it.product.name}</td>
                  <td style={{ padding: "3px 0", textAlign: "right", borderBottom: "1px dashed #ddd" }}>{formatCurrency(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "14px" }}>
            <span>TOTAL:</span><span>{formatCurrency(receipt.total)}</span>
          </div>
          {receipt.paymentMethod === "credito" ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Modalidad:</span><span>Crédito (Saldo: {formatCurrency(receipt.total)})</span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Recibido:</span><span>{formatCurrency(receipt.amountReceived)}</span>
              </div>
              {receipt.change > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                  <span>Cambio:</span><span>{formatCurrency(receipt.change)}</span>
                </div>
              )}
            </>
          )}
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <p style={{ textAlign: "center", fontSize: "11px", color: "#555", marginTop: "6px" }}>{storeInfo.message}</p>
        </div>
      )}

      <button
        onClick={() => setView("dashboard")}
        className="sr-only"
        aria-label="volver"
      />

      {/* Modal Moderno para Vaciar Cola de Espera */}
      <AlertDialog open={confirmClearQueueOpen} onOpenChange={setConfirmClearQueueOpen}>
        <AlertDialogContent className="border-border bg-card shadow-2xl max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <IconAlertTriangle className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="text-center text-lg font-semibold tracking-tight">
              ¿Vaciar cola de espera?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-muted-foreground">
              Se descartarán todos los carritos pausados en cola ({heldCarts.length}). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-center gap-2 pt-2 sm:justify-center">
            <AlertDialogCancel className="flex-1">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearHeldCarts()
                toast.info("Cola de espera vaciada")
              }}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, vaciar cola
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

