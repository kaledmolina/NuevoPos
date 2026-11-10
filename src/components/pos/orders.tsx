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
  IconTrash,
  IconSettings,
  IconSparkles,
  IconCalculator,
  IconCoins,
  IconWallet,
  IconCircleCheck,
  IconHistory,
  IconLock,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { DriverSettlementView } from "@/components/pos/driver-settlement"

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
  deliveryLatitude?: number | null
  deliveryLongitude?: number | null
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
  phone?: string | null
  telegramUsername?: string | null
  telegramChatId?: string | null
}

interface ProductItem {
  id: string
  name: string
  price: number
  stock: number
}

interface NeighborhoodRate {
  id: string
  neighborhood: string
  fee: number
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

export const PAYMENT_STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: string }
> = {
  pagado: {
    label: "Pagado",
    badgeClass: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
    icon: "💰",
  },
  pendiente: {
    label: "Pendiente de Pago",
    badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    icon: "⏳",
  },
  por_cobrar: {
    label: "Sin Liquidar (Entregado)",
    badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
    icon: "⏳",
  },
}

export const PAYMENT_METHOD_CONFIG: Record<
  string,
  { label: string; icon: string; short: string }
> = {
  efectivo: { label: "Efectivo", icon: "💵", short: "Efectivo" },
  contraentrega: { label: "Efectivo Contraentrega", icon: "💵", short: "Contraentrega" },
  transferencia: { label: "Transferencia (Nequi/Banco)", icon: "📲", short: "Transf." },
  tarjeta: { label: "Tarjeta Débito/Crédito", icon: "💳", short: "Tarjeta" },
  credito: { label: "Fiado / Crédito", icon: "📝", short: "Fiado" },
}

