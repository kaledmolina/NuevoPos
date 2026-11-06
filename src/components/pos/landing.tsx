"use client"

import { useState, useMemo, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion"
import { ParticlesCanvas } from "./particles-canvas"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Shield, ShoppingCart, ArrowRight, ArrowLeft, Check, Package, Truck,
  Users, Building2, ReceiptText, Wallet, BarChart3, Lock, Play, BookOpen,
  TrendingUp, Boxes, AlertTriangle, CalendarClock, Plus, Search, ScanLine,
  CheckCircle2, DollarSign, Sparkles, Menu, X, ArrowLeftRight, Store,
  Pill, Hammer, Shirt, ShoppingBag, HardDrive, Printer, Layers, HelpCircle,
  ChevronRight, ChevronDown, Laptop, Smartphone, UtensilsCrossed, Coffee,
  Flame, Percent, CircleCheck, Star, ExternalLink, RefreshCw, Zap, Crown,
  Copy, CheckCheck
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { toast } from "sonner"

// Tipos
type Role = "admin" | "vendedor"

interface GuideStep {
  icon: React.ElementType
  title: string
  desc: string
  detail: string
}

// Productos de ejemplo para el mockup interactivo del POS (estilo ClaPos)
interface MockProduct {
  id: string
  name: string
  category: "all" | "burger" | "chicken" | "drink" | "coffee"
  price: number
  image: string
  badge?: string
}

const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "p1",
    name: "Deluxe Crispy Burger",
    category: "burger",
    price: 6.95,
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80",
    badge: "Top Ventas",
  },
  {
    id: "p2",
    name: "Classic Crispyburger",
    category: "burger",
    price: 4.75,
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p3",
    name: "Special Crispy Combo",
    category: "burger",
    price: 5.75,
    image: "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p4",
    name: "Special Angus Burger",
    category: "burger",
    price: 6.49,
    image: "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p5",
    name: "Spicy Chicken Wrap",
    category: "chicken",
    price: 5.49,
    image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p6",
    name: "Cheeseburger Clásica",
    category: "burger",
    price: 5.20,
    image: "https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p7",
    name: "Combo Crispy Drums",
    category: "chicken",
    price: 8.59,
    image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p8",
    name: "Double Cheese Burger",
    category: "burger",
    price: 7.35,
    image: "https://images.unsplash.com/photo-1583032015879-bf6495be1568?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p9",
    name: "Bebida Coca Cola 500ml",
    category: "drink",
    price: 3.00,
    image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=300&auto=format&fit=crop&q=80",
  },
  {
    id: "p10",
    name: "Café Latte & Espresso",
    category: "coffee",
    price: 3.50,
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&auto=format&fit=crop&q=80",
  },
]

// Guías de flujo
const ADMIN_GUIDE: GuideStep[] = [
  {
    icon: Store,
    title: "1. Configurar tipo de negocio",
    desc: "Configuración → Negocio & Rubro",
    detail: "Elige entre tienda de barrio, droguería, ferretería, ropa o comercio general. Define tu moneda, impuestos, datos de factura y control de vencimientos.",
  },
  {
    icon: Package,
    title: "2. Registrar productos y stock",
    desc: "Inventario → Catálogo",
    detail: "Crea productos con códigos de barra, precios de venta, costos de compra, stock mínimo de alerta y unidades flexibles (kg, unidades, paquetes).",
  },
  {
    icon: Truck,
    title: "3. Compras a proveedores",
    desc: "Compras → Registrar ingreso",
    detail: "Registra entradas de mercancía de tus proveedores; el stock y costos promedio se recalculan en tiempo real sin intervención manual.",
  },
  {
    icon: Wallet,
    title: "4. Control de caja y arqueo",
    desc: "Caja → Arqueo de turnos",
    detail: "Supervisa aperturas, egresos autorizados y cierres. El sistema calcula el efectivo esperado y detecta cualquier diferencia o faltante.",
  },
  {
    icon: Users,
    title: "5. Créditos y clientes (Fiados)",
    desc: "Clientes → Cuentas por cobrar",
    detail: "Asigna límites de crédito a clientes de confianza. Registra compras a crédito y abonos parciales con recibos automáticos.",
  },
  {
    icon: BarChart3,
    title: "6. Analítica y rentabilidad",
    desc: "Reportes → Rendimiento",
    detail: "Visualiza utilidad neta real, ticket promedio, artículos más vendidos, valorización de inventario y tendencias de ventas.",
  },
]

const VENDEDOR_GUIDE: GuideStep[] = [
  {
    icon: Wallet,
    title: "1. Abrir caja de turno",
    desc: "Caja → Apertura",
    detail: "Digita la base de efectivo inicial en gaveta para comenzar las operaciones del turno.",
  },
  {
    icon: Search,
    title: "2. Buscar o escanear productos",
    desc: "Punto de Venta",
    detail: "Usa el lector de código de barras o la búsqueda instantánea por nombre para agregar productos al carrito en 1 segundo.",
  },
  {
    icon: ShoppingCart,
    title: "3. Cobro veloz y recibo",
    desc: "Cobrar Orden",
    detail: "Acepta efectivo, tarjeta, transferencia bancaria o crédito. Calcula el cambio exacto e imprime el ticket térmico.",
  },
  {
    icon: ArrowLeftRight,
    title: "4. Movimientos de caja",
    desc: "Caja → Ingreso / Egreso",
    detail: "Registra egresos de caja para compras menores o gastos autorizados durante el turno manteniendo el cuadre al día.",
  },
  {
    icon: CheckCircle2,
    title: "5. Arqueo y cierre",
    desc: "Caja → Cerrar turno",
    detail: "Cuenta el dinero físico disponible, digítalo en el sistema y obtén el informe de cuadre inmediato antes de cerrar sesión.",
  },
]

// Rubros
const RUBRO_SHOWCASE = [
  {
    id: "tienda",
    name: "Tienda de Barrio & Minimarket",
    icon: Store,
    badge: "Abarrotes y Alimentos",
    description: "Venta ultra rápida de productos de canasta familiar, granos, bebidas, lácteos y snacks con soporte para ventas por unidad, paquetes y peso.",
    features: [
      "Lectura rápida de códigos de barras en mostrador",
      "Control de fiados / cuentas por cobrar a vecinos",
      "Soporte de unidades: kg, gramos, litros, paquetes",
      "Control de caja por turnos sin descuadres",
    ],
    sampleProducts: [
      { name: "Arroz Diana 1kg", price: "$4.500", unit: "bolsa" },
      { name: "Aceite Premier 1000ml", price: "$11.500", unit: "botella" },
      { name: "Leche Entera 1L", price: "$4.700", unit: "bolsa" },
      { name: "Huevos Tipo AA x 30", price: "$18.500", unit: "panal" },
      { name: "Coca-Cola 1.5L", price: "$5.800", unit: "botella" },
    ],
  },
  {
    id: "drogueria",
    name: "Droguería & Farmacia",
    icon: Pill,
    badge: "Medicamentos y Salud",
    description: "Control riguroso de inventario farmacéutico con seguimiento de lotes, fechas de vencimiento, alertas a 30 días y bloqueo de venta de vencidos.",
    features: [
      "Control de fecha de vencimiento y lote por producto",
      "Alerta automática de medicamentos próximos a caducar",
      "Bloqueo de seguridad: impide vender productos vencidos",
      "Historial de compras y proveedores farmacéuticos",
    ],
    sampleProducts: [
      { name: "Acetaminofén 500mg x 10", price: "$2.800", unit: "caja" },
      { name: "Ibuprofeno 400mg x 10", price: "$4.200", unit: "caja" },
      { name: "Amoxicilina 500mg x 12", price: "$9.800", unit: "caja" },
      { name: "Loratadina 10mg x 10", price: "$5.400", unit: "caja" },
      { name: "Vitamina C 1g x 10 efervescente", price: "$8.400", unit: "tubo" },
    ],
  },
  {
    id: "ferreteria",
    name: "Ferretería & Construcción",
    icon: Hammer,
    badge: "Herramientas y Materiales",
    description: "Gestión de herramientas manuales y eléctricas, tornillería, plomería, electricidad, pinturas y materiales de construcción con stock mínimo.",
    features: [
      "Control de inventario por metros, galones, bultos y piezas",
      "Alertas de stock mínimo para no quedarte sin insumos clave",
      "Venta a crédito para contratistas y maestros de obra",
      "Impresión de comprobantes con detalle de medidas",
    ],
    sampleProducts: [
      { name: "Martillo de Uña 16oz Stanley", price: "$34.500", unit: "unidad" },
      { name: "Taladro Percutor 650W DeWalt", price: "$295.000", unit: "unidad" },
      { name: "Tornillo Drywall 6x1 x 100", price: "$7.900", unit: "caja" },
      { name: "Tubo PVC Sanitario 3 pulg x 3m", price: "$42.000", unit: "tubo" },
      { name: "Pintura Vinilo Blanco Galón", price: "$56.000", unit: "galón" },
    ],
  },
  {
    id: "ropa",
    name: "Tienda de Ropa & Calzado",
    icon: Shirt,
    badge: "Moda y Accesorios",
    description: "Administra prendas de vestir, calzado y accesorios con referencias, precios diferenciados y políticas de cambio en el recibo.",
    features: [
      "Registro por tallas, colores y referencias de moda",
      "Mensaje personalizado de garantía en el ticket",
      "Múltiples métodos de pago: tarjetas, transferencias y efectivo",
      "Reporte de prendas y accesorios más vendidos del mes",
    ],
    sampleProducts: [
      { name: "Camiseta Algodón Talla M", price: "$38.000", unit: "unidad" },
      { name: "Jean Slim Fit Azul Talla 32", price: "$95.000", unit: "unidad" },
      { name: "Vestido Casual Floral Talla M", price: "$110.000", unit: "unidad" },
      { name: "Zapatillas Urbanas Blancas #40", price: "$165.000", unit: "par" },
      { name: "Bolso Tote Bag Cuero Sintético", price: "$85.000", unit: "unidad" },
    ],
  },
  {
    id: "general",
    name: "Comercio General & Retail",
    icon: ShoppingBag,
    badge: "Comercio Todoterreno",
    description: "La solución adaptable para papelerías, tecnología, cosméticos, librerías y cualquier tipo de comercio minorista.",
    features: [
      "Personalización instantánea del nombre y datos de negocio",
      "Unidades de medida flexibles (combos, juegos, unidades)",
      "Gestión ágil de clientes y proveedores",
      "Respaldo seguro en la nube y copias descargables",
    ],
    sampleProducts: [
      { name: "Cuaderno Argollado 100h", price: "$9.500", unit: "unidad" },
      { name: "Cargador Rápido USB-C 20W", price: "$35.000", unit: "unidad" },
      { name: "Kit de Maquillaje Pro", price: "$75.000", unit: "juego" },
      { name: "Resma de Papel Carta x 500", price: "$22.000", unit: "paquete" },
      { name: "Audífonos Bluetooth Inalámbricos", price: "$58.000", unit: "unidad" },
    ],
  },
]

