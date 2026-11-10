"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAppStore } from "@/lib/store"
import type { ViewKey } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles, Wallet, ShoppingCart, Clock, CheckCircle2, ArrowLeftRight,
  Receipt, Settings, Package, Truck, CreditCard, BarChart3,
  HardDrive, X, ArrowRight, ArrowLeft, Lightbulb, Play, Compass,
  Minimize2, Maximize2, Crosshair, HelpCircle, ChevronUp, ChevronDown,
  Smartphone, MapPin, Check,
} from "lucide-react"
import { cn } from "@/lib/utils"

export const TOUR_STORAGE_KEY_PREFIX = "pos-tour-done-"

interface TourStep {
  title: string
  category: string
  icon: React.ElementType
  desc: string
  detail: string
  actionLabel?: string
  tip?: string
  view: ViewKey
  targetSelector?: string
}

const VENDEDOR_WORKFLOW: TourStep[] = [
  {
    title: "¡Bienvenido a tu Turno de Trabajo!",
    category: "OPERACIÓN DE MOSTRADOR",
    icon: Sparkles,
    desc: "Como vendedor o cajero, este tour interactivo te enseñará el flujo diario paso a paso en pantalla.",
    detail: "Aprenderás a abrir caja con tu base inicial, buscar y escanear productos, pausar carritos para atender filas rápidas y cuadrar tu arqueo de cierre.",
    actionLabel: "La pantalla se sincronizará automáticamente con cada sección explicada.",
    tip: "En tu teléfono puedes usar la barra inferior para moverte rápidamente.",
    view: "pos",
    targetSelector: '[data-tour="sidebar-nav"], [data-tour="mobile-bottom-nav"], [data-tour="mobile-menu-btn"]',
  },
  {
    title: "1. Abrir Caja (¡Obligatorio antes de vender!)",
    category: "PASO 1: APERTURA DE TURNO",
    icon: Wallet,
    desc: "Antes de atender a tu primer cliente, siempre debes registrar el dinero base físico en tu gaveta.",
    detail: "Haz clic en el botón 'Abrir caja', escribe el monto inicial (ej. $100.000) y tu nombre. Esta base queda guardada para calcular el cuadre exacto al finalizar tu turno.",
    actionLabel: "👉 Haz clic en 'Abrir caja' para iniciar tu turno.",
    tip: "⚠️ Si intentas vender sin abrir caja, el sistema te solicitará abrir turno primero para proteger los números.",
    view: "cash",
    targetSelector: '[data-tour="cash-open-btn"], [data-tour="cash-open-card"], [data-tour="mobile-nav-cash"]',
  },
  {
    title: "2. Punto de Venta (POS) & Escáner",
    category: "PASO 2: REGISTRO DE PRODUCTOS",
    icon: ShoppingCart,
    desc: "El terminal de cobro ultra-rápido donde buscarás o escanearás los artículos que el cliente desea llevar.",
    detail: "Escribe en la barra de búsqueda o pasa el lector de código de barras. El producto se agregará de inmediato al carrito. Puedes modificar cantidades (+ / −) y verificar el stock.",
    actionLabel: "👉 Usa la barra de búsqueda o el lector de código de barras.",
    tip: "En celular, toca sobre cualquier producto para sumarlo directamente al carrito.",
    view: "pos",
    targetSelector: '[data-tour="pos-search-input"], [data-tour="mobile-nav-pos"]',
  },
  {
    title: "3. Cola de Carritos en Espera (Pausar Venta)",
    category: "PASO 3: ATENCIÓN EN PARALELO",
    icon: Clock,
    desc: "¿Un cliente necesita más tiempo o fue a buscar otro producto? ¡No detengas la fila!",
    detail: "Haz clic en el botón 'En espera' en la parte superior del carrito. Asigna una referencia rápida (ej. 'Don Carlos') y el pedido se guardará en la cola. Tu terminal quedará libre de inmediato.",
    actionLabel: "👉 Pulsa 'En espera' en el carrito para pausar una venta.",
    tip: "Pulsa 'Gestionar cola' o 'Cola (N)' para recuperar el carrito en cualquier instante.",
    view: "pos",
    targetSelector: '[data-tour="pos-hold-btn"], [data-tour="pos-cart-panel"]',
  },
  {
    title: "4. Cobro, Medios de Pago y Recibos",
    category: "PASO 4: FINALIZAR VENTA",
    icon: CheckCircle2,
    desc: "Finaliza la compra de forma ágil y emite el comprobante para el cliente.",
    detail: "Selecciona el método de pago: Efectivo (calcula el cambio automáticamente), Tarjeta, Transferencia o Crédito/Fiado. Al presionar 'Cobrar', se generará el ticket térmico listo para imprimir o descargar.",
    actionLabel: "👉 Pulsa 'Cobrar' para registrar la venta e imprimir ticket.",
    tip: "Para clientes con cupo de crédito, selecciónalos en el desplegable de Cliente.",
    view: "pos",
    targetSelector: '[data-tour="pos-checkout-btn"], [data-tour="pos-cart-panel"]',
  },
  {
    title: "5. Movimientos Menores de Caja",
    category: "PASO 5: CONTROL DE GASTOS Y RETIROS",
    icon: ArrowLeftRight,
    desc: "¿Tuviste que pagar un flete imprevisto o insumos de aseo de emergencia?",
    detail: "En la sección de Caja, usa 'Registrar Egreso' para registrar cualquier salida de efectivo de la gaveta. De igual forma, si ingresa dinero adicional, usa 'Registrar Ingreso'.",
    actionLabel: "👉 Usa 'Registrar Ingreso' o 'Registrar Egreso' según el movimiento.",
    tip: "Registrar cada gasto evita faltantes de dinero al momento de cerrar el turno.",
    view: "cash",
    targetSelector: '[data-tour="cash-movement-actions"], [data-tour="cash-expense-btn"]',
  },
  {
    title: "6. Conteo Físico y Cierre de Turno (Arqueo)",
    category: "PASO 6: CUADRE Y ARQUEO",
    icon: Wallet,
    desc: "Al terminar tu jornada, cuenta el dinero físico de la gaveta y realiza el cierre.",
    detail: "En 'Caja', presiona 'Cerrar turno / Arqueo'. Ingresa el conteo físico real. El sistema calculará la diferencia: Cuadrado, Sobrante o Faltante, y generará el informe de auditoría.",
    actionLabel: "👉 Presiona 'Cerrar turno' para registrar el cuadre final.",
    tip: "El arqueo queda registrado con fecha, hora y usuario responsable para auditoría.",
    view: "cash",
    targetSelector: '[data-tour="cash-close-btn"], [data-tour="cash-summary-card"]',
  },
  {
    title: "7. Consultas y Salida Segura",
    category: "PASO 7: HISTORIAL Y SEGURIDAD",
    icon: Receipt,
    desc: "En 'Historial de Ventas' puedes consultar los comprobantes emitidos durante tu turno y reimprimir tickets.",
    detail: "Para terminar, ve al menú de usuario en la barra superior y pulsa 'Cerrar sesión'. ¡Estás 100% listo para operar el punto de venta con total velocidad y precisión!",
    actionLabel: "👉 Abre el menú de usuario en la esquina superior derecha para salir.",
    tip: "¡Felicitaciones! Has completado el entrenamiento de vendedor.",
    view: "sales",
    targetSelector: '[data-tour="user-menu"]',
  },
]

