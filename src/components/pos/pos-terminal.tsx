"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, expirationStatus, formatDateTime } from "@/lib/format"
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  Search, Plus, Minus, Trash2, ShoppingCart, ScanLine, X, CheckCircle2,
  Printer, Package,
} from "lucide-react"

interface Product {
  id: string
  name: string
  price: number
  cost: number
  stock: number
  unit: string
  barcode: string | null
  category?: { name: string } | null
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
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "credito", label: "Crédito" },
]

export default function PosTerminal() {
  const cart = useAppStore((s) => s.cart)
  const addToCart = useAppStore((s) => s.addToCart)
  const updateCartQty = useAppStore((s) => s.updateCartQty)
  const removeFromCart = useAppStore((s) => s.removeFromCart)
  const clearCart = useAppStore((s) => s.clearCart)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const setView = useAppStore((s) => s.setView)

  const [products, setProducts] = useState<Product[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string>("")
  const [payment, setPayment] = useState("efectivo")
  const [received, setReceived] = useState("")
  const [discount, setDiscount] = useState("")
  const [checkingOut, setCheckingOut] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [cartOpenMobile, setCartOpenMobile] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<Product[]>("/api/products"),
      apiFetch<Client[]>("/api/clients"),
    ])
      .then(([p, c]) => { setProducts(p); setClients(c) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // Escaneo por código de barras exacto
  useEffect(() => {
    const exact = products.find((p) => p.barcode && p.barcode === query.trim())
    if (exact && exact.stock > 0) {
      addToCart({ productId: exact.id, name: exact.name, price: exact.price, cost: exact.cost, stock: exact.stock })
      toast.success(`${exact.name} agregado`)
      setQuery("")
    }
  }, [query, products, addToCart])

  const filtered = useMemo(() => {
    if (!query.trim()) return products
    const q = query.toLowerCase()
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(query.trim())
    )
  }, [products, query])

  const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0)
  const disc = Math.min(Number(discount) || 0, subtotal)
  const total = Math.max(0, subtotal - disc)
  const receivedNum = payment === "efectivo" ? (Number(received) || 0) : total
  const change = Math.max(0, receivedNum - total)

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

  const cartCount = cart.reduce((s, it) => s + it.quantity, 0)

  // Contenido del carrito (reutilizado en desktop panel + mobile drawer)
  const CartBody = (
    <CardContent className="flex-1 flex flex-col min-h-0 p-0 overflow-y-auto scroll-thin">
      {/* Items del carrito — solo ocupa lo que necesita */}
      <div className="px-3 sm:px-4 shrink-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <ScanLine className="h-7 w-7 mb-1.5 opacity-40" />
            <p className="text-sm">Escanea o selecciona productos</p>
          </div>
        ) : (
          <div className="space-y-1.5 py-2">
            <AnimatePresence initial={false}>
              {cart.map((it) => (
                <motion.div
                  key={it.productId}
                  layout
                  initial={{ opacity: 0, x: 20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: "auto" }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 rounded-lg border p-1.5 bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(it.price)} · {it.unit ?? "unidad"}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(it.productId, it.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      className="h-7 w-10 text-center px-0 text-sm"
                      value={it.quantity}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, it.stock))
                        updateCartQty(it.productId, v)
                      }}
                    />
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(it.productId, Math.min(it.quantity + 1, it.stock))}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="w-18 text-right">
                    <p className="text-sm font-semibold">{formatCurrency(it.price * it.quantity)}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground shrink-0" onClick={() => removeFromCart(it.productId)}>
                    <X className="h-3 w-3" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Sección de pago — compacta, sin expandir */}
      <div className="border-t p-2.5 sm:p-3 space-y-2 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Genérico" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Pago</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Descuento</Label>
            <Input className="h-9 text-sm" type="number" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
          </div>
          {payment === "efectivo" ? (
            <div>
              <Label className="text-[11px]">Recibido</Label>
              <Input className="h-9 text-sm" type="number" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0" />
            </div>
          ) : (
            <div className="flex items-end">
              <div className="text-xs text-muted-foreground pb-2">—</div>
            </div>
          )}
        </div>

        {payment === "efectivo" && (
          <>
            {receivedNum > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cambio:</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(change)}</span>
              </div>
            )}
            <div className="flex gap-1">
              {[total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                <Button key={v} variant="outline" size="sm" className="h-7 text-[11px] flex-1 px-1" onClick={() => setReceived(String(v))}>
                  {formatCurrency(v)}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Total + Botón Cobrar pegados, siempre visibles al final */}
      <div className="border-t bg-card shrink-0">
        <div className="px-3 sm:px-4 pt-2 pb-1 space-y-0.5 text-sm">
          <div className="flex justify-between text-muted-foreground text-xs"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          {disc > 0 && <div className="flex justify-between text-muted-foreground text-xs"><span>Descuento</span><span>-{formatCurrency(disc)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">{formatCurrency(total)}</span></div>
        </div>
        <div className="p-2.5 sm:p-3 pt-2">
          <Button className="w-full h-11 text-sm font-semibold shadow-md shadow-primary/20" disabled={cart.length === 0 || checkingOut} onClick={handleCheckout}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> {checkingOut ? "Procesando…" : `Cobrar ${cart.length > 0 ? formatCurrency(total) : ""}`}
          </Button>
        </div>
      </div>
    </CardContent>
  )

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 p-3 sm:p-4 md:p-6 h-full lg:h-full pb-28 lg:pb-6">
      {/* Productos */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="relative mb-3 sm:mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar o escanear código…"
            className="pl-10 h-11 sm:h-12 text-base"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 pb-4">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3 pr-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-40" />
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
                        addToCart({ productId: p.id, name: p.name, price: p.price, cost: p.cost, stock: p.stock })
                        toast.success(`${p.name} agregado`)
                      }}
                      disabled={out}
                      className="group text-left rounded-xl border bg-card p-2.5 sm:p-3 hover:border-primary hover:shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground truncate">{p.category?.name ?? "Sin categoría"}</span>
                        <Badge variant={out ? "destructive" : low ? "secondary" : "outline"} className="text-[9px] sm:text-[10px] px-1.5 py-0 shrink-0">
                          {out ? "Agotado" : `${p.stock}`}
                        </Badge>
                      </div>
                      <p className="text-xs sm:text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-primary">{p.name}</p>
                      <div className="flex items-end justify-between mt-2">
                        <span className="text-sm sm:text-base font-bold text-primary">{formatCurrency(p.price)}</span>
                        <motion.span
                          whileHover={{ scale: 1.1, rotate: 90 }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                        </motion.span>
                      </div>
                      {exp.variant !== "ok" && (
                        <p className={`text-[9px] sm:text-[10px] mt-1 ${exp.variant === "expired" ? "text-red-600" : "text-orange-600"}`}>{exp.label}</p>
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
      <div className="hidden lg:flex lg:w-[380px] xl:w-[420px] shrink-0">
        <Card className="flex flex-col w-full h-[calc(100vh-3.5rem)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-4 w-4 text-primary" /> Venta actual
                {cartCount > 0 && <Badge className="ml-1">{cartCount}</Badge>}
              </CardTitle>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-xs text-destructive h-8">
                  <Trash2 className="h-3.5 w-3.5" /> Vaciar
                </Button>
              )}
            </div>
          </CardHeader>
          {CartBody}
        </Card>
      </div>

      {/* Bottom bar fija en móvil */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 safe-area-inset-bottom">
        <div className="flex items-center gap-2 p-2.5 safe-pad">
          <Button
            variant="outline"
            className="h-12 px-4 relative shrink-0"
            onClick={() => setCartOpenMobile(true)}
          >
            <ShoppingCart className="h-5 w-5" />
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.span
                  key={cartCount}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold"
                >
                  {cartCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="text-lg font-bold text-primary leading-tight truncate">{formatCurrency(total)}</p>
          </div>
          <Button
            className="h-12 px-6 text-base font-semibold shrink-0"
            disabled={cart.length === 0 || checkingOut}
            onClick={handleCheckout}
          >
            <CheckCircle2 className="h-5 w-5 mr-1.5" /> Cobrar
          </Button>
        </div>
      </div>

      {/* Carrito — drawer móvil */}
      <Sheet open={cartOpenMobile} onOpenChange={setCartOpenMobile}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" /> Venta actual
                {cartCount > 0 && <Badge>{cartCount}</Badge>}
              </span>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-xs text-destructive h-8">
                  <Trash2 className="h-3.5 w-3.5" /> Vaciar
                </Button>
              )}
            </SheetTitle>
          </SheetHeader>
          {CartBody}
        </SheetContent>
      </Sheet>

      {/* Recibo */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col items-center text-center gap-2">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
              >
                <CheckCircle2 className="h-8 w-8" />
              </motion.div>
              <DialogTitle>¡Venta exitosa!</DialogTitle>
              <DialogDescription className="sr-only">Detalle de la venta realizada</DialogDescription>
            </div>
          </DialogHeader>
          {receipt && (
            <div className="space-y-3">
              <div className="text-center text-sm text-muted-foreground">
                <p className="font-mono font-semibold text-foreground">{receipt.invoiceNumber}</p>
                <p>{formatDateTime(receipt.createdAt)}</p>
              </div>
              <Separator />
              <div className="space-y-1 max-h-52 overflow-y-auto scroll-thin">
                {receipt.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="truncate pr-2">{it.quantity}× {it.product.name}</span>
                    <span className="font-medium whitespace-nowrap">{formatCurrency(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between font-bold text-base"><span>Total</span><span className="text-primary">{formatCurrency(receipt.total)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Recibido ({receipt.paymentMethod})</span><span>{formatCurrency(receipt.amountReceived)}</span></div>
                {receipt.change > 0 && <div className="flex justify-between text-emerald-600 font-medium"><span>Cambio</span><span>{formatCurrency(receipt.change)}</span></div>}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Imprimir</Button>
            <Button className="flex-1" onClick={() => setReceipt(null)}>Nueva venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <button
        onClick={() => setView("dashboard")}
        className="sr-only"
        aria-label="volver"
      />
    </div>
  )
}