export default function OrdersView() {
  const { role, userId, userName, activeBranch, refreshKey, tenantId, triggerRefresh, setView } = useAppStore()
  const activeBranchId = activeBranch?.id
  const isDriver = role === "domiciliario"

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all")
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all")
  const [driverFilter, setDriverFilter] = useState<string>("all")

  // Vista y estado exclusivo del Portal del Domiciliario
  const [driverTab, setDriverTab] = useState<"available" | "active" | "settlement" | "all">("available")
  const [deliveryCounts, setDeliveryCounts] = useState<{
    available: number
    active: number
    delivered: number
    unsettled: number
  } | null>(null)
  const [claimingOrderId, setClaimingOrderId] = useState<string | null>(null)
  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null)

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
  const [quickDriverTelegram, setQuickDriverTelegram] = useState("")
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
  const [deliveryFee, setDeliveryFee] = useState<number>(5000)
  const [paymentMethod, setPaymentMethod] = useState("contraentrega")
  const [orderNotes, setOrderNotes] = useState("")
  const [catalogProducts, setCatalogProducts] = useState<ProductItem[]>([])
  const [cartItems, setCartItems] = useState<{ productId: string; name: string; price: number; quantity: number }[]>([])
  const [savingOrder, setSavingOrder] = useState(false)

  // Modal de Ajustes de Tarifas de Domicilio & Tarifas por Barrio
  const [deliverySettingsModalOpen, setDeliverySettingsModalOpen] = useState(false)
  const [driverSettlementModalOpen, setDriverSettlementModalOpen] = useState(false)
  const [loadingDeliverySettings, setLoadingDeliverySettings] = useState(false)
  const [savingDeliverySettings, setSavingDeliverySettings] = useState(false)
  const [globalDeliveryFee, setGlobalDeliveryFee] = useState<number>(5000)
  const [neighborhoodRates, setNeighborhoodRates] = useState<NeighborhoodRate[]>([])
  const [newNeighborhood, setNewNeighborhood] = useState("")
  const [newNeighborhoodFee, setNewNeighborhoodFee] = useState("")
  const [neighborhoodSearch, setNeighborhoodSearch] = useState("")

  const detectDeliveryFee = useCallback(
    (address: string, fallbackFee = globalDeliveryFee) => {
      if (!address || !address.trim()) return fallbackFee
      const normalized = address.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      for (const rate of neighborhoodRates) {
        const normNeighborhood = rate.neighborhood.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        if (normNeighborhood && normalized.includes(normNeighborhood)) {
          return rate.fee
        }
      }
      return fallbackFee
    },
    [neighborhoodRates, globalDeliveryFee]
  )

  const fetchDeliverySettings = useCallback(async () => {
    try {
      setLoadingDeliverySettings(true)
      const branchParam = activeBranchId ? `?branchId=${encodeURIComponent(activeBranchId)}` : ""
      const res = await apiFetch<{
        ok: boolean
        config: { globalFee: number; neighborhoodRates: NeighborhoodRate[] }
      }>(`/api/delivery-settings${branchParam}`)
      if (res?.ok && res.config) {
        setGlobalDeliveryFee(res.config.globalFee ?? 5000)
        setNeighborhoodRates(res.config.neighborhoodRates ?? [])
      }
    } catch (e) {
      console.warn("No se pudo cargar configuración de domicilios:", e)
    } finally {
      setLoadingDeliverySettings(false)
    }
  }, [activeBranchId])

  const handleOpenDeliverySettings = async () => {
    setDeliverySettingsModalOpen(true)
    await fetchDeliverySettings()
  }

  const handleAddNeighborhood = () => {
    const name = newNeighborhood.trim()
    const feeNum = Number(newNeighborhoodFee)
    if (!name) {
      toast.error("Por favor escribe el nombre del barrio")
      return
    }
    if (isNaN(feeNum) || feeNum < 0) {
      toast.error("Ingresa un costo de envío válido (mayor o igual a 0)")
      return
    }
    const exists = neighborhoodRates.some(
      (r) => r.neighborhood.toLowerCase().trim() === name.toLowerCase()
    )
    if (exists) {
      toast.error(`El barrio "${name}" ya está configurado en la lista.`)
      return
    }
    setNeighborhoodRates((prev) => [
      ...prev,
      {
        id: `nr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        neighborhood: name,
        fee: feeNum,
      },
    ])
    setNewNeighborhood("")
    setNewNeighborhoodFee("")
    toast.success(`Barrio "${name}" agregado a la lista`)
  }

  const handleRemoveNeighborhood = (id: string) => {
    setNeighborhoodRates((prev) => prev.filter((r) => r.id !== id))
  }

  const handleSaveDeliverySettings = async () => {
    if (isNaN(globalDeliveryFee) || globalDeliveryFee < 0) {
      toast.error("La tarifa global es obligatoria y debe ser mayor o igual a 0.")
      return
    }
    try {
      setSavingDeliverySettings(true)
      const branchParam = activeBranch?.id ? `?branchId=${encodeURIComponent(activeBranch.id)}` : ""
      const res = await apiFetch<{
        ok: boolean
        message?: string
        config: { globalFee: number; neighborhoodRates: NeighborhoodRate[] }
      }>(`/api/delivery-settings${branchParam}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalFee: Number(globalDeliveryFee),
          neighborhoodRates,
        }),
      })

      if (res?.ok) {
        toast.success("¡Tarifas de domicilio guardadas con éxito! El agente de IA ya las tiene sincronizadas.")
        if (res.config) {
          setGlobalDeliveryFee(res.config.globalFee)
          setNeighborhoodRates(res.config.neighborhoodRates)
        }
        setDeliverySettingsModalOpen(false)
      } else {
        toast.error("No se pudo guardar la configuración de domicilios")
      }
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || "Error al guardar las tarifas de domicilio")
    } finally {
      setSavingDeliverySettings(false)
    }
  }

  // Cargar pedidos y conductores aislados por sede activa
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const branchParam = activeBranchId ? `&branchId=${encodeURIComponent(activeBranchId)}` : ""
      if (isDriver) {
        const res = await apiFetch<{
          ok: boolean
          data: {
            orders: Order[]
            counts?: { available: number; active: number; delivered: number; unsettled: number }
          }
        }>(`/api/v1/delivery/orders?pageSize=100${branchParam}`)
        if (res?.data?.orders) {
          setOrders(res.data.orders)
          setDetailOrder((prev) =>
            prev ? res.data.orders.find((o) => o.id === prev.id) || prev : null
          )
        }
        if (res?.data?.counts) {
          setDeliveryCounts(res.data.counts)
        }
      } else {
        const res = await apiFetch<{ ok: boolean; data: { orders: Order[] } }>(`/api/v1/orders?pageSize=100${branchParam}`)
        if (res?.data?.orders) {
          setOrders(res.data.orders)
          setDetailOrder((prev) =>
            prev ? res.data.orders.find((o) => o.id === prev.id) || prev : null
          )
        }
      }
    } catch (e) {
      console.error(e)
      toast.error("Error al cargar los pedidos a domicilio")
    } finally {
      setLoading(false)
    }
  }, [activeBranchId, isDriver])

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
    if (!isDriver) {
      fetchStaff()
      fetchProducts()
      fetchDeliverySettings()
    }
  }, [fetchOrders, fetchStaff, fetchProducts, fetchDeliverySettings, refreshKey, activeBranchId, isDriver])

  // Aislamiento estricto por sede activa
  const branchIsolatedOrders = useMemo(() => {
    if (!activeBranchId) return orders
    return orders.filter((o) => !o.branchId || o.branchId === activeBranchId)
  }, [orders, activeBranchId])

  // Listas derivadas y Cuadre rápido para el Portal Web del Domiciliario
  const availableOrders = useMemo(
    () =>
      branchIsolatedOrders.filter(
        (o) => !o.deliveryDriverId && ["pendiente", "confirmado", "en_preparacion"].includes(o.status)
      ),
    [branchIsolatedOrders]
  )

  const myOrders = useMemo(
    () =>
      branchIsolatedOrders.filter((o) =>
        userId ? o.deliveryDriverId === userId : Boolean(o.deliveryDriverId)
      ),
    [branchIsolatedOrders, userId]
  )

  const myActiveOrders = useMemo(
    () =>
      myOrders.filter((o) =>
        ["pendiente", "confirmado", "en_preparacion", "en_camino"].includes(o.status)
      ),
    [myOrders]
  )

  const myDeliveredOrders = useMemo(
    () => myOrders.filter((o) => o.status === "entregado"),
    [myOrders]
  )

  const myUnsettledOrders = useMemo(
    () => myDeliveredOrders.filter((o) => o.paymentStatus !== "pagado"),
    [myDeliveredOrders]
  )

  const myUnsettledCashSummary = useMemo(() => {
    let productsTotal = 0
    let deliveryTotal = 0
    let count = 0
    for (const o of myUnsettledOrders) {
      const m = (o.paymentMethod || "contraentrega").toLowerCase().trim()
      const isCash = !m || m === "efectivo" || m === "contraentrega" || m.includes("efectivo") || m.includes("contra")
      if (!isCash) continue
      const total = Math.max(0, Number(o.total || 0))
      const fee = Math.min(total, Math.max(0, Number(o.deliveryFee || 0)))
      const prod = Math.max(0, total - fee)
      productsTotal += prod
      deliveryTotal += fee
      count += 1
    }
    return {
      count,
      productsTotal,
      deliveryTotal,
      grossTotal: productsTotal + deliveryTotal,
    }
  }, [myUnsettledOrders])

  const driverFilteredAllOrders = useMemo(() => {
    return branchIsolatedOrders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false
      if (paymentStatusFilter !== "all") {
        const isPaid = o.paymentStatus === "pagado"
        if (paymentStatusFilter === "pagado" && !isPaid) return false
        if (paymentStatusFilter === "pendiente" && isPaid) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchNumber = o.orderNumber.toLowerCase().includes(q)
        const matchCustomer = o.customerName.toLowerCase().includes(q)
        const matchPhone = o.customerPhone.includes(q)
        const matchAddress = o.deliveryAddress?.toLowerCase().includes(q) ?? false
        return matchNumber || matchCustomer || matchPhone || matchAddress
      }
      return true
    })
  }, [branchIsolatedOrders, statusFilter, paymentStatusFilter, search])

  // Filtrado multidimensional sobre los pedidos de la sede activa
  const filteredOrders = useMemo(() => {
    return branchIsolatedOrders.filter((o) => {
      // 1. Filtro por Estado de Envío (Logística)
      if (statusFilter !== "all" && o.status !== statusFilter) return false

      // 2. Filtro por Estado de Pago
      if (paymentStatusFilter !== "all") {
        const isPaid = o.paymentStatus === "pagado"
        if (paymentStatusFilter === "pagado" && !isPaid) return false
        if (paymentStatusFilter === "pendiente" && isPaid) return false
      }

      // 3. Filtro por Medio de Pago
      if (paymentMethodFilter !== "all") {
        const m = (o.paymentMethod || "").toLowerCase()
        if (paymentMethodFilter === "efectivo" && !m.includes("efectivo") && !m.includes("contra")) return false
        if (paymentMethodFilter === "transferencia" && !m.includes("transf") && !m.includes("nequi") && !m.includes("davi")) return false
        if (paymentMethodFilter === "tarjeta" && !m.includes("tarjeta")) return false
        if (paymentMethodFilter === "credito" && !m.includes("credito") && !m.includes("fiado")) return false
      }

      // 4. Filtro por Conductor
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

      // 5. Búsqueda por texto
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
  }, [branchIsolatedOrders, statusFilter, paymentStatusFilter, paymentMethodFilter, driverFilter, search])

  // Métricas completas para la sede activa
  const metrics = useMemo(() => {
    const total = branchIsolatedOrders.length
    const pending = branchIsolatedOrders.filter((o) => o.status === "pendiente").length
    const inPrep = branchIsolatedOrders.filter((o) => o.status === "en_preparacion").length
    const inTransit = branchIsolatedOrders.filter((o) => o.status === "en_camino").length
    const delivered = branchIsolatedOrders.filter((o) => o.status === "entregado").length
    const unassigned = branchIsolatedOrders.filter((o) => !o.deliveryDriverName && o.status !== "cancelado" && o.status !== "entregado").length

    const countPaid = branchIsolatedOrders.filter((o) => o.paymentStatus === "pagado").length
    const countPendingPayment = branchIsolatedOrders.filter((o) => o.paymentStatus !== "pagado" && o.status !== "cancelado").length
    const totalPendingMoney = branchIsolatedOrders
      .filter((o) => o.paymentStatus !== "pagado" && o.status !== "cancelado")
      .reduce((acc, o) => acc + (o.total || 0), 0)

    const unsettledDeliveredOrders = branchIsolatedOrders.filter(
      (o) => o.status === "entregado" && o.paymentStatus !== "pagado"
    )
    const unsettledDeliveredCount = unsettledDeliveredOrders.length
    const unsettledDeliveredTotal = unsettledDeliveredOrders.reduce((acc, o) => acc + (o.total || 0), 0)

    return {
      total,
      pending,
      inPrep,
      inTransit,
      delivered,
      unassigned,
      countPaid,
      countPendingPayment,
      totalPendingMoney,
      unsettledDeliveredCount,
      unsettledDeliveredTotal,
    }
  }, [branchIsolatedOrders])

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
      const cleanPhone = quickDriverPhone.trim() || null
      let cleanTg = quickDriverTelegram.trim() || null
      if (cleanTg && !cleanTg.startsWith("@")) cleanTg = `@${cleanTg}`

      const generatedEmail = cleanPhone
        ? `repartidor.${cleanPhone.replace(/\D/g, "")}@pos.local`
        : null

      const res = await apiFetch<{ ok: boolean; user: StaffUser }>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: quickDriverName.trim(),
          email: generatedEmail,
          phone: cleanPhone,
          telegramUsername: cleanTg,
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
      setQuickDriverTelegram("")
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
    if (order.status === "cancelado") {
      toast.error("No se puede asignar conductor a un pedido cancelado")
      return
    }
    setSelectedOrder(order)
    setDispatchNow(order.status !== "en_camino" && order.status !== "entregado")

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
      finalDriverPhone = staffMember.phone || staffMember.email || ""
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
      if (dispatchNow && !["en_camino", "entregado", "cancelado"].includes(selectedOrder.status)) {
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

  // Tomar pedido disponible desde el portal del domiciliario (Primero en Aceptar)
  const handleAcceptOrder = async (orderId: string, shouldDispatchNow: boolean) => {
    try {
      setClaimingOrderId(orderId)
      const res = await apiFetch<{
        ok: boolean
        data?: { order?: Order; message?: string }
      }>(`/api/v1/delivery/orders/${orderId}/accept`, {
        method: "POST",
        body: JSON.stringify({
          dispatchNow: shouldDispatchNow,
          mode: shouldDispatchNow ? "pickup" : "claim",
        }),
      })
      toast.success(
        res?.data?.message ||
          (shouldDispatchNow
            ? "¡Pedido tomado y marcado En Camino!"
            : "¡Pedido adjudicado a tu cuenta! Pasa por la tienda a recogerlo.")
      )
      setDriverTab("active")
      if (res?.data?.order && detailOrder?.id === orderId) {
        setDetailOrder(res.data.order)
      }
      await fetchOrders()
      triggerRefresh()
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "No se pudo tomar el pedido")
      await fetchOrders()
    } finally {
      setClaimingOrderId(null)
    }
  }

  // Finalizar entrega desde el portal del domiciliario (NO marca pagado, pasa a Sin Liquidar)
  const handleCompleteOrder = async (orderId: string) => {
    try {
      setCompletingOrderId(orderId)
      const res = await apiFetch<{
        ok: boolean
        data?: { order?: Order; message?: string }
      }>(`/api/v1/delivery/orders/${orderId}/complete`, {
        method: "POST",
      })
      toast.success(
        res?.data?.message ||
          "¡Entrega finalizada! Quedó registrada como Sin Liquidar en tu Cuadre hasta entregar el efectivo en Caja."
      )
      if (res?.data?.order && detailOrder?.id === orderId) {
        setDetailOrder(res.data.order)
      }
      await fetchOrders()
      triggerRefresh()
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al finalizar la entrega")
    } finally {
      setCompletingOrderId(null)
    }
  }

  // Actualizar estado rápido
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      })
      if (newStatus === "entregado") {
        toast.success(
          "Pedido marcado Entregado · El pago queda pendiente por liquidar hasta recibir el efectivo en Caja"
        )
      } else {
        toast.success(`Estado actualizado a: ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
      }
      if (detailOrder && detailOrder.id === orderId) {
        setDetailOrder({ ...detailOrder, status: newStatus })
      }
      fetchOrders()
      triggerRefresh()
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al cambiar estado")
    }
  }

  // Actualizar estado de pago (ej: verificar transferencia o recibir efectivo en caja)
  const handleUpdatePaymentStatus = async (
    orderId: string,
    paymentStatus: "pagado" | "pendiente" | "por_cobrar"
  ) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ paymentStatus }),
      })
      toast.success(
        paymentStatus === "pagado"
          ? "¡Pago confirmado por caja y registrado en Ventas!"
          : "Pago marcado como pendiente por liquidar"
      )
      fetchOrders()
      triggerRefresh()
      if (detailOrder && detailOrder.id === orderId) {
        setDetailOrder({ ...detailOrder, paymentStatus })
      }
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al actualizar estado de pago")
    }
  }

  // Difundir pedido a todos los domiciliarios por Telegram (Primero en Aceptar)
  const handleBroadcastOrder = async (orderId: string) => {
    try {
      const res = await apiFetch<{ ok: boolean; data?: { notifiedCount: number; message: string }; message?: string }>(
        `/api/v1/orders/${orderId}/broadcast`,
        { method: "POST" }
      )
      toast.success(res?.data?.message || res?.message || "Pedido difundido a los domiciliarios vía Telegram")
    } catch (e) {
      toast.error((e as Error).message || "Error al difundir pedido")
    }
  }

  // Actualizar medio de pago (efectivo, transferencia, tarjeta, credito)
  const handleUpdatePaymentMethod = async (orderId: string, paymentMethod: string) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod }),
      })
      toast.success(`Medio de pago actualizado a: ${PAYMENT_METHOD_CONFIG[paymentMethod]?.label || paymentMethod}`)
      fetchOrders()
      if (detailOrder && detailOrder.id === orderId) {
        setDetailOrder({ ...detailOrder, paymentMethod })
      }
    } catch (e) {
      console.error(e)
      toast.error((e as Error).message || "Error al actualizar medio de pago")
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
      const sessionTenantId = tenantId || useAppStore.getState().tenantId
      await apiFetch("/api/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          businessId: sessionTenantId || "default",
          branchId: activeBranch?.id || undefined,
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
      {isDriver ? (
        <>
          {/* ========================================================================= */}
          {/* PORTAL WEB DEL DOMICILIARIO (TOMAR PEDIDOS, EN RUTA Y CUADRE DE CAJA)    */}
          {/* ========================================================================= */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-xs shrink-0">
                <IconMotorbike className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Portal de Reparto & Pedidos
                  </h1>
                  {activeBranch && (
                    <Badge
                      variant="outline"
                      className="text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1"
                    >
                      <IconBuildingStore className="h-3 w-3" />
                      Sede: {activeBranch.name}
                    </Badge>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Toma pedidos disponibles (Primero en Aceptar), navega por GPS y consulta tu Cuadre de Caja (X + Y)
                </p>
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
                onClick={() => setView("driver_settlement")}
                className={cn(
                  "rounded-xl h-9 text-xs gap-1.5 font-bold shadow-xs",
                  myUnsettledCashSummary.grossTotal > 0
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
                )}
              >
                <IconCalculator className="h-4 w-4" />
                Mi Cuadre en Caja: {formatCurrency(myUnsettledCashSummary.grossTotal)}
              </Button>
            </div>
          </div>

          {/* 4 KPIs del Domiciliario */}
          <div data-tour="orders-kpi-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card
              onClick={() => setDriverTab("available")}
              className={cn(
                "rounded-2xl border p-4 cursor-pointer transition-all hover:border-foreground shadow-xs",
                driverTab === "available" && "ring-2 ring-foreground/40 bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Disponibles para Tomar</span>
                <IconTruckDelivery className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums text-foreground">
                  {deliveryCounts?.available ?? availableOrders.length}
                </span>
                {availableOrders.length > 0 && (
                  <Badge className="text-[10px] bg-emerald-600 text-white border-0">
                    ¡Listos!
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Primero en aceptar se lo adjudica
              </p>
            </Card>

            <Card
              onClick={() => setDriverTab("active")}
              className={cn(
                "rounded-2xl border p-4 cursor-pointer transition-all hover:border-foreground shadow-xs",
                driverTab === "active" && "ring-2 ring-foreground/40 bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Mis Envíos Activos</span>
                <IconMotorbike className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="text-2xl font-black tabular-nums text-foreground mt-2">
                {deliveryCounts?.active ?? myActiveOrders.length}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Confirmados, en tienda o en camino
              </p>
            </Card>

            <Card
              onClick={() => {
                setDriverTab("all")
                setStatusFilter("entregado")
              }}
              className={cn(
                "rounded-2xl border p-4 cursor-pointer transition-all hover:border-foreground shadow-xs",
                driverTab === "all" && statusFilter === "entregado" && "ring-2 ring-foreground/40 bg-muted/30"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Entregados por Mí</span>
                <IconCircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-2xl font-black tabular-nums text-foreground mt-2">
                {deliveryCounts?.delivered ?? myDeliveredOrders.length}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Ver historial de entregas realizadas
              </p>
            </Card>

            <Card
              onClick={() => setDriverTab("settlement")}
              className={cn(
                "rounded-2xl border p-4 cursor-pointer transition-all shadow-xs",
                myUnsettledCashSummary.count > 0
                  ? "border-amber-500/50 bg-amber-500/10 hover:border-amber-500"
                  : "hover:border-foreground",
                driverTab === "settlement" && "ring-2 ring-amber-500/60"
              )}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
                <span>Efectivo Sin Liquidar</span>
                <IconCoins className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-2xl font-black tabular-nums text-amber-900 dark:text-amber-200 mt-2">
                {formatCurrency(myUnsettledCashSummary.grossTotal)}
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-1 truncate tabular-nums">
                {myUnsettledCashSummary.count} efec. · X: {formatCurrency(myUnsettledCashSummary.productsTotal)} + Y: {formatCurrency(myUnsettledCashSummary.deliveryTotal)}
              </p>
            </Card>
          </div>

          {/* Barra de Pestañas del Repartidor */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              {
                key: "available" as const,
                label: "Disponibles",
                count: availableOrders.length,
                icon: IconTruckDelivery,
              },
              {
                key: "active" as const,
                label: "Mis Envíos Activos",
                count: myActiveOrders.length,
                icon: IconMotorbike,
              },
              {
                key: "settlement" as const,
                label: "Mi Cuadre (X + Y)",
                count: myUnsettledCashSummary.count,
                icon: IconWallet,
              },
              {
                key: "all" as const,
                label: "Todos / Historial",
                count: branchIsolatedOrders.length,
                icon: IconHistory,
              },
            ].map((tab) => {
              const Icon = tab.icon
              const active = driverTab === tab.key
              return (
                <Button
                  key={tab.key}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setDriverTab(tab.key)
                    if (tab.key !== "all") setStatusFilter("all")
                  }}
                  className={cn(
                    "rounded-xl h-9 text-xs gap-1.5 shrink-0 font-semibold",
                    active && "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-4 px-1.5 text-[10px] font-bold tabular-nums border-0",
                      active
                        ? "bg-white/20 text-white dark:bg-zinc-950/15 dark:text-zinc-950"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {tab.count}
                  </Badge>
                </Button>
              )
            })}
          </div>

          {/* CONTENIDO POR PESTAÑA DEL DOMICILIARIO */}
          {driverTab === "settlement" ? (
            <div className="space-y-4">
              <DriverSettlementView
                driverSelfMode
                compactHeader
                onSettled={() => fetchOrders()}
              />
            </div>
          ) : loading ? (
            <div className="py-20 text-center space-y-3">
              <IconRefresh className="h-8 w-8 animate-spin text-zinc-950 dark:text-white mx-auto" />
              <p className="text-sm text-muted-foreground">Cargando pedidos de reparto...</p>
            </div>
          ) : driverTab === "available" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs text-sky-950 dark:text-sky-200 flex items-start gap-2.5">
                <IconTruckDelivery className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Adjudicación Primero en Aceptar:</strong> Al pulsar{" "}
                  <span className="font-semibold">Tomar Pedido</span>, el sistema bloquea la orden para ti al instante (también sincronizado con Telegram). Si otro repartidor la tomó segundos antes, se te avisará para evitar dobles recorridos.
                </div>
              </div>

              {availableOrders.length === 0 ? (
                <Card className="rounded-2xl border-dashed p-10 text-center space-y-3">
                  <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                    <IconTruckDelivery className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">
                      No hay pedidos libres en este momento
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Cuando entren nuevos pedidos por WhatsApp, web o caja sin repartidor asignado, aparecerán aquí para tomarlos con un clic.
                    </p>
                  </div>
                  {myActiveOrders.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => setDriverTab("active")}
                      className="rounded-xl text-xs gap-1.5"
                    >
                      <IconMotorbike className="h-4 w-4" />
                      Ver Mis Envíos Activos ({myActiveOrders.length})
                    </Button>
                  )}
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableOrders.map((order) => {
                    const fee = Math.min(Math.max(0, Number(order.total || 0)), Math.max(0, Number(order.deliveryFee || 0)))
                    const prod = Math.max(0, Number(order.total || 0) - fee)
                    const m = (order.paymentMethod || "contraentrega").toLowerCase()
                    const isCash = !m || m.includes("efectivo") || m.includes("contra")
                    const isBusy = claimingOrderId === order.id

                    return (
                      <Card key={order.id} className="rounded-2xl border shadow-xs flex flex-col justify-between">
                        <CardContent className="p-4 sm:p-5 space-y-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-black text-sm text-foreground">
                                  #{order.orderNumber}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-bold">
                                  {STATUS_CONFIG[order.status]?.label || order.status}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {formatDateTime(order.createdAt)}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] font-bold shrink-0",
                                isCash
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              )}
                            >
                              {isCash
                                ? `💵 Cobrar ${formatCurrency(order.total)}`
                                : `${PAYMENT_METHOD_CONFIG[order.paymentMethod]?.short || order.paymentMethod} · ${formatCurrency(order.total)}`}
                            </Badge>
                          </div>

                          {order.branch?.name && (
                            <div className="rounded-xl bg-muted/40 border px-3 py-2 text-xs flex items-center gap-2">
                              <IconBuildingStore className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <span className="font-semibold text-foreground">Recoger en: {order.branch.name}</span>
                                {order.branch.address && (
                                  <p className="text-[11px] text-muted-foreground truncate">{order.branch.address}</p>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-foreground flex items-center gap-1.5">
                                <IconUser className="h-3.5 w-3.5 text-muted-foreground" />
                                {order.customerName}
                              </span>
                              <a
                                href={`tel:${order.customerPhone}`}
                                className="text-[11px] font-mono text-primary hover:underline flex items-center gap-1"
                              >
                                <IconPhone className="h-3 w-3" />
                                {order.customerPhone}
                              </a>
                            </div>
                            <p className="text-xs font-medium text-foreground flex items-start gap-1.5">
                              <IconMapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                              <span>{order.deliveryAddress || "Recoger en tienda / Sin dirección"}</span>
                            </p>
                            {order.deliveryNotes && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                                📝 {order.deliveryNotes}
                              </p>
                            )}
                            {order.deliveryLatitude && order.deliveryLongitude && (
                              <div className="flex items-center gap-2 flex-wrap pt-1">
                                <a
                                  href={`https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-500/20"
                                >
                                  <IconBrandGoogleMaps className="h-3.5 w-3.5 text-red-500" />
                                  Google Maps ↗
                                </a>
                                <a
                                  href={`https://waze.com/ul?ll=${order.deliveryLatitude},${order.deliveryLongitude}&navigate=yes`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30 hover:bg-sky-500/20"
                                >
                                  <IconMapPin className="h-3.5 w-3.5" />
                                  Waze ↗
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border p-2.5 space-y-1 text-xs bg-background">
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>{order.items.length} ítem(s): {order.items.map((it) => `${it.quantity}x ${it.productName}`).join(", ")}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t text-[11px] tabular-nums">
                              <span className="text-muted-foreground">
                                Ped (X): <strong className="text-foreground">{formatCurrency(prod)}</strong> · Dom (Y): <strong className="text-foreground">{formatCurrency(fee)}</strong>
                              </span>
                              <span className="font-mono font-black text-foreground">
                                {formatCurrency(order.total)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleAcceptOrder(order.id, false)}
                              className="rounded-xl h-9 text-xs font-bold flex-1 min-w-[130px]"
                            >
                              <IconCheck className="h-3.5 w-3.5 mr-1" />
                              {isBusy ? "Tomando..." : "Tomar (Reservar)"}
                            </Button>
                            <Button
                              size="sm"
                              disabled={isBusy}
                              onClick={() => handleAcceptOrder(order.id, true)}
                              className="rounded-xl h-9 text-xs font-bold flex-1 min-w-[160px] bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
                            >
                              <IconMotorbike className="h-3.5 w-3.5 mr-1" />
                              {isBusy ? "Procesando..." : "Tomar y Salir en Camino"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDetailOrder(order)
                                setDetailModalOpen(true)
                              }}
                              className="h-9 w-9 rounded-xl shrink-0"
                              title="Ver detalle"
                            >
                              <IconEye className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          ) : driverTab === "active" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
                <IconWallet className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Recuerda:</strong> Marcar <strong>Entregado</strong> confirma que entregaste el pedido al cliente, pero el pedido permanece <strong>Sin Liquidar</strong> en tu Cuadre hasta que entregues el efectivo recibido en Caja.
                </div>
              </div>

              {myActiveOrders.length === 0 ? (
                <Card className="rounded-2xl border-dashed p-10 text-center space-y-3">
                  <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                    <IconMotorbike className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">
                      No tienes entregas activas en curso
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Revisa la pestaña Disponibles para adjudicarte un pedido nuevo.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setDriverTab("available")}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <IconTruckDelivery className="h-4 w-4" />
                    Ver Pedidos Disponibles ({availableOrders.length})
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myActiveOrders.map((order) => {
                    const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmado
                    const fee = Math.min(Math.max(0, Number(order.total || 0)), Math.max(0, Number(order.deliveryFee || 0)))
                    const prod = Math.max(0, Number(order.total || 0) - fee)
                    const m = (order.paymentMethod || "contraentrega").toLowerCase()
                    const isCash = !m || m.includes("efectivo") || m.includes("contra")
                    const isCompleting = completingOrderId === order.id

                    return (
                      <Card key={order.id} className="rounded-2xl border shadow-xs">
                        <CardContent className="p-4 sm:p-5 space-y-3.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-black text-sm text-foreground">
                                  #{order.orderNumber}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center text-[11px] font-bold rounded-full border px-2.5 py-0.5",
                                    statusCfg.color,
                                    statusCfg.bg,
                                    statusCfg.border
                                  )}
                                >
                                  {statusCfg.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {formatDateTime(order.createdAt)}
                              </p>
                            </div>
                            <span className="font-mono font-black text-sm text-foreground">
                              {formatCurrency(order.total)}
                            </span>
                          </div>

                          <div
                            className={cn(
                              "rounded-xl border px-3 py-2 text-xs font-medium",
                              order.paymentStatus === "pagado"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                                : isCash
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                                : "bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-200"
                            )}
                          >
                            {order.paymentStatus === "pagado" ? (
                              <span>💰 Pedido ya pagado ($0 por cobrar en efectivo)</span>
                            ) : isCash ? (
                              <span>
                                💵 Cobrar <strong>{formatCurrency(order.total)}</strong> contraentrega (Ped {formatCurrency(prod)} + Dom {formatCurrency(fee)})
                              </span>
                            ) : (
                              <span>
                                📲 Pago por {PAYMENT_METHOD_CONFIG[order.paymentMethod]?.label || order.paymentMethod} ({formatCurrency(order.total)})
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-bold text-foreground">{order.customerName}</span>
                              <div className="flex items-center gap-1.5">
                                <a
                                  href={`tel:${order.customerPhone}`}
                                  className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-lg border hover:bg-muted"
                                >
                                  <IconPhone className="h-3 w-3" />
                                  {order.customerPhone}
                                </a>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    openWhatsApp(
                                      order.customerPhone,
                                      `Hola ${order.customerName}, soy ${userName || "tu domiciliario"} de ${order.branch?.name || "la tienda"}. Voy con tu pedido #${order.orderNumber} hacia ${order.deliveryAddress || "tu dirección"}.`
                                    )
                                  }
                                  className="h-6 px-2 text-[11px] rounded-lg border-emerald-500/40 text-emerald-700 dark:text-emerald-300 gap-1"
                                >
                                  <IconBrandWhatsapp className="h-3.5 w-3.5" />
                                  WhatsApp
                                </Button>
                              </div>
                            </div>

                            <p className="text-xs font-medium text-foreground flex items-start gap-1.5">
                              <IconMapPin className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                              <span>{order.deliveryAddress || "Recoger en tienda / Sin dirección"}</span>
                            </p>

                            {order.deliveryNotes && (
                              <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                                📝 {order.deliveryNotes}
                              </p>
                            )}

                            {order.deliveryLatitude && order.deliveryLongitude && (
                              <div className="flex items-center gap-2 flex-wrap pt-1">
                                <a
                                  href={`https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-500/20"
                                >
                                  <IconBrandGoogleMaps className="h-3.5 w-3.5 text-red-500" />
                                  Google Maps ↗
                                </a>
                                <a
                                  href={`https://waze.com/ul?ll=${order.deliveryLatitude},${order.deliveryLongitude}&navigate=yes`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30 hover:bg-sky-500/20"
                                >
                                  <IconMapPin className="h-3.5 w-3.5" />
                                  Waze ↗
                                </a>
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border p-2.5 text-[11px] text-muted-foreground space-y-1">
                            {order.items.map((it) => (
                              <div key={it.id} className="flex justify-between">
                                <span>
                                  <strong className="text-foreground">{it.quantity}x</strong> {it.productName}
                                </span>
                                <span className="font-mono text-foreground">{formatCurrency(it.subtotal)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {order.status !== "en_camino" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(order.id, "en_camino")}
                                className="rounded-xl h-9 text-xs font-bold flex-1 min-w-[130px]"
                              >
                                <IconMotorbike className="h-3.5 w-3.5 mr-1" />
                                Salir en Camino
                              </Button>
                            )}
                            <Button
                              size="sm"
                              disabled={isCompleting}
                              onClick={() => handleCompleteOrder(order.id)}
                              className="rounded-xl h-9 text-xs font-bold flex-1 min-w-[155px] bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <IconCheck className="h-4 w-4 mr-1" />
                              {isCompleting ? "Finalizando..." : "Marcar Entregado"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintOrder(order)}
                              className="h-9 w-9 rounded-xl shrink-0"
                              title="Imprimir comanda"
                            >
                              <IconPrinter className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDetailOrder(order)
                                setDetailModalOpen(true)
                              }}
                              className="h-9 w-9 rounded-xl shrink-0"
                              title="Ver detalle"
                            >
                              <IconEye className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* PESTAÑA TODOS / HISTORIAL DEL DOMICILIARIO (SOLO LECTURA EN PAGOS) */
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-card p-3 rounded-2xl border shadow-2xs">
                <div className="relative flex-1">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por # orden, cliente, teléfono o dirección..."
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 text-xs rounded-xl w-[150px]">
                      <SelectValue placeholder="Estado Envío" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs">
                      <SelectItem value="all">📦 Todos los estados</SelectItem>
                      <SelectItem value="pendiente">🟡 Pendientes</SelectItem>
                      <SelectItem value="confirmado">🟢 Confirmados</SelectItem>
                      <SelectItem value="en_preparacion">🔵 En Preparación</SelectItem>
                      <SelectItem value="en_camino">🟣 En Camino</SelectItem>
                      <SelectItem value="entregado">✅ Entregados</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="h-9 text-xs rounded-xl w-[155px]">
                      <SelectValue placeholder="Liquidación" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl text-xs">
                      <SelectItem value="all">💳 Todos los pagos</SelectItem>
                      <SelectItem value="pendiente">⏳ Sin Liquidar / Por Cobrar</SelectItem>
                      <SelectItem value="pagado">💰 Liquidados (Pagado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {driverFilteredAllOrders.length === 0 ? (
                <Card className="rounded-2xl border-dashed p-10 text-center space-y-2">
                  <IconTruckDelivery className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-bold text-foreground">No hay pedidos que coincidan</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearch("")
                      setStatusFilter("all")
                      setPaymentStatusFilter("all")
                    }}
                    className="rounded-xl text-xs"
                  >
                    Restablecer filtros
                  </Button>
                </Card>
              ) : (
                <Card className="rounded-2xl border shadow-xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow>
                          <TableHead className="text-xs font-bold">Orden</TableHead>
                          <TableHead className="text-xs font-bold">Cliente</TableHead>
                          <TableHead className="text-xs font-bold">Dirección / GPS</TableHead>
                          <TableHead className="text-xs font-bold">Valores (X + Y)</TableHead>
                          <TableHead className="text-xs font-bold">Estado Envío</TableHead>
                          <TableHead className="text-xs font-bold">Liquidación</TableHead>
                          <TableHead className="text-xs font-bold text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {driverFilteredAllOrders.map((order) => {
                          const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendiente
                          const fee = Math.min(Math.max(0, Number(order.total || 0)), Math.max(0, Number(order.deliveryFee || 0)))
                          const prod = Math.max(0, Number(order.total || 0) - fee)
                          const isUnassignedAvailable =
                            !order.deliveryDriverId &&
                            ["pendiente", "confirmado", "en_preparacion"].includes(order.status)

                          return (
                            <TableRow key={order.id} className="hover:bg-muted/20">
                              <TableCell className="font-mono font-bold text-xs whitespace-nowrap">
                                #{order.orderNumber}
                                <span className="block text-[10px] text-muted-foreground font-normal">
                                  {formatDateTime(order.createdAt)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <p className="text-xs font-bold text-foreground">{order.customerName}</p>
                                <p className="text-[11px] text-muted-foreground">{order.customerPhone}</p>
                              </TableCell>
                              <TableCell className="max-w-[200px]">
                                <p className="text-xs truncate font-medium">{order.deliveryAddress || "N/A"}</p>
                                {order.deliveryLatitude && order.deliveryLongitude && (
                                  <a
                                    href={`https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                                  >
                                    <IconBrandGoogleMaps className="h-3 w-3 text-red-500" />
                                    GPS ↗
                                  </a>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs whitespace-nowrap">
                                <div className="font-bold text-foreground">{formatCurrency(order.total)}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  Ped: {formatCurrency(prod)} + Dom: {formatCurrency(fee)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center text-[11px] font-bold rounded-full border px-2.5 py-0.5 whitespace-nowrap",
                                    statusCfg.color,
                                    statusCfg.bg,
                                    statusCfg.border
                                  )}
                                >
                                  {statusCfg.label}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap",
                                    order.paymentStatus === "pagado"
                                      ? PAYMENT_STATUS_CONFIG.pagado.badgeClass
                                      : order.status === "entregado"
                                      ? PAYMENT_STATUS_CONFIG.por_cobrar.badgeClass
                                      : PAYMENT_STATUS_CONFIG.pendiente.badgeClass
                                  )}
                                >
                                  {order.paymentStatus === "pagado"
                                    ? "💰 Liquidado"
                                    : order.status === "entregado"
                                    ? `⏳ Sin Liquidar (${formatCurrency(order.total)})`
                                    : `⏳ Por Cobrar (${formatCurrency(order.total)})`}
                                </span>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap space-x-1">
                                {isUnassignedAvailable && (
                                  <Button
                                    size="sm"
                                    disabled={claimingOrderId === order.id}
                                    onClick={() => handleAcceptOrder(order.id, true)}
                                    className="h-7 text-xs rounded-lg px-2.5 font-bold"
                                  >
                                    Tomar
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setDetailOrder(order)
                                    setDetailModalOpen(true)
                                  }}
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
            </div>
          )}
        </>
      ) : (
        <>
          {/* Encabezado y Acciones Principales (Admin / Vendedor) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-xs">
              <IconTruckDelivery className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Gestión de Pedidos & Domicilios
                </h1>
                {activeBranch && (
                  <Badge variant="outline" className="text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1">
                    <IconBuildingStore className="h-3 w-3" />
                    Sede: {activeBranch.name}
                  </Badge>
                )}
              </div>
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
            variant="outline"
            size="sm"
            onClick={() => setDriverSettlementModalOpen(true)}
            className={cn(
              "rounded-xl h-9 text-xs gap-1.5 shadow-2xs",
              metrics.unsettledDeliveredCount > 0
                ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold"
                : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-foreground"
            )}
          >
            <IconCalculator className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Cuadre Domiciliarios
            {metrics.unsettledDeliveredCount > 0 && (
              <Badge className="h-4 px-1.5 text-[10px] font-bold tabular-nums bg-amber-500 text-white border-0">
                {metrics.unsettledDeliveredCount}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenDeliverySettings}
            className="rounded-xl h-9 text-xs gap-1.5 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-foreground shadow-2xs"
          >
            <IconMotorbike className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Tarifas de Domicilio
          </Button>

          <Button
            size="sm"
            data-tour="orders-new-btn"
            onClick={() => {
              setDeliveryFee(globalDeliveryFee)
              setNewOrderModalOpen(true)
            }}
            className="rounded-xl h-9 text-xs gap-1.5 bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shadow-xs"
          >
            <IconPlus className="h-4 w-4" />
            Nuevo Pedido
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI / Métricas Rápidas */}
      <div data-tour="orders-kpi-grid" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <Card
          onClick={() => {
            setStatusFilter("all")
            setPaymentStatusFilter("all")
            setDriverFilter("all")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-zinc-950 dark:hover:border-white",
            statusFilter === "all" && paymentStatusFilter === "all" && driverFilter === "all" && "ring-2 ring-zinc-950/30 dark:ring-white/30 bg-zinc-100 dark:bg-zinc-800"
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
            setPaymentStatusFilter("all")
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
            setPaymentStatusFilter("all")
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
            setPaymentStatusFilter("all")
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
            setPaymentStatusFilter("all")
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

        {/* Métrica de Estado de Pago: Por Cobrar / Sin Liquidar */}
        <Card
          onClick={() => {
            setPaymentStatusFilter(paymentStatusFilter === "pendiente" ? "all" : "pendiente")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-amber-500 bg-amber-500/5 dark:bg-amber-500/10",
            paymentStatusFilter === "pendiente" && "ring-2 ring-amber-500 bg-amber-500/20"
          )}
        >
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 truncate">
            ⏳ Sin Liquidar ({metrics.countPendingPayment})
          </div>
          <div className="text-base sm:text-lg font-bold text-amber-800 dark:text-amber-300 mt-1 truncate tabular-nums">
            {formatCurrency(metrics.totalPendingMoney)}
          </div>
        </Card>

        {/* Métrica de Estado de Pago: Pagados */}
        <Card
          onClick={() => {
            setPaymentStatusFilter(paymentStatusFilter === "pagado" ? "all" : "pagado")
          }}
          className={cn(
            "rounded-2xl border transition-all cursor-pointer shadow-xs p-3 hover:border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10",
            paymentStatusFilter === "pagado" && "ring-2 ring-emerald-500 bg-emerald-500/20"
          )}
        >
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            💰 Pagados
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-800 dark:text-emerald-300 mt-1">
            {metrics.countPaid}
          </div>
        </Card>
      </div>

      {/* Barra de Búsqueda y Filtros Detallados (Envío, Pago, Medio) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-card p-3 rounded-2xl border shadow-2xs">
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por # orden, cliente, dirección o conductor..."
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

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 1. Filtro de Estado de Envío (Logística) */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[130px] sm:w-[145px]" title="Filtrar por Estado de Envío">
              <SelectValue placeholder="Estado Envío" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">📦 Todos los envíos</SelectItem>
              <SelectItem value="pendiente">🟡 Pendientes</SelectItem>
              <SelectItem value="confirmado">🟢 Confirmados</SelectItem>
              <SelectItem value="en_preparacion">🔵 En Preparación</SelectItem>
              <SelectItem value="en_camino">🟣 En Camino</SelectItem>
              <SelectItem value="entregado">✅ Entregados</SelectItem>
              <SelectItem value="cancelado">🔴 Cancelados</SelectItem>
            </SelectContent>
          </Select>

          {/* 2. Filtro de Estado de Pago */}
          <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[125px] sm:w-[140px]" title="Filtrar por Estado de Pago">
              <SelectValue placeholder="Estado Pago" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">💳 Todos los pagos</SelectItem>
              <SelectItem value="pagado">✅ Solo Pagados</SelectItem>
              <SelectItem value="pendiente">⏳ Por Cobrar</SelectItem>
            </SelectContent>
          </Select>

          {/* 3. Filtro de Medio de Pago */}
          <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[125px] sm:w-[145px]" title="Filtrar por Medio de Pago">
              <SelectValue placeholder="Medio Pago" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">🏦 Todos los medios</SelectItem>
              <SelectItem value="efectivo">💵 Efectivo</SelectItem>
              <SelectItem value="transferencia">📲 Transferencia</SelectItem>
              <SelectItem value="tarjeta">💳 Tarjeta</SelectItem>
              <SelectItem value="credito">📝 Fiado / Crédito</SelectItem>
            </SelectContent>
          </Select>

          {/* Filtro de Conductor */}
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="h-9 text-xs rounded-xl w-[125px] sm:w-[150px]">
              <SelectValue placeholder="Conductor" />
            </SelectTrigger>
            <SelectContent className="rounded-xl text-xs">
              <SelectItem value="all">🛵 Todos los conductores</SelectItem>
              <SelectItem value="unassigned">⚠️ Sin Asignar</SelectItem>
              <SelectItem value="assigned">✅ Con Conductor</SelectItem>
              {staffDrivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} {d.role === "domiciliario" ? "(Repartidor)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      ) : (
        /* VISTA DE TABLA DETALLADA (ENVÍO, PAGO, MEDIO) */
        <Card className="rounded-2xl border shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-xs font-bold">Orden</TableHead>
                  <TableHead className="text-xs font-bold">Cliente</TableHead>
                  <TableHead className="text-xs font-bold">Dirección</TableHead>
                  <TableHead className="text-xs font-bold">Valores</TableHead>
                  <TableHead className="text-xs font-bold">Estado Envío</TableHead>
                  <TableHead className="text-xs font-bold">Estado Pago</TableHead>
                  <TableHead className="text-xs font-bold">Medio Pago</TableHead>
                  <TableHead className="text-xs font-bold">Conductor</TableHead>
                  <TableHead className="text-xs font-bold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendiente
                  const productTotal = order.subtotal || Math.max(0, order.total - order.deliveryFee)
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-xs whitespace-nowrap">
                        {order.orderNumber}
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          {formatDateTime(order.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-bold text-foreground">{order.customerName}</p>
                        <p className="text-[11px] text-muted-foreground">{order.customerPhone}</p>
                      </TableCell>
                      <TableCell className="max-w-[190px]">
                        <p className="text-xs truncate font-medium">{order.deliveryAddress || "N/A"}</p>
                        {order.deliveryNotes && (
                          <p className="text-[10px] text-muted-foreground truncate">{order.deliveryNotes}</p>
                        )}
                        {order.deliveryLatitude && order.deliveryLongitude && (
                          <a
                            href={`https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                          >
                            <IconBrandGoogleMaps className="h-3 w-3 text-red-500" />
                            GPS en Mapa ↗
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        <div className="font-bold text-foreground">
                          {formatCurrency(order.total)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Prod: {formatCurrency(productTotal)}
                          {order.deliveryFee > 0 ? ` + Env: ${formatCurrency(order.deliveryFee)}` : " (Envío $0)"}
                        </div>
                      </TableCell>

                      {/* 1. Estado de Envío (Logística) */}
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleUpdateStatus(order.id, val)}
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 text-[11px] font-bold rounded-full border px-2.5 gap-1.5 w-[140px] transition-all cursor-pointer shadow-2xs",
                              statusCfg.color,
                              statusCfg.bg,
                              statusCfg.border
                            )}
                          >
                            <SelectValue>{statusCfg.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="text-xs rounded-xl shadow-lg">
                            <SelectItem value="pendiente" className="cursor-pointer">🟡 Pendiente</SelectItem>
                            <SelectItem value="confirmado" className="cursor-pointer">🟢 Confirmado</SelectItem>
                            <SelectItem value="en_preparacion" className="cursor-pointer">🔵 En Preparación</SelectItem>
                            <SelectItem value="en_camino" className="cursor-pointer">🟣 En Camino</SelectItem>
                            <SelectItem value="entregado" className="cursor-pointer">✅ Entregado</SelectItem>
                            <SelectItem value="cancelado" className="cursor-pointer text-rose-600">🔴 Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* 2. Estado de Pago (Toggle interactivo) */}
                      <TableCell>
                        {order.paymentStatus === "pagado" ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdatePaymentStatus(
                                order.id,
                                order.status === "entregado" ? "por_cobrar" : "pendiente"
                              )
                            }
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2 py-1 rounded-md cursor-pointer transition-all active:scale-95 shadow-2xs whitespace-nowrap"
                            title="Pagado y liquidado en Caja. Clic para revertir"
                          >
                            💰 Pagado ($0 a cobrar)
                          </button>
                        ) : order.status === "entregado" ? (
                          <button
                            type="button"
                            onClick={() => handleUpdatePaymentStatus(order.id, "pagado")}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-2 py-1 rounded-md cursor-pointer transition-all active:scale-95 shadow-2xs whitespace-nowrap"
                            title="Pedido entregado, pero aún falta liquidar el efectivo en Caja con el domiciliario. Clic para confirmar Pagado"
                          >
                            ⏳ Sin Liquidar ({formatCurrency(order.total)})
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdatePaymentStatus(order.id, "pagado")}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer transition-all active:scale-95 shadow-2xs whitespace-nowrap"
                            title="Pendiente de cobro. Clic para marcar Pagado"
                          >
                            ⏳ Por Cobrar ({formatCurrency(order.total)})
                          </button>
                        )}
                      </TableCell>

                      {/* 3. Medio de Pago (Selector interactivo) */}
                      <TableCell>
                        <Select
                          value={order.paymentMethod || "efectivo"}
                          onValueChange={(val) => handleUpdatePaymentMethod(order.id, val)}
                        >
                          <SelectTrigger className="h-7 text-[11px] font-bold rounded-lg border px-2 gap-1 w-[125px] bg-background cursor-pointer shadow-2xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="text-xs rounded-xl shadow-lg">
                            <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                            <SelectItem value="contraentrega">💵 Contraentrega</SelectItem>
                            <SelectItem value="transferencia">📲 Transferencia</SelectItem>
                            <SelectItem value="tarjeta">💳 Tarjeta</SelectItem>
                            <SelectItem value="credito">📝 Fiado / Crédito</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Conductor */}
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

                      {/* Acciones */}
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {!order.deliveryDriverName && order.status !== "cancelado" && order.status !== "entregado" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleBroadcastOrder(order.id)}
                            className="h-7 text-xs rounded-lg px-2 border-dashed border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                            title="Difundir a todos los domiciliarios de la sede por Telegram (Primero en Aceptar)"
                          >
                            <IconSend className="h-3 w-3 mr-1" />
                            Difundir
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenAssign(order)}
                          className="h-7 text-xs rounded-lg px-2"
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
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ASIGNAR CONDUCTOR / REPARTIDOR (SOLO ADMIN / VENDEDOR)           */}
      {/* ========================================================================= */}
      {!isDriver && (
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
                  <div className="flex flex-col items-end">
                    <span className="font-medium text-foreground max-w-[240px] truncate text-right">
                      {selectedOrder.deliveryAddress}
                    </span>
                    {selectedOrder.deliveryLatitude && selectedOrder.deliveryLongitude && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <IconBrandGoogleMaps className="h-3 w-3 text-red-500" /> GPS Vinculado
                      </span>
                    )}
                  </div>
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
                              <Label className="text-[10px] font-semibold">Teléfono / Celular</Label>
                              <Input
                                value={quickDriverPhone}
                                onChange={(e) => setQuickDriverPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                placeholder="Ej. 3123456789"
                                className="h-8 text-xs rounded-lg bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-semibold flex items-center gap-1">
                                <span>Usuario de Telegram</span>
                                <span className="text-[9px] text-muted-foreground font-normal">(@usuario)</span>
                              </Label>
                              <Input
                                value={quickDriverTelegram}
                                onChange={(e) => setQuickDriverTelegram(e.target.value.trim())}
                                placeholder="Ej. @carlos_domi"
                                className="h-8 text-xs rounded-lg bg-background"
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-semibold">PIN de Acceso (4-8 dígitos) *</Label>
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
                              {s.telegramChatId ? (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 font-medium">
                                  ● Telegram Activo
                                </Badge>
                              ) : s.telegramUsername ? (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 font-medium">
                                  {s.telegramUsername} (Pendiente /vincular)
                                </Badge>
                              ) : null}
                              {s.phone && <span className="text-[10px] text-muted-foreground">Tel: {s.phone}</span>}
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

              {/* Checkbox: Despachar de inmediato (solo si el pedido aún no está entregado) */}
              {selectedOrder.status !== "entregado" ? (
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
              ) : (
                <div className="p-3 rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs">
                  <p className="font-bold">Pedido ya entregado</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Se actualizará el conductor asignado en el registro histórico sin alterar el estado de entrega.
                  </p>
                </div>
              )}
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
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DETALLE Y TRAZABILIDAD DEL PEDIDO                                */}
      {/* ========================================================================= */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-mono font-bold text-base text-foreground">
                {detailOrder?.orderNumber}
              </span>
              {detailOrder && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-medium">Estado:</span>
                  {isDriver ? (
                    <span
                      className={cn(
                        "inline-flex items-center h-7 text-xs font-bold rounded-full border px-3",
                        STATUS_CONFIG[detailOrder.status]?.color,
                        STATUS_CONFIG[detailOrder.status]?.bg,
                        STATUS_CONFIG[detailOrder.status]?.border
                      )}
                    >
                      {STATUS_CONFIG[detailOrder.status]?.label || detailOrder.status}
                    </span>
                  ) : (
                    <Select
                      value={detailOrder.status}
                      onValueChange={(val) => {
                        handleUpdateStatus(detailOrder.id, val)
                        setDetailOrder({ ...detailOrder, status: val })
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "h-7 text-xs font-bold rounded-full border px-2.5 gap-1.5 w-[145px] transition-all cursor-pointer shadow-2xs",
                          STATUS_CONFIG[detailOrder.status]?.color,
                          STATUS_CONFIG[detailOrder.status]?.bg,
                          STATUS_CONFIG[detailOrder.status]?.border
                        )}
                      >
                        <SelectValue>{STATUS_CONFIG[detailOrder.status]?.label || detailOrder.status}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="text-xs rounded-xl shadow-lg">
                        <SelectItem value="pendiente" className="cursor-pointer">🟡 Pendiente</SelectItem>
                        <SelectItem value="confirmado" className="cursor-pointer">🟢 Confirmado</SelectItem>
                        <SelectItem value="en_preparacion" className="cursor-pointer">🔵 En Preparación</SelectItem>
                        <SelectItem value="en_camino" className="cursor-pointer">🟣 En Camino</SelectItem>
                        <SelectItem value="entregado" className="cursor-pointer">✅ Entregado</SelectItem>
                        <SelectItem value="cancelado" className="cursor-pointer text-rose-600">🔴 Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl border bg-card space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Cliente & Destino
                  </span>
                  <p className="font-bold text-foreground">{detailOrder.customerName}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`tel:${detailOrder.customerPhone}`}
                      className="text-muted-foreground hover:text-foreground hover:underline font-mono"
                    >
                      {detailOrder.customerPhone}
                    </a>
                    {detailOrder.customerPhone && (
                      <button
                        type="button"
                        onClick={() =>
                          openWhatsApp(
                            detailOrder.customerPhone,
                            `Hola ${detailOrder.customerName}, te escribimos sobre tu pedido #${detailOrder.orderNumber}.`
                          )
                        }
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                      >
                        <IconBrandWhatsapp className="h-3.5 w-3.5" />
                        WhatsApp
                      </button>
                    )}
                  </div>
                  <p className="text-foreground pt-1 border-t mt-1 font-medium">{detailOrder.deliveryAddress}</p>
                  {detailOrder.deliveryLatitude && detailOrder.deliveryLongitude && (
                    <div className="pt-1.5 border-t mt-1 flex items-center gap-3 flex-wrap">
                      <a
                        href={`https://www.google.com/maps?q=${detailOrder.deliveryLatitude},${detailOrder.deliveryLongitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <IconBrandGoogleMaps className="h-4 w-4 text-red-500" />
                        Google Maps ↗
                      </a>
                      <a
                        href={`https://waze.com/ul?ll=${detailOrder.deliveryLatitude},${detailOrder.deliveryLongitude}&navigate=yes`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        <IconMapPin className="h-3.5 w-3.5" />
                        Waze ↗
                      </a>
                    </div>
                  )}
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
                      {!isDriver ? (
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
                      ) : (
                        <Badge
                          variant="outline"
                          className="mt-2 text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
                        >
                          Asignado a tu cuenta ✓
                        </Badge>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 py-1">
                      <p className="text-muted-foreground italic">No asignado</p>
                      {isDriver ? (
                        <Button
                          size="sm"
                          disabled={claimingOrderId === detailOrder.id}
                          onClick={() => handleAcceptOrder(detailOrder.id, true)}
                          className="h-7 text-[11px] rounded-lg w-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
                        >
                          <IconMotorbike className="h-3.5 w-3.5 mr-1" />
                          Tomar y Salir en Camino
                        </Button>
                      ) : (
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
                      )}
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

              {/* Liquidación y Control para el Domiciliario */}
              <div
                className={cn(
                  "p-3.5 rounded-xl border text-xs space-y-3",
                  detailOrder.paymentStatus === "pagado"
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200"
                    : detailOrder.paymentMethod === "transferencia"
                    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200"
                    : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40 text-blue-900 dark:text-blue-200"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                    {detailOrder.paymentStatus === "pagado"
                      ? "✅ Pago Confirmado / Liquidado"
                      : detailOrder.status === "entregado"
                      ? "⏳ Entregado · Pendiente de Liquidar en Caja"
                      : detailOrder.paymentMethod === "transferencia"
                      ? "⏳ Transferencia Pendiente por Verificar"
                      : "💵 Pago Contraentrega en Efectivo"}
                  </span>
                  <span className="font-mono font-bold text-xs">
                    {detailOrder.paymentStatus === "pagado"
                      ? "Cobrar: $0"
                      : detailOrder.paymentMethod === "transferencia"
                      ? `Monto: ${formatCurrency(detailOrder.total)}`
                      : detailOrder.status === "entregado"
                      ? `Por Liquidar: ${formatCurrency(detailOrder.total)}`
                      : `Cobrar: ${formatCurrency(detailOrder.total)}`}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {detailOrder.paymentStatus === "pagado"
                    ? "✅ Este pedido ya fue verificado y liquidado en caja. No hay saldo pendiente por cobrar."
                    : detailOrder.status === "entregado" && detailOrder.paymentMethod !== "transferencia"
                    ? `⚠️ El pedido ya fue entregado al cliente, pero el dinero aún NO ha ingresado a Caja ni a Ventas. Confirma el pago solo cuando el domiciliario entregue ${formatCurrency(detailOrder.total)} en caja o realiza su Cuadre de Caja.`
                    : detailOrder.paymentMethod === "transferencia"
                    ? "⚠️ El cliente indicó pago por transferencia bancaria (Nequi/Daviplata). Verifica el comprobante en tu app bancaria o chat antes de confirmar como Pagado."
                    : `⚠️ Cobro en efectivo contraentrega. El domiciliario DEBE cobrar ${formatCurrency(detailOrder.total)} al cliente y entregarlo en caja al regresar.`}
                </p>

                {/* Controles para cambiar Estado de Pago y Medio de Pago en el detalle (Solo Caja / Admin) */}
                {!isDriver ? (
                  <div className="pt-2 border-t border-dashed flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Medio:</span>
                      <Select
                        value={detailOrder.paymentMethod || "efectivo"}
                        onValueChange={(val) => handleUpdatePaymentMethod(detailOrder.id, val)}
                      >
                        <SelectTrigger className="h-7 text-xs rounded-lg border w-[135px] bg-background text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="text-xs rounded-xl">
                          <SelectItem value="efectivo">💵 Efectivo</SelectItem>
                          <SelectItem value="contraentrega">💵 Contraentrega</SelectItem>
                          <SelectItem value="transferencia">📲 Transferencia</SelectItem>
                          <SelectItem value="tarjeta">💳 Tarjeta</SelectItem>
                          <SelectItem value="credito">📝 Fiado / Crédito</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      {detailOrder.paymentStatus !== "pagado" ? (
                        <Button
                          size="sm"
                          onClick={() => handleUpdatePaymentStatus(detailOrder.id, "pagado")}
                          className="h-7 text-xs rounded-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                        >
                          <IconCheck className="h-3.5 w-3.5" /> Confirmar Pago Recibido
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleUpdatePaymentStatus(
                              detailOrder.id,
                              detailOrder.status === "entregado" ? "por_cobrar" : "pendiente"
                            )
                          }
                          className="h-7 text-xs rounded-lg border-emerald-500/40 text-emerald-700 dark:text-emerald-300 gap-1"
                        >
                          Revertir a Sin Liquidar
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-dashed flex items-center justify-between gap-2 text-[11px] opacity-90 flex-wrap">
                    <span className="font-semibold">
                      Medio: {PAYMENT_METHOD_CONFIG[detailOrder.paymentMethod]?.label || detailOrder.paymentMethod}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium">
                      <IconLock className="h-3 w-3" />
                      El pago lo confirma Caja al hacer tu Cuadre
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 flex-wrap">
            {isDriver && detailOrder && detailOrder.deliveryDriverId === userId && detailOrder.status !== "entregado" && detailOrder.status !== "cancelado" && (
              <>
                {detailOrder.status !== "en_camino" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUpdateStatus(detailOrder.id, "en_camino")}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    <IconMotorbike className="h-4 w-4" /> Salir en Camino
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={completingOrderId === detailOrder.id}
                  onClick={() => handleCompleteOrder(detailOrder.id)}
                  className="rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  <IconCheck className="h-4 w-4" />
                  {completingOrderId === detailOrder.id ? "Finalizando..." : "Marcar Entregado"}
                </Button>
              </>
            )}
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
      {/* MODAL 3, 4 y 5: SOLO ADMIN / VENDEDOR                                     */}
      {/* ========================================================================= */}
      {!isDriver && (
        <>
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Dirección de Entrega *</Label>
                  {deliveryAddress && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <IconMapPin className="h-3 w-3" />
                      Tarifa sugerida: ${formatCurrency(detectDeliveryFee(deliveryAddress, globalDeliveryFee))}
                    </span>
                  )}
                </div>
                <Input
                  value={deliveryAddress}
                  onChange={(e) => {
                    const val = e.target.value
                    setDeliveryAddress(val)
                    const autoFee = detectDeliveryFee(val, globalDeliveryFee)
                    setDeliveryFee(autoFee)
                  }}
                  placeholder="Ej. Calle 100 # 15-20, Barrio El Dorado"
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

      {/* MODAL 4: AJUSTE DE TARIFAS DE DOMICILIO & ENVÍOS (AGENTE IA) */}
      <Dialog open={deliverySettingsModalOpen} onOpenChange={setDeliverySettingsModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col p-6 rounded-2xl">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800 shrink-0">
                <IconMotorbike className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold">
                  Tarifas de Domicilio & Envíos
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Configura el costo estándar obligatorio y tarifas por barrio para que el Agente IA calcule de inmediato el total en el chat.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1 py-1">
            {/* 1. Tarifa Global (Obligatoria) */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs font-bold text-foreground">
                      Tarifa Global del Costo de Domicilio
                    </Label>
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/90">
                      Obligatorio
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Costo estándar que el agente de IA cobrará automáticamente si el barrio indicado por el cliente no está en la lista de barrios especiales.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="500"
                    value={globalDeliveryFee}
                    onChange={(e) => setGlobalDeliveryFee(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="5000"
                    className="pl-7 h-10 text-sm font-semibold rounded-xl"
                  />
                </div>
                <div className="text-xs text-muted-foreground font-mono font-medium">
                  COP (${formatCurrency(globalDeliveryFee)})
                </div>
              </div>
            </div>

            {/* 2. Tarifas Personalizadas por Barrio (Opcional) */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    Tarifas Personalizadas por Barrio
                  </Label>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                    Opcional
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Agrega barrios específicos donde apliques tarifas especiales (cercanos, lejanos o especiales). El agente de IA buscará el barrio en esta lista antes de aplicar la tarifa global.
                </p>
              </div>

              {/* Formulario para agregar nuevo barrio */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                <div className="sm:col-span-6">
                  <Input
                    placeholder="Nombre del barrio (ej: El Dorado, Centro...)"
                    value={newNeighborhood}
                    onChange={(e) => setNewNeighborhood(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddNeighborhood()
                      }
                    }}
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
                <div className="sm:col-span-4 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                    $
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="500"
                    placeholder="Costo (ej: 4000)"
                    value={newNeighborhoodFee}
                    onChange={(e) => setNewNeighborhoodFee(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleAddNeighborhood()
                      }
                    }}
                    className="pl-7 h-9 text-xs rounded-xl"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddNeighborhood}
                    className="w-full h-9 text-xs rounded-xl gap-1 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-200"
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    Agregar
                  </Button>
                </div>
              </div>

              {/* Buscador de barrios si hay más de 3 */}
              {neighborhoodRates.length > 3 && (
                <div className="relative pt-1">
                  <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar barrio configurado..."
                    value={neighborhoodSearch}
                    onChange={(e) => setNeighborhoodSearch(e.target.value)}
                    className="h-8 pl-8 text-xs rounded-lg bg-background"
                  />
                </div>
              )}

              {/* Lista de Barrios Configurados */}
              <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {neighborhoodRates.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border/70 text-center space-y-1">
                    <IconMapPin className="h-6 w-6 text-muted-foreground/60 mx-auto" />
                    <p className="text-xs font-medium text-foreground">
                      No hay barrios especiales registrados
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      El agente de IA usará la tarifa global obligatoria (${formatCurrency(globalDeliveryFee)}) para todos los clientes y pedidos.
                    </p>
                  </div>
                ) : (
                  neighborhoodRates
                    .filter((r) =>
                      !neighborhoodSearch.trim() ||
                      r.neighborhood.toLowerCase().includes(neighborhoodSearch.toLowerCase().trim())
                    )
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 text-xs hover:border-border transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <IconMapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="font-semibold text-foreground truncate">
                            {item.neighborhood}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <Badge variant="secondary" className="font-mono text-xs font-bold px-2 py-0.5">
                            ${formatCurrency(item.fee)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveNeighborhood(item.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            title="Eliminar tarifa de este barrio"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              {neighborhoodRates.length > 0 && (
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                  <span>Total barrios configurados: <strong>{neighborhoodRates.length}</strong></span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Sincronizado con IA</span>
                </div>
              )}
            </div>

            {/* Tip explicativo del funcionamiento del Agente de IA */}
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
              <IconSparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong>¿Cómo funciona en el chat?</strong> El agente le preguntará al cliente su dirección y barrio. Luego el agente validará si lo que respondió el cliente coincide con algún barrio de esta lista: si coincide aplicará esa tarifa especial; si no coincide o no está en la lista, aplicará automáticamente la tarifa global obligatoria y le dirá de inmediato el total exacto con envío.
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeliverySettingsModalOpen(false)}
              className="rounded-xl text-xs"
              disabled={savingDeliverySettings}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDeliverySettings}
              disabled={savingDeliverySettings || loadingDeliverySettings}
              className="rounded-xl text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 gap-1.5"
            >
              <IconCheck className="h-4 w-4" />
              {savingDeliverySettings ? "Guardando tarifas..." : "Guardar Tarifas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: CUADRE DE CAJA CON DOMICILIARIOS */}
      <Dialog open={driverSettlementModalOpen} onOpenChange={setDriverSettlementModalOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <IconCalculator className="h-5 w-5 text-primary" />
              Cuadre de Caja con Domiciliarios
            </DialogTitle>
            <DialogDescription className="text-xs">
              Liquida aquí las entregas cobradas por cada repartidor. Visualiza cuánto debe entregar por Valor en Pedidos (X) y por Valor en Domicilios (Y) antes de marcar los pedidos como Pagados.
            </DialogDescription>
          </DialogHeader>
          <DriverSettlementView
            compactHeader
            onSettled={() => {
              fetchOrders()
            }}
          />
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  )
}