const ADMIN_WORKFLOW: TourStep[] = [
  {
    title: "¡Bienvenido al Centro de Control!",
    category: "PANEL PRINCIPAL",
    icon: Sparkles,
    desc: "Como Administrador tienes el control integral de tu negocio: catálogo, compras, inventario, créditos, cajas, finanzas, analítica y entregas a domicilio.",
    detail: "A continuación recorreremos paso a paso cada sección con los elementos reales en pantalla para que configures y administres tu establecimiento de forma profesional.",
    actionLabel: "La pantalla se desplazará automáticamente hacia cada botón o formulario relevante.",
    tip: "En celular, puedes minimizar la guía en cualquier momento para explorar libremente.",
    view: "dashboard",
    targetSelector: '[data-tour="sidebar-nav"], [data-tour="mobile-bottom-nav"], [data-tour="mobile-menu-btn"]',
  },
  {
    title: "1. Personaliza tu Comercio y Rubro",
    category: "PASO 1: CONFIGURACIÓN INICIAL",
    icon: Settings,
    desc: "Comienza adaptando el software a las características específicas de tu negocio.",
    detail: "En 'Configuración' define el nombre de tu tienda, NIT, teléfono, dirección, mensaje de pie de recibo y selecciona tu rubro: Tienda de Barrio, Droguería (con lotes y vencimientos), Ferretería o Retail.",
    actionLabel: "👉 Completa los datos de tu empresa en el formulario.",
    tip: "También puedes alternar entre Modo Claro, Oscuro o Automático según tu iluminación.",
    view: "settings",
    targetSelector: '[data-tour="settings-store-form"], [data-tour="settings-rubro-selector"]',
  },
  {
    title: "2. Catálogo e Inventario Multirubro",
    category: "PASO 2: GESTIÓN DE PRODUCTOS",
    icon: Package,
    desc: "Administra todo tu catálogo de productos con control de existencias en tiempo real.",
    detail: "Crea productos con código de barras, precios de venta, costos de compra, stock mínimo de alerta y unidades de medida. En farmacias, gestiona lotes y fechas de vencimiento con bloqueo automático para caducados.",
    actionLabel: "👉 Haz clic en 'Nuevo producto' para añadir artículos a tu inventario.",
    tip: "El inventario se descuenta en vivo con cada venta realizada en el mostrador o por domicilio.",
    view: "products",
    targetSelector: '[data-tour="products-new-btn"], [data-tour="products-search-bar"]',
  },
  {
    title: "3. Pedidos a Domicilio y Despacho",
    category: "PASO 3: ENTREGAS & REPARTIDORES",
    icon: Truck,
    desc: "Gestiona pedidos online o telefónicos y asígnalos a tus repartidores en tiempo real.",
    detail: "En 'Pedidos & Domicilios' puedes tomar pedidos manuales, asignar un conductor exclusivo o externo, imprimir comandas y contactar al cliente o domiciliario por WhatsApp con un solo clic.",
    actionLabel: "👉 Pulsa 'Asignar' en los pedidos para coordinar el despacho.",
    tip: "Puedes registrar personal con rol exclusivo 'Domiciliario' desde el propio modal de asignación.",
    view: "orders",
    targetSelector: '[data-tour="orders-kpi-grid"], [data-tour="orders-new-btn"]',
  },
  {
    title: "4. Compras a Proveedores",
    category: "PASO 4: ENTRADAS DE MERCANCÍA",
    icon: Package,
    desc: "Registra las compras a tus distribuidores para mantener tu stock siempre actualizado.",
    detail: "En 'Compras' registra las facturas de tus proveedores. Al guardar la compra, el inventario de los productos se incrementa automáticamente y el costo unitario se actualiza para garantizar cálculos de utilidad exactos.",
    actionLabel: "👉 Haz clic en 'Nueva compra' para recepcionar mercancía.",
    tip: "Registrar tus compras garantiza que conozcas el costo real de tu mercancía.",
    view: "purchases",
    targetSelector: '[data-tour="purchases-new-btn"]',
  },
  {
    title: "5. Clientes y Cuentas por Cobrar (Créditos)",
    category: "PASO 5: FIADOS Y CARTERA",
    icon: CreditCard,
    desc: "Fideliza a tus clientes de confianza otorgándoles crédito con control estricto de cartera.",
    detail: "Asigna cupos máximos de crédito a tus clientes. Cuando compren a crédito en el POS, su deuda se acumula automáticamente. En este módulo podrás ver los saldos pendientes y registrar abonos con comprobante.",
    actionLabel: "👉 Pulsa 'Otorgar crédito' o 'Abonar' en las cuentas activas.",
    tip: "El sistema bloquea compras a crédito si el cliente supera su cupo autorizado.",
    view: "credit",
    targetSelector: '[data-tour="credit-grant-btn"], [data-tour="credit-summary-cards"]',
  },
  {
    title: "6. Auditoría de Caja y Arqueo de Turnos",
    category: "PASO 6: CONTROL DE EFECTIVO",
    icon: Wallet,
    desc: "Supervisa en tiempo real las operaciones de caja de tus colaboradores y evita fugas de dinero.",
    detail: "Consulta qué cajero tiene turno abierto, el saldo en efectivo acumulado y revisa el historial completo de arqueos para verificar que el dinero físico contado coincida con el esperado por el sistema.",
    actionLabel: "👉 Revisa el 'Historial de sesiones' y el saldo esperado de turno.",
    tip: "El sistema registra fecha, hora y responsable de cada apertura y cierre.",
    view: "cash",
    targetSelector: '[data-tour="cash-history-card"], [data-tour="cash-movement-actions"]',
  },
  {
    title: "7. Control Financiero (Ingresos y Egresos)",
    category: "PASO 7: FLUJO DE CAJA Y GASTOS",
    icon: ArrowLeftRight,
    desc: "Lleva el control de todos los movimientos de dinero que no son ventas de mostrador.",
    detail: "Registra gastos operativos (arriendo, servicios públicos, nómina, fletes) e ingresos extraordinarios. El módulo calcula en tiempo real tu balance financiero neto mensual para mantener tu negocio rentable.",
    actionLabel: "👉 Usa los botones 'Nuevo ingreso' y 'Nuevo egreso' para registrar movimientos.",
    tip: "Activa 'Sumar ventas efectivo' o 'Sumar ventas crédito' para balances consolidados.",
    view: "finance",
    targetSelector: '[data-tour="finance-actions"], [data-tour="finance-summary-cards"]',
  },
  {
    title: "8. Reportes, Utilidad Real y Analítica",
    category: "PASO 8: INTELIGENCIA DE NEGOCIO",
    icon: BarChart3,
    desc: "Toma decisiones basadas en datos y números reales.",
    detail: "Visualiza tus ventas del mes, ticket promedio, margen porcentual, ganancia neta real (Ventas − Costo − Gastos), los productos más vendidos y el rendimiento por método de pago con gráficos modernos.",
    actionLabel: "👉 Selecciona el periodo (7, 30 o 90 días) y revisa los KPIs.",
    tip: "Usa los filtros de tiempo para evaluar el crecimiento de tu tienda.",
    view: "reports",
    targetSelector: '[data-tour="reports-period-selector"], [data-tour="reports-kpi-grid"]',
  },
  {
    title: "9. Copias de Seguridad (Backups)",
    category: "PASO 9: SEGURIDAD Y RESPALDO",
    icon: HardDrive,
    desc: "Protege la información de tu negocio contra cualquier imprevisto.",
    detail: "En 'Configuración → Backups' puedes descargar una copia completa de tu base de datos en un solo clic. Guárdala en tu computador o memoria USB y restáurala cuando lo necesites.",
    actionLabel: "👉 Haz clic en 'Crear nueva copia ahora' para respaldar tu base de datos.",
    tip: "¡Excelente! Has completado el tour de administración. Tu negocio está listo para operar.",
    view: "settings",
    targetSelector: '[data-tour="settings-backup-section"]',
  },
]

