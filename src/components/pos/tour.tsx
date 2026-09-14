"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAppStore } from "@/lib/store"
import type { ViewKey } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles, Wallet, ShoppingCart, Clock, CheckCircle2, ArrowLeftRight,
  Calculator, Receipt, Settings, Package, Truck, CreditCard, BarChart3,
  HardDrive, X, ArrowRight, ArrowLeft, Lightbulb, Play, Compass,
  Minimize2, Maximize2, Crosshair, HelpCircle, GripHorizontal,
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
    desc: "Como vendedor o cajero, este tour interactivo te enseñará el flujo diario paso a paso con las secciones reales del sistema.",
    detail: "Aprenderás a abrir caja con tu base inicial, buscar y escanear productos, pausar carritos para atender filas rápidas y cuadrar tu arqueo de cierre.",
    actionLabel: "La pantalla se sincronizará automáticamente con cada sección explicada.",
    tip: "Puedes minimizar esta tarjeta o moverte con 'Siguiente' / 'Atrás' en cualquier momento.",
    view: "pos",
    targetSelector: '[data-tour="sidebar-nav"]',
  },
  {
    title: "1. Abrir Caja (¡Obligatorio antes de vender!)",
    category: "PASO 1: APERTURA DE TURNO",
    icon: Wallet,
    desc: "Antes de atender a tu primer cliente, siempre debes registrar el dinero base físico en tu gaveta.",
    detail: "Haz clic en el botón 'Abrir caja' que ves resaltado en pantalla, escribe el monto inicial (ej. $100.000) y tu nombre. Esta base queda guardada para calcular el cuadre exacto al finalizar tu turno.",
    actionLabel: "👉 Haz clic en 'Abrir caja' para iniciar tu turno.",
    tip: "⚠️ Si intentas vender sin abrir caja, el sistema te solicitará abrir turno primero para proteger los números.",
    view: "cash",
    targetSelector: '[data-tour="cash-open-btn"], [data-tour="cash-open-card"]',
  },
  {
    title: "2. Punto de Venta (POS) & Escáner",
    category: "PASO 2: REGISTRO DE PRODUCTOS",
    icon: ShoppingCart,
    desc: "El terminal de cobro ultra-rápido donde buscarás o escanearás los artículos que el cliente desea llevar.",
    detail: "Escribe en la barra de búsqueda resaltada o simplemente pasa el lector de código de barras USB/inalámbrico. El producto se agregará de inmediato al carrito. Puedes modificar cantidades (+ / −) y verificar el stock.",
    actionLabel: "👉 Usa la barra de búsqueda o el lector de código de barras.",
    tip: "El lector de códigos de barras funciona de manera automática sin necesidad de hacer clics previos.",
    view: "pos",
    targetSelector: '[data-tour="pos-search-input"]',
  },
  {
    title: "3. Cola de Carritos en Espera (Pausar Venta)",
    category: "PASO 3: ATENCIÓN EN PARALELO",
    icon: Clock,
    desc: "¿Un cliente necesita más tiempo o fue a buscar otro producto? ¡No detengas la fila!",
    detail: "Haz clic en el botón 'En espera' en la parte superior del carrito. Asigna una referencia rápida (ej. 'Don Carlos') y el pedido se guardará en la cola. Tu terminal quedará libre de inmediato para cobrar al siguiente cliente.",
    actionLabel: "👉 Pulsa 'En espera' en el carrito para pausar una venta.",
    tip: "Pulsa 'Gestionar cola' o 'Cola (N)' para recuperar el carrito en cualquier instante.",
    view: "pos",
    targetSelector: '[data-tour="pos-hold-btn"]',
  },
  {
    title: "4. Cobro, Medios de Pago y Recibos",
    category: "PASO 4: FINALIZAR VENTA",
    icon: CheckCircle2,
    desc: "Finaliza la compra de forma ágil y emite el comprobante para el cliente.",
    detail: "Selecciona el método de pago: Efectivo (calcula el cambio automáticamente), Tarjeta, Transferencia o Crédito/Fiado. Al presionar el botón 'Cobrar', se generará el ticket térmico listo para imprimir o descargar.",
    actionLabel: "👉 Pulsa 'Cobrar' para registrar la venta e imprimir ticket.",
    tip: "Para clientes con cupo de crédito, selecciónalos en el desplegable de Cliente.",
    view: "pos",
    targetSelector: '[data-tour="pos-checkout-btn"]',
  },
  {
    title: "5. Movimientos Menores de Caja",
    category: "PASO 5: CONTROL DE GASTOS Y RETIROS",
    icon: ArrowLeftRight,
    desc: "¿Tuviste que pagar un flete imprevisto o comprar insumos de aseo de emergencia?",
    detail: "En la sección de Caja, usa 'Registrar Egreso' para registrar cualquier salida de efectivo de la gaveta. De igual forma, si ingresa dinero adicional, usa 'Registrar Ingreso'.",
    actionLabel: "👉 Usa 'Registrar Ingreso' o 'Registrar Egreso' según el movimiento.",
    tip: "Registrar cada gasto evita faltantes de dinero al momento de cerrar el turno.",
    view: "cash",
    targetSelector: '[data-tour="cash-movement-actions"], [data-tour="cash-expense-btn"]',
  },
  {
    title: "6. Conteo Físico y Cierre de Turno (Arqueo)",
    category: "PASO 6: CUADRE Y ARQUEO",
    icon: Calculator,
    desc: "Al terminar tu jornada laboral, realiza el arqueo de caja para entregar cuentas claras.",
    detail: "Pulsa 'Cerrar caja / Realizar Arqueo'. Cuenta físicamente todo el efectivo en tu gaveta e ingrésalo en el campo 'Efectivo contado'. El sistema comparará el dinero real contra el esperado (Apertura + Ventas Efectivo + Ingresos − Egresos) y te confirmará si el turno cuadró perfecto.",
    actionLabel: "👉 Pulsa 'Cerrar caja / Realizar Arqueo' para cuadrar tu turno.",
    tip: "Nunca salgas sin cerrar tu caja para que el siguiente compañero pueda abrir la suya.",
    view: "cash",
    targetSelector: '[data-tour="cash-close-btn"], [data-tour="cash-movement-actions"]',
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
    desc: "Como Administrador tienes el control integral de tu negocio: catálogo, compras a proveedores, control de inventario, créditos a clientes, supervisión de cajas, finanzas, analítica y seguridad.",
    detail: "A continuación recorreremos paso a paso cada sección con los elementos reales en pantalla para que configures y administres tu establecimiento de forma profesional.",
    actionLabel: "La pantalla se desplazará automáticamente hacia cada botón o formulario relevante.",
    tip: "Puedes minimizar esta guía flotante si deseas probar libremente las funciones.",
    view: "dashboard",
    targetSelector: '[data-tour="sidebar-nav"]',
  },
  {
    title: "1. Personaliza tu Comercio y Rubro",
    category: "PASO 1: CONFIGURACIÓN INICIAL",
    icon: Settings,
    desc: "Comienza adaptando el software a las características específicas de tu negocio.",
    detail: "En 'Configuración' define el nombre de tu tienda, NIT, teléfono, dirección, mensaje de pie de recibo y selecciona tu rubro: Tienda de Barrio/Minimarket, Droguería/Farmacia (con control de fechas de vencimiento), Ferretería, Tienda de Ropa o Comercio General.",
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
    detail: "Crea productos con código de barras, precios de venta, costos de compra, stock mínimo de alerta y unidades de medida. En farmacias, gestiona lotes y fechas de vencimiento con bloqueo automático para productos caducados.",
    actionLabel: "👉 Haz clic en 'Nuevo producto' para añadir artículos a tu inventario.",
    tip: "El inventario se descuenta en vivo con cada venta realizada en el mostrador.",
    view: "products",
    targetSelector: '[data-tour="products-new-btn"], [data-tour="products-search-bar"]',
  },
  {
    title: "3. Compras a Proveedores",
    category: "PASO 3: ENTRADAS DE MERCANCÍA",
    icon: Truck,
    desc: "Registra las compras a tus distribuidores para mantener tu stock siempre actualizado.",
    detail: "En 'Compras' registra las facturas de tus proveedores. Al guardar la compra, el inventario de los productos se incrementa automáticamente y el costo unitario se actualiza para garantizar cálculos de utilidad exactos.",
    actionLabel: "👉 Haz clic en 'Nueva compra' para recepcionar mercancía.",
    tip: "Registrar tus compras garantiza que conozcas el costo real de tu mercancía.",
    view: "purchases",
    targetSelector: '[data-tour="purchases-new-btn"]',
  },
  {
    title: "4. Clientes y Cuentas por Cobrar (Créditos)",
    category: "PASO 4: FIADOS Y CARTERA",
    icon: CreditCard,
    desc: "Fideliza a tus clientes de confianza otorgándoles crédito con control estricto de cartera.",
    detail: "Asigna cupos máximos de crédito a tus clientes. Cuando compren a crédito en el POS, su deuda se acumula automáticamente. En este módulo podrás ver los saldos pendientes y registrar abonos de dinero con comprobante.",
    actionLabel: "👉 Pulsa 'Otorgar crédito' o 'Abonar' en las cuentas activas.",
    tip: "El sistema bloquea compras a crédito si el cliente supera su cupo autorizado.",
    view: "credit",
    targetSelector: '[data-tour="credit-grant-btn"], [data-tour="credit-summary-cards"]',
  },
  {
    title: "5. Auditoría de Caja y Arqueo de Turnos",
    category: "PASO 5: CONTROL DE EFECTIVO",
    icon: Wallet,
    desc: "Supervisa en tiempo real las operaciones de caja de tus colaboradores y evita fugas de dinero.",
    detail: "Consulta qué cajero tiene turno abierto, el saldo en efectivo acumulado y revisa el historial completo de arqueos para verificar que el dinero físico contado coincida con el esperado por el sistema.",
    actionLabel: "👉 Revisa el 'Historial de sesiones' y el saldo esperado de turno.",
    tip: "El sistema registra fecha, hora y responsable de cada apertura y cierre.",
    view: "cash",
    targetSelector: '[data-tour="cash-history-card"], [data-tour="cash-movement-actions"]',
  },
  {
    title: "6. Control Financiero (Ingresos y Egresos)",
    category: "PASO 6: FLUJO DE CAJA Y GASTOS",
    icon: ArrowLeftRight,
    desc: "Lleva el control de todos los movimientos de dinero que no son ventas de mostrador.",
    detail: "Registra gastos operativos (arriendo, servicios públicos, nómina, fletes) e ingresos extraordinarios. El módulo calcula en tiempo real tu balance financiero neto mensual para mantener tu negocio rentable.",
    actionLabel: "👉 Usa los botones 'Nuevo ingreso' y 'Nuevo egreso' para registrar movimientos.",
    tip: "Activa 'Sumar ventas efectivo' o 'Sumar ventas crédito' para balances consolidados.",
    view: "finance",
    targetSelector: '[data-tour="finance-actions"], [data-tour="finance-summary-cards"]',
  },
  {
    title: "7. Reportes, Utilidad Real y Analítica",
    category: "PASO 7: INTELIGENCIA DE NEGOCIO",
    icon: BarChart3,
    desc: "Toma decisiones basadas en datos y números reales.",
    detail: "Visualiza tus ventas del mes, ticket promedio, margen porcentual, ganancia neta real (Ventas − Costo − Gastos), los productos más vendidos y el rendimiento por método de pago con gráficos modernos.",
    actionLabel: "👉 Selecciona el periodo (7, 30 o 90 días) y revisa los KPIs.",
    tip: "Usa los filtros de tiempo para evaluar el crecimiento de tu tienda.",
    view: "reports",
    targetSelector: '[data-tour="reports-period-selector"], [data-tour="reports-kpi-grid"]',
  },
  {
    title: "8. Copias de Seguridad (Backups)",
    category: "PASO 8: SEGURIDAD Y RESPALDO",
    icon: HardDrive,
    desc: "Protege la información de tu negocio contra cualquier imprevisto.",
    detail: "En 'Configuración → Backups' puedes descargar una copia completa de tu base de datos en un solo clic. Guárdala en tu computador o memoria USB y restáurala cuando lo necesites.",
    actionLabel: "👉 Haz clic en 'Crear nueva copia ahora' para respaldar tu base de datos.",
    tip: "¡Excelente! Has completado el tour de administración. Tu negocio está listo para operar.",
    view: "settings",
    targetSelector: '[data-tour="settings-backup-section"]',
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
  const [dockSide, setDockSide] = useState<"right" | "left">("right")
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [targetRadius, setTargetRadius] = useState<string>("12px")

  const steps = role === "vendedor" ? VENDEDOR_WORKFLOW : ADMIN_WORKFLOW
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

  // Medir y enfocar el elemento objetivo (Spotlight)
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
        el = found
        break
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
        el.scrollIntoView({ behavior: "smooth", block: "nearest" })
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
    setTargetRect(null)
  }, [role, closeTour])

  // Atajos de teclado: Flecha derecha (siguiente), Flecha izquierda (atrás), Escape (minimizar)
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

  return (
    <>
      {/* Resaltador Spotlight sobre el elemento objetivo en la interfaz */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: Math.max(0, targetRect.top - 5),
            left: Math.max(0, targetRect.left - 5),
            width: targetRect.width + 10,
            height: targetRect.height + 10,
            borderRadius: targetRadius,
            pointerEvents: "none",
            zIndex: 45,
          }}
          className="border-2 border-primary ring-4 ring-primary/35 shadow-[0_0_25px_rgba(37,99,235,0.5)] transition-all duration-300 animate-pulse"
        >
          {/* Indicador flotante 'Haz clic aquí' */}
          <div className="absolute -top-7 left-1.5 bg-primary text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 whitespace-nowrap animate-bounce">
            <span>👉</span>
            <span>¡Aquí!</span>
          </div>
        </div>
      )}

      {/* Versión Minimizada: Pastilla flotante en la esquina inferior */}
      {minimized ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className={cn(
            "fixed bottom-5 z-50 flex items-center gap-2 bg-card/95 backdrop-blur-md border border-primary/50 text-card-foreground p-2 px-3.5 rounded-full shadow-2xl",
            dockSide === "right" ? "right-5" : "left-5 lg:left-72"
          )}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white text-xs font-bold shadow-xs">
            {currentStep + 1}
          </div>
          <div className="text-xs">
            <span className="font-bold text-foreground">Tour Activo</span>
            <span className="text-muted-foreground ml-1">({currentStep + 1}/{steps.length})</span>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => setMinimized(false)}
            className="h-7 px-2.5 text-xs font-semibold rounded-full ml-1 shadow-xs"
          >
            <Maximize2 className="h-3.5 w-3.5 mr-1" /> Reanudar
          </Button>
          <button
            onClick={handleFinish}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5"
            title="Cerrar tour"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      ) : (
        /* Tarjeta Flotante Inteligente Arrastrable / No Bloqueante */
        <motion.div
          drag
          dragMomentum={false}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
          className={cn(
            "fixed bottom-4 z-50 w-[calc(100vw-2rem)] sm:w-[440px] md:w-[470px] rounded-2xl border border-border bg-card/98 backdrop-blur-md text-card-foreground shadow-2xl overflow-hidden",
            dockSide === "right" ? "right-4 sm:right-6" : "left-4 sm:left-6 lg:left-72"
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

          {/* Header del Tour con agarradera para arrastrar */}
          <div className="p-3.5 sm:p-4 pb-2.5 border-b border-border/70 flex items-center justify-between gap-2 cursor-move select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                <Icon className="h-4.5 w-4.5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold tracking-wider uppercase text-primary block truncate">
                  {step.category}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-foreground leading-tight truncate">
                  {step.title}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Badge variant="secondary" className="text-[11px] font-semibold px-2 py-0.5">
                {currentStep + 1} de {steps.length}
              </Badge>
              {/* Botón para cambiar de lado (izquierda / derecha) si tapa contenido */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDockSide((prev) => (prev === "right" ? "left" : "right"))
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                title={dockSide === "right" ? "Mover guía a la izquierda" : "Mover guía a la derecha"}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMinimized(true)
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                title="Minimizar tour para probar la pantalla libremente"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleFinish()
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                title="Cerrar tour"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Cuerpo del paso */}
          <div className="p-3.5 sm:p-4 space-y-3">
            <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
              {step.desc}
            </p>

            <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-xs text-foreground/90 dark:text-zinc-200 leading-relaxed font-normal">
              {step.detail}
            </div>

            {/* Acción destacada sin texto cortado ni ellipsis */}
            {step.actionLabel && (
              <div className="flex items-start justify-between gap-2.5 rounded-xl bg-primary/10 border border-primary/25 p-2.5 px-3 text-xs text-foreground font-semibold">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="text-sm shrink-0 mt-0.5">🎯</span>
                  <span className="leading-snug break-words">{step.actionLabel}</span>
                </div>
                {step.targetSelector && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={updateTargetRect}
                    className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/20 shrink-0 self-center"
                    title="Centrar y resaltar el botón en pantalla"
                  >
                    <Crosshair className="h-3 w-3 mr-1" /> Enfocar
                  </Button>
                )}
              </div>
            )}

            {step.tip && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 p-2.5 px-3 text-xs text-amber-900 dark:text-amber-200">
                <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="leading-snug font-medium">{step.tip}</p>
              </div>
            )}
          </div>

          {/* Footer de navegación con Stepper Dots interactivos */}
          <div className="p-3 sm:p-4 pt-2.5 border-t border-border/70 bg-muted/20 flex items-center justify-between gap-2">
            <button
              onClick={handleFinish}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium px-1.5"
            >
              Omitir
            </button>

            {/* Puntos indicadores interactivos */}
            <div className="hidden sm:flex items-center gap-1">
              {steps.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentStep(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    idx === currentStep
                      ? "w-4 bg-primary"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  )}
                  title={`Ir al paso ${idx + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs font-semibold gap-1 rounded-xl"
                  title="Paso anterior (o presiona flecha izquierda)"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Atrás
                </Button>
              )}

              <Button
                size="sm"
                onClick={handleNext}
                className="h-8 sm:h-9 px-3.5 sm:px-4 text-xs font-bold gap-1.5 rounded-xl shadow-xs shadow-primary/25"
                title="Siguiente paso (o presiona flecha derecha)"
              >
                <span>{isLast ? "¡Finalizar!" : "Siguiente"}</span>
                {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </>
  )
}