// Logos de confianza (Social Proof)
const BRAND_LOGOS = [
  { name: "Dune Retail", icon: "🏛️" },
  { name: "Snowflake POS", icon: "❄️" },
  { name: "Greenish Food", icon: "🍃" },
  { name: "Leafe Market", icon: "🌿" },
  { name: "Minty Cafe", icon: "🌱" },
  { name: "Apex Stores", icon: "⚡" },
]

export default function LandingPage() {
  const setShowLanding = useAppStore((s) => s.setShowLanding)
  const login = useAppStore((s) => s.login)

  // Estado del mockup interactivo de POS
  const [mockCategory, setMockCategory] = useState<"all" | "burger" | "chicken" | "drink" | "coffee">("all")
  const [mockOrderType, setMockOrderType] = useState<"dine_in" | "take_away">("dine_in")
  const [mockCart, setMockCart] = useState<Record<string, number>>({
    p2: 1, // Classic Crispyburger x1
    p8: 1, // Double Cheese Burger x1
    p9: 2, // Coca Cola x2
  })
  const [mockSearch, setMockSearch] = useState("")

  // Estado de planes (Mensual vs Anual con descuento)
  const [annualBilling, setAnnualBilling] = useState(true)

  // Guía por roles
  const [activeRole, setActiveRole] = useState<Role>("admin")
  const [activeStep, setActiveStep] = useState(0)

  // Rubro seleccionado
  const [selectedRubro, setSelectedRubro] = useState(0)

  // Menú móvil, dropdowns y scroll
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [mobileExpandedGroup, setMobileExpandedGroup] = useState<string | null>("producto")
  const [isScrolled, setIsScrolled] = useState(false)
  const { scrollY } = useScroll()
  const heroParallaxY = useTransform(scrollY, [0, 500], [0, 35])
  const mockupParallaxY = useTransform(scrollY, [0, 800], [0, -45])
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  const [activeNav, setActiveNav] = useState("home")

  // Detección de scroll para animación dinámica de navbar flotante
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 25)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // FAQ desplegables
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)

  // Login rápido de prueba
  const [loggingIn, setLoggingIn] = useState<string | null>(null)

  const handleQuickLogin = async (username: string, pin: string) => {
    try {
      setLoggingIn(username)
      await login(username, pin)
      toast.success(`Sesión iniciada como ${username}`)
    } catch (e) {
      toast.error((e as Error).message || "Error al iniciar sesión")
    } finally {
      setLoggingIn(null)
    }
  }

  const goLogin = () => setShowLanding(false)

  // Filtrado de productos en el mockup
  const filteredProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter((p) => {
      const matchCat = mockCategory === "all" || p.category === mockCategory
      const matchSearch = p.name.toLowerCase().includes(mockSearch.toLowerCase())
      return matchCat && matchSearch
    })
  }, [mockCategory, mockSearch])

  // Cálculo del total del mockup
  const mockSubtotal = useMemo(() => {
    return Object.entries(mockCart).reduce((acc, [id, qty]) => {
      const prod = MOCK_PRODUCTS.find((p) => p.id === id)
      return acc + (prod ? prod.price * qty : 0)
    }, 0)
  }, [mockCart])

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast.success(`"${text}" copiado al portapapeles`, { duration: 1500 })
      setTimeout(() => setCopiedKey(null), 1800)
    }
  }

  const toggleMockProduct = (id: string) => {
    const prod = MOCK_PRODUCTS.find((p) => p.id === id)
    if (prod) {
      toast.success(`"${prod.name}" añadido al pedido demo`, { duration: 1200 })
    }
    setMockCart((prev) => {
      const current = prev[id] || 0
      if (current === 0) {
        return { ...prev, [id]: 1 }
      }
      return { ...prev, [id]: current + 1 }
    })
  }

  const removeMockProduct = (id: string) => {
    setMockCart((prev) => {
      const updated = { ...prev }
      delete updated[id]
      return updated
    })
  }

  const clearMockCart = () => {
    setMockCart({})
    toast.info("Orden demo vaciada")
  }

  const handleMockCheckout = () => {
    toast.success("¡Venta demo procesada con éxito!", {
      description: `Total: $${mockSubtotal.toFixed(2)} · Comprobante simulado`,
    })
    setMockCart({})
  }

  const guide = activeRole === "admin" ? ADMIN_GUIDE : VENDEDOR_GUIDE
  const currentStep = guide[activeStep]
  const activeRubroData = RUBRO_SHOWCASE[selectedRubro]

  const NAV_DROPDOWNS = [
    {
      id: "producto",
      label: "Producto",
      items: [
        {
          title: "Punto de Venta (POS)",
          desc: "Venta rápida en mostrador, turnos, arqueo y ticket térmico.",
          href: "#mockup-interactive",
          icon: ShoppingCart,
        },
        {
          title: "Inventario & Stock",
          desc: "Control en tiempo real, alertas de stock mínimo y compras.",
          href: "#features",
          icon: Package,
        },
        {
          title: "Caja y Finanzas",
          desc: "Apertura de turno, arqueo ciego y reportes de rentabilidad.",
          href: "#features",
          icon: Wallet,
        },
        {
          title: "Créditos & Fiados",
          desc: "Cuentas por cobrar a clientes de confianza con abonos.",
          href: "#features",
          icon: Users,
        },
      ],
    },
    {
      id: "soluciones",
      label: "Soluciones",
      items: [
        {
          title: "Tienda de Barrio & Minimarket",
          desc: "Canasta familiar, venta por unidades, kg o paquetes.",
          href: "#rubros",
          icon: Store,
        },
        {
          title: "Droguería & Farmacia",
          desc: "Control riguroso de lotes, caducidad y alertas a 30 días.",
          href: "#rubros",
          icon: Pill,
        },
        {
          title: "Ferretería & Construcción",
          desc: "Ventas por metros, galones, bultos y cotizaciones.",
          href: "#rubros",
          icon: Hammer,
        },
        {
          title: "Moda & Comercio General",
          desc: "Tallas, referencias, políticas de cambio y garantías.",
          href: "#rubros",
          icon: Shirt,
        },
      ],
    },
    {
      id: "devs",
      label: "Desarrolladores & IA",
      items: [
        {
          title: "Agentes IA (Servidor MCP)",
          desc: "Conecta Claude, Gemini o Cursor a tu POS vía stdio.",
          href: "#ia-mcp",
          icon: Sparkles,
          badge: "MCP",
        },
        {
          title: "Documentación API REST",
          desc: "Especificación completa con paridad 100% web y endpoints.",
          href: "/docs",
          icon: BookOpen,
        },
        {
          title: "Simulador POS en Vivo",
          desc: "Demostración interactiva de órdenes sin necesidad de login.",
          href: "#mockup-interactive",
          icon: Play,
        },
      ],
    },
  ]

  const DIRECT_NAV_ITEMS = [
    { id: "pricing", label: "Precios", href: "#pricing" },
    { id: "credentials", label: "Acceso Demo", href: "#credentials" },
  ]

  return (
    <div className="min-h-screen bg-white dark:bg-black text-zinc-950 dark:text-zinc-100 transition-colors duration-200 selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-950 relative">
      
      {/* Interactive Floating Monochrome Particles & Ambient Mesh */}
      <ParticlesCanvas particleCount={70} connectDistance={135} className="fixed inset-0 pointer-events-none -z-10" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-20">
        <div className="absolute inset-0 bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:28px_28px] opacity-70 dark:opacity-40" />
        <motion.div
          animate={{ x: [0, 25, 0], y: [0, -30, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 left-1/4 w-[800px] h-[600px] rounded-full bg-zinc-300/15 dark:bg-zinc-800/20 blur-[140px]"
        />
        <motion.div
          animate={{ x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-28 right-1/4 w-[650px] h-[550px] rounded-full bg-zinc-200/20 dark:bg-zinc-800/15 blur-[150px]"
        />
      </div>

      {/* ========================================================= */}
      {/* 1. NAVBAR SIMÉTRICA Y ELEGANTE (ESTILO LINEAR / STRIPE)   */}
      {/* ========================================================= */}
      <header className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pointer-events-none transition-all">
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className={cn(
            "pointer-events-auto w-full transition-all duration-300 flex items-center justify-between",
            "max-w-7xl 2xl:max-w-[1400px] rounded-2xl sm:rounded-full px-5 sm:px-8 py-2.5 sm:py-3",
            "bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl",
            "border border-zinc-200/90 dark:border-zinc-800/90",
            "shadow-lg shadow-black/5 dark:shadow-black/50 ring-1 ring-zinc-900/5 dark:ring-white/5",
            isScrolled && "bg-white/95 dark:bg-zinc-950/95 border-zinc-300 dark:border-zinc-700 shadow-xl"
          )}
        >
          {/* Columna 1 (Izquierda): Logo y Marca */}
          <div className="flex-1 flex items-center justify-start">
            <a
              href="#home"
              className="flex items-center gap-2.5 select-none group cursor-pointer"
            >
              <motion.div
                whileHover={{ rotate: 15, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
                className="relative flex h-8 w-8 sm:h-8.5 sm:w-8.5 items-center justify-center rounded-full bg-zinc-950 dark:bg-white text-white dark:text-black shadow-md"
              >
                <Zap className="h-4 w-4 fill-white dark:fill-black" />
              </motion.div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm sm:text-base tracking-tight text-zinc-950 dark:text-white transition-colors">
                  Omni<span className="text-zinc-950 dark:text-white">POS</span>
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600 animate-pulse" />
              </div>
            </a>
          </div>

          {/* Columna 2 (Centro): Navegación central simétricamente centrada */}
          <nav
            className="hidden lg:flex flex-none items-center justify-center gap-1.5 relative"
            onMouseLeave={() => setOpenDropdown(null)}
          >
            {NAV_DROPDOWNS.map((grp) => {
              const isOpen = openDropdown === grp.id

              return (
                <div
                  key={grp.id}
                  className="relative"
                  onMouseEnter={() => setOpenDropdown(grp.id)}
                >
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(isOpen ? null : grp.id)}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 select-none cursor-pointer",
                      isOpen
                        ? "text-zinc-950 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60"
                    )}
                    aria-expanded={isOpen}
                  >
                    <span>{grp.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 text-zinc-400 transition-transform duration-200",
                        isOpen && "rotate-180 text-zinc-950 dark:text-white"
                      )}
                    />
                  </button>

                  {/* Submenú desplegable flotante con microinteracciones */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 w-80 sm:w-[380px]"
                      >
                        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl shadow-2xl p-2.5 space-y-1 ring-1 ring-zinc-900/10 dark:ring-white/10">
                          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800/80 mb-1">
                            {grp.label}
                          </div>
                          {grp.items.map((sub) => {
                            const SubIcon = sub.icon
                            const isRoute = sub.href.startsWith("/")
                            const Comp = isRoute ? Link : "a"

                            return (
                              <Comp
                                key={sub.title}
                                href={sub.href}
                                onClick={() => setOpenDropdown(null)}
                                className="flex items-start gap-3 p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all group cursor-pointer"
                              >
                                <div className="h-8 w-8 rounded-lg bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shrink-0 group-hover:bg-zinc-950 dark:group-hover:bg-white group-hover:text-white transition-colors shadow-xs">
                                  <SubIcon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors">
                                      {sub.title}
                                    </span>
                                    {sub.badge && (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border border-zinc-300 dark:border-zinc-700">
                                        {sub.badge}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5 leading-snug">
                                    {sub.desc}
                                  </p>
                                </div>
                              </Comp>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}

            {/* Enlaces directos sin submenú (Precios y Acceso Demo) */}
            {DIRECT_NAV_ITEMS.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-full text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60 transition-colors select-none"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Columna 3 (Derecha): Acciones (ThemeToggle + Iniciar Sesión + Probar Gratis) */}
          <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-2">
            {/* BOTÓN PROMINENTE DE MODO CLARO / OSCURO */}
            <ThemeToggle showLabel />

            {/* Iniciar Sesión Pill */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goLogin}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Iniciar Sesión
            </motion.button>

            {/* Probar Gratis Pill estilo SaaS Moderno */}
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="hidden sm:block"
            >
              <Button
                size="sm"
                onClick={goLogin}
                className="rounded-full px-4 py-1.5 text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shadow-sm h-8 cursor-pointer flex items-center gap-1.5"
              >
                <span>Probar Gratis</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </motion.div>

            {/* Botón menú móvil */}
            <button
              className="lg:hidden p-1.5 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menú de navegación"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </motion.div>

        {/* Menú móvil desplegable con acordeones organizados */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto w-full max-w-sm mt-2 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl shadow-2xl p-4 space-y-2"
            >
              <div className="space-y-1.5">
                {NAV_DROPDOWNS.map((grp) => {
                  const isExpanded = mobileExpandedGroup === grp.id

                  return (
                    <div
                      key={grp.id}
                      className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/40"
                    >
                      <button
                        onClick={() => setMobileExpandedGroup(isExpanded ? null : grp.id)}
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-zinc-800 dark:text-zinc-200"
                      >
                        <span>{grp.label}</span>
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200 transition-transform", isExpanded && "rotate-180")}
                        />
                      </button>

                      {isExpanded && (
                        <div className="p-1 space-y-0.5 border-t border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-950">
                          {grp.items.map((sub) => {
                            const SubIcon = sub.icon
                            const isRoute = sub.href.startsWith("/")
                            const Comp = isRoute ? Link : "a"

                            return (
                              <Comp
                                key={sub.title}
                                href={sub.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:text-zinc-100 transition-colors"
                              >
                                <SubIcon className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200 shrink-0" />
                                <span className="font-medium truncate">{sub.title}</span>
                              </Comp>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {DIRECT_NAV_ITEMS.map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                  >
                    <span>{item.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" />
                  </a>
                ))}
              </div>

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between px-3 py-1">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Tema Visual:</span>
                  <ThemeToggle showLabel />
                </div>
                <Link
                  href="/docs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-bold text-zinc-800 dark:text-zinc-200"
                >
                  <BookOpen className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" />
                  Ver Documentación & MCP
                </Link>
                <Button
                  onClick={goLogin}
                  className="w-full rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white font-bold h-9 text-xs"
                >
                  Acceder al Sistema POS
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ========================================================= */}
      {/* 2. HERO SECTION ESTILO SAAS MODERNO & ELEGANTE            */}
      {/* ========================================================= */}
      <section id="home" className="relative z-10 pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 overflow-hidden">
        <motion.div style={{ y: heroParallaxY }} className="mx-auto max-w-6xl text-center">

          {/* Badge Pill Superior (Estilo del Referente) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 px-4 py-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 shadow-xs mb-6 backdrop-blur-md"
          >
            <span className="flex h-2 w-2 rounded-full bg-zinc-950 dark:bg-white animate-pulse" />
            <span className="font-bold text-zinc-950 dark:text-white">Tu Plataforma de Gestión Comercial</span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-600 dark:text-zinc-300">POS & Agentes IA en Tiempo Real</span>
          </motion.div>

          {/* Headline Limpio y Elegante con Icono Destacado Embebido */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-zinc-950 dark:text-white max-w-4xl mx-auto leading-[1.12]"
          >
            Hacemos la Gestión de tu Empresa{" "}
            <span className="inline-flex items-center gap-2 align-middle">
              <span className="inline-flex items-center justify-center h-8 w-8 sm:h-12 sm:w-12 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-black shadow-md">
                <Zap className="h-4 w-4 sm:h-6 sm:w-6 fill-white dark:fill-black" />
              </span>
            </span>
            <br />
            Más Fácil & Rentable
          </motion.h1>

          {/* Subtítulo descriptivo con tipografía balanceada */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg text-zinc-700 dark:text-zinc-300 max-w-2xl mx-auto leading-relaxed font-normal"
          >
            Administra inventario, acelera tus ventas en mostrador, cuadra tu caja sin descuadres y conecta Agentes de IA autónomos con protocolo MCP en una sola suite profesional.
          </motion.p>

          {/* Botones de acción principales (Estilo Pill Elegante) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5"
          >
            <Button
              size="lg"
              onClick={goLogin}
              className="w-full sm:w-auto h-12 px-8 rounded-full text-sm font-semibold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shadow-md transition-all hover:scale-105 active:scale-[0.96] cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Comenzar Ahora</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                const el = document.getElementById("mockup-interactive")
                el?.scrollIntoView({ behavior: "smooth" })
              }}
              className="w-full sm:w-auto h-12 px-7 rounded-full text-sm font-medium border-zinc-300 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.96] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Play className="h-3.5 w-3.5 fill-zinc-900 dark:fill-white text-zinc-900 dark:text-white" />
              <span>Ver Demostración Interactiva</span>
            </Button>
          </motion.div>

          {/* Fila Horizontal de Pastillas / Categorías (Exacto como en la imagen de referencia) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs">
              <Wallet className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" /> Finanzas & Caja
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs">
              <Users className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" /> Colaboradores & Sedes
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-zinc-950 dark:text-white" /> Agentes IA (MCP)
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs">
              <Package className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" /> Inventario & Lotes
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 shadow-2xs">
              <Truck className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" /> Domicilios & Rutas
            </div>
          </motion.div>

          {/* ========================================================= */}
          {/* MOCKUP INTERACTIVO CENTRAL (RÉPLICA EXACTA DE LA IMAGEN)  */}
          {/* ========================================================= */}
          <motion.div
            id="mockup-interactive"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            style={{ y: mockupParallaxY }}
            className="mt-14 relative mx-auto max-w-6xl xl:max-w-7xl text-left"
          >
            {/* Glow sutil debajo del contenedor del mockup */}
            <div className="absolute -inset-1 rounded-3xl bg-zinc-500/10 blur-xl opacity-40 -z-10" />

            <div className="rounded-2xl sm:rounded-3xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl shadow-lg overflow-hidden ring-1 ring-zinc-900/10 dark:ring-white/10">
              
              {/* Header del Mockup */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/80">
                <div className="flex items-center gap-3">
                  {/* macOS Traffic Lights Window Chrome */}
                  <div className="flex items-center gap-1.5 mr-1 select-none">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700 border border-zinc-400/30 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600 border border-zinc-500/30 inline-block" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-900 dark:bg-zinc-100 border border-zinc-300 dark:border-zinc-700 inline-block" />
                  </div>
                  <button className="p-1 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors">
                    <Menu className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-zinc-950 dark:text-zinc-100 fill-zinc-950 dark:fill-white" />
                    <span className="font-bold text-sm tracking-tight text-zinc-800 dark:text-white">OmniPOS</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-zinc-950 dark:bg-white dark:text-zinc-950/10 text-zinc-950 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800">v2.0 Demo</span>
                  </div>
                </div>

                {/* Buscador de productos del mockup */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={mockSearch}
                    onChange={(e) => setMockSearch(e.target.value)}
                    className="w-full rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-zinc-950 dark:ring-white"
                  />
                </div>

                {/* Acciones de cabecera como en la imagen */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-950 dark:hover:border-white cursor-pointer">
                    <Users className="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-100" />
                    <span>Cliente</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-950 dark:hover:border-white cursor-pointer">
                    <Layers className="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-100" />
                    <span>Mesas</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-950 dark:hover:border-white cursor-pointer">
                    <Percent className="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-100" />
                    <span>Descuento</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-950 dark:hover:border-white cursor-pointer">
                    <HardDrive className="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-100" />
                    <span>Guardar</span>
                  </div>
                </div>
              </div>

              {/* Cuerpo del Mockup: Categorías + Catálogo + Detalle de Orden */}
              <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100 dark:divide-zinc-800">
                
                {/* 1. Categorías laterales izquierdas (exacto como en la imagen) */}
                <div className="lg:col-span-2 p-3 bg-zinc-50/40 dark:bg-zinc-900/40 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible">
                  <button
                    onClick={() => setMockCategory("all")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all text-left",
                      mockCategory === "all"
                        ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                    )}
                  >
                    <UtensilsCrossed className="h-3.5 w-3.5 shrink-0" />
                    <span>Todo el Menú</span>
                  </button>

                  <button
                    onClick={() => setMockCategory("burger")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all text-left",
                      mockCategory === "burger"
                        ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                    )}
                  >
                    <Flame className="h-3.5 w-3.5 shrink-0" />
                    <span>Hamburguesas</span>
                  </button>

                  <button
                    onClick={() => setMockCategory("chicken")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all text-left",
                      mockCategory === "chicken"
                        ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                    )}
                  >
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span>Pollo Crispy</span>
                  </button>

                  <button
                    onClick={() => setMockCategory("drink")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all text-left",
                      mockCategory === "drink"
                        ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                    )}
                  >
                    <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                    <span>Bebidas</span>
                  </button>

                  <button
                    onClick={() => setMockCategory("coffee")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all text-left",
                      mockCategory === "coffee"
                        ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                    )}
                  >
                    <Coffee className="h-3.5 w-3.5 shrink-0" />
                    <span>Café & Postres</span>
                  </button>
                </div>

                {/* 2. Cuadrícula de Productos Central */}
                <div className="lg:col-span-6 p-4 bg-white dark:bg-zinc-900">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Productos ({filteredProducts.length}) · Haz clic para agregar
                    </p>
                    <span className="text-[11px] text-zinc-950 dark:text-zinc-100 font-medium">Demostración en Vivo</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {filteredProducts.map((prod) => {
                      const count = mockCart[prod.id] || 0
                      return (
                        <motion.div
                          key={prod.id}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.96 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          onClick={() => toggleMockProduct(prod.id)}
                          className={cn(
                            "relative group rounded-xl border p-2.5 transition-all cursor-pointer select-none flex flex-col justify-between",
                            count > 0
                              ? "border-zinc-950 dark:border-white bg-zinc-100 dark:bg-zinc-900 shadow-xs ring-1 ring-zinc-900/20 dark:ring-white/20"
                              : "border-zinc-200/90 dark:border-zinc-800 bg-card hover:border-zinc-900 dark:hover:border-zinc-100 hover:shadow-sm"
                          )}
                        >
                          {/* Badge de cantidad activa estilo ClaPos */}
                          {count > 0 && (
                            <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white text-[10px] font-bold shadow-xs animate-in zoom-in-75">
                              {count}
                            </span>
                          )}

                          {/* Imagen del producto */}
                          <div className="relative h-20 w-full rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 mb-2 flex items-center justify-center img-outline">
                            <img
                              src={prod.image}
                              alt={prod.name}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          </div>

                          <div>
                            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate" title={prod.name}>
                              {prod.name}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs font-extrabold text-zinc-950 dark:text-white">
                                ${prod.price.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-muted-foreground group-hover:text-zinc-950 dark:text-zinc-100 transition-colors font-medium">
                                + Agregar
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Panel Lateral Derecho: Detalle de la Orden (Order Details) */}
                <div className="lg:col-span-4 p-4 bg-zinc-50/60 dark:bg-zinc-900/60 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        Detalle de Orden
                      </p>
                      <span className="text-[11px] font-mono text-muted-foreground">#M-1042</span>
                    </div>

                    {/* Selector de servicio: Dine In vs Take Away */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-200/70 dark:bg-zinc-800 text-xs font-semibold mb-3">
                      <button
                        onClick={() => setMockOrderType("dine_in")}
                        className={cn(
                          "py-1 rounded-lg transition-all",
                          mockOrderType === "dine_in"
                            ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        En Sala
                      </button>
                      <button
                        onClick={() => setMockOrderType("take_away")}
                        className={cn(
                          "py-1 rounded-lg transition-all",
                          mockOrderType === "take_away"
                            ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Para Llevar
                      </button>
                    </div>

                    {/* Lista de artículos en la orden */}
                    <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                      {Object.keys(mockCart).length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          El pedido está vacío. Haz clic en un producto para agregarlo.
                        </div>
                      ) : (
                        Object.entries(mockCart).map(([id, qty]) => {
                          const prod = MOCK_PRODUCTS.find((p) => p.id === id)
                          if (!prod) return null
                          return (
                            <div key={id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg bg-white/70 dark:bg-zinc-800/70 border border-zinc-100 dark:border-zinc-800">
                              <div className="min-w-0 flex-1 pr-2">
                                <p className="font-semibold truncate text-zinc-800 dark:text-zinc-200">{prod.name}</p>
                                <span className="text-[10px] text-muted-foreground">x{qty} · ${(prod.price * qty).toFixed(2)}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeMockProduct(id)
                                }}
                                className="text-muted-foreground hover:text-zinc-950 dark:hover:text-white p-0.5"
                                title="Eliminar"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Totales y Botón de Cobro */}
                  <div className="pt-3 mt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span>${mockSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-zinc-900 dark:text-white">
                      <span>Total</span>
                      <span className="text-zinc-950 dark:text-white text-base font-black">
                        ${mockSubtotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleMockCheckout}
                        disabled={mockSubtotal === 0}
                        className="flex-1 rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 active:scale-[0.96] text-white font-bold text-xs h-9 shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        <ReceiptText className="h-3.5 w-3.5" />
                        Cobrar Orden (${mockSubtotal.toFixed(2)})
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearMockCart}
                        disabled={Object.keys(mockCart).length === 0}
                        className="text-xs text-muted-foreground hover:text-foreground h-9 px-2 active:scale-[0.96] transition-all cursor-pointer"
                        title="Vaciar orden"
                      >
                        Limpiar
                      </Button>
                    </div>
                  </div>

                </div>

              </div>

            </div>

            {/* Micro badges flotantes con métricas en las esquinas */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="hidden md:flex absolute -bottom-5 -left-4 items-center gap-2.5 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-3 shadow-xl ring-1 ring-zinc-900/10 dark:ring-white/10 hover:scale-105 transition-transform"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-zinc-900 dark:text-white">+38% Velocidad</p>
                <p className="text-[10px] text-muted-foreground">En atención en mostrador</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 }}
              className="hidden md:flex absolute -top-5 -right-4 items-center gap-2.5 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-3 shadow-xl ring-1 ring-zinc-900/10 dark:ring-white/10 hover:scale-105 transition-transform"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-zinc-900 dark:text-white">Caja 100% Cuadrada</p>
                <p className="text-[10px] text-muted-foreground">Arqueo automático sin pérdidas</p>
              </div>
            </motion.div>

          </motion.div>

        </motion.div>
      </section>

      {/* ========================================================= */}
      {/* 3. SOCIAL PROOF / LOGOS DE CONFIANZA                      */}
      {/* ========================================================= */}
      <section className="relative z-10 py-10 border-y border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 sm:px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-6">
            Con la confianza de cientos de comercios, minimarkets y droguerías en la región
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-90 hover:opacity-100 transition-opacity">
            {BRAND_LOGOS.map((brand, i) => (
              <div key={i} className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-bold text-sm tracking-tight">
                <span className="text-lg">{brand.icon}</span>
                <span>{brand.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3.1 DECLARACIÓN DE VALOR & 3 MICRO-CARACTERÍSTICAS         */}
      {/* ========================================================= */}
      <section className="relative z-10 py-20 sm:py-28 px-4 sm:px-6 max-w-6xl xl:max-w-7xl mx-auto text-center space-y-12">
        <div className="space-y-4 max-w-3xl mx-auto">
          <p className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-zinc-950 dark:text-white leading-[1.2] tracking-tight">
            Administra y optimiza{" "}
            <span className="text-zinc-950 dark:text-white font-black underline decoration-zinc-950/40 dark:decoration-white/40 decoration-4 underline-offset-4">
              las operaciones de tu negocio
            </span>{" "}
            con nuestra suite todo-en-uno.{" "}
            <span className="text-zinc-600 dark:text-zinc-400 font-medium">
              Simplifica flujos de caja, eleva la eficiencia diaria y enfócate en lo que verdaderamente importa.
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-left">
          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-400 dark:hover:border-zinc-600 transition-all space-y-2.5">
            <div className="h-10 w-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-2xs">
              <Zap className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-zinc-950 dark:text-white">Rapidez en Mostrador</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Cobro en menos de 3 segundos, lectura instantánea de códigos de barras e impresión térmica de recibos.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-400 dark:hover:border-zinc-600 transition-all space-y-2.5">
            <div className="h-10 w-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-2xs">
              <Layers className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-zinc-950 dark:text-white">Solución Todo-En-Uno</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Punto de venta, inventario con lotes, finanzas, domicilios y agentes IA en una arquitectura única y sincronizada.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-md hover:border-zinc-400 dark:hover:border-zinc-600 transition-all space-y-2.5">
            <div className="h-10 w-10 rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-2xs">
              <Users className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-base text-zinc-950 dark:text-white">Colaboración Multisede</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Permisos estrictos por rol (RBAC), control por sedes y tokens criptográficos para que cada sucursal opere segura.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3.2 SOLUCIÓN EN MÚLTIPLES ASPECTOS (ESTILO REFERENTE)      */}
      {/* ========================================================= */}
      <section className="relative z-10 py-12 sm:py-16 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-3xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-6 sm:p-12 shadow-sm space-y-10">
          
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white flex items-center justify-center gap-2">
              Solución en Múltiples{" "}
              <span className="inline-flex items-center justify-center h-7 w-7 sm:h-9 sm:w-9 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm align-middle text-xs font-bold">
                <Layers className="h-4 w-4" />
              </span>{" "}
              Aspectos
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Diseñado para simplificar todas las áreas críticas de tu empresa en una sola pantalla.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Tarjeta 1: Colaboradores & Arqueos */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
              <div className="p-4 rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <span>Colaboradores & Caja</span>
                  <Badge variant="outline" className="text-[10px] bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-white border-zinc-300 dark:border-zinc-700">
                    Turno Abierto
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center font-bold text-xs">
                    CG
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-900 dark:text-white">Carlos Gómez (Cajero)</p>
                    <p className="text-[10px] text-zinc-400">Sede Principal · Base: $100.000 COP</p>
                  </div>
                  <div className="ml-auto text-right">
                    <span className="text-xs font-black text-zinc-950 dark:text-zinc-100">$540.000 COP</span>
                    <p className="text-[9px] text-zinc-400">Efectivo en Gaveta</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Colaboradores & Sedes Blindadas</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mt-1">
                  Asigna sedes específicas a tus empleados, controla los límites de crédito autorizados y audita cada movimiento de dinero.
                </p>
              </div>
            </div>

            {/* Tarjeta 2: Finanzas & Utilidad Real */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-5">
              <div className="p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800/80 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <span>Métricas de Rentabilidad</span>
                  <span className="text-[10px] text-zinc-950 dark:text-zinc-100 font-bold">+18.4% vs mes ant.</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                    <span className="text-[10px] text-zinc-400">Ventas Totales</span>
                    <p className="font-black text-zinc-900 dark:text-white text-sm">$15.400.000</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                    <span className="text-[10px] text-zinc-400">Ganancia Neta Real</span>
                    <p className="font-black text-zinc-950 dark:text-zinc-100 text-sm">$4.350.000 (28.2%)</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Gestión Financiera & Margen Real</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mt-1">
                  Conoce cuánto dinero ganas realmente descontando el costo exacto de compra de cada producto vendido y los gastos de caja.
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 3.3 SIMPLIFICA TU PRODUCTIVIDAD (ECOSISTEMA & MCP)        */}
      {/* ========================================================= */}
      <section className="relative z-10 py-20 px-4 sm:px-6 text-center space-y-8">
        <div className="max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white flex items-center justify-center gap-2">
            Simplifica tu{" "}
            <span className="inline-flex items-center justify-center h-7 w-7 sm:h-9 sm:w-9 rounded-xl bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm align-middle text-xs font-bold">
              <Zap className="h-4 w-4 fill-white" />
            </span>{" "}
            Productividad con IA
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Conéctate nativamente con más de 10 plataformas y modelos de Inteligencia Artificial mediante el protocolo MCP.
          </p>
        </div>

        {/* Malla de Integraciones */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-3xl mx-auto">
          {[
            { name: "Claude Desktop", icon: "🧠" },
            { name: "Cursor IDE", icon: "⚡" },
            { name: "Antigravity", icon: "🚀" },
            { name: "WhatsApp Bot", icon: "💬" },
            { name: "Nequi & Daviplata", icon: "📱" },
            { name: "DIAN Facturación", icon: "📄" },
            { name: "Stripe & Tarjetas", icon: "💳" },
            { name: "Excel & CSV", icon: "📊" },
          ].map((item, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 shadow-2xs text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:scale-105 transition-transform"
            >
              <span>{item.icon}</span>
              <span>{item.name}</span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
          Soporte oficial de herramientas MCP (Model Context Protocol) para consultar stock, registrar abonos y obtener arqueos en lenguaje natural.
        </p>
      </section>

      {/* ========================================================= */}
      {/* 3.4 LO QUE DICEN NUESTROS CLIENTES (TESTIMONIAL ELEGANTE)  */}
      {/* ========================================================= */}
      <section className="relative z-10 py-16 sm:py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white flex items-center justify-center gap-2">
              Lo que Dicen{" "}
              <span className="inline-flex items-center justify-center h-6 w-6 sm:h-8 sm:w-8 rounded-xl bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-sm align-middle text-xs font-bold">
                <Star className="h-3.5 w-3.5 fill-white" />
              </span>{" "}
              de Nosotros
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Comercios y farmacias reales que operan su negocio a diario con OmniPOS.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            {/* Foto y perfil */}
            <div className="md:col-span-5 rounded-3xl overflow-hidden relative min-h-[220px] bg-zinc-900 flex flex-col justify-end p-5 text-white">
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80"
                alt="Alejandra Moreno"
                className="absolute inset-0 w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
              <div className="relative z-10 space-y-1">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-bold text-zinc-900 dark:text-white mb-1">
                  ⭐ 5.0 Excelente
                </div>
                <p className="font-bold text-sm">Alejandra Moreno</p>
                <p className="text-[11px] text-zinc-300">Gerente de Operaciones · Droguería Central</p>
              </div>
            </div>

            {/* Testimonio Card */}
            <div className="md:col-span-7 rounded-3xl bg-white/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800 p-6 sm:p-8 flex flex-col justify-between shadow-xs space-y-4">
              <div className="space-y-3">
                <div className="flex gap-1 text-zinc-950 dark:text-white">
                  <Star className="h-4 w-4 fill-zinc-950 dark:fill-white" />
                  <Star className="h-4 w-4 fill-zinc-950 dark:fill-white" />
                  <Star className="h-4 w-4 fill-zinc-950 dark:fill-white" />
                  <Star className="h-4 w-4 fill-zinc-950 dark:fill-white" />
                  <Star className="h-4 w-4 fill-zinc-950 dark:fill-white" />
                </div>
                <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                  "Una plataforma excepcional. Nos ayuda a <strong className="text-zinc-900 dark:text-white font-extrabold">administrar el inventario por lotes, ventas y turnos de caja sin pérdidas</strong> en una sola pantalla. La conexión con agentes de IA nos permite hacer arqueos diarios en segundos con solo enviar un mensaje."
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                <span>Cliente verificado en OmniPOS</span>
                <span className="font-semibold text-zinc-950 dark:text-white">Caso de Éxito →</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. SECCIÓN SPOTLIGHT DE CARACTERÍSTICAS (ESTILO CLAPOS)   */}
      {/* ========================================================= */}
      <section id="features" className="relative z-10 py-20 sm:py-28 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-extrabold tracking-widest text-zinc-950 dark:text-zinc-100 uppercase">
              CARACTERÍSTICAS OMNIPOS
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white mt-2">
              Revoluciona la Operación de tu Negocio
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed">
              Explora herramientas de vanguardia diseñadas para acelerar el cobro, evitar pérdidas por desabastecimiento y multiplicar tu rentabilidad diaria.
            </p>
          </div>

          {/* Feature 1: Inventory & Stock Management (Reproducción exacta del lado derecho de la imagen) */}
          <div className="grid lg:grid-cols-12 gap-10 items-center">
            
            {/* Columna izquierda: Información y Checklist */}
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100 dark:text-zinc-200 px-3 py-1 text-xs font-bold">
                <Package className="h-4 w-4" /> GESTIÓN INTELIGENTE
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white leading-tight">
                Control de Inventario y Almacén en Tiempo Real
              </h3>

              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Supervisa el nivel de tus existencias con datos precisos y actualizados al instante,
                previniendo quiebres de stock, sobreabastecimiento y mermas por vencimientos.
              </p>

              <button
                onClick={goLogin}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-950 dark:text-zinc-100 hover:text-zinc-950 dark:text-zinc-100 transition-colors"
              >
                Conocer Más <ArrowRight className="h-4 w-4" />
              </button>

              {/* Checklist con círculos verdes estilo ClaPos */}
              <div className="space-y-3.5 pt-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shrink-0 mt-0.5 shadow-xs">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">Seguimiento en Tiempo Real (Real-time Tracking)</p>
                    <p className="text-xs text-muted-foreground">Control por lotes, fechas de vencimiento y unidades fraccionadas (kg, metros, litros).</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shrink-0 mt-0.5 shadow-xs">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">Alertas Inteligentes (Smart Alerts)</p>
                    <p className="text-xs text-muted-foreground">Notificaciones tempranas cuando un producto alcance su stock mínimo o esté por caducar.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shrink-0 mt-0.5 shadow-xs">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">Ajustes Automáticos (Inventory Adjustments)</p>
                    <p className="text-xs text-muted-foreground">Entradas automáticas al recibir compras de proveedores y recálculo de costos promedio.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna derecha: Tarjeta visual de Dashboard (Donut chart & metrics como en la imagen) */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl ring-1 ring-zinc-900/10 dark:ring-white/10 space-y-5">
                
                {/* Métricas superiores simuladas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-3.5 border border-zinc-100 dark:border-zinc-800">
                    <span className="text-[11px] font-medium text-muted-foreground">Ingresos Totales</span>
                    <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">$348,005</p>
                    <span className="text-[10px] text-zinc-950 dark:text-zinc-100 font-bold">↑ +12.4% este mes</span>
                  </div>

                  <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-3.5 border border-zinc-100 dark:border-zinc-800">
                    <span className="text-[11px] font-medium text-muted-foreground">Total Clientes</span>
                    <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">50,921</p>
                    <span className="text-[10px] text-zinc-950 dark:text-zinc-100 font-bold">↑ +8.2% recurrentes</span>
                  </div>
                </div>

                {/* Donut Chart visual de estado de productos como en la imagen */}
                <div className="rounded-2xl border border-zinc-100 dark:border-zinc-800 p-4 bg-zinc-50/40 dark:bg-zinc-900/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Estado de Productos
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">61 Total</Badge>
                  </div>

                  <div className="flex items-center justify-around gap-4 py-2">
                    {/* Donut SVG gráfico elegante */}
                    <div className="relative flex items-center justify-center">
                      <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 36 36">
                        {/* Background circle */}
                        <path
                          className="text-zinc-100 dark:text-zinc-800"
                          strokeWidth="4"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        {/* Active products (Emerald) */}
                        <path
                          className="text-zinc-900 dark:text-zinc-200"
                          strokeDasharray="85, 100"
                          strokeWidth="4"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        {/* Draft/Low stock (Amber) */}
                        <path
                          className="text-zinc-950 dark:text-white"
                          strokeDasharray="10, 100"
                          strokeDashoffset="-85"
                          strokeWidth="4"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-lg font-black text-zinc-900 dark:text-white">61</span>
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Total</p>
                      </div>
                    </div>

                    {/* Leyenda con contadores */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950" />
                        <span className="text-muted-foreground">Activos</span>
                        <span className="font-bold ml-auto text-zinc-800 dark:text-white">52</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
                        <span className="text-muted-foreground">Inactivos</span>
                        <span className="font-bold ml-auto text-zinc-800 dark:text-white">7</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
                        <span className="text-muted-foreground">Por Agotar</span>
                        <span className="font-bold ml-auto text-zinc-800 dark:text-white">2</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista de Top Ventas simulada como en la imagen */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Artículos más vendidos hoy
                  </span>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 text-xs">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">1. Deluxe Cheeseburger</span>
                    <span className="font-extrabold text-zinc-950 dark:text-zinc-100">142 vendidos</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 text-xs">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">2. Combo Chicken & Fries</span>
                    <span className="font-extrabold text-zinc-950 dark:text-zinc-100">98 vendidos</span>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Feature 2: Arqueos de Caja y Punto de Venta */}
          <div className="grid lg:grid-cols-12 gap-10 items-center mt-20 sm:mt-28">
            
            {/* Visual a la izquierda */}
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-xl ring-1 ring-zinc-900/10 dark:ring-white/10 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-zinc-950 dark:text-zinc-100" />
                    <span className="font-bold text-sm">Resumen de Cuadre de Turno</span>
                  </div>
                  <Badge className="bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white text-[10px]">Caja Cuadrada</Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Efectivo Inicial en Caja:</span>
                    <span className="font-bold">$100,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Ventas en Efectivo (+):</span>
                    <span className="font-bold text-zinc-950 dark:text-zinc-100">$450,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Tarjetas y Transferencias:</span>
                    <span className="font-bold">$280,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Egresos menores autorizados (-):</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">-$25,000</span>
                  </div>
                  <div className="flex justify-between py-2 bg-zinc-100 dark:bg-zinc-900/70  px-3 rounded-xl text-sm font-extrabold text-zinc-950 dark:text-zinc-100">
                    <span>Efectivo Esperado en Gaveta:</span>
                    <span>$525,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 px-3 text-xs text-muted-foreground">
                    <span>Efectivo Físico Contado:</span>
                    <span className="font-bold text-foreground">$525,000 (Diferencia: $0.00)</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Impresión térmica compatible: 58mm y 80mm</span>
                  <span className="flex items-center gap-1 text-zinc-950 dark:text-zinc-100 font-semibold">
                    <Printer className="h-3.5 w-3.5" /> Ticket POS Listo
                  </span>
                </div>
              </div>
            </div>

            {/* Texto a la derecha */}
            <div className="lg:col-span-6 order-1 lg:order-2 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-zinc-100 dark:text-zinc-200 px-3 py-1 text-xs font-bold">
                <ReceiptText className="h-4 w-4" /> PUNTO DE VENTA Y CAJA
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white leading-tight">
                Cobro Ágil en Segundos y Cierre de Turno Blindado
              </h3>

              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Elimina las filas y evita los descuadres al final del día. Omnicanalidad total con cobros en efectivo, tarjetas, transferencias bancarias y fiados a clientes frecuentes.
              </p>

              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="h-2 w-2 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950" />
                  <span>Compatibilidad con lectores de código de barras USB y Bluetooth</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="h-2 w-2 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950" />
                  <span>Tickets con código QR, políticas de garantía e información tributaria</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="h-2 w-2 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950" />
                  <span>Módulo de Cuentas por Cobrar (Fiados) con registro de abonos parciales</span>
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={goLogin} className="rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white px-6">
                  Explorar Punto de Venta <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. SELECTOR DE RUBROS COMERCIALES INTERACTIVO             */}
      {/* ========================================================= */}
      <section id="rubros" className="relative z-10 py-20 sm:py-28 bg-zinc-50/70 dark:bg-zinc-950/60 border-y border-zinc-200/80 dark:border-zinc-800/80 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl xl:max-w-7xl">
          
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-zinc-950 dark:text-zinc-100 uppercase">
              MULTIRUBRO INTEGRADO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-white mt-1">
              Diseñado a la Medida de tu Tipo de Tienda
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2">
              Selecciona tu rubro y mira cómo el catálogo, unidades y alertas se adaptan al instante.
            </p>
          </div>

          {/* Pestañas de rubros */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-8 justify-start md:justify-center scroll-thin">
            {RUBRO_SHOWCASE.map((rubro, idx) => {
              const Icon = rubro.icon
              const active = selectedRubro === idx
              return (
                <button
                  key={rubro.id}
                  onClick={() => setSelectedRubro(idx)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer active:scale-[0.96]",
                    active
                      ? "text-white dark:text-zinc-950 shadow-md"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-950 dark:hover:border-white"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="activeRubroTab"
                      className="absolute inset-0 bg-zinc-950 dark:bg-white rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    />
                  )}
                  <Icon className="h-4 w-4 relative z-10" />
                  <span className="relative z-10">{rubro.name.split("&")[0]}</span>
                </button>
              )
            })}
          </div>

          {/* Contenido animado del rubro seleccionado */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRubroData.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="grid lg:grid-cols-12 gap-8 items-center bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm"
            >
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 px-3 py-1 text-xs font-bold border border-zinc-200 dark:border-zinc-700">
                  <activeRubroData.icon className="h-4 w-4" /> {activeRubroData.badge}
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white">
                  {activeRubroData.name}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {activeRubroData.description}
                </p>

                <div className="space-y-2 pt-2">
                  {activeRubroData.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs sm:text-sm">
                      <CheckCircle2 className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Button onClick={goLogin} className="rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white font-semibold shadow-xs">
                    Probar {activeRubroData.name.split("&")[0]} <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </div>

              {/* Catálogo de muestra del rubro */}
              <div className="lg:col-span-6">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 p-4 space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase">
                    <span>Catálogo de Muestra</span>
                    <Badge variant="outline" className="text-[10px] font-mono border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200">{activeRubroData.sampleProducts.length} Items</Badge>
                  </div>
                  {activeRubroData.sampleProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs text-xs">
                      <div>
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{p.name}</p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Unidad: {p.unit}</p>
                      </div>
                      <span className="font-black text-zinc-950 dark:text-white">{p.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 5.5 SECCIÓN DE AGENTES DE IA & SERVIDOR MCP (INNOVACIÓN)  */}
      {/* ========================================================= */}
      <section id="ia-mcp" className="py-20 sm:py-28 px-4 sm:px-6 relative overflow-hidden bg-zinc-50 dark:bg-zinc-950 border-y border-zinc-200 dark:border-zinc-800">
        <div className="absolute inset-0 bg-radial-[at_top_right] from-zinc-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="mx-auto max-w-6xl relative z-10">
          
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3.5 py-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              <Sparkles className="h-3.5 w-3.5 text-zinc-950 dark:text-white" />
              <span>Innovación: Model Context Protocol</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-zinc-950 dark:text-white">
              Tu POS Conectado a Agentes de IA en Tiempo Real
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-300 leading-relaxed">
              OmniPOS es el primer sistema de punto de venta con un <strong className="text-zinc-400">Servidor MCP nativo</strong>. Conéctalo a Claude Desktop, Cursor o tus propios asistentes para que consulten saldos, despachen pedidos o auditen la caja en lenguaje natural.
            </p>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-center">
            {/* Visual Chat Mockup */}
            <div className="lg:col-span-7 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7 shadow-2xl space-y-4 text-white">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-zinc-950 dark:bg-white flex items-center justify-center text-white dark:text-zinc-950 font-bold text-xs">
                    AI
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Agente Administrativo OmniPOS</p>
                    <p className="text-[10px] text-zinc-200 font-mono">● Conectado a base de datos (11 tools activas)</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-[10px]">
                  JSON-RPC 2.0 stdio
                </Badge>
              </div>

              {/* Conversación interactiva simulada */}
              <div className="space-y-3 font-mono text-xs">
                {/* Mensaje 1: Humano */}
                <div className="bg-zinc-800/80 p-3 rounded-2xl rounded-tr-xs text-zinc-200 max-w-md ml-auto border border-zinc-700/50">
                  <span className="text-zinc-700 dark:text-zinc-300 text-[10px] block font-sans font-bold mb-0.5">Administrador:</span>
                  "¿Cuánto vendimos hoy y cuánta plata en efectivo debe haber en la caja?"
                </div>

                {/* Mensaje 1: Respuesta Agente */}
                <div className="bg-zinc-950 p-3.5 rounded-2xl rounded-tl-xs text-zinc-300 max-w-lg border border-zinc-300 dark:border-zinc-700 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-sans font-bold">
                    <span>⚡ Ejecutó: pos_get_cash_status()</span>
                    <span className="text-zinc-500">· 2ms</span>
                  </div>
                  <p className="font-sans leading-relaxed text-xs">
                    Hoy se completaron <strong className="text-white">14 ventas</strong>. En efectivo ingresaron <strong className="text-zinc-200">$385.000 COP</strong> y la base inicial fue de <strong className="text-white">$100.000 COP</strong>. En la gaveta debe haber exactamente <strong className="text-zinc-200 font-bold">$485.000 COP</strong>.
                  </p>
                </div>

                {/* Mensaje 2: Humano */}
                <div className="bg-zinc-800/80 p-3 rounded-2xl rounded-tr-xs text-zinc-200 max-w-md ml-auto border border-zinc-700/50">
                  <span className="text-zinc-700 dark:text-zinc-300 text-[10px] block font-sans font-bold mb-0.5">Administrador:</span>
                  "Asigna el pedido PED-20261105-1001 al domiciliario Andrés y ponlo en camino."
                </div>

                {/* Mensaje 2: Respuesta Agente */}
                <div className="bg-zinc-950 p-3.5 rounded-2xl rounded-tl-xs text-zinc-300 max-w-lg border border-zinc-300 dark:border-zinc-700 space-y-2">
                  <div className="flex items-center gap-2 text-zinc-200 text-[10px] font-sans font-bold">
                    <span>✓ Ejecutó: pos_assign_order_driver(PED-1001, "Andrés")</span>
                  </div>
                  <p className="font-sans leading-relaxed text-xs">
                    Listo. El pedido <strong className="text-white">PED-20261105-1001</strong> fue asignado a <strong className="text-white">Andrés Repartidor</strong> y su estado cambió inmediatamente a <span className="text-zinc-200 font-bold">'en_camino'</span>.
                  </p>
                </div>
              </div>
            </div>

            {/* Beneficios & Call To Action */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-1.5">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-zinc-200 shrink-0" />
                    Sin interfaces complicadas
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Tú o tus supervisores pueden pedir información financiera, consultar inventario o registrar abonos simplemente enviando un mensaje de texto.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-1.5">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-zinc-200 shrink-0" />
                    11 Herramientas Oficiales
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Ventas del día, búsqueda de productos, despacho de repartidores, arqueo de gaveta, cobro de fiados y cálculo de rentabilidad neta.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-1.5">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-zinc-200 shrink-0" />
                    Compatible con Claude, Cursor y Antigravity
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Configuración en 1 solo clic copiando el bloque JSON provisto en nuestro portal de desarrolladores.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <Link
                  href="/docs"
                  className="w-full sm:w-auto px-6 py-3 rounded-full text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shadow-md flex items-center justify-center gap-2 transition-all hover:scale-105 cursor-pointer"
                >
                  <BookOpen className="h-4 w-4" />
                  Ver Guía y Documentación MCP
                </Link>
                <a
                  href="#credentials"
                  className="w-full sm:w-auto px-6 py-3 rounded-full text-xs font-semibold border border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  Probar Demo del POS
                </a>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. SECCIÓN DE PRECIOS (RÉPLICA FIEL DE LA IMAGEN DE CLAPOS)*/}
      {/* ========================================================= */}
      <section id="pricing" className="relative z-10 py-20 sm:py-28 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">

          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-zinc-950 dark:text-zinc-100 uppercase">
              PRECIOS TRANSPARENTES
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-white mt-1">
              Para Todo Tipo de Negocio
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Elige el plan ideal adaptado a tu volumen. Sin contratos forzosos ni comisiones ocultas por venta.
            </p>

            {/* Toggle de facturación mensual vs anual como en la imagen */}
            <div className="mt-8 inline-flex items-center p-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-xs font-bold">
              <button
                onClick={() => setAnnualBilling(false)}
                className={cn(
                  "px-4 py-2 rounded-full transition-all",
                  !annualBilling
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Mensual
              </button>
              <button
                onClick={() => setAnnualBilling(true)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full transition-all",
                  annualBilling
                    ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Anual</span>
                <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 text-[10px] font-extrabold px-2 py-0.5">
                  -24% Ahorro
                </span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Precios (Estilo exacto de ClaPos: Standard destacada en contraste + Premium) */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            
            {/* 1. Plan Starter */}
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
              <div>
                <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                  Básico
                </span>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white mt-1">Starter</h3>
                <p className="text-xs text-muted-foreground mt-1">Ideal para comercios unipersonales que inician.</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white">
                    ${annualBilling ? "11.39" : "14.99"}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">/Mes</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {annualBilling ? "Facturado anualmente ($136.68/año)" : "Facturado mes a mes"}
                </p>

                <Button
                  onClick={goLogin}
                  variant="outline"
                  className="w-full mt-6 rounded-full border-zinc-300 dark:border-zinc-700 hover:border-zinc-950 dark:border-white font-bold text-xs h-11"
                >
                  Comenzar Gratis
                </Button>

                <div className="mt-8 space-y-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>1 Punto de Venta en mostrador</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Hasta 500 productos y categorías</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Control de apertura y cierre de caja</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Impresión de tickets de 58mm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Plan Standard (Destacado como en la imagen de ClaPos: tarjeta oscura/verde de alto impacto con badge Popular) */}
            <div className="relative rounded-3xl border-2 border-zinc-950 dark:border-white bg-zinc-900 text-white p-6 sm:p-8 flex flex-col justify-between shadow-2xl shadow-zinc-950/20 scale-[1.03] z-10">
              
              {/* Badge Popular estilo ClaPos */}
              <div className="absolute -top-3.5 right-6 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white text-[11px] font-extrabold uppercase px-3 py-1 shadow-md">
                Popular
              </div>

              <div>
                <span className="text-xs font-extrabold uppercase text-zinc-200 tracking-wider">
                  Estándar
                </span>
                <h3 className="text-2xl font-black text-white mt-1">Standard Pro</h3>
                <p className="text-xs text-zinc-300 mt-1">
                  La solución ideal diseñada para negocios en expansión con alto flujo diario.
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">
                    ${annualBilling ? "22.79" : "29.99"}
                  </span>
                  <span className="text-xs text-zinc-400 font-semibold">/Mes</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {annualBilling ? "Facturado anualmente ($273.48/año)" : "Facturado mes a mes"}
                </p>

                <Button
                  onClick={goLogin}
                  className="w-full mt-6 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 hover:bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white font-extrabold text-xs h-11 shadow-lg shadow-md transition-transform hover:scale-[1.02]"
                >
                  Comenzar Ahora
                </Button>

                {/* Features con checks verdes exacto como en la imagen */}
                <div className="mt-8 space-y-3 text-xs text-zinc-200">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-zinc-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="font-semibold">Todo lo del Plan Básico</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-zinc-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Control de inventario avanzado y lotes</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-zinc-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Reportes detallados de ventas y rentabilidad</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-zinc-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Módulo de fiados / cuentas por cobrar</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 text-zinc-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Alertas inteligentes de stock mínimo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Plan Premium (Como en la imagen de ClaPos: tarjeta limpia blanca con $59.99/Month) */}
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
              <div>
                <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                  Avanzado
                </span>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white mt-1">Premium</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Específicamente diseñado para comercios con múltiples sedes o gran volumen.
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-zinc-900 dark:text-white">
                    ${annualBilling ? "45.59" : "59.99"}
                  </span>
                  <span className="text-xs text-muted-foreground font-semibold">/Mes</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {annualBilling ? "Facturado anualmente ($547.08/año)" : "Facturado mes a mes"}
                </p>

                <Button
                  onClick={goLogin}
                  variant="outline"
                  className="w-full mt-6 rounded-full border-zinc-300 dark:border-zinc-700 hover:border-zinc-950 dark:border-white font-bold text-xs h-11"
                >
                  Comenzar Ahora
                </Button>

                {/* Features list */}
                <div className="mt-8 space-y-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span className="font-semibold">Todo lo del Plan Estándar</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Soporte prioritario 24/7</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Soporte Multi-Sedes y Sucursales ilimitadas</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Analíticas avanzadas de rendimiento</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0" />
                    <span>Copias de seguridad automáticas en la nube</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 7. GUÍA INTERACTIVA DE OPERACIÓN (ADMIN VS VENDEDOR)      */}
      {/* ========================================================= */}
      <section id="guia" className="relative z-10 py-20 bg-zinc-50/70 dark:bg-zinc-900/40 border-y border-zinc-100 dark:border-zinc-900 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-xs font-extrabold tracking-widest text-zinc-950 dark:text-zinc-100 uppercase">
              FLUJO DE TRABAJO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white mt-1">
              ¿Cómo Operar el Sistema?
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Selecciona tu rol operativo para revisar el paso a paso de trabajo diario.
            </p>

            {/* Selector de rol */}
            <div className="mt-6 inline-flex rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1 shadow-xs">
              <button
                onClick={() => { setActiveRole("admin"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all",
                  activeRole === "admin" ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Shield className="h-3.5 w-3.5" /> Administrador
              </button>
              <button
                onClick={() => { setActiveRole("vendedor"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all",
                  activeRole === "vendedor" ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ShoppingCart className="h-3.5 w-3.5" /> Vendedor / Cajero
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 items-start">
            
            {/* Lista de pasos */}
            <div className="lg:col-span-5 space-y-2">
              {guide.map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 p-3 rounded-2xl border transition-all",
                    activeStep === idx
                      ? "border-zinc-950 dark:border-white bg-white dark:bg-zinc-900 shadow-md ring-1 ring-zinc-950 dark:ring-white/20"
                      : "border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 hover:border-zinc-900 dark:hover:border-zinc-100"
                  )}
                >
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                    activeStep === idx ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-muted-foreground"
                  )}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-xs font-bold truncate", activeStep === idx ? "text-zinc-900 dark:text-white" : "text-zinc-600 dark:text-zinc-400")}>
                      {step.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{step.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Detalle ampliado del paso activo */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shrink-0">
                    <currentStep.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-zinc-950 dark:text-zinc-100 uppercase">
                      Paso {activeStep + 1} de {guide.length}
                    </span>
                    <h3 className="text-xl font-black text-zinc-900 dark:text-white mt-0.5">
                      {currentStep.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{currentStep.desc}</p>
                  </div>
                </div>

                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed pt-2">
                  {currentStep.detail}
                </p>

                <div className="flex items-center justify-between pt-6 border-t border-zinc-100 dark:border-zinc-800">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                    className="rounded-full text-xs"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Anterior
                  </Button>

                  <span className="text-xs text-muted-foreground font-mono">
                    {activeStep + 1} / {guide.length}
                  </span>

                  {activeStep < guide.length - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => setActiveStep((s) => Math.min(guide.length - 1, s + 1))}
                      className="rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white text-xs font-bold"
                    >
                      Siguiente <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={goLogin}
                      className="rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white text-xs font-bold"
                    >
                      ¡Iniciar Prueba! <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 8. CREDENCIALES DE DEMO RÁPIDO (1-CLIC DIRECTO)           */}
      {/* ========================================================= */}
      <section id="credentials" className="relative z-10 py-20 sm:py-24 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-zinc-950 dark:text-zinc-100 uppercase">
              ACCESO INMEDIATO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white mt-1">
              Prueba el Sistema en Vivo
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Haz clic en cualquiera de las 3 cuentas de prueba para ingresar instantáneamente con su rol.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Cuenta Admin */}
            <div className="rounded-3xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/40  p-6 flex flex-col justify-between hover:border-zinc-950 dark:border-white/60 transition-all hover:shadow-lg  group">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white shadow-md">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-zinc-900 dark:text-white">Administrador</h4>
                    <p className="text-xs text-muted-foreground">Inventario, compras, finanzas y reportes</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-3">
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-muted-foreground">Usuario:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-bold text-zinc-800 dark:text-zinc-200">admin</code>
                      <button
                        onClick={() => copyToClipboard("admin", "admin-user")}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-950 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Copiar usuario"
                      >
                        {copiedKey === "admin-user" ? <CheckCheck className="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-100" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-muted-foreground">PIN:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-bold text-zinc-950 dark:text-zinc-100">1234</code>
                      <button
                        onClick={() => copyToClipboard("1234", "admin-pin")}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-950 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Copiar PIN"
                      >
                        {copiedKey === "admin-pin" ? <CheckCheck className="h-3.5 w-3.5 text-zinc-950 dark:text-zinc-100" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleQuickLogin("admin", "1234")}
                disabled={loggingIn === "admin"}
                className="w-full mt-5 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white font-bold text-xs h-10 shadow-sm active:scale-[0.96] transition-all cursor-pointer"
              >
                {loggingIn === "admin" ? "Iniciando..." : "Ingresar como Admin (1-Clic)"}
              </Button>
            </div>

            {/* Cuenta Vendedor */}
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-600 transition-all hover:shadow-lg group">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-zinc-900 dark:text-white">Vendedor / Cajero</h4>
                    <p className="text-xs text-muted-foreground">Punto de venta, caja y arqueos</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-3">
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-muted-foreground">Usuario:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-bold text-zinc-800 dark:text-zinc-200">vendedor</code>
                      <button
                        onClick={() => copyToClipboard("vendedor", "vendedor-user")}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Copiar usuario"
                      >
                        {copiedKey === "vendedor-user" ? <CheckCheck className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-muted-foreground">PIN:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-bold text-zinc-900 dark:text-zinc-100">0000</code>
                      <button
                        onClick={() => copyToClipboard("0000", "vendedor-pin")}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Copiar PIN"
                      >
                        {copiedKey === "vendedor-pin" ? <CheckCheck className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-100" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleQuickLogin("vendedor", "0000")}
                disabled={loggingIn === "vendedor"}
                className="w-full mt-5 rounded-full bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-white font-bold text-xs h-10 shadow-sm active:scale-[0.96] transition-all cursor-pointer"
              >
                {loggingIn === "vendedor" ? "Iniciando..." : "Ingresar como Vendedor (1-Clic)"}
              </Button>
            </div>

            {/* Cuenta Superadmin */}
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-6 flex flex-col justify-between hover:border-zinc-400 dark:hover:border-zinc-600 transition-all hover:shadow-lg group sm:col-span-2 lg:col-span-1">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md">
                    <Crown className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-base text-zinc-900 dark:text-white">Superadmin</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-white dark:text-zinc-900 dark:text-white">
                        Maestro
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Acceso global y control maestro</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-3">
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-muted-foreground">Usuario:</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <code className="font-mono font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[130px]">kaledmoly@gmail.com</code>
                      <button
                        onClick={() => copyToClipboard("kaledmoly@gmail.com", "super-user")}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Copiar usuario"
                      >
                        {copiedKey === "super-user" ? <CheckCheck className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <span className="text-muted-foreground">PIN:</span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-bold text-zinc-900 dark:text-zinc-200">9999</code>
                      <button
                        onClick={() => copyToClipboard("9999", "super-pin")}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Copiar PIN"
                      >
                        {copiedKey === "super-pin" ? <CheckCheck className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleQuickLogin("kaledmoly@gmail.com", "9999")}
                disabled={loggingIn === "kaledmoly@gmail.com"}
                className="w-full mt-5 rounded-full bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white font-bold text-xs h-10 shadow-sm active:scale-[0.96] transition-all cursor-pointer"
              >
                {loggingIn === "kaledmoly@gmail.com" ? "Iniciando..." : "Ingresar como Superadmin (1-Clic)"}
              </Button>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 9. PREGUNTAS FRECUENTES (FAQ ACORDEÓN)                    */}
      {/* ========================================================= */}
      <section id="faq" className="relative z-10 py-20 bg-zinc-50/70 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-900 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-zinc-950 dark:text-zinc-100 uppercase">
              RESOLVEMOS TUS DUDAS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white mt-1">
              Preguntas Frecuentes
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Todo lo que necesitas saber antes de empezar a operar con OmniPOS.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: "¿Qué dispositivos necesito para usar el sistema?",
                a: "OmniPOS es 100% web y responsivo. Puedes usarlo en cualquier computadora con Windows, Mac, Linux, tablet Android/iPad o teléfono móvil. Es compatible con lectores de código de barras USB/Bluetooth e impresoras térmicas de 58mm y 80mm.",
              },
              {
                q: "¿Cómo se manejan los arqueos de caja y los descuadres?",
                a: "El sistema registra de forma automática la apertura, los ingresos y egresos, y todas las ventas en efectivo, tarjeta o crédito. Al cerrar turno, calcula el efectivo esperado y lo compara con el dinero físico que declaras, detectando cualquier faltante o sobrante con precisión.",
              },
              {
                q: "¿Puedo vender a crédito (fiados) y controlar la deuda?",
                a: "Sí. Cuenta con un módulo de Cuentas por Cobrar donde puedes asignar límites de crédito a clientes, ver su saldo pendiente, imprimir comprobantes de deuda y registrar abonos parciales o totales.",
              },
              {
                q: "¿Mis datos están seguros ante fallas de mi equipo?",
                a: "Completamente. La información se almacena en base de datos en la nube de alta disponibilidad. Además, desde el panel de Configuración puedes generar y descargar respaldos (backups) completos de tus datos con un solo clic.",
              },
              {
                q: "¿Puedo cambiar entre rubros (ej. de tienda a droguería o ferretería)?",
                a: "Sí. En cualquier momento desde la Configuración puedes cambiar el rubro de tu establecimiento. El sistema adaptará automáticamente los campos y controles (como control de lotes y fechas de vencimiento en droguerías).",
              },
            ].map((faq, idx) => {
              const isOpen = expandedFaq === idx
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden transition-all shadow-xs"
                >
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 font-bold text-sm text-zinc-900 dark:text-white cursor-pointer select-none hover:text-zinc-950 dark:text-zinc-100 dark:hover:text-zinc-200 transition-colors"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={cn("h-4 w-4 text-zinc-950 dark:text-zinc-100 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 10. BANNER FINAL DE LLAMADO A LA ACCIÓN (ESTILO REFERENTE) */}
      {/* ========================================================= */}
      <section className="relative z-10 py-16 sm:py-24 px-4 sm:px-6 overflow-hidden">
        <div className="mx-auto max-w-5xl rounded-3xl bg-zinc-950 text-white p-8 sm:p-14 shadow-2xl relative border border-zinc-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 max-w-xl text-left">
              <span className="rounded-full bg-white/10 text-zinc-300 border border-white/10 text-[10px] font-bold uppercase px-3 py-1 inline-block">
                Comienza en Menos de 2 Minutos
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                ¿Listo para simplificar las operaciones de tu negocio hoy?
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                Únete a cientos de comercios y farmacias que ya aceleraron sus ventas y eliminaron los descuadres de caja con OmniPOS.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <Button
                size="lg"
                onClick={goLogin}
                className="w-full sm:w-auto h-12 px-8 rounded-full text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-100 shadow-md hover:scale-105 active:scale-[0.96] transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Comenzar Ahora</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 11. FOOTER SAAS COMPLETO MULTICOLUMNA PROFESIONAL         */}
      {/* ========================================================= */}
      <footer className="relative z-10 border-t border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-black text-zinc-600 dark:text-zinc-400 py-16 px-4 sm:px-6 text-xs overflow-hidden">
        {/* Marca de Agua Gigante en el fondo (como en la imagen de referencia) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none select-none text-[110px] sm:text-[180px] font-black text-zinc-900/[0.02] dark:text-white/[0.02] tracking-tighter z-0">
          OMNIPOS
        </div>

        <div className="mx-auto max-w-6xl space-y-12 relative z-10">
          
          {/* Fila Principal de 5 Columnas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            
            {/* Columna 1: Marca & Visión */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 dark:bg-white text-white font-bold shadow-md shadow-sm">
                  <Zap className="h-5 w-5 fill-white" />
                </div>
                <div>
                  <p className="font-extrabold text-base text-white tracking-tight">OmniPOS</p>
                  <p className="text-[11px] text-zinc-200 font-mono">Punto de Venta & Marketplace v2.0</p>
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
                Plataforma integral de punto de venta, inventarios con control de vencimiento, arqueo de caja y domicilios para droguerías, minimarkets y retail, conectada de fábrica a Agentes de Inteligencia Artificial mediante el protocolo MCP.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950 dark:bg-white dark:text-zinc-950/10 border border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-200 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse" />
                  Sistemas 99.9% Uptime
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-700 dark:text-zinc-300 font-medium">
                  <Sparkles className="h-3 w-3 text-zinc-400" />
                  Servidor MCP Activo
                </span>
              </div>
            </div>

            {/* Columna 2: Módulos del Sistema */}
            <div className="space-y-3">
              <p className="font-bold text-xs uppercase tracking-wider text-white">Módulos POS</p>
              <ul className="space-y-2 text-xs">
                <li><a href="#features" className="hover:text-zinc-200 transition-colors">Terminal de Caja Rápida</a></li>
                <li><a href="#features" className="hover:text-zinc-200 transition-colors">Inventario & Vencimientos</a></li>
                <li><a href="#features" className="hover:text-zinc-200 transition-colors">Arqueo & Sesiones de Caja</a></li>
                <li><a href="#features" className="hover:text-zinc-200 transition-colors">Cuentas por Cobrar (Fiados)</a></li>
                <li><a href="#features" className="hover:text-zinc-200 transition-colors">Despacho de Domicilios</a></li>
                <li><a href="#features" className="hover:text-zinc-200 transition-colors">App Preventa Móvil</a></li>
              </ul>
            </div>

            {/* Columna 3: Rubros Soportados */}
            <div className="space-y-3">
              <p className="font-bold text-xs uppercase tracking-wider text-white">Sectores</p>
              <ul className="space-y-2 text-xs">
                <li><a href="#rubros" className="hover:text-zinc-200 transition-colors">Droguerías & Farmacias</a></li>
                <li><a href="#rubros" className="hover:text-zinc-200 transition-colors">Minimarkets & Abarrotes</a></li>
                <li><a href="#rubros" className="hover:text-zinc-200 transition-colors">Ferreterías & Materiales</a></li>
                <li><a href="#rubros" className="hover:text-zinc-200 transition-colors">Tiendas de Ropa & Calzado</a></li>
                <li><a href="#rubros" className="hover:text-zinc-200 transition-colors">Comercio General & Retail</a></li>
              </ul>
            </div>

            {/* Columna 4: Desarrolladores & IA */}
            <div className="space-y-3">
              <p className="font-bold text-xs uppercase tracking-wider text-white">Desarrolladores & IA</p>
              <ul className="space-y-2 text-xs">
                <li><Link href="/docs" className="hover:text-zinc-950 dark:hover:text-white transition-colors flex items-center gap-1"><span>Portal API REST</span><ExternalLink className="h-3 w-3" /></Link></li>
                <li><Link href="/docs" className="hover:text-zinc-950 dark:hover:text-white transition-colors flex items-center gap-1"><span>Servidor MCP Oficial</span><Sparkles className="h-3 w-3 text-zinc-400" /></Link></li>
                <li><Link href="/docs" className="hover:text-zinc-950 dark:hover:text-white transition-colors">Guía Claude & Cursor</Link></li>
                <li><a href="/api/v1/openapi.json" target="_blank" className="hover:text-zinc-950 dark:hover:text-white transition-colors">OpenAPI Spec JSON</a></li>
                <li><Link href="/docs" className="hover:text-zinc-950 dark:hover:text-white transition-colors">Rate Limiting (80 req/min)</Link></li>
              </ul>
            </div>

          </div>

          {/* Fila de Accesos Rápidos */}
          <div className="pt-6 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-4 text-zinc-400">
              <a href="#home" className="hover:text-white transition-colors">Inicio</a>
              <span>•</span>
              <a href="#pricing" className="hover:text-white transition-colors">Planes y Precios</a>
              <span>•</span>
              <a href="#credentials" className="hover:text-white transition-colors">Acceso Demo (1-Clic)</a>
              <span>•</span>
              <a href="#faq" className="hover:text-white transition-colors">Preguntas Frecuentes</a>
              <span>•</span>
              <a href="https://wa.me/573000000000" target="_blank" rel="noreferrer" className="text-zinc-200 hover:underline">Soporte WhatsApp</a>
            </div>

            <Button
              onClick={goLogin}
              size="sm"
              className="rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 text-white font-bold text-xs h-8 px-4"
            >
              Acceder al Punto de Venta
            </Button>
          </div>

          {/* Fila Inferior de Copyright y Legal */}
          <div className="pt-6 border-t border-zinc-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-zinc-500">
            <p>© {new Date().getFullYear()} OmniPOS All-In-One Enterprise Platform. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4">
              <span>Modo Oscuro Nativo</span>
              <span>•</span>
              <span>Cumplimiento Estándar DIAN</span>
              <span>•</span>
              <span>Seguridad de Datos SSL</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  )
}