const DOMICILIARIO_WORKFLOW: TourStep[] = [
  {
    title: "¡Bienvenido a tu Portal de Reparto!",
    category: "APP DE DOMICILIARIOS",
    icon: Truck,
    desc: "Como repartidor, desde la web puedes tomar pedidos libres, gestionar tus entregas y consultar tu Cuadre de Caja.",
    detail: "En la pestaña 'Disponibles' verás los pedidos listos sin conductor. El primero en pulsar 'Tomar Pedido' se adjudica la entrega automáticamente (sincronizado con Telegram).",
    actionLabel: "👉 Revisa tus pedidos disponibles o activos en tu Portal de Reparto.",
    tip: "Puedes tocar el enlace de Google Maps o Waze para navegar directo hasta el cliente.",
    view: "orders",
    targetSelector: '[data-tour="orders-kpi-grid"], [data-tour="mobile-bottom-nav"]',
  },
  {
    title: "1. Ruta en Camino y Cierre de Entrega",
    category: "PASO 1: ENTREGA AL CLIENTE",
    icon: MapPin,
    desc: "Cuando recojas el pedido pasa el estado a 'En Camino' y al entregarlo al cliente pulsa 'Marcar Entregado'.",
    detail: "Puedes abrir WhatsApp con el cliente o llamar con un toque. Al marcar Entregado, el pedido NO se marca Pagado automáticamente: queda en estado 'Sin Liquidar' hasta que entregues el dinero en Caja.",
    actionLabel: "👉 Pulsa 'Salir en Camino' al salir y 'Marcar Entregado' al entregar.",
    tip: "Esto garantiza trazabilidad limpia y evita descuadres antes del cierre de turno.",
    view: "orders",
    targetSelector: '[data-tour="orders-kpi-grid"]',
  },
  {
    title: "2. Tu Cuadre de Caja (Pedidos X + Domicilios Y)",
    category: "PASO 2: CUADRE Y LIQUIDACIÓN",
    icon: Wallet,
    desc: "Consulta exactamente cuánto efectivo debes entregar al regresar a Caja desglosado en Valor Pedidos (X) y Valor Domicilios (Y).",
    detail: "En 'Mi Cuadre de Caja' verás tus entregas en efectivo sin liquidar, transferencias por verificar e historial de comprobantes cuando el cajero o administrador liquide tu turno.",
    actionLabel: "👉 Abre 'Mi Cuadre de Caja' en el menú para verificar tus totales.",
    tip: "Cuando Caja registre tu entrega de efectivo, el sistema genera tu comprobante oficial.",
    view: "driver_settlement",
    targetSelector: '[data-tour="sidebar-nav"], [data-tour="mobile-bottom-nav"]',
  },
]

