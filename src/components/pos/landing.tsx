"use client"

import { useState } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

type Role = "admin" | "vendedor"

interface GuideStep {
  icon: React.ElementType
  title: string
  desc: string
  detail: string
}

const ADMIN_GUIDE: GuideStep[] = [
  {
    icon: Store,
    title: "1. Configurar tu tipo de negocio",
    desc: "Ve a Configuración → Negocio & Rubro",
    detail: "Elige si tu tienda es una tienda de barrio, droguería, ferretería, tienda de ropa o comercio general. Ajusta el nombre de tu establecimiento, NIT, dirección, teléfono, moneda y activa o desactiva el control de vencimientos.",
  },
  {
    icon: Package,
    title: "2. Registrar productos y categorías",
    desc: "Ve a Inventario → Nuevo producto",
    detail: "Crea tus productos con código de barras, precios de venta, costos de compra, stock inicial, alertas de stock mínimo y unidades de medida (kilos, gramos, litros, metros, unidades, paquetes, etc.).",
  },
  {
    icon: Truck,
    title: "3. Registrar compras a proveedores",
    desc: "Ve a Compras → Nueva compra",
    detail: "Registra las entradas de mercancía de tus proveedores. Al guardar la compra, el inventario de los productos se incrementa y el costo se actualiza automáticamente.",
  },
  {
    icon: Wallet,
    title: "4. Control de caja y arqueo",
    desc: "Ve a Caja → Arqueo de turnos",
    detail: "Supervisa las aperturas y cierres de caja. Al cerrar el turno, el sistema calcula el efectivo esperado (apertura + ventas en efectivo + ingresos − egresos) y lo compara con el efectivo contado para detectar cualquier faltante.",
  },
  {
    icon: Users,
    title: "5. Créditos y clientes (Fiados)",
    desc: "Ve a Cuentas por Cobrar",
    detail: "Asigna cupos de crédito a clientes de confianza. Cuando compren a crédito en el POS, el saldo se registrará en su cuenta y podrás registrar abonos parciales o totales con comprobante.",
  },
  {
    icon: BarChart3,
    title: "6. Analizar reportes y utilidad",
    desc: "Ve a Reportes",
    detail: "Revisa en tiempo real la utilidad neta de tu negocio, ticket promedio, ventas por día y métodos de pago, top productos más vendidos y valor total del inventario.",
  },
  {
    icon: HardDrive,
    title: "7. Copias de seguridad (Backups)",
    desc: "Ve a Configuración → Backups",
    detail: "Crea respaldos completos de tu base de datos SQLite con un solo clic. Descarga el archivo .db para guardarlo en tu equipo o restaura versiones anteriores cuando lo necesites.",
  },
]

