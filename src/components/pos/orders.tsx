"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAppStore } from "@/lib/store"
import { apiFetch } from "@/lib/api"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  IconTruckDelivery,
  IconMotorbike,
  IconUser,
  IconPhone,
  IconMapPin,
  IconClock,
  IconCheck,
  IconX,
  IconSearch,
  IconPlus,
  IconRefresh,
  IconChevronRight,
  IconPrinter,
  IconBrandWhatsapp,
  IconAlertCircle,
  IconFileText,
  IconUserCheck,
  IconLayersLinked,
  IconEye,
  IconSend,
  IconCash,
  IconBuildingStore,
  IconBrandGoogleMaps,
  IconDotsVertical,
  IconBoxSeam,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export interface OrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  notes?: string | null
}

export interface Order {
  id: string
  orderNumber: string
  tenantId?: string | null
  branchId?: string | null
  clientId?: string | null
  customerName: string
  customerPhone: string
  customerEmail?: string | null
  deliveryAddress?: string | null
  deliveryNotes?: string | null
  subtotal: number
  tax: number
  deliveryFee: number
  discount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  status: string
  notes?: string | null
  createdByRole: string
  createdById?: string | null
  deliveryDriverId?: string | null
  deliveryDriverName?: string | null
  deliveryDriverPhone?: string | null
  assignedAt?: string | null
  dispatchedAt?: string | null
  deliveredAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  tenant?: { id: string; name: string; rubro: string; ownerPhone?: string } | null
  branch?: { id: string; name: string; address?: string; phone?: string } | null
}

interface StaffUser {
  id: string
  name: string
  role: string
  email?: string | null
}

interface ProductItem {
  id: string
  name: string
  price: number
  stock: number
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; step: number }
> = {
  pendiente: {
    label: "Pendiente",
    color: "text-zinc-900 dark:text-zinc-100",
    bg: "bg-zinc-100 dark:bg-zinc-800",
    border: "border-zinc-300 dark:border-zinc-700",
    step: 1,
  },
  confirmado: {
    label: "Confirmado",
    color: "text-zinc-950 dark:text-white font-semibold",
    bg: "bg-zinc-200 dark:bg-zinc-800",
    border: "border-zinc-400 dark:border-zinc-600",
    step: 2,
  },
  en_preparacion: {
    label: "En Preparación",
    color: "text-white dark:text-zinc-950 font-bold",
    bg: "bg-zinc-900 dark:bg-white",
    border: "border-zinc-900 dark:border-white",
    step: 3,
  },
  en_camino: {
    label: "En Camino (Conductor)",
    color: "text-white dark:text-zinc-950 font-black",
    bg: "bg-zinc-950 dark:bg-zinc-100",
    border: "border-zinc-950 dark:border-zinc-200",
    step: 4,
  },
  entregado: {
    label: "Entregado",
    color: "text-zinc-950 dark:text-zinc-100 font-bold",
    bg: "bg-zinc-100 dark:bg-zinc-800/80",
    border: "border-zinc-300 dark:border-zinc-700",
    step: 5,
  },
  cancelado: {
    label: "Cancelado",
    color: "text-zinc-500 dark:text-zinc-400 line-through",
    bg: "bg-zinc-100 dark:bg-zinc-900",
    border: "border-zinc-200 dark:border-zinc-800",
    step: 0,
  },
}