export default function TourGuide() {
  const role = useAppStore((s) => s.role)
  const setView = useAppStore((s) => s.setView)
  const tourOpen = useAppStore((s) => s.tourOpen)
  const startTour = useAppStore((s) => s.startTour)
  const closeTour = useAppStore((s) => s.closeTour)

  const [currentStep, setCurrentStep] = useState(0)
  const [minimized, setMinimized] = useState(false)
  const [mobileCollapsed, setMobileCollapsed] = useState(false)
  const [dockSide, setDockSide] = useState<"right" | "left">("right")
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [targetRadius, setTargetRadius] = useState<string>("12px")
  const [isMobile, setIsMobile] = useState(false)

  // Detectar responsive móvil
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const steps =
    role === "domiciliario"
      ? DOMICILIARIO_WORKFLOW
      : role === "vendedor"
      ? VENDEDOR_WORKFLOW
      : ADMIN_WORKFLOW

  const step = steps[currentStep] || steps[0]

  // Abrir tour automáticamente si es la primera vez
  useEffect(() => {
    if (!role) return
    const key = TOUR_STORAGE_KEY_PREFIX + role
    const done = localStorage.getItem(key)
    if (!done) {
      const timer = setTimeout(() => {
        startTour()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [role, startTour])

  // Navegación automática a la vista correspondiente
  useEffect(() => {
    if (tourOpen && step?.view) {
      setView(step.view)
    }
  }, [tourOpen, currentStep, step?.view, setView])

  // Medir y enfocar el elemento objetivo (Spotlight) adaptativo a móvil y desktop
  const updateTargetRect = useCallback(() => {
    if (!tourOpen || !step?.targetSelector) {
      setTargetRect(null)
      return
    }

    const selectors = step.targetSelector.split(",").map((s) => s.trim())
    let el: HTMLElement | null = null
    for (const sel of selectors) {
      const found = document.querySelector<HTMLElement>(sel)
      if (found) {
        // Verificar si el elemento está visible (offsetParent no null o getBoundingClientRect > 0)
        const r = found.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          el = found
          break
        }
      }
    }

    if (el) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect(rect)
        try {
          const style = window.getComputedStyle(el)
          if (style.borderRadius && style.borderRadius !== "0px") {
            setTargetRadius(style.borderRadius)
          } else {
            setTargetRadius("12px")
          }
        } catch {
          setTargetRadius("12px")
        }

        // En móvil, hacer scroll suave asegurando que no se tape con barras fijas
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }
    }
    setTargetRect(null)
  }, [tourOpen, step?.targetSelector])

  // Recalcular rect al cambiar de paso, ventana o scroll
  useEffect(() => {
    const timer = setTimeout(updateTargetRect, 250)
    window.addEventListener("resize", updateTargetRect)
    window.addEventListener("scroll", updateTargetRect, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", updateTargetRect)
      window.removeEventListener("scroll", updateTargetRect, true)
    }
  }, [currentStep, tourOpen, updateTargetRect])

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      handleFinish()
    }
  }, [currentStep, steps.length])

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }, [currentStep])

  const handleFinish = useCallback(() => {
    if (role) {
      try {
        localStorage.setItem(TOUR_STORAGE_KEY_PREFIX + role, "1")
      } catch {}
    }
    closeTour()
    setCurrentStep(0)
    setMinimized(false)
    setMobileCollapsed(false)
    setTargetRect(null)
  }, [role, closeTour])

  // Atajos de teclado para PC
  useEffect(() => {
    if (!tourOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrev()
      } else if (e.key === "Escape") {
        e.preventDefault()
        setMinimized(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tourOpen, handleNext, handlePrev])

  if (!role || !tourOpen) return null

  const Icon = step.icon
  const isLast = currentStep === steps.length - 1
  const progressPercent = ((currentStep + 1) / steps.length) * 100

  // En móvil: determinar si el elemento enfocado está en la parte inferior de la pantalla
  // Si está abajo, anclamos la guía en la parte superior para NO tapar el botón objetivo
  const targetIsInBottomHalf = isMobile && targetRect && targetRect.top > (typeof window !== "undefined" ? window.innerHeight * 0.45 : 300)

  return (
    <>
      {/* Resaltador Spotlight interactivo sobre el elemento real */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: Math.max(0, targetRect.top - 4),
            left: Math.max(0, targetRect.left - 4),
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: targetRadius,
            pointerEvents: "none",
            zIndex: 45,
          }}
          className="border-2 border-primary ring-4 ring-primary/35 shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all duration-300 animate-pulse"
        >
          {/* Indicador flotante 'Aquí' */}
          <div className="absolute -top-6 left-1 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 whitespace-nowrap animate-bounce">
            <span>👉</span>
            <span>¡Aquí!</span>
          </div>
        </div>
      )}

      {/* VERSIÓN MINIMIZADA (Pastilla flotante limpia) */}
      {minimized ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className={cn(
            "fixed z-50 flex items-center gap-2 bg-card/95 backdrop-blur-md border border-primary/50 text-card-foreground p-1.5 px-3 rounded-full shadow-2xl",
            isMobile
              ? "bottom-20 right-3 max-w-[calc(100vw-1.5rem)]"
              : dockSide === "right"
              ? "bottom-5 right-5"
              : "bottom-5 left-5 lg:left-72"
          )}
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold shadow-xs shrink-0">
            {currentStep + 1}
          </div>
          <div className="text-[11px] min-w-0">
            <span className="font-bold text-foreground">Guía</span>
            <span className="text-muted-foreground ml-1">({currentStep + 1}/{steps.length})</span>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => setMinimized(false)}
            className="h-6 px-2 text-[11px] font-semibold rounded-full ml-1 shadow-xs active:scale-[0.96]"
          >
            <Maximize2 className="h-3 w-3 mr-1" /> Reanudar
          </Button>
          <button
            onClick={handleFinish}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5"
            title="Cerrar tour"
          >
            <X className="h-3 w-3" />
          </button>
        </motion.div>
      ) : (
        /* TARJETA FLOTANTE INTELIGENTE RESPONSIVE */
        <motion.div
          drag={!isMobile} // Desactivar drag en móviles táctiles para no interferir con scroll
          dragMomentum={false}
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
          className={cn(
            "fixed z-50 rounded-2xl border border-border bg-card/98 backdrop-blur-md text-card-foreground shadow-2xl overflow-hidden transition-all duration-200",
            isMobile
              ? targetIsInBottomHalf
                ? "top-14 left-2 right-2 max-w-[calc(100vw-1rem)] mx-auto"
                : "bottom-20 left-2 right-2 max-w-[calc(100vw-1rem)] mx-auto"
              : cn(
                  "bottom-4 w-[450px] md:w-[480px]",
                  dockSide === "right" ? "right-4 sm:right-6" : "left-4 sm:left-6 lg:left-72"
                )
          )}
        >
          {/* Barra de progreso superior */}
          <div className="h-1.5 w-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            />
          </div>

          {/* Encabezado del Tour */}
          <div className="p-3 sm:p-4 pb-2 border-b border-border/70 flex items-center justify-between gap-2 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase text-primary block truncate">
                  {step.category}
                </span>
                <h3 className="text-xs sm:text-sm font-bold text-foreground leading-tight truncate">
                  {step.title}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Badge variant="secondary" className="text-[10px] sm:text-[11px] font-semibold px-2 py-0.5">
                {currentStep + 1}/{steps.length}
              </Badge>

              {/* Botón colapsar / expandir en móvil */}
              {isMobile && (
                <button
                  onClick={() => setMobileCollapsed(!mobileCollapsed)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title={mobileCollapsed ? "Expandir detalles" : "Modo compacto"}
                >
                  {mobileCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              )}

              {/* Botón cambiar lado en desktop */}
              {!isMobile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDockSide((prev) => (prev === "right" ? "left" : "right"))
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                  title={dockSide === "right" ? "Mover a la izquierda" : "Mover a la derecha"}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMinimized(true)
                }}
                className="p-1 sm:p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                title="Minimizar tour"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleFinish()
                }}
                className="p-1 sm:p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                title="Cerrar tour"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Cuerpo del paso (Colapsable en móvil para máxima visibilidad) */}
          <AnimatePresence initial={false}>
            {(!isMobile || !mobileCollapsed) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="p-3 sm:p-4 space-y-2.5 max-h-[42vh] sm:max-h-none overflow-y-auto">
                  <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                    {step.desc}
                  </p>

                  <div className="p-2.5 rounded-xl bg-muted/50 border border-border/80 text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
                    {step.detail}
                  </div>

                  {step.actionLabel && (
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold flex items-center gap-1.5">
                      <span>{step.actionLabel}</span>
                    </div>
                  )}

                  {step.tip && (
                    <div className="text-[10px] sm:text-[11px] text-muted-foreground flex items-start gap-1.5 pt-0.5">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>{step.tip}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer de Navegación del Tour */}
          <div className="p-2.5 sm:p-3.5 border-t border-border/70 bg-muted/20 flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="h-8 px-2.5 text-xs rounded-xl active:scale-[0.96]"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Anterior
            </Button>

            {/* Puntos de progreso en desktop */}
            <div className="hidden sm:flex items-center gap-1">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStep(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    idx === currentStep ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  )}
                  title={`Ir al paso ${idx + 1}`}
                />
              ))}
            </div>

            <Button
              size="sm"
              variant="default"
              onClick={handleNext}
              className={cn(
                "h-8 px-3 text-xs rounded-xl font-bold shadow-xs active:scale-[0.96]",
                isLast ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
              )}
            >
              {isLast ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" /> ¡Listo, finalizar!
                </>
              ) : (
                <>
                  Siguiente <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      )}
    </>
  )
}
