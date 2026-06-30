"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
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

  // Búsqueda con debounce por barcode exacto
  const [barcodeBuffer, setBarcodeBuffer] = useState("")
  useEffect(() => {
    const exact = products.find((p) => p.barcode && p.barcode === query.trim())
    if (exact && exact.stock > 0) {
      addToCart({ productId: exact.id, name: exact.name, price: exact.price, cost: exact.cost, stock: exact.stock })
      toast.success(`${exact.name} agregado`)
      setQuery("")
      setBarcodeBuffer("")
    }
    void barcodeBuffer
  }, [query, products, addToCart, barcodeBuffer])

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
      toast.success(`Venta ${sale.invoiceNumber} registrada`)
      setReceipt(sale)
      clearCart()
      setReceived("")
      setDiscount("")
      setClientId("")
      setPayment("efectivo")
      triggerRefresh()
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 md:p-6 h-full">
      {/* Productos */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o escanear código de barras…"
            className="pl-10 h-12 text-base"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-2">
              {filtered.map((p) => {
                const exp = expirationStatus(p.expirationDate)
                const out = p.stock <= 0
                const low = p.stock <= 5
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (out) return toast.error("Producto sin stock")
                      if (exp.variant === "expired") return toast.error("Producto vencido, no se puede vender")
                      addToCart({ productId: p.id, name: p.name, price: p.price, cost: p.cost, stock: p.stock })
                      toast.success(`${p.name} agregado`)
                    }}
                    disabled={out}
                    className="group text-left rounded-xl border bg-card p-3 hover:border-primary hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{p.category?.name ?? "Sin categoría"}</span>
                      <Badge variant={out ? "destructive" : low ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                        {out ? "Agotado" : `${p.stock}`}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium leading-tight line-clamp-2 min-h-[2.5rem] group-hover:text-primary">{p.name}</p>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-base font-bold text-primary">{formatCurrency(p.price)}</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Plus className="h-4 w-4" />
                      </span>
                    </div>
                    {exp.variant !== "ok" && (
                      <p className={`text-[10px] mt-1 ${exp.variant === "expired" ? "text-red-600" : "text-orange-600"}`}>{exp.label}</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Carrito */}
      <div className="lg:w-[380px] xl:w-[420px] shrink-0">
        <Card className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-3.5rem)]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-4 w-4 text-primary" /> Venta actual
              </CardTitle>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-xs text-destructive">
                  <Trash2 className="h-3 w-3" /> Vaciar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 p-0">
            <ScrollArea className="flex-1 px-4">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                  <ScanLine className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Escanea o selecciona productos</p>
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  {cart.map((it) => (
                    <div key={it.productId} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(it.price)} · {it.unit ?? "unidad"}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateCartQty(it.productId, it.quantity - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-7 w-12 text-center px-0"
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
                      <div className="w-20 text-right">
                        <p className="text-sm font-semibold">{formatCurrency(it.price * it.quantity)}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => removeFromCart(it.productId)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-4 space-y-3">
              <div>
                <Label className="text-xs">Cliente</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Cliente genérico" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Descuento $</Label>
                  <Input className="h-9" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Pago</Label>
                  <Select value={payment} onValueChange={setPayment}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENTS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {payment === "efectivo" && (
                <div>
                  <Label className="text-xs">Efectivo recibido</Label>
                  <Input className="h-9" type="number" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0" />
                  {receivedNum > 0 && (
                    <div className="flex items-center justify-between mt-1 text-xs">
                      <span className="text-muted-foreground">Cambio:</span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(change)}</span>
                    </div>
                  )}
                  <div className="flex gap-1 mt-1">
                    {[total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                      <Button key={v} variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => setReceived(String(v))}>
                        {formatCurrency(v)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                {disc > 0 && <div className="flex justify-between text-muted-foreground"><span>Descuento</span><span>-{formatCurrency(disc)}</span></div>}
                <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-primary">{formatCurrency(total)}</span></div>
              </div>

              <Button className="w-full h-11 text-base" disabled={cart.length === 0 || checkingOut} onClick={handleCheckout}>
                <CheckCircle2 className="h-5 w-5 mr-2" /> {checkingOut ? "Procesando…" : "Cobrar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recibo */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex flex-col items-center text-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <DialogTitle>¡Venta exitosa!</DialogTitle>
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