export default function OrdersView() {
  const { role, userName } = useAppStore()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [driverFilter, setDriverFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards")

  // Personal / Conductores registrados
  const [staffDrivers, setStaffDrivers] = useState<StaffUser[]>([])

  // Modal Asignar Conductor
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [driverSource, setDriverSource] = useState<"staff" | "custom">("staff")
  const [selectedStaffId, setSelectedStaffId] = useState<string>("")
  const [customDriverName, setCustomDriverName] = useState("")
  const [customDriverPhone, setCustomDriverPhone] = useState("")
  const [dispatchNow, setDispatchNow] = useState(true)
  const [savingAssign, setSavingAssign] = useState(false)

  // Registro rápido de Domiciliario dentro del modal
  const [showQuickAddDriver, setShowQuickAddDriver] = useState(false)
  const [quickDriverName, setQuickDriverName] = useState("")
  const [quickDriverPhone, setQuickDriverPhone] = useState("")
  const [quickDriverPin, setQuickDriverPin] = useState("1234")
  const [savingQuickDriver, setSavingQuickDriver] = useState(false)

  // Modal Detalle / Trazabilidad
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)

  // Modal Nuevo Pedido
  const [newOrderModalOpen, setNewOrderModalOpen] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryNotes, setDeliveryNotes] = useState("")
  const [deliveryFee, setDeliveryFee] = useState<number>(3000)
  const [paymentMethod, setPaymentMethod] = useState("contraentrega")
  const [orderNotes, setOrderNotes] = useState("")
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([])
  const [cartItems, setCartItems] = useState<{ productId: string; name: string; price: number; quantity: number }[]>([])
  const [savingOrder, setSavingOrder] = useState(false)

  // Cargar pedidos y conductores
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const res = await apiFetch<{ ok: boolean; data: { orders: Order[] } }>("/api/v1/orders?pageSize=100")
      if (res?.data?.orders) {
        setOrders(res.data.orders)
      }
    } catch (e) {
      console.error(e)
      toast.error("Error al cargar los pedidos a domicilio")
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStaff = useCallback(async () => {
    try {
      const res = await apiFetch<{ ok: boolean; users: StaffUser[] }>("/api/users")
      if (res?.users) {
        // filtrar staff activos
        setStaffDrivers(res.users)
      }
    } catch (e) {
      console.warn("No se pudo cargar la lista de personal:", e)
    }
  }, [])

  const fetchProducts = useCallback(async () => {
    try {
      const res = await apiFetch<ProductItem[]>("/api/products")
      if (Array.isArray(res)) {
        setCatalogProducts(res.filter((p) => p.stock > 0))
      }
    } catch (e) {
      console.warn("No se pudieron cargar productos:", e)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    fetchStaff()
    fetchProducts()
  }, [fetchOrders, fetchStaff, fetchProducts])

  // Filtrado
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false
      if (driverFilter === "unassigned" && o.deliveryDriverId) return false
      if (driverFilter === "assigned" && !o.deliveryDriverId && !o.deliveryDriverName) return false
      if (
        driverFilter !== "all" &&
        driverFilter !== "unassigned" &&
        driverFilter !== "assigned" &&
        o.deliveryDriverId !== driverFilter &&
        o.deliveryDriverName !== driverFilter
      ) {
        return false
      }

      if (search.trim()) {
        const q = search.toLowerCase()
        const matchNumber = o.orderNumber.toLowerCase().includes(q)
        const matchCustomer = o.customerName.toLowerCase().includes(q)
        const matchPhone = o.customerPhone.includes(q)
        const matchAddress = o.deliveryAddress?.toLowerCase().includes(q) ?? false
        const matchDriver = o.deliveryDriverName?.toLowerCase().includes(q) ?? false
        return matchNumber || matchCustomer || matchPhone || matchAddress || matchDriver
      }

      return true
    })
  }, [orders, statusFilter, driverFilter, search])

  // Métricas
  const metrics = useMemo(() => {
    const total = orders.length
    const pending = orders.filter((o) => o.status === "pendiente").length
    const inPrep = orders.filter((o) => o.status === "en_preparacion").length
    const inTransit = orders.filter((o) => o.status === "en_camino").length
    const delivered = orders.filter((o) => o.status === "entregado").length
    const unassigned = orders.filter((o) => !o.deliveryDriverName && o.status !== "cancelado" && o.status !== "entregado").length

    return { total, pending, inPrep, inTransit, delivered, unassigned }
  }, [orders])

  const dedicatedDrivers = useMemo(() => staffDrivers.filter((s) => s.role === "domiciliario"), [staffDrivers])
  const otherStaff = useMemo(() => staffDrivers.filter((s) => s.role !== "domiciliario"), [staffDrivers])

  // Crear domiciliario rápido desde el propio modal
  const handleCreateQuickDriver = async () => {
    if (!quickDriverName.trim()) return toast.error("Ingresa el nombre del repartidor")
    if (!quickDriverPin || !/^\d{4,8}$/.test(quickDriverPin)) {
      return toast.error("El PIN debe tener entre 4 y 8 dígitos numéricos")
    }

    setSavingQuickDriver(true)
    try {
      const generatedEmail = quickDriverPhone.trim()
        ? `repartidor.${quickDriverPhone.trim().replace(/\D/g, "")}@pos.local`
        : null

      const res = await apiFetch<{ ok: boolean; user: StaffUser }>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: quickDriverName.trim(),
          email: generatedEmail,
          role: "domiciliario",
          pin: quickDriverPin.trim(),
        }),
      })

      toast.success(`¡Repartidor "${quickDriverName}" registrado como Domiciliario exclusivo!`)
      await fetchStaff()
      if (res?.user?.id) {
        setSelectedStaffId(res.user.id)
      }
      setShowQuickAddDriver(false)
      setQuickDriverName("")
      setQuickDriverPhone("")
      setQuickDriverPin("1234")
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al registrar repartidor")
    } finally {
      setSavingQuickDriver(false)
    }
  }

  // Abrir modal de asignación de conductor
  const handleOpenAssign = (order: Order) => {
    setSelectedOrder(order)
    setDispatchNow(order.status !== "en_camino")

    // Si ya tiene conductor asignado, prellenar
    if (order.deliveryDriverId && staffDrivers.some((d) => d.id === order.deliveryDriverId)) {
      setDriverSource("staff")
      setSelectedStaffId(order.deliveryDriverId)
      setCustomDriverName("")
      setCustomDriverPhone("")
    } else if (order.deliveryDriverName) {
      setDriverSource("custom")
      setSelectedStaffId("")
      setCustomDriverName(order.deliveryDriverName)
      setCustomDriverPhone(order.deliveryDriverPhone || "")
    } else {
      // Priorizar el primer colaborador con rol "domiciliario"
      const firstDom = staffDrivers.find((s) => s.role === "domiciliario")
      if (firstDom) {
        setDriverSource("staff")
        setSelectedStaffId(firstDom.id)
      } else {
        setDriverSource("staff")
        setSelectedStaffId(staffDrivers[0]?.id || "")
      }
      setCustomDriverName("")
      setCustomDriverPhone("")
    }

    setAssignModalOpen(true)
  }

  // Guardar asignación de conductor
  const handleSubmitAssign = async () => {
    if (!selectedOrder) return

    let finalDriverId: string | null = null
    let finalDriverName = ""
    let finalDriverPhone = ""

    if (driverSource === "staff") {
      const staffMember = staffDrivers.find((s) => s.id === selectedStaffId)
      if (!staffMember) {
        return toast.error("Por favor selecciona un colaborador del equipo")
      }
      finalDriverId = staffMember.id
      finalDriverName = staffMember.name
      finalDriverPhone = staffMember.email || ""
    } else {
      if (!customDriverName.trim()) {
        return toast.error("Por favor ingresa el nombre del conductor o mensajero")
      }
      finalDriverName = customDriverName.trim()
      finalDriverPhone = customDriverPhone.trim()
    }

    setSavingAssign(true)
    try {
      // 1. Asignar el conductor al pedido
      await apiFetch(`/api/v1/orders/${selectedOrder.id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          driverId: finalDriverId,
          driverName: finalDriverName,
          driverPhone: finalDriverPhone,
        }),
      })

      // 2. Si se marcó despacho inmediato, cambiar estado a 'en_camino'
      if (dispatchNow && selectedOrder.status !== "en_camino") {
        await apiFetch(`/api/v1/orders/${selectedOrder.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "en_camino",
          }),
        })
      }

      toast.success(
        `Conductor "${finalDriverName}" asignado con éxito ${dispatchNow ? "y despachado en camino" : ""}`
      )
      setAssignModalOpen(false)
      fetchOrders()
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al asignar conductor al pedido")
    } finally {
      setSavingAssign(false)
    }
  }

  // Actualizar estado rápido
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      })
      toast.success(`Estado actualizado a: ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
      fetchOrders()
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al cambiar estado")
    }
  }

  // WhatsApp directo al cliente o conductor
  const openWhatsApp = (phone: string, text: string) => {
    const cleanPhone = phone.replace(/\D/g, "")
    const fullPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`, "_blank")
  }

  // Imprimir comanda de entrega
  const handlePrintOrder = (order: Order) => {
    const printWindow = window.open("", "_blank", "width=400,height=600")
    if (!printWindow) return

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Comanda Domicilio ${order.orderNumber}</title>
          <style>
            body { font-family: monospace; font-size: 13px; margin: 15px; color: #000; }
            h2, h3, p { margin: 4px 0; text-align: center; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
            .item-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .bold { font-weight: bold; }
            .total { font-size: 15px; font-weight: bold; }
            .box { border: 1px solid #000; padding: 6px; margin: 6px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <h2>${order.tenant?.name || "DESPACHO A DOMICILIO"}</h2>
          <p class="bold">PEDIDO: ${order.orderNumber}</p>
          <p>Fecha: ${formatDateTime(order.createdAt)}</p>
          <div class="line"></div>
          
          <div class="box">
            <p class="bold" style="text-align: left;">CLIENTE: ${order.customerName}</p>
            <p style="text-align: left;">TEL: ${order.customerPhone}</p>
            <p style="text-align: left;" class="bold">DIR: ${order.deliveryAddress || "Para recoger"}</p>
            ${order.deliveryNotes ? `<p style="text-align: left;">NOTAS: ${order.deliveryNotes}</p>` : ""}
          </div>

          <div class="box">
            <p class="bold" style="text-align: left;">CONDUCTOR / REPARTIDOR:</p>
            <p style="text-align: left;" class="bold">${order.deliveryDriverName || "SIN ASIGNAR"}</p>
            ${order.deliveryDriverPhone ? `<p style="text-align: left;">TEL: ${order.deliveryDriverPhone}</p>` : ""}
          </div>

          <div class="line"></div>
          <p class="bold" style="text-align: left;">ITEMS DEL PEDIDO:</p>
          ${order.items
            .map(
              (it) => `
            <div class="item-row">
              <span>${it.quantity}x ${it.productName}</span>
              <span>${formatCurrency(it.subtotal)}</span>
            </div>
          `
            )
            .join("")}

          <div class="line"></div>
          <div class="item-row">
            <span>Subtotal:</span>
            <span>${formatCurrency(order.subtotal)}</span>
          </div>
          <div class="item-row">
            <span>Domicilio / Envío:</span>
            <span>${formatCurrency(order.deliveryFee)}</span>
          </div>
          <div class="item-row total">
            <span>TOTAL A COBRAR:</span>
            <span>${formatCurrency(order.total)}</span>
          </div>
          <div class="item-row">
            <span>Método de pago:</span>
            <span class="bold">${order.paymentMethod.toUpperCase()} (${order.paymentStatus.toUpperCase()})</span>
          </div>

          ${order.notes ? `<div class="line"></div><p>Observaciones: ${order.notes}</p>` : ""}
          <div class="line"></div>
          <p style="text-align: center;">¡Gracias por tu compra!</p>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

  // Guardar nuevo pedido manual
  const handleCreateOrder = async () => {
    if (!customerName.trim()) return toast.error("Ingresa el nombre del cliente")
    if (!customerPhone.trim()) return toast.error("Ingresa el teléfono del cliente")
    if (!deliveryAddress.trim()) return toast.error("Ingresa la dirección de entrega")
    if (cartItems.length === 0) return toast.error("Agrega al menos un producto al pedido")

    setSavingOrder(true)
    try {
      // Tomamos el tenant del usuario o el primero del sistema
      const sessionTenantId = useAppStore.getState().tenantId
      await apiFetch("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          businessId: sessionTenantId || "default",
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryNotes: deliveryNotes.trim() || null,
          deliveryFee: Number(deliveryFee) || 0,
          paymentMethod,
          notes: orderNotes.trim() || null,
          items: cartItems.map((ci) => ({
            productId: ci.productId,
            quantity: ci.quantity,
          })),
        }),
      })

      toast.success("¡Pedido a domicilio creado exitosamente!")
      setNewOrderModalOpen(false)
      // Limpiar formulario
      setCustomerName("")
      setCustomerPhone("")
      setDeliveryAddress("")
      setDeliveryNotes("")
      setOrderNotes("")
      setCartItems([])
      fetchOrders()
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al crear pedido")
    } finally {
      setSavingOrder(false)
    }
  }

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full pb-28 lg:pb-8">
      {/* Encabezado y Acciones Principales */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-xs">
              <IconTruckDelivery className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Gestión de Pedidos & Domicilios
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Control de entregas en tiempo real, trazabilidad y asignación de conductores
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            className="rounded-xl h-9 text-xs gap-1.5"
            disabled={loading}
          >
            <IconRefresh className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar
          </Button>

          <Button
            size="sm"
            data-tour="orders-new-btn"
            onClick={() => setNewOrderModalOpen(true)}
            className="rounded-xl h-9 text-xs gap-1.5 bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shadow-xs"
          >
            <IconPlus className="h-4 w-4" />
            Nuevo Pedido
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI / Métricas Rápidas */}
      <div data-tour="orders-kpi-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card
          onClick={() => setStatusFilter("all")}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-zinc-950 dark:hover:border-white",
            statusFilter === "all" && "ring-2 ring-zinc-950/30 dark:ring-white/30 bg-zinc-100 dark:bg-zinc-800"
          )}
        >
          <div className="text-[11px] font-semibold text-muted-foreground">Total Pedidos</div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">{metrics.total}</div>
        </Card>

        <Card
          onClick={() => {
            setStatusFilter("all")
            setDriverFilter("unassigned")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-foreground bg-muted/20",
            driverFilter === "unassigned" && "ring-2 ring-foreground/40 bg-muted/40"
          )}
        >
          <div className="text-[11px] font-semibold text-foreground flex items-center gap-1">
            <IconAlertCircle className="h-3 w-3" /> Sin Conductor
          </div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {metrics.unassigned}
          </div>
        </Card>

        <Card
          onClick={() => {
            setStatusFilter("pendiente")
            setDriverFilter("all")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-foreground",
            statusFilter === "pendiente" && "ring-2 ring-foreground/40 bg-muted/40"
          )}
        >
          <div className="text-[11px] font-semibold text-muted-foreground">Pendientes</div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">{metrics.pending}</div>
        </Card>

        <Card
          onClick={() => {
            setStatusFilter("en_preparacion")
            setDriverFilter("all")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-foreground",
            statusFilter === "en_preparacion" && "ring-2 ring-foreground/40 bg-muted/40"
          )}
        >
          <div className="text-[11px] font-semibold text-muted-foreground">En Preparación</div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">{metrics.inPrep}</div>
        </Card>

        <Card
          onClick={() => {
            setStatusFilter("en_camino")
            setDriverFilter("all")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-foreground bg-muted/20",
            statusFilter === "en_camino" && "ring-2 ring-foreground/40 bg-muted/40"
          )}
        >
          <div className="text-[11px] font-semibold text-foreground flex items-center gap-1">
            <IconMotorbike className="h-3 w-3" /> En Camino
          </div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {metrics.inTransit}
          </div>
        </Card>

        <Card
          onClick={() => {
            setStatusFilter("entregado")
            setDriverFilter("all")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-foreground",
            statusFilter === "entregado" && "ring-2 ring-foreground/40 bg-muted/40"
          )}
        >
          <div className="text-[11px] font-semibold text-muted-foreground">Entregados</div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {metrics.delivered}
          </div>
        </Card>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card p-3 rounded-2xl border shadow-2xs">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por # pedido, cliente, dirección o conductor..."
            className="pl-9 h-9 text-xs rounded-xl border-border bg-background"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro de Estado */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[140px] sm:w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="confirmado">Confirmados</SelectItem>
              <SelectItem value="en_preparacion">En Preparación</SelectItem>
              <SelectItem value="en_camino">En Camino</SelectItem>
              <SelectItem value="entregado">Entregados</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Conductor */}
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[140px] sm:w-[170px]">
              <SelectValue placeholder="Conductor" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">Todos los conductores</SelectItem>
              <SelectItem value="unassigned">⚠️ Sin Asignar</SelectItem>
              <SelectItem value="assigned">✅ Con Conductor</SelectItem>
              {staffDrivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} {d.role === "domiciliario" ? "(Repartidor)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Alternar vista Cards / Tabla */}
          <div className="flex items-center border rounded-xl overflow-hidden bg-muted/40 p-0.5">
            <button
              onClick={() => setViewMode("cards")}
              className={cn(
                "px-2.5 py-1 text-xs rounded-lg transition-all font-medium",
                viewMode === "cards" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tarjetas
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "px-2.5 py-1 text-xs rounded-lg transition-all font-medium",
                viewMode === "table" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tabla
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Pedidos (Cards o Tabla) */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <IconRefresh className="h-8 w-8 animate-spin text-zinc-950 dark:text-white mx-auto" />
          <p className="text-sm text-muted-foreground">Cargando pedidos...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="rounded-2xl border-dashed p-10 text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
            <IconTruckDelivery className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">No se encontraron pedidos</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
              {search || statusFilter !== "all" || driverFilter !== "all"
                ? "No hay pedidos que coincidan con los filtros aplicados. Intenta restablecer los filtros."
                : "Aún no se han recibido pedidos a domicilio en el sistema."}
            </p>
          </div>
          <div className="pt-2">
            <Button
              size="sm"
              onClick={() => {
                setSearch("")
                setStatusFilter("all")
                setDriverFilter("all")
              }}
              variant="outline"
              className="rounded-xl text-xs"
            >
              Restablecer Filtros
            </Button>
          </div>
        </Card>
      ) : viewMode === "cards" ? (
        /* VISTA DE TARJETAS (CARDS GRID) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredOrders.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendiente
              const hasDriver = !!order.deliveryDriverName

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card className="rounded-2xl border shadow-xs hover:shadow-md transition-all flex flex-col h-full overflow-hidden bg-card">
                    {/* Header de la tarjeta */}
                    <div className="p-4 pb-3 border-b flex items-start justify-between gap-2 bg-muted/20">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs sm:text-sm text-foreground">
                            {order.orderNumber}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusCfg.color, statusCfg.bg, statusCfg.border)}
                          >
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <IconClock className="h-3 w-3" />
                          <span>{formatDateTime(order.createdAt)}</span>
                        </div>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg">
                            <IconDotsVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl text-xs w-48">
                          <DropdownMenuItem onClick={() => { setDetailOrder(order); setDetailModalOpen(true); }}>
                            <IconEye className="h-3.5 w-3.5 mr-2 text-zinc-950 dark:text-white" /> Ver Detalles
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintOrder(order)}>
                            <IconPrinter className="h-3.5 w-3.5 mr-2" /> Imprimir Comanda
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] text-muted-foreground">Cambiar Estado</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, "confirmado")}>
                            Marcar Confirmado
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, "en_preparacion")}>
                            Marcar En Preparación
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, "en_camino")}>
                            Marcar En Camino
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpdateStatus(order.id, "entregado")}>
                            Marcar Entregado
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleUpdateStatus(order.id, "cancelado")}
                          >
                            <IconX className="h-3.5 w-3.5 mr-2" /> Cancelar Pedido
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Cuerpo de la tarjeta */}
                    <CardContent className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                      {/* Datos del Cliente y Destino */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate flex items-center gap-1">
                              <IconUser className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              {order.customerName}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <button
                                onClick={() => openWhatsApp(order.customerPhone, `Hola ${order.customerName}, te escribimos sobre tu pedido ${order.orderNumber}`)}
                                className="text-[11px] text-foreground hover:text-foreground font-semibold flex items-center gap-1 hover:underline"
                                title="Enviar mensaje por WhatsApp"
                              >
                                <IconBrandWhatsapp className="h-3.5 w-3.5" />
                                {order.customerPhone}
                              </button>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold text-foreground block">
                              {formatCurrency(order.total)}
                            </span>
                            <span className="text-[10px] text-muted-foreground capitalize block">
                              {order.paymentMethod}
                            </span>
                          </div>
                        </div>

                        {/* Dirección */}
                        <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-1">
                          <div className="flex items-start gap-1.5 text-foreground font-medium">
                            <IconMapPin className="h-3.5 w-3.5 text-zinc-950 dark:text-white shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{order.deliveryAddress || "Dirección no especificada"}</span>
                          </div>
                          {order.deliveryNotes && (
                            <p className="text-[11px] text-muted-foreground pl-5 italic">
                              "{order.deliveryNotes}"
                            </p>
                          )}
                        </div>

                        {/* Items resumidos */}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <IconBoxSeam className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {order.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")}
                          </span>
                        </div>
                      </div>

                      {/* SECCIÓN DEL CONDUCTOR / REPARTIDOR */}
                      <div className="pt-2 border-t space-y-2">
                        {hasDriver ? (
                          /* Conductor ya asignado */
                          <div className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-muted text-foreground flex items-center justify-center shrink-0">
                                <IconMotorbike className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground block">
                                  Conductor Asignado
                                </span>
                                <p className="text-xs font-bold text-foreground truncate">
                                  {order.deliveryDriverName}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {order.deliveryDriverPhone && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-lg text-foreground hover:text-foreground hover:bg-muted"
                                  onClick={() => openWhatsApp(order.deliveryDriverPhone!, `Hola ${order.deliveryDriverName}, actualización sobre pedido ${order.orderNumber}`)}
                                  title="Contactar conductor por WhatsApp"
                                >
                                  <IconBrandWhatsapp className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenAssign(order)}
                                className="h-7 px-2 text-[10px] rounded-lg border-border text-foreground hover:bg-muted"
                              >
                                Cambiar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Sin conductor asignado -> Botón destacado */
                          <div className="p-2.5 rounded-xl bg-muted/40 border border-border flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-xs text-foreground font-medium">
                              <IconAlertCircle className="h-4 w-4 text-foreground shrink-0" />
                              <span>Sin conductor asignado</span>
                            </div>

                            <Button
                              size="sm"
                              onClick={() => handleOpenAssign(order)}
                              className="h-8 px-3 text-xs rounded-xl font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shadow-xs gap-1 active:scale-[0.98]"
                            >
                              <IconMotorbike className="h-3.5 w-3.5" />
                              Asignar
                            </Button>
                          </div>
                        )}

                        {/* Botones de acción rápida de flujo */}
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          {order.status === "pendiente" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(order.id, "confirmado")}
                              className="h-8 text-xs rounded-xl border-border text-foreground hover:bg-muted col-span-2"
                            >
                              <IconCheck className="h-3.5 w-3.5 mr-1" /> Confirmar Pedido
                            </Button>
                          )}

                          {order.status === "confirmado" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(order.id, "en_preparacion")}
                              className="h-8 text-xs rounded-xl border-border text-foreground hover:bg-muted col-span-2"
                            >
                              Comenzar Preparación
                            </Button>
                          )}

                          {order.status === "en_preparacion" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                if (!hasDriver) {
                                  handleOpenAssign(order)
                                } else {
                                  handleUpdateStatus(order.id, "en_camino")
                                }
                              }}
                              className="h-8 text-xs rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 col-span-2 font-bold gap-1"
                            >
                              <IconMotorbike className="h-3.5 w-3.5" />
                              {hasDriver ? "Despachar a Domicilio" : "Asignar Conductor & Despachar"}
                            </Button>
                          )}

                          {order.status === "en_camino" && (
                            <Button
                              size="sm"
                              onClick={() => handleUpdateStatus(order.id, "entregado")}
                              className="h-8 text-xs rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 col-span-2 font-bold gap-1"
                            >
                              <IconCheck className="h-3.5 w-3.5" /> Marcar Entregado y Cobrado
                            </Button>
                          )}

                          {order.status === "entregado" && (
                            <div className="col-span-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground py-1">
                              <IconCheck className="h-4 w-4" /> Entrega Finalizada con Éxito
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* VISTA DE TABLA */
        <Card className="rounded-2xl border shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-xs font-bold">Orden</TableHead>
                  <TableHead className="text-xs font-bold">Cliente</TableHead>
                  <TableHead className="text-xs font-bold">Dirección</TableHead>
                  <TableHead className="text-xs font-bold">Total</TableHead>
                  <TableHead className="text-xs font-bold">Estado</TableHead>
                  <TableHead className="text-xs font-bold">Conductor</TableHead>
                  <TableHead className="text-xs font-bold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendiente
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-xs">
                        {order.orderNumber}
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          {formatDateTime(order.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-bold text-foreground">{order.customerName}</p>
                        <p className="text-[11px] text-muted-foreground">{order.customerPhone}</p>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-xs truncate">{order.deliveryAddress || "N/A"}</p>
                        {order.deliveryNotes && (
                          <p className="text-[10px] text-muted-foreground truncate">{order.deliveryNotes}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-bold text-xs">
                        {formatCurrency(order.total)}
                        <span className="block text-[10px] font-normal text-muted-foreground capitalize">
                          {order.paymentMethod}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusCfg.color, statusCfg.bg, statusCfg.border)}
                        >
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {order.deliveryDriverName ? (
                          <div className="flex items-center gap-1.5">
                            <IconMotorbike className="h-3.5 w-3.5 text-foreground" />
                            <div>
                              <p className="text-xs font-bold text-foreground">{order.deliveryDriverName}</p>
                              {order.deliveryDriverPhone && (
                                <p className="text-[10px] text-muted-foreground">{order.deliveryDriverPhone}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-border text-foreground bg-muted/40">
                            Sin Conductor
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenAssign(order)}
                          className="h-7 text-xs rounded-lg px-2.5"
                        >
                          <IconMotorbike className="h-3.5 w-3.5 mr-1" />
                          {order.deliveryDriverName ? "Cambiar" : "Asignar"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setDetailOrder(order); setDetailModalOpen(true); }}
                          className="h-7 text-xs rounded-lg px-2"
                        >
                          <IconEye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ASIGNAR CONDUCTOR / REPARTIDOR                                   */}
      {/* ========================================================================= */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader className="space-y-1">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white flex items-center justify-center border border-zinc-200 dark:border-zinc-700 mb-1">
              <IconMotorbike className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Asignar Conductor al Pedido
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Selecciona el repartidor encargado de entregar la orden{" "}
              <span className="font-mono font-bold text-foreground">{selectedOrder?.orderNumber}</span>
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 pt-2">
              {/* Tarjeta resumen del pedido a entregar */}
              <div className="p-3 rounded-xl bg-muted/40 border text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-bold text-foreground">{selectedOrder.customerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Destino:</span>
                  <span className="font-medium text-foreground max-w-[240px] truncate text-right">
                    {selectedOrder.deliveryAddress}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total a cobrar:</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(selectedOrder.total)} ({selectedOrder.paymentMethod})
                  </span>
                </div>
              </div>

              {/* Selector de Origen: Colaborador del Equipo vs Conductor Externo */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">¿Quién realizará la entrega?</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDriverSource("staff")}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all flex flex-col gap-0.5",
                      driverSource === "staff"
                        ? "border-foreground bg-muted/40 ring-1 ring-border"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <IconUserCheck className="h-3.5 w-3.5 text-foreground" />
                      Equipo de la Tienda
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Repartidor o colaborador registrado
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDriverSource("custom")}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all flex flex-col gap-0.5",
                      driverSource === "custom"
                        ? "border-foreground bg-muted/40 ring-1 ring-border"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <IconMotorbike className="h-3.5 w-3.5 text-foreground" />
                      Conductor Externo
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Mensajero temporal o independiente
                    </span>
                  </button>
                </div>
              </div>

              {/* Contenido según la opción elegida */}
              {driverSource === "staff" ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Seleccionar Repartidor / Colaborador *</Label>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddDriver(!showQuickAddDriver)}
                      className="text-[11px] font-bold text-foreground hover:text-foreground hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <IconPlus className="h-3.5 w-3.5" />
                      {showQuickAddDriver ? "Ocultar formulario" : "+ Registrar Domiciliario"}
                    </button>
                  </div>

                  {/* Formulario rápido para registrar un domiciliario sin salir del modal */}
                  <AnimatePresence>
                    {showQuickAddDriver && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                            <IconMotorbike className="h-4 w-4" />
                            Nuevo Personal: Domiciliario Exclusivo
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Este usuario tendrá rol <strong>Domiciliario</strong> con acceso únicamente a consultar pedidos asignados y marcar entregas (sin acceso a inventario ni dinero en caja).
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-semibold">Nombre Completo *</Label>
                              <Input
                                value={quickDriverName}
                                onChange={(e) => setQuickDriverName(e.target.value)}
                                placeholder="Ej. Carlos Mendoza"
                                className="h-8 text-xs rounded-lg bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-semibold">Teléfono / WhatsApp</Label>
                              <Input
                                value={quickDriverPhone}
                                onChange={(e) => setQuickDriverPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                placeholder="Ej. 3123456789"
                                className="h-8 text-xs rounded-lg bg-background"
                              />
                            </div>
                            <div className="space-y-1 sm:col-span-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-semibold">PIN de Acceso (4-8 dígitos) *</Label>
                                <span className="text-[9px] text-muted-foreground">Para ingresar al sistema o app</span>
                              </div>
                              <Input
                                type="password"
                                value={quickDriverPin}
                                onChange={(e) => setQuickDriverPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                                placeholder="1234"
                                className="h-8 text-xs font-mono rounded-lg bg-background"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowQuickAddDriver(false)}
                              className="h-7 text-xs rounded-lg"
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleCreateQuickDriver}
                              disabled={savingQuickDriver}
                              className="h-7 text-xs rounded-lg font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 gap-1"
                            >
                              <IconCheck className="h-3.5 w-3.5" />
                              {savingQuickDriver ? "Guardando..." : "Guardar y Seleccionar"}
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Selector con separación entre Repartidores y Otros Colaboradores */}
                  <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                    <SelectTrigger className="h-10 text-xs rounded-xl">
                      <SelectValue placeholder="Seleccionar colaborador" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs max-h-64">
                      {/* 1. SECCIÓN: REPARTIDORES DEDICADOS */}
                      <div className="px-2 py-1 text-[10px] font-bold text-foreground uppercase tracking-wider bg-muted/40 rounded-md my-1 flex items-center gap-1">
                        <IconMotorbike className="h-3 w-3" /> Repartidores / Domiciliarios ({dedicatedDrivers.length})
                      </div>
                      {dedicatedDrivers.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-muted-foreground italic">
                          No tienes personal exclusivo de reparto. Puedes crear uno con el botón "+ Registrar Domiciliario".
                        </div>
                      ) : (
                        dedicatedDrivers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground">{s.name}</span>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-border text-foreground bg-muted/40">
                                Repartidor
                              </Badge>
                              {s.email && <span className="text-[10px] text-muted-foreground">{s.email}</span>}
                            </div>
                          </SelectItem>
                        ))
                      )}

                      {/* 2. SECCIÓN: OTROS COLABORADORES */}
                      {otherStaff.length > 0 && (
                        <>
                          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted rounded-md my-1 mt-2 flex items-center gap-1">
                            <IconUser className="h-3 w-3" /> Otros Colaboradores (Admin / Vendedor)
                          </div>
                          {otherStaff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex items-center gap-2">
                                <span>{s.name}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                  {s.role === "admin" ? "Administrador" : "Vendedor"}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>

                  <p className="text-[10px] text-muted-foreground">
                    Los repartidores dedicados solo tienen acceso a ver y despachar pedidos (sin acceso a caja ni inventario).
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nombre del Conductor / Mensajero *</Label>
                    <Input
                      value={customDriverName}
                      onChange={(e) => setCustomDriverName(e.target.value)}
                      placeholder="Ej. Juan Pérez (Moto Yamaha)"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Teléfono / WhatsApp de Contacto</Label>
                    <Input
                      value={customDriverPhone}
                      onChange={(e) => setCustomDriverPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Ej. 3123456789"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Checkbox: Despachar de inmediato */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl border bg-muted/20 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dispatchNow}
                  onChange={(e) => setDispatchNow(e.target.checked)}
                  className="rounded h-4 w-4 text-foreground focus:ring-foreground"
                />
                <div className="text-xs">
                  <p className="font-bold text-foreground">Marcar como "En Camino" de inmediato</p>
                  <p className="text-[10px] text-muted-foreground">
                    El pedido cambiará de estado y registrará la hora de salida del repartidor.
                  </p>
                </div>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssignModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitAssign}
              disabled={savingAssign}
              className="rounded-xl text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 gap-1.5"
            >
              <IconCheck className="h-4 w-4" />
              {savingAssign ? "Asignando..." : "Confirmar Asignación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: DETALLE Y TRAZABILIDAD DEL PEDIDO                                */}
      {/* ========================================================================= */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-xl rounded-2xl p-6">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-base text-foreground">
                {detailOrder?.orderNumber}
              </span>
              {detailOrder && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-semibold px-2.5 py-0.5 rounded-full",
                    STATUS_CONFIG[detailOrder.status]?.color,
                    STATUS_CONFIG[detailOrder.status]?.bg,
                    STATUS_CONFIG[detailOrder.status]?.border
                  )}
                >
                  {STATUS_CONFIG[detailOrder.status]?.label || detailOrder.status}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Detalle y Trazabilidad del Pedido
            </DialogTitle>
          </DialogHeader>

          {detailOrder && (
            <div className="space-y-4 pt-2">
              {/* Timeline de Seguimiento */}
              <div className="p-3.5 rounded-xl bg-muted/40 border space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Línea de Tiempo del Despacho
                </span>

                <div className="grid grid-cols-4 gap-2 text-center pt-1">
                  <div className="space-y-1">
                    <div className="h-7 w-7 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center mx-auto text-xs font-bold shadow-xs">
                      ✓
                    </div>
                    <p className="text-[10px] font-bold text-foreground">Creado</p>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(detailOrder.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center mx-auto text-xs font-bold",
                        detailOrder.assignedAt ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {detailOrder.assignedAt ? "✓" : "2"}
                    </div>
                    <p className="text-[10px] font-bold text-foreground">Conductor</p>
                    <p className="text-[9px] text-muted-foreground">
                      {detailOrder.assignedAt
                        ? new Date(detailOrder.assignedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Pendiente"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center mx-auto text-xs font-bold",
                        detailOrder.dispatchedAt ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {detailOrder.dispatchedAt ? "✓" : "3"}
                    </div>
                    <p className="text-[10px] font-bold text-foreground">En Camino</p>
                    <p className="text-[9px] text-muted-foreground">
                      {detailOrder.dispatchedAt
                        ? new Date(detailOrder.dispatchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Pendiente"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center mx-auto text-xs font-bold",
                        detailOrder.deliveredAt ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {detailOrder.deliveredAt ? "✓" : "4"}
                    </div>
                    <p className="text-[10px] font-bold text-foreground">Entregado</p>
                    <p className="text-[9px] text-muted-foreground">
                      {detailOrder.deliveredAt
                        ? new Date(detailOrder.deliveredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Pendiente"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Información de Cliente y Conductor */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border bg-card space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Cliente & Destino
                  </span>
                  <p className="font-bold text-foreground">{detailOrder.customerName}</p>
                  <p className="text-muted-foreground">{detailOrder.customerPhone}</p>
                  <p className="text-foreground pt-1 border-t mt-1 font-medium">{detailOrder.deliveryAddress}</p>
                  {detailOrder.deliveryNotes && (
                    <p className="text-[11px] text-muted-foreground italic">"{detailOrder.deliveryNotes}"</p>
                  )}
                </div>

                <div className="p-3 rounded-xl border bg-card space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Conductor Responsable
                  </span>
                  {detailOrder.deliveryDriverName ? (
                    <>
                      <p className="font-bold text-foreground flex items-center gap-1">
                        <IconMotorbike className="h-3.5 w-3.5" />
                        {detailOrder.deliveryDriverName}
                      </p>
                      <p className="text-muted-foreground">{detailOrder.deliveryDriverPhone || "Sin teléfono"}</p>
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDetailModalOpen(false)
                            handleOpenAssign(detailOrder)
                          }}
                          className="h-7 text-[11px] rounded-lg px-2 w-full"
                        >
                          Cambiar Conductor
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2 py-1">
                      <p className="text-muted-foreground italic">No asignado</p>
                      <Button
                        size="sm"
                        onClick={() => {
                          setDetailModalOpen(false)
                          handleOpenAssign(detailOrder)
                        }}
                        className="h-7 text-[11px] rounded-lg w-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
                      >
                        Asignar Ahora
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Desglose de Productos */}
              <div className="p-3 rounded-xl border space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Productos del Pedido ({detailOrder.items.length})
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {detailOrder.items.map((it) => (
                    <div key={it.id} className="flex justify-between items-center text-xs">
                      <span>
                        <span className="font-bold">{it.quantity}x</span> {it.productName}
                      </span>
                      <span className="font-mono font-bold">{formatCurrency(it.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(detailOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Costo Domicilio:</span>
                    <span>{formatCurrency(detailOrder.deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-foreground pt-1 border-t">
                    <span>TOTAL:</span>
                    <span className="text-zinc-950 dark:text-white font-mono font-black">{formatCurrency(detailOrder.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => detailOrder && handlePrintOrder(detailOrder)}
              className="rounded-xl text-xs gap-1.5"
            >
              <IconPrinter className="h-4 w-4" /> Imprimir Comanda
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setDetailModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 3: CREAR NUEVO PEDIDO A DOMICILIO (CALL CENTER / WHATSAPP)          */}
      {/* ========================================================================= */}
      <Dialog open={newOrderModalOpen} onOpenChange={setNewOrderModalOpen}>
        <DialogContent className="max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-foreground flex items-center justify-center border border-border mb-1">
              <IconPlus className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Tomar Pedido a Domicilio
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registra un nuevo pedido recibido por teléfono o WhatsApp para entrega a domicilio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Datos del Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Nombre del Cliente *</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ej. Roberto Gómez"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Teléfono / WhatsApp *</Label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Ej. 3101234567"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-semibold">Dirección de Entrega *</Label>
                <Input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Ej. Calle 100 # 15-20, Apto 502 Torre A"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-semibold">Indicaciones / Notas de Entrega</Label>
                <Input
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Ej. Timbre blanco, dejar en portería, casa esquinera..."
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Agregar Productos */}
            <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3">
              <Label className="text-xs font-bold text-foreground">Seleccionar Productos del Inventario</Label>

              <div className="flex gap-2">
                <Select
                  onValueChange={(val) => {
                    const prod = catalogProducts.find((p) => p.id === val)
                    if (!prod) return
                    const existing = cartItems.find((ci) => ci.productId === prod.id)
                    if (existing) {
                      setCartItems(cartItems.map((ci) => ci.productId === prod.id ? { ...ci, quantity: ci.quantity + 1 } : ci))
                    } else {
                      setCartItems([...cartItems, { productId: prod.id, name: prod.name, price: prod.price, quantity: 1 }])
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs rounded-xl flex-1 bg-background">
                    <SelectValue placeholder="Buscar y agregar producto..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl text-xs max-h-56">
                    {catalogProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} - {formatCurrency(p.price)} (Stock: {p.stock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lista de productos en el pedido */}
              {cartItems.length > 0 ? (
                <div className="space-y-2 pt-1 border-t">
                  {cartItems.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background border text-xs">
                      <span className="font-medium flex-1 truncate">{item.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            if (item.quantity > 1) {
                              setCartItems(cartItems.map((ci) => ci.productId === item.productId ? { ...ci, quantity: ci.quantity - 1 } : ci))
                            } else {
                              setCartItems(cartItems.filter((ci) => ci.productId !== item.productId))
                            }
                          }}
                          className="h-6 w-6 rounded bg-muted hover:bg-muted/80 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="font-bold w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => setCartItems(cartItems.map((ci) => ci.productId === item.productId ? { ...ci, quantity: ci.quantity + 1 } : ci))}
                          className="h-6 w-6 rounded bg-muted hover:bg-muted/80 flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>
                      <span className="font-mono font-bold w-20 text-right">{formatCurrency(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No hay productos agregados al pedido todavía.
                </p>
              )}
            </div>

            {/* Domicilio y Método de Pago */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Costo Domicilio ($)</Label>
                <Input
                  type="number"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Number(e.target.value))}
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Forma de Pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-9 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl text-xs">
                    <SelectItem value="contraentrega">Contraentrega (Efectivo)</SelectItem>
                    <SelectItem value="transferencia">Transferencia (Nequi / Daviplata)</SelectItem>
                    <SelectItem value="tarjeta">Datáfono / Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resumen Total */}
            {cartItems.length > 0 && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs flex justify-between items-center font-bold">
                <span className="text-foreground">TOTAL DEL PEDIDO:</span>
                <span className="text-base text-foreground font-mono">
                  {formatCurrency(cartItems.reduce((acc, it) => acc + it.price * it.quantity, 0) + deliveryFee)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewOrderModalOpen(false)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateOrder}
              disabled={savingOrder}
              className="rounded-xl text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 gap-1.5"
            >
              <IconCheck className="h-4 w-4" />
              {savingOrder ? "Creando..." : "Guardar y Despachar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
