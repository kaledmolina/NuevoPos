"use client"

import { useState, useMemo, useEffect } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
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
  Flame, Percent, CircleCheck, Star, ExternalLink, RefreshCw, Zap
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

  // Menú móvil y scroll
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
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

  const toggleMockProduct = (id: string) => {
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

  const clearMockCart = () => setMockCart({})

  const guide = activeRole === "admin" ? ADMIN_GUIDE : VENDEDOR_GUIDE
  const currentStep = guide[activeStep]
  const activeRubroData = RUBRO_SHOWCASE[selectedRubro]

  const NAV_ITEMS = [
    { id: "home", label: "Inicio", href: "#home" },
    { id: "features", label: "Características", href: "#features" },
    { id: "rubros", label: "Rubros", href: "#rubros" },
    { id: "pricing", label: "Precios", href: "#pricing" },
    { id: "guia", label: "Cómo Funciona", href: "#guia" },
    { id: "credentials", label: "Acceso Demo", href: "#credentials" },
  ]

  return (
    <div className="min-h-screen bg-[#FBFDFB] dark:bg-slate-950 text-foreground selection:bg-emerald-500/20 selection:text-emerald-700">
      
      {/* Background soft ambient glows inspirados en el diseño de ClaPos */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-emerald-400/10 dark:bg-emerald-500/5 blur-[120px]" />
        <div className="absolute top-48 right-0 w-[500px] h-[500px] rounded-full bg-teal-300/10 dark:bg-teal-500/5 blur-[130px]" />
        <div className="absolute top-[1200px] left-1/4 w-[700px] h-[700px] rounded-full bg-emerald-500/5 blur-[150px]" />
      </div>

      {/* ========================================================= */}
      {/* 1. HEADER / NAVBAR COMPLETO & ELEGANTE ESTILO CLAPOS      */}
      {/* ========================================================= */}
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-all duration-200 border-b",
          isScrolled
            ? "bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-slate-200/80 dark:border-slate-800 shadow-xs"
            : "bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-slate-200/50 dark:border-slate-800/50"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-8 h-18 sm:h-20 flex items-center justify-between">
          
          {/* Logo y Marca */}
          <a
            href="#home"
            className="flex items-center gap-2.5 cursor-pointer group select-none"
          >
            <motion.div
              whileHover={{ rotate: 12, scale: 1.08 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20"
            >
              <Zap className="h-5 w-5 fill-white" />
            </motion.div>
            <div className="flex flex-col">
              <span className="font-black text-lg sm:text-xl tracking-tight leading-none text-slate-900 dark:text-white">
                Omni<span className="text-emerald-600 dark:text-emerald-400">POS</span>
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                All-In-One Business
              </span>
            </div>
          </a>

          {/* Navegación central limpia y elegante (Idéntica a ClaPos) */}
          <nav className="hidden md:flex items-center gap-8 lg:gap-10">
            {NAV_ITEMS.map((item) => {
              const isActive = activeNav === item.id

              return (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={() => setActiveNav(item.id)}
                  className={cn(
                    "relative py-2 text-sm font-semibold transition-colors select-none",
                    isActive
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                  )}
                >
                  {item.label}

                  {/* Indicador inferior animado estilo ClaPos */}
                  {isActive && (
                    <motion.span
                      layoutId="activeNavIndicator"
                      className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-emerald-500 rounded-full"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                </a>
              )
            })}
          </nav>

          {/* Acciones de la derecha */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <ThemeToggle />

            {/* Botón Login Pill estilizado como en ClaPos */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={goLogin}
              className="rounded-full border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 px-5 py-2 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-500 hover:text-emerald-600 transition-all shadow-2xs"
            >
              Iniciar Sesión
            </motion.button>

            {/* Botón CTA Verde Esmeralda */}
            <motion.div
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="hidden sm:block"
            >
              <Button
                size="sm"
                onClick={goLogin}
                className="rounded-full px-5 py-2 text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 transition-all h-9"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Probar Gratis
              </Button>
            </motion.div>

            {/* Botón de Menú móvil */}
            <button
              className="md:hidden p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menú de navegación"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <X className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Menu className="h-5 w-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>

        {/* Menú móvil desplegable fluido */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl px-5 py-4 space-y-1.5"
            >
              {NAV_ITEMS.map((item, i) => (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    setActiveNav(item.id)
                    setMobileMenuOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                    activeNav === item.id
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
                  )}
                >
                  <span>{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-emerald-600" />
                </a>
              ))}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                <Button
                  onClick={goLogin}
                  className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10"
                >
                  Acceder al Sistema
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ========================================================= */}
      {/* 2. HERO SECTION CON MOCKUP INTERACTIVO ESTILO CLAPOS      */}
      {/* ========================================================= */}
      <section id="home" className="relative pt-10 sm:pt-16 pb-20 sm:pb-32 px-4 sm:px-6 overflow-hidden">
        <div className="mx-auto max-w-6xl text-center">

          {/* Badge Pill "Nuevo" */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/40 px-3.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shadow-xs mb-6"
          >
            <span className="rounded-full bg-emerald-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Nuevo
            </span>
            <span>Transacciones y control sin fricción para tu comercio</span>
          </motion.div>

          {/* Headline estilo ClaPos */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl mx-auto leading-[1.15]"
          >
            Tu Solución{" "}
            <span className="text-emerald-600 dark:text-emerald-400 underline decoration-emerald-300/40 decoration-wavy decoration-2">
              Todo-En-Uno
            </span>
            <br />
            para Hacer Crecer tu Negocio
          </motion.h1>

          {/* Subtítulo descriptivo */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-base sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed"
          >
            Nuestra solución ofrece una suite integral de herramientas para administrar tu inventario,
            acelerar las ventas en mostrador y potenciar la experiencia de tus clientes.
          </motion.p>

          {/* Botones de acción principales (Pill buttons estilo ClaPos) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5"
          >
            <Button
              size="lg"
              onClick={goLogin}
              className="w-full sm:w-auto h-12 px-8 rounded-full text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/30 hover:shadow-emerald-600/40 transition-all hover:scale-105 active:scale-95"
            >
              Comenzar Ahora
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                const el = document.getElementById("mockup-interactive")
                el?.scrollIntoView({ behavior: "smooth" })
              }}
              className="w-full sm:w-auto h-12 px-8 rounded-full text-base font-medium border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xs hover:border-emerald-500 hover:text-emerald-600 transition-colors"
            >
              <Play className="h-4 w-4 mr-2 fill-emerald-600 text-emerald-600" />
              Ver Demostración
            </Button>
          </motion.div>

          {/* ========================================================= */}
          {/* MOCKUP INTERACTIVO CENTRAL (RÉPLICA EXACTA DE LA IMAGEN)  */}
          {/* ========================================================= */}
          <motion.div
            id="mockup-interactive"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="mt-14 relative mx-auto max-w-5xl text-left"
          >
            {/* Glow sutil debajo del contenedor del mockup */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-emerald-500/20 blur-xl opacity-75 -z-10" />

            <div className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl shadow-emerald-950/10 overflow-hidden ring-1 ring-emerald-500/10">
              
              {/* Header del Mockup */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/80">
                <div className="flex items-center gap-3">
                  <button className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-white">
                    <Menu className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-emerald-600 fill-emerald-600" />
                    <span className="font-bold text-sm tracking-tight text-slate-800 dark:text-white">OmniPOS</span>
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
                    className="w-full rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Acciones de cabecera como en la imagen */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-emerald-400 cursor-pointer">
                    <Users className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Cliente</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-emerald-400 cursor-pointer">
                    <Layers className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Mesas</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-emerald-400 cursor-pointer">
                    <Percent className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Descuento</span>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-emerald-400 cursor-pointer">
                    <HardDrive className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Guardar</span>
                  </div>
                </div>
              </div>

              {/* Cuerpo del Mockup: Categorías + Catálogo + Detalle de Orden */}
              <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
                
                {/* 1. Categorías laterales izquierdas (exacto como en la imagen) */}
                <div className="lg:col-span-2 p-3 bg-slate-50/40 dark:bg-slate-900/40 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible">
                  <button
                    onClick={() => setMockCategory("all")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all text-left",
                      mockCategory === "all"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
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
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
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
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
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
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
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
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                    )}
                  >
                    <Coffee className="h-3.5 w-3.5 shrink-0" />
                    <span>Café & Postres</span>
                  </button>
                </div>

                {/* 2. Cuadrícula de Productos Central */}
                <div className="lg:col-span-6 p-4 bg-white dark:bg-slate-900">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Productos ({filteredProducts.length}) · Haz clic para agregar
                    </p>
                    <span className="text-[11px] text-emerald-600 font-medium">Demostración en Vivo</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {filteredProducts.map((prod) => {
                      const count = mockCart[prod.id] || 0
                      return (
                        <div
                          key={prod.id}
                          onClick={() => toggleMockProduct(prod.id)}
                          className={cn(
                            "relative group rounded-xl border p-2.5 transition-all cursor-pointer select-none flex flex-col justify-between",
                            count > 0
                              ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs"
                              : "border-slate-200/90 dark:border-slate-800 bg-card hover:border-emerald-300 hover:shadow-xs"
                          )}
                        >
                          {/* Badge de cantidad activa estilo ClaPos */}
                          {count > 0 && (
                            <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold shadow-xs animate-in zoom-in-75">
                              {count}
                            </span>
                          )}

                          {/* Imagen del producto */}
                          <div className="relative h-20 w-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2 flex items-center justify-center">
                            <img
                              src={prod.image}
                              alt={prod.name}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={prod.name}>
                              {prod.name}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                                ${prod.price.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-muted-foreground group-hover:text-emerald-600 transition-colors">
                                + Agregar
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Panel Lateral Derecho: Detalle de la Orden (Order Details) */}
                <div className="lg:col-span-4 p-4 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Detalle de Orden
                      </p>
                      <span className="text-[11px] font-mono text-muted-foreground">#M-1042</span>
                    </div>

                    {/* Selector de servicio: Dine In vs Take Away */}
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-xs font-semibold mb-3">
                      <button
                        onClick={() => setMockOrderType("dine_in")}
                        className={cn(
                          "py-1 rounded-lg transition-all",
                          mockOrderType === "dine_in"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
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
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
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
                            <div key={id} className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg bg-white/70 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800">
                              <div className="min-w-0 flex-1 pr-2">
                                <p className="font-semibold truncate text-slate-800 dark:text-slate-200">{prod.name}</p>
                                <span className="text-[10px] text-muted-foreground">x{qty} · ${(prod.price * qty).toFixed(2)}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeMockProduct(id)
                                }}
                                className="text-muted-foreground hover:text-red-500 p-0.5"
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
                  <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span>${mockSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white">
                      <span>Total</span>
                      <span className="text-emerald-600 dark:text-emerald-400 text-base font-black">
                        ${mockSubtotal.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={goLogin}
                        className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 shadow-sm"
                      >
                        Cobrar Orden (${mockSubtotal.toFixed(2)})
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearMockCart}
                        className="text-xs text-muted-foreground hover:text-foreground h-9 px-2"
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
            <div className="hidden md:flex absolute -bottom-5 -left-4 items-center gap-2 rounded-2xl border border-emerald-500/20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 shadow-xl ring-1 ring-emerald-500/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">+38% Velocidad</p>
                <p className="text-[10px] text-muted-foreground">En atención en mostrador</p>
              </div>
            </div>

            <div className="hidden md:flex absolute -top-5 -right-4 items-center gap-2 rounded-2xl border border-emerald-500/20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 shadow-xl ring-1 ring-emerald-500/10">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">Caja 100% Cuadrada</p>
                <p className="text-[10px] text-muted-foreground">Arqueo automático sin pérdidas</p>
              </div>
            </div>

          </motion.div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. SOCIAL PROOF / LOGOS DE CONFIANZA (ESTILO CLAPOS)      */}
      {/* ========================================================= */}
      <section className="py-10 border-y border-slate-100 dark:border-slate-900 bg-white/50 dark:bg-slate-950/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-6">
            Con la confianza de miles de comercios, minimarkets y emprendedores en la región
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-70 hover:opacity-90 transition-opacity">
            {BRAND_LOGOS.map((brand, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold text-sm tracking-tight">
                <span className="text-lg">{brand.icon}</span>
                <span>{brand.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. SECCIÓN SPOTLIGHT DE CARACTERÍSTICAS (ESTILO CLAPOS)   */}
      {/* ========================================================= */}
      <section id="features" className="py-20 sm:py-28 px-4 sm:px-6 relative">
        <div className="mx-auto max-w-6xl">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-extrabold tracking-widest text-emerald-600 uppercase">
              CARACTERÍSTICAS OMNIPOS
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-2">
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
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-bold">
                <Package className="h-4 w-4" /> GESTIÓN INTELIGENTE
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                Control de Inventario y Almacén en Tiempo Real
              </h3>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Supervisa el nivel de tus existencias con datos precisos y actualizados al instante,
                previniendo quiebres de stock, sobreabastecimiento y mermas por vencimientos.
              </p>

              <button
                onClick={goLogin}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                Conocer Más <ArrowRight className="h-4 w-4" />
              </button>

              {/* Checklist con círculos verdes estilo ClaPos */}
              <div className="space-y-3.5 pt-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0 mt-0.5 shadow-xs">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Seguimiento en Tiempo Real (Real-time Tracking)</p>
                    <p className="text-xs text-muted-foreground">Control por lotes, fechas de vencimiento y unidades fraccionadas (kg, metros, litros).</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0 mt-0.5 shadow-xs">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Alertas Inteligentes (Smart Alerts)</p>
                    <p className="text-xs text-muted-foreground">Notificaciones tempranas cuando un producto alcance su stock mínimo o esté por caducar.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0 mt-0.5 shadow-xs">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Ajustes Automáticos (Inventory Adjustments)</p>
                    <p className="text-xs text-muted-foreground">Entradas automáticas al recibir compras de proveedores y recálculo de costos promedio.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Columna derecha: Tarjeta visual de Dashboard (Donut chart & metrics como en la imagen) */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-emerald-500/10 space-y-5">
                
                {/* Métricas superiores simuladas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-medium text-muted-foreground">Ingresos Totales</span>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">$348,005</p>
                    <span className="text-[10px] text-emerald-600 font-bold">↑ +12.4% este mes</span>
                  </div>

                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] font-medium text-muted-foreground">Total Clientes</span>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">50,921</p>
                    <span className="text-[10px] text-emerald-600 font-bold">↑ +8.2% recurrentes</span>
                  </div>
                </div>

                {/* Donut Chart visual de estado de productos como en la imagen */}
                <div className="rounded-2xl border border-slate-100 dark:border-slate-800 p-4 bg-slate-50/40 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
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
                          className="text-slate-100 dark:text-slate-800"
                          strokeWidth="4"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        {/* Active products (Emerald) */}
                        <path
                          className="text-emerald-500"
                          strokeDasharray="85, 100"
                          strokeWidth="4"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        {/* Draft/Low stock (Amber) */}
                        <path
                          className="text-amber-400"
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
                        <span className="text-lg font-black text-slate-900 dark:text-white">61</span>
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Total</p>
                      </div>
                    </div>

                    {/* Leyenda con contadores */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-muted-foreground">Activos</span>
                        <span className="font-bold ml-auto text-slate-800 dark:text-white">52</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                        <span className="text-muted-foreground">Inactivos</span>
                        <span className="font-bold ml-auto text-slate-800 dark:text-white">7</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <span className="text-muted-foreground">Por Agotar</span>
                        <span className="font-bold ml-auto text-slate-800 dark:text-white">2</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista de Top Ventas simulada como en la imagen */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Artículos más vendidos hoy
                  </span>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">1. Deluxe Cheeseburger</span>
                    <span className="font-extrabold text-emerald-600">142 vendidos</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">2. Combo Chicken & Fries</span>
                    <span className="font-extrabold text-emerald-600">98 vendidos</span>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Feature 2: Arqueos de Caja y Punto de Venta */}
          <div className="grid lg:grid-cols-12 gap-10 items-center mt-20 sm:mt-28">
            
            {/* Visual a la izquierda */}
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl ring-1 ring-emerald-500/10 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-emerald-600" />
                    <span className="font-bold text-sm">Resumen de Cuadre de Turno</span>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-[10px]">Caja Cuadrada</Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Efectivo Inicial en Caja:</span>
                    <span className="font-bold">$100,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Ventas en Efectivo (+):</span>
                    <span className="font-bold text-emerald-600">$450,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Tarjetas y Transferencias:</span>
                    <span className="font-bold">$280,000</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-dashed">
                    <span className="text-muted-foreground">Egresos menores autorizados (-):</span>
                    <span className="font-bold text-rose-500">-$25,000</span>
                  </div>
                  <div className="flex justify-between py-2 bg-emerald-50/70 dark:bg-emerald-950/40 px-3 rounded-xl text-sm font-extrabold text-emerald-800 dark:text-emerald-300">
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
                  <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                    <Printer className="h-3.5 w-3.5" /> Ticket POS Listo
                  </span>
                </div>
              </div>
            </div>

            {/* Texto a la derecha */}
            <div className="lg:col-span-6 order-1 lg:order-2 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-bold">
                <ReceiptText className="h-4 w-4" /> PUNTO DE VENTA Y CAJA
              </div>

              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
                Cobro Ágil en Segundos y Cierre de Turno Blindado
              </h3>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Elimina las filas y evita los descuadres al final del día. Omnicanalidad total con cobros en efectivo, tarjetas, transferencias bancarias y fiados a clientes frecuentes.
              </p>

              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Compatibilidad con lectores de código de barras USB y Bluetooth</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Tickets con código QR, políticas de garantía e información tributaria</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-medium">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Módulo de Cuentas por Cobrar (Fiados) con registro de abonos parciales</span>
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={goLogin} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-6">
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
      <section id="rubros" className="py-20 bg-slate-50/70 dark:bg-slate-900/40 border-y border-slate-100 dark:border-slate-900 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-emerald-600 uppercase">
              MULTIRUBRO INTEGRADO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              Diseñado a la Medida de tu Tipo de Tienda
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
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
                    "flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all shrink-0 border",
                    active
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-emerald-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{rubro.name.split("&")[0]}</span>
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
              className="grid lg:grid-cols-12 gap-8 items-center bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm"
            >
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-bold">
                  <activeRubroData.icon className="h-4 w-4" /> {activeRubroData.badge}
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {activeRubroData.name}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeRubroData.description}
                </p>

                <div className="space-y-2 pt-2">
                  {activeRubroData.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2.5 text-xs sm:text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-medium text-slate-800 dark:text-slate-200">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Button onClick={goLogin} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                    Probar {activeRubroData.name.split("&")[0]} <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </div>

              {/* Catálogo de muestra del rubro */}
              <div className="lg:col-span-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-muted-foreground uppercase">
                    <span>Catálogo de Muestra</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{activeRubroData.sampleProducts.length} Items</Badge>
                  </div>
                  {activeRubroData.sampleProducts.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">Unidad: {p.unit}</p>
                      </div>
                      <span className="font-black text-emerald-600 dark:text-emerald-400">{p.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. SECCIÓN DE PRECIOS (RÉPLICA FIEL DE LA IMAGEN DE CLAPOS)*/}
      {/* ========================================================= */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 relative">
        <div className="mx-auto max-w-6xl">

          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-emerald-600 uppercase">
              PRECIOS TRANSPARENTES
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              Para Todo Tipo de Negocio
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Elige el plan ideal adaptado a tu volumen. Sin contratos forzosos ni comisiones ocultas por venta.
            </p>

            {/* Toggle de facturación mensual vs anual como en la imagen */}
            <div className="mt-8 inline-flex items-center p-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-xs font-bold">
              <button
                onClick={() => setAnnualBilling(false)}
                className={cn(
                  "px-4 py-2 rounded-full transition-all",
                  !annualBilling
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
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
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Anual</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold px-2 py-0.5">
                  -24% Ahorro
                </span>
              </button>
            </div>
          </div>

          {/* Tarjetas de Precios (Estilo exacto de ClaPos: Standard destacada en contraste + Premium) */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            
            {/* 1. Plan Starter */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
              <div>
                <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                  Básico
                </span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">Starter</h3>
                <p className="text-xs text-muted-foreground mt-1">Ideal para comercios unipersonales que inician.</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">
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
                  className="w-full mt-6 rounded-full border-slate-300 dark:border-slate-700 hover:border-emerald-500 font-bold text-xs h-11"
                >
                  Comenzar Gratis
                </Button>

                <div className="mt-8 space-y-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>1 Punto de Venta en mostrador</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Hasta 500 productos y categorías</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Control de apertura y cierre de caja</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Impresión de tickets de 58mm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Plan Standard (Destacado como en la imagen de ClaPos: tarjeta oscura/verde de alto impacto con badge Popular) */}
            <div className="relative rounded-3xl border-2 border-emerald-500 bg-slate-900 text-white p-6 sm:p-8 flex flex-col justify-between shadow-2xl shadow-emerald-950/20 scale-[1.03] z-10">
              
              {/* Badge Popular estilo ClaPos */}
              <div className="absolute -top-3.5 right-6 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold uppercase px-3 py-1 shadow-md">
                Popular
              </div>

              <div>
                <span className="text-xs font-extrabold uppercase text-emerald-400 tracking-wider">
                  Estándar
                </span>
                <h3 className="text-2xl font-black text-white mt-1">Standard Pro</h3>
                <p className="text-xs text-slate-300 mt-1">
                  La solución ideal diseñada para negocios en expansión con alto flujo diario.
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-black text-white">
                    ${annualBilling ? "22.79" : "29.99"}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">/Mes</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {annualBilling ? "Facturado anualmente ($273.48/año)" : "Facturado mes a mes"}
                </p>

                <Button
                  onClick={goLogin}
                  className="w-full mt-6 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs h-11 shadow-lg shadow-emerald-600/30 transition-transform hover:scale-[1.02]"
                >
                  Comenzar Ahora
                </Button>

                {/* Features con checks verdes exacto como en la imagen */}
                <div className="mt-8 space-y-3 text-xs text-slate-200">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span className="font-semibold">Todo lo del Plan Básico</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Control de inventario avanzado y lotes</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Reportes detallados de ventas y rentabilidad</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Módulo de fiados / cuentas por cobrar</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-900 shrink-0">
                      <Check className="h-3 w-3" />
                    </div>
                    <span>Alertas inteligentes de stock mínimo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Plan Premium (Como en la imagen de ClaPos: tarjeta limpia blanca con $59.99/Month) */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 flex flex-col justify-between shadow-sm hover:shadow-md transition-all">
              <div>
                <span className="text-xs font-extrabold uppercase text-muted-foreground tracking-wider">
                  Avanzado
                </span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">Premium</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Específicamente diseñado para comercios con múltiples sedes o gran volumen.
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">
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
                  className="w-full mt-6 rounded-full border-slate-300 dark:border-slate-700 hover:border-emerald-500 font-bold text-xs h-11"
                >
                  Comenzar Ahora
                </Button>

                {/* Features list */}
                <div className="mt-8 space-y-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold">Todo lo del Plan Estándar</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Soporte prioritario 24/7</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Soporte Multi-Sedes y Sucursales ilimitadas</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Analíticas avanzadas de rendimiento</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" />
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
      <section id="guia" className="py-20 bg-slate-50/70 dark:bg-slate-900/40 border-y border-slate-100 dark:border-slate-900 px-4 sm:px-6">
        <div className="mx-auto max-w-5xl">
          
          <div className="text-center max-w-xl mx-auto mb-10">
            <span className="text-xs font-extrabold tracking-widest text-emerald-600 uppercase">
              FLUJO DE TRABAJO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              ¿Cómo Operar el Sistema?
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Selecciona tu rol operativo para revisar el paso a paso de trabajo diario.
            </p>

            {/* Selector de rol */}
            <div className="mt-6 inline-flex rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-xs">
              <button
                onClick={() => { setActiveRole("admin"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all",
                  activeRole === "admin" ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Shield className="h-3.5 w-3.5" /> Administrador
              </button>
              <button
                onClick={() => { setActiveRole("vendedor"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold transition-all",
                  activeRole === "vendedor" ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground"
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
                      ? "border-emerald-500 bg-white dark:bg-slate-900 shadow-md ring-1 ring-emerald-500/20"
                      : "border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:border-emerald-300"
                  )}
                >
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                    activeStep === idx ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-muted-foreground"
                  )}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-xs font-bold truncate", activeStep === idx ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400")}>
                      {step.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{step.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Detalle ampliado del paso activo */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 shrink-0">
                    <currentStep.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-emerald-600 uppercase">
                      Paso {activeStep + 1} de {guide.length}
                    </span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                      {currentStep.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{currentStep.desc}</p>
                  </div>
                </div>

                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pt-2">
                  {currentStep.detail}
                </p>

                <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
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
                      className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                    >
                      Siguiente <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={goLogin}
                      className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
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
      <section id="credentials" className="py-20 sm:py-24 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-emerald-600 uppercase">
              ACCESO INMEDIATO
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              Prueba el Sistema en Vivo
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              Haz clic en cualquiera de las cuentas de prueba para ingresar instantáneamente.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Cuenta Admin */}
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-6 flex flex-col justify-between hover:border-emerald-500/60 transition-all">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Administrador</h4>
                    <p className="text-xs text-muted-foreground">Acceso completo a inventario, compras, finanzas y reportes</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-3">
                  <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-muted-foreground">Usuario:</span>
                    <code className="font-mono font-bold text-slate-800 dark:text-slate-200">admin</code>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-muted-foreground">PIN:</span>
                    <code className="font-mono font-bold text-emerald-600">1234</code>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleQuickLogin("admin", "1234")}
                disabled={loggingIn === "admin"}
                className="w-full mt-5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 shadow-sm"
              >
                {loggingIn === "admin" ? "Iniciando..." : "Ingresar como Admin (1-Clic)"}
              </Button>
            </div>

            {/* Cuenta Vendedor */}
            <div className="rounded-3xl border border-teal-500/30 bg-teal-50/40 dark:bg-teal-950/20 p-6 flex flex-col justify-between hover:border-teal-500/60 transition-all">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-base text-slate-900 dark:text-white">Vendedor / Cajero</h4>
                    <p className="text-xs text-muted-foreground">Terminal POS rápido, cobros, comprobantes y arqueos</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-3">
                  <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-muted-foreground">Usuario:</span>
                    <code className="font-mono font-bold text-slate-800 dark:text-slate-200">vendedor</code>
                  </div>
                  <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-muted-foreground">PIN:</span>
                    <code className="font-mono font-bold text-teal-600">0000</code>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleQuickLogin("vendedor", "0000")}
                disabled={loggingIn === "vendedor"}
                className="w-full mt-5 rounded-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs h-10 shadow-sm"
              >
                {loggingIn === "vendedor" ? "Iniciando..." : "Ingresar como Vendedor (1-Clic)"}
              </Button>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 9. PREGUNTAS FRECUENTES (FAQ ACORDEÓN)                    */}
      {/* ========================================================= */}
      <section id="faq" className="py-20 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-900 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          
          <div className="text-center max-w-xl mx-auto mb-12">
            <span className="text-xs font-extrabold tracking-widest text-emerald-600 uppercase">
              RESOLVEMOS TUS DUDAS
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
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
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 font-bold text-sm text-slate-900 dark:text-white"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown className={cn("h-4 w-4 text-emerald-600 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ========================================================= */}
      {/* 10. BANNER FINAL DE LLAMADO A LA ACCIÓN (CTA)             */}
      {/* ========================================================= */}
      <section className="py-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="mx-auto max-w-5xl rounded-3xl bg-gradient-to-tr from-emerald-800 via-emerald-700 to-teal-700 text-white p-8 sm:p-14 text-center shadow-2xl relative">
          <div className="max-w-2xl mx-auto space-y-4">
            <span className="rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 text-xs font-extrabold uppercase px-3 py-1 inline-block">
              Comienza en Menos de 2 Minutos
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Lleva el Control de tu Negocio al Próximo Nivel
            </h2>
            <p className="text-sm sm:text-base text-emerald-100 leading-relaxed">
              Únete a cientos de comerciantes que ya aceleraron sus ventas y eliminaron los descuadres de caja con OmniPOS.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Button
                size="lg"
                onClick={goLogin}
                className="w-full sm:w-auto h-12 px-8 rounded-full text-sm font-bold bg-white text-emerald-800 hover:bg-emerald-50 shadow-lg hover:scale-105 transition-all"
              >
                Probar Demostración Gratis
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={goLogin}
                className="w-full sm:w-auto h-12 px-8 rounded-full text-sm font-semibold border-emerald-400/40 text-white hover:bg-emerald-600/30"
              >
                Iniciar Sesión
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 11. FOOTER SAAS COMPLETO                                  */}
      {/* ========================================================= */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-12 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold">
              <Zap className="h-4 w-4 fill-white" />
            </div>
            <div>
              <p className="font-extrabold text-sm text-slate-900 dark:text-white">OmniPOS</p>
              <p className="text-[11px] text-muted-foreground">Sistema Punto de Venta Multirubro & Gestión Integral</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <a href="#features" className="hover:text-emerald-600 transition-colors">Características</a>
            <a href="#rubros" className="hover:text-emerald-600 transition-colors">Rubros</a>
            <a href="#pricing" className="hover:text-emerald-600 transition-colors">Precios</a>
            <a href="#faq" className="hover:text-emerald-600 transition-colors">FAQ</a>
            <button onClick={goLogin} className="hover:text-emerald-600 font-semibold transition-colors">Iniciar Sesión</button>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px]">Sistemas operativos 99.9% Uptime</span>
          </div>
        </div>

        <div className="mx-auto max-w-6xl mt-8 pt-6 border-t border-slate-100 dark:border-slate-900 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} OmniPOS All-In-One Business Solution. Todos los derechos reservados.
        </div>
      </footer>

    </div>
  )
}