const VENDEDOR_GUIDE: GuideStep[] = [
  {
    icon: Wallet,
    title: "1. Abrir caja al iniciar turno",
    desc: "Ve a Caja → Abrir caja",
    detail: "Ingresa el monto de dinero base con el que comienzas tu turno en el mostrador. Este monto inicial sirve como base para el cuadre final del día.",
  },
  {
    icon: Search,
    title: "2. Buscar o escanear productos en el POS",
    desc: "Ve a Punto de Venta",
    detail: "Escribe el nombre del artículo o pasa el lector de código de barras. Los productos se filtran al instante y se agregan directamente al carrito de compras.",
  },
  {
    icon: ShoppingCart,
    title: "3. Cobrar y emitir comprobante",
    desc: "Pulsa el botón Cobrar",
    detail: "Selecciona el cliente (opcional), el medio de pago (efectivo, tarjeta, transferencia bancaria o crédito/fiado), digita el monto recibido para que el sistema calcule el cambio exacto y emite el recibo imprimible.",
  },
  {
    icon: ArrowLeftRight,
    title: "4. Movimientos menores de caja",
    desc: "Ve a Caja → Ingreso / Egreso",
    detail: "Registra gastos menores autorizados (ej. pago de flete, compras menores) o ingresos imprevistos durante tu jornada laboral para mantener la caja cuadrada.",
  },
  {
    icon: Wallet,
    title: "5. Realizar el arqueo y cerrar turno",
    desc: "Ve a Caja → Cerrar caja",
    detail: "Cuenta el dinero físico disponible en tu gaveta, ingrésalo en el campo 'Efectivo contado' y verifica la diferencia con el sistema antes de cerrar sesión.",
  },
]

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
      "Soporte de unidades: kg, gramos, litros, bolsas, panales",
      "Control de caja por turnos sin descuadres",
    ],
    sampleProducts: [
      { name: "Arroz Diana 1kg", price: "$4.500", unit: "bolsa" },
      { name: "Aceite Premier 1000ml", price: "$11.500", unit: "botella" },
      { name: "Leche Entera Colanta 1L", price: "$4.700", unit: "bolsa" },
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
    name: "Tienda de Ropa & Boutique",
    icon: Shirt,
    badge: "Moda y Calzado",
    description: "Administra prendas de vestir, calzado y accesorios con referencias, precios diferenciados y políticas de garantía en el recibo.",
    features: [
      "Registro por tallas, referencias y categorías de moda",
      "Mensaje personalizado de cambios y garantía en el ticket",
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
    name: "Comercio General & Variedades",
    icon: ShoppingBag,
    badge: "Comercio y Retail",
    description: "El sistema todoterreno para papelerías, tiendas de tecnología, cosméticos, librerías y cualquier negocio comercial.",
    features: [
      "Personalización instantánea del nombre y datos de negocio",
      "Unidades de medida flexibles (combos, juegos, unidades)",
      "Gestión ágil de clientes y proveedores",
      "Respaldo y modo offline seguro con SQLite",
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

const FEATURES_LIST = [
  { icon: ShoppingCart, title: "Punto de Venta Rápido", desc: "Escaneo de código de barras, cobro ágil en efectivo, tarjeta, transferencia o crédito, y tickets de venta." },
  { icon: Boxes, title: "Inventario Multirubro", desc: "Manejo de stock en tiempo real, alertas de reposición, múltiples unidades (kg, litros, metros, piezas) y lotes opcionales." },
  { icon: Wallet, title: "Caja y Arqueo Preciso", desc: "Apertura y cierre de turnos con cuadre automático: efectivo esperado vs. contado, con detección de descuadres." },
  { icon: Users, title: "Cuentas por Cobrar (Fiados)", desc: "Administración de créditos para clientes frecuentes con control de límite de deuda y registro de abonos." },
  { icon: Truck, title: "Compras a Proveedores", desc: "Registro de entradas de mercancía que actualiza existencias y costos de adquisición de forma automática." },
  { icon: BarChart3, title: "Reportes y Utilidad Real", desc: "Métricas de ingresos, ticket promedio, margen de ganancia, top de productos y mejores clientes." },
  { icon: Shield, title: "Seguridad y Roles", desc: "Sesiones firmadas y seguras con cookie httpOnly. Roles Admin y Vendedor con permisos restringidos." },
  { icon: HardDrive, title: "Backups y Modo Offline", desc: "Base de datos local SQLite ultra veloz. Copias de seguridad descargables con 1 clic para total tranquilidad." },
  { icon: Printer, title: "Tickets Térmicos POS", desc: "Impresión de recibos optimizada para impresoras térmicas de 58mm y 80mm con datos personalizados de tu negocio." },
]

export default function LandingPage() {
  const setShowLanding = useAppStore((s) => s.setShowLanding)
  const [activeRole, setActiveRole] = useState<Role>("admin")
  const [activeStep, setActiveStep] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [selectedRubro, setSelectedRubro] = useState(0)

  const goLogin = () => setShowLanding(false)

  const guide = activeRole === "admin" ? ADMIN_GUIDE : VENDEDOR_GUIDE
  const current = guide[activeStep]
  const activeRubroData = RUBRO_SHOWCASE[selectedRubro]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/20 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 border border-slate-800 shadow-sm overflow-hidden p-1">
              <Image
                src="/logo.svg"
                alt="OmniPOS"
                width={36}
                height={36}
                className="h-full w-full object-contain"
                priority
              />
            </div>
            <div>
              <p className="font-bold text-sm sm:text-base leading-tight">OmniPOS</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Sistema Punto de Venta Multirubro</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <a href="#rubros" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Para tu negocio</a>
            <a href="#features" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#guide" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cómo funciona</a>
            <a href="#credentials" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Acceso Demo</a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={goLogin} className="text-sm font-medium">
              Iniciar Sesión
            </Button>
            <Button size="sm" onClick={goLogin} className="shadow-sm">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Probar Demo
            </Button>
            <button className="md:hidden p-2 rounded-lg hover:bg-muted" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            <a href="#rubros" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Para tu negocio</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Funcionalidades</a>
            <a href="#guide" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Cómo funciona</a>
            <a href="#credentials" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Acceso Demo</a>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 sm:pt-20 pb-16 sm:pb-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/3 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
          <div className="absolute top-20 right-1/4 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge variant="secondary" className="mb-4 gap-1.5 py-1.5 px-3 shadow-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Sistema POS Inteligente & Multirubro
            </Badge>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-tight sm:leading-tight">
              El Punto de Venta diseñado para{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                todo tipo de negocio
              </span>
            </h1>

            <p className="mt-5 text-base sm:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Tiendas de barrio, droguerías, ferreterías, tiendas de ropa y comercio en general. Control total de ventas, inventario, arqueos de caja, fiados y reportes en un solo lugar.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3.5 justify-center">
              <Button size="lg" onClick={goLogin} className="h-12 px-7 text-base font-semibold shadow-lg shadow-primary/20">
                <Play className="h-5 w-5 mr-2" /> Probar Sistema en Vivo
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-7 text-base">
                <a href="#rubros">
                  <Layers className="h-4 w-4 mr-2" /> Ver tipos de tienda
                </a>
              </Button>
            </div>
          </motion.div>

          {/* Stats Bar */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto"
          >
            {[
              { icon: Store, label: "Rubros compatibles", value: "100%" },
              { icon: ScanLine, label: "Cobro rápido", value: "< 3 seg" },
              { icon: Wallet, label: "Arqueo de turnos", value: "Sin descuadres" },
              { icon: HardDrive, label: "Modo offline", value: "SQLite Local" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="rounded-2xl border bg-card/80 backdrop-blur-sm p-4 text-center shadow-xs"
              >
                <s.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary mx-auto mb-2" />
                <p className="text-xl sm:text-2xl font-bold tracking-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Selector Interactivo de Rubros */}
      <section id="rubros" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-white via-blue-50/20 to-white border-y">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <Badge variant="secondary" className="mb-2.5">Adaptable a tu comercio</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Diseñado para tu tipo de tienda</h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              Haz clic en cualquier tipo de negocio y mira cómo el sistema adapta automáticamente su catálogo, unidades y alertas.
            </p>
          </div>

          {/* Selector de pestañas */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-8 justify-start md:justify-center scroll-thin">
            {RUBRO_SHOWCASE.map((rubro, idx) => {
              const Icon = rubro.icon
              const active = selectedRubro === idx
              return (
                <button
                  key={rubro.id}
                  onClick={() => setSelectedRubro(idx)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 border",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{rubro.name.split("&")[0]}</span>
                </button>
              )
            })}
          </div>

          {/* Tarjeta de demostración del rubro activo */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRubroData.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="grid lg:grid-cols-12 gap-6 items-center"
            >
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 rounded-lg bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
                  <activeRubroData.icon className="h-4 w-4" /> {activeRubroData.badge}
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold leading-snug">{activeRubroData.name}</h3>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  {activeRubroData.description}
                </p>

                <div className="space-y-2.5 pt-2">
                  {activeRubroData.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-blue-600 shrink-0 mt-0.5">
                        <Check className="h-3 w-3" />
                      </div>
                      <span className="text-foreground/90 font-medium">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3">
                  <Button onClick={goLogin} className="h-11 shadow-sm">
                    Probar con catálogo de {activeRubroData.name.split("&")[0]} <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </div>
              </div>

              {/* Preview de productos de muestra */}
              <div className="lg:col-span-6">
                <Card className="shadow-md border-border/80 overflow-hidden">
                  <div className="bg-muted/50 px-4 py-3 border-b flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Vista previa de catálogo adaptado
                    </span>
                    <Badge variant="outline" className="text-[11px]">{activeRubroData.sampleProducts.length} artículos</Badge>
                  </div>
                  <CardContent className="p-4 space-y-2.5">
                    {activeRubroData.sampleProducts.map((prod, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold shrink-0">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{prod.name}</p>
                            <p className="text-[11px] text-muted-foreground">Unidad: {prod.unit}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-primary whitespace-nowrap">{prod.price}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="secondary" className="mb-2.5">Funcionalidades Completas</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Todo lo que tu negocio necesita</h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              Desde el registro de una venta en mostrador hasta el reporte financiero de fin de mes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES_LIST.map((feat, i) => {
              const Icon = feat.icon
              return (
                <Card key={i} className="border-border/70 hover:border-primary/40 hover:shadow-md transition-all">
                  <CardContent className="p-5 space-y-2.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-bold text-base">{feat.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feat.desc}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Guía interactiva por roles */}
      <section id="guide" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white border-y">
        <div className="mx-auto max-w-5xl">
          <div className="text-center max-w-xl mx-auto mb-10">
            <Badge variant="secondary" className="mb-2.5"><BookOpen className="h-3.5 w-3.5 text-primary mr-1" /> Flujo de Trabajo</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">¿Cómo operar el sistema?</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Selecciona tu rol para ver la guía paso a paso de operación.
            </p>
          </div>

          {/* Selector de rol */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-xl border bg-card p-1 shadow-xs">
              <button
                onClick={() => { setActiveRole("admin"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  activeRole === "admin" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Shield className="h-4 w-4" /> Administrador
              </button>
              <button
                onClick={() => { setActiveRole("vendedor"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  activeRole === "vendedor" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ShoppingCart className="h-4 w-4" /> Vendedor
              </button>
            </div>
          </div>

          {/* Contenedor de pasos */}
          <div className="grid lg:grid-cols-[280px_1fr] gap-5">
            <div className="space-y-1.5">
              {guide.map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 rounded-xl border p-3 transition-all",
                    activeStep === idx
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    activeStep === idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-semibold truncate", activeStep === idx ? "text-foreground" : "text-muted-foreground")}>
                      {step.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{step.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Detalle del paso */}
            <Card className="shadow-xs border-border/80">
              <CardContent className="p-6 sm:p-8 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                    <current.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-primary uppercase">Paso {activeStep + 1} de {guide.length}</span>
                    <h3 className="text-xl font-bold mt-0.5">{current.title}</h3>
                    <p className="text-xs text-muted-foreground">{current.desc}</p>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-foreground/80 leading-relaxed pt-2">
                  {current.detail}
                </p>

                <div className="flex items-center justify-between pt-6 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activeStep === 0}
                    onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1.5" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground font-medium">{activeStep + 1} / {guide.length}</span>
                  {activeStep < guide.length - 1 ? (
                    <Button size="sm" onClick={() => setActiveStep((s) => Math.min(guide.length - 1, s + 1))}>
                      Siguiente <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  ) : (
                    <Button size="sm" onClick={goLogin} className="bg-blue-600 hover:bg-blue-700">
                      <CheckCircle2 className="h-4 w-4 mr-1.5" /> ¡Comenzar ahora!
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Credenciales Demo & CTA */}
      <section id="credentials" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">Acceso de Demostración</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Ingresa inmediatamente con cualquiera de las cuentas de prueba preconfiguradas.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card className="border-primary/30 bg-primary/5 hover:border-primary/60 transition-colors">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Administrador</p>
                    <p className="text-xs text-muted-foreground">Acceso total al sistema</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm pt-2">
                  <div className="flex justify-between items-center rounded-lg bg-card px-3 py-2 border">
                    <span className="text-muted-foreground">Usuario:</span>
                    <code className="font-mono font-bold">admin</code>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-card px-3 py-2 border">
                    <span className="text-muted-foreground">PIN:</span>
                    <code className="font-mono font-bold text-primary">1234</code>
                  </div>
                </div>
                <Button onClick={goLogin} className="w-full mt-2" size="sm">
                  Ingresar como Admin
                </Button>
              </CardContent>
            </Card>

            <Card className="border-sky-500/30 bg-sky-500/5 hover:border-sky-500/60 transition-colors">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Vendedor</p>
                    <p className="text-xs text-muted-foreground">Punto de venta y caja</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-sm pt-2">
                  <div className="flex justify-between items-center rounded-lg bg-card px-3 py-2 border">
                    <span className="text-muted-foreground">Usuario:</span>
                    <code className="font-mono font-bold">vendedor</code>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-card px-3 py-2 border">
                    <span className="text-muted-foreground">PIN:</span>
                    <code className="font-mono font-bold text-sky-600">0000</code>
                  </div>
                </div>
                <Button onClick={goLogin} variant="outline" className="w-full mt-2 border-sky-500/40 text-sky-700" size="sm">
                  Ingresar como Vendedor
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center text-xs text-muted-foreground bg-card">
        <p>OmniPOS · Sistema Punto de Venta Inteligente & Multirubro · {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
