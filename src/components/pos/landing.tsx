"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAppStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Pill, Shield, ShoppingCart, ArrowRight, ArrowLeft, Check, Package, Truck,
  Users, Building2, ReceiptText, Wallet, BarChart3, Lock, Play, BookOpen,
  TrendingUp, Boxes, AlertTriangle, CalendarClock, Plus, Search, ScanLine,
  CheckCircle2, DollarSign, Sparkles, Menu, X, ArrowLeftRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Role = "admin" | "vendedor"

interface GuideStep {
  icon: React.ElementType
  title: string
  desc: string
  detail: string
}

const ADMIN_GUIDE: GuideStep[] = [
  {
    icon: Package,
    title: "Registrar productos",
    desc: "Ve a Inventario → Nuevo producto",
    detail: "Completa nombre, código de barras, categoría, costo, precio de venta, stock inicial y fecha de vencimiento. El sistema bloquea la venta de productos vencidos automáticamente.",
  },
  {
    icon: Truck,
    title: "Comprar a proveedores",
    desc: "Ve a Compras → Nueva compra",
    detail: "Selecciona el proveedor, busca productos y agrega líneas con cantidad, costo unitario y vencimiento del lote. Al guardar, el stock se incrementa y el costo se actualiza automáticamente.",
  },
  {
    icon: Users,
    title: "Gestionar clientes y proveedores",
    desc: "Ve a Clientes o Proveedores",
    detail: "Registra contactos con documento, teléfono y dirección. Los clientes aparecen al cobrar; los proveedores al comprar. Puedes editar o eliminar en cualquier momento.",
  },
  {
    icon: ArrowLeftRight,
    title: "Registrar ingresos y egresos",
    desc: "Ve a Ingresos/Egresos",
    detail: "Documenta movimientos financieros como servicios públicos, salarios o ingresos diversos. Cada movimiento se asocia a la caja abierta y aparece en el arqueo.",
  },
  {
    icon: ReceiptText,
    title: "Anular ventas",
    desc: "Ve a Ventas → detalle → Anular",
    detail: "Si una venta se registró mal, ábrela y pulsa 'Anular venta'. El stock se devuelve automáticamente y la venta queda marcada como anulada en el historial.",
  },
  {
    icon: Wallet,
    title: "Arqueo de caja",
    desc: "Ve a Caja → Cerrar caja",
    detail: "Al cerrar, el sistema calcula el monto esperado (inicial + ventas + ingresos − egresos en efectivo) y lo compara con el efectivo contado para detectar faltantes o sobrantes.",
  },
  {
    icon: BarChart3,
    title: "Revisar reportes",
    desc: "Ve a Reportes",
    detail: "Analiza ventas por día/categoría/método de pago, utilidad bruta, ticket promedio, top productos, mejores clientes y el estado del inventario con alertas.",
  },
]

const VENDEDOR_GUIDE: GuideStep[] = [
  {
    icon: Wallet,
    title: "Abrir caja al iniciar turno",
    desc: "Ve a Caja → Abrir caja",
    detail: "Ingresa el monto inicial en efectivo y tu nombre. No puede haber dos cajas abiertas a la vez. Este monto es la base del arqueo al cerrar.",
  },
  {
    icon: Search,
    title: "Buscar productos en el POS",
    desc: "Ve a Punto de Venta",
    detail: "Escribe el nombre o escanea el código de barras. Los productos se filtran en tiempo real. Los agotados o vencidos no se pueden agregar al carrito.",
  },
  {
    icon: Plus,
    title: "Agregar al carrito",
    desc: "Toca un producto",
    detail: "El producto se agrega al carrito (visible en el panel derecho en desktop o en el drawer inferior en móvil). Ajusta cantidades con los botones +/−.",
  },
  {
    icon: ShoppingCart,
    title: "Cobrar la venta",
    desc: "Botón Cobrar",
    detail: "Selecciona el cliente (opcional), el método de pago (efectivo/tarjeta/transferencia/crédito), ingresa el efectivo recibido para calcular el cambio, y confirma. Se genera un recibo imprimible.",
  },
  {
    icon: ArrowLeftRight,
    title: "Movimientos de caja",
    desc: "Caja → Ingreso o Egreso",
    detail: "Registra ingresos (ej. adelanto de efectivo) o egresos (ej. gastos menores) durante tu turno. Todos afectan el arqueo final.",
  },
  {
    icon: Wallet,
    title: "Cerrar caja y arqueo",
    desc: "Caja → Cerrar caja",
    detail: "Cuenta el efectivo real, ingrésalo como 'monto contado' y el sistema muestra la diferencia con el esperado. Si cuadra, diferencia $0. Registra notas si hay faltante.",
  },
]

const FEATURES = [
  { icon: ShoppingCart, title: "Punto de venta rápido", desc: "Escaneo por código de barras, carrito con cantidades, múltiples métodos de pago y recibo imprimible." },
  { icon: Package, title: "Inventario con vencimientos", desc: "Alertas de stock bajo, productos por vencer y vencidos. El sistema bloquea la venta de productos vencidos." },
  { icon: Wallet, title: "Caja y arqueo", desc: "Apertura y cierre de turnos con cuadre automático: esperado vs. contado, con detección de faltantes." },
  { icon: Truck, title: "Compras a proveedores", desc: "Registra entradas de mercancía; el stock y los costos se actualizan solos. Anulación con reversa." },
  { icon: Shield, title: "Roles y seguridad", desc: "Sesiones firmadas server-side. El vendedor solo vende y opera caja; el admin gestiona todo." },
  { icon: BarChart3, title: "Reportes y analítica", desc: "Ventas, utilidad, ticket promedio, top productos, mejores clientes y estado de inventario." },
]

export default function LandingPage() {
  const setShowLanding = useAppStore((s) => s.setShowLanding)
  const [activeRole, setActiveRole] = useState<Role>("admin")
  const [activeStep, setActiveStep] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const goLogin = () => setShowLanding(false)

  const guide = activeRole === "admin" ? ADMIN_GUIDE : VENDEDOR_GUIDE
  const steps = guide
  const current = steps[activeStep]

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 via-white to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Pill className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Droguería La Salud</p>
              <p className="text-[10px] text-muted-foreground leading-tight">Sistema POS</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            <a href="#features" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Características</a>
            <a href="#guide" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Cómo usar</a>
            <a href="#credentials" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Credenciales</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goLogin} className="text-sm">
              Ir al login
            </Button>
            <Button size="sm" asChild className="hidden sm:flex">
              <a href="#guide">
                <Play className="h-3.5 w-3.5 mr-1.5" /> Empezar
              </a>
            </Button>
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Características</a>
            <a href="#guide" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Cómo usar</a>
            <a href="#credentials" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium rounded-lg hover:bg-muted">Credenciales</a>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-20 right-1/4 h-64 w-64 rounded-full bg-teal-300/20 blur-3xl" />
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-3xl mx-auto"
          >
            <Badge variant="secondary" className="mb-4 gap-1.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Sistema POS completo para droguería
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
              Gestiona tu droguería de forma{" "}
              <span className="bg-gradient-to-r from-primary to-teal-600 bg-clip-text text-transparent">
                simple y segura
              </span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Punto de venta, inventario con control de vencimientos, caja con arqueo, compras a proveedores y reportes. Todo en un solo lugar.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
              <Button size="lg" asChild className="h-12 text-base shadow-lg shadow-primary/25">
                <a href="#guide">
                  <BookOpen className="h-5 w-5 mr-2" /> Aprende a usarlo
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 text-base">
                <a href="#credentials">
                  <Lock className="h-4 w-4 mr-2" /> Ver credenciales
                </a>
              </Button>
            </div>
          </motion.div>

          {/* Stats animadas */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto"
          >
            {[
              { icon: Package, label: "Productos", value: "26+" },
              { icon: ShoppingCart, label: "Ventas", value: "ilimitadas" },
              { icon: Shield, label: "Roles", value: "2" },
              { icon: BarChart3, label: "Reportes", value: "6+" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="rounded-xl border bg-card p-3 sm:p-4 text-center"
              >
                <s.icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary mx-auto mb-1.5" />
                <p className="text-lg sm:text-2xl font-bold">{s.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 sm:py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-4xl font-bold">Todo lo que necesitas</h2>
            <p className="mt-2 text-muted-foreground max-w-xl mx-auto">Funciones completas para administrar tu droguería de principio a fin.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4 }}
              >
                <Card className="h-full border-border/60 hover:border-primary/40 hover:shadow-lg transition-all">
                  <CardContent className="p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold mb-1.5">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Guía interactiva por rol */}
      <section id="guide" className="py-12 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-emerald-50/40 to-white">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <Badge variant="secondary" className="mb-3 gap-1.5"><BookOpen className="h-3.5 w-3.5 text-primary" /> Tutorial paso a paso</Badge>
            <h2 className="text-2xl sm:text-4xl font-bold">Cómo usar el sistema</h2>
            <p className="mt-2 text-muted-foreground max-w-xl mx-auto">Selecciona tu rol y sigue la guía. Cada paso te explica qué hacer y dónde.</p>
          </motion.div>

          {/* Selector de rol */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex rounded-xl border bg-card p-1 shadow-sm">
              <button
                onClick={() => { setActiveRole("admin"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activeRole === "admin" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Shield className="h-4 w-4" /> Administrador
              </button>
              <button
                onClick={() => { setActiveRole("vendedor"); setActiveStep(0) }}
                className={cn(
                  "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                  activeRole === "vendedor" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ShoppingCart className="h-4 w-4" /> Vendedor
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[280px_1fr] gap-5">
            {/* Lista de pasos */}
            <div className="space-y-1.5">
              {steps.map((step, i) => (
                <motion.button
                  key={step.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => setActiveStep(i)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 rounded-xl border p-3 transition-all",
                    activeStep === i
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors",
                    activeStep === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium truncate", activeStep === i ? "text-foreground" : "text-muted-foreground")}>
                      {step.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{step.desc}</p>
                  </div>
                  {activeStep === i && <ArrowRight className="h-4 w-4 text-primary shrink-0" />}
                </motion.button>
              ))}
            </div>

            {/* Detalle del paso */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRole + "-" + activeStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="h-full border-border/60 shadow-sm">
                  <CardContent className="p-6 sm:p-8">
                    <div className="flex items-start gap-4 mb-5">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shrink-0">
                        <current.icon className="h-7 w-7" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-primary">PASO {activeStep + 1} DE {steps.length}</span>
                          <Badge variant="outline" className="text-[10px]">{activeRole === "admin" ? "Administrador" : "Vendedor"}</Badge>
                        </div>
                        <h3 className="text-xl font-bold">{current.title}</h3>
                        <p className="text-sm text-muted-foreground mt-0.5">{current.desc}</p>
                      </div>
                    </div>
                    <p className="text-sm sm:text-base text-foreground/80 leading-relaxed mb-6">
                      {current.detail}
                    </p>

                    {/* Navegación */}
                    <div className="flex items-center justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={activeStep === 0}
                        onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                      >
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">{activeStep + 1} / {steps.length}</span>
                      {activeStep < steps.length - 1 ? (
                        <Button size="sm" onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}>
                          Siguiente <ArrowRight className="h-4 w-4 ml-1.5" />
                        </Button>
                      ) : (
                        <Button size="sm" onClick={goLogin} className="bg-emerald-600">
                          <CheckCircle2 className="h-4 w-4 mr-1.5" /> ¡Listo, ir al login!
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Credenciales */}
      <section id="credentials" className="py-12 sm:py-20 px-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <h2 className="text-2xl sm:text-4xl font-bold">Credenciales de acceso</h2>
            <p className="mt-2 text-muted-foreground">Usa estas cuentas para probar el sistema. En el login, toca una credencial para rellenar automáticamente.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold">Administrador</p>
                      <p className="text-xs text-muted-foreground">Acceso completo</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center rounded-lg bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">Usuario</span>
                      <code className="font-mono font-semibold">admin</code>
                    </div>
                    <div className="flex justify-between items-center rounded-lg bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">PIN</span>
                      <code className="font-mono font-semibold">1234</code>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Gestiona inventario, compras, finanzas, reportes y puede anular ventas.</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <Card className="border-teal-500/20 bg-teal-500/5">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white">
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-bold">Vendedor</p>
                      <p className="text-xs text-muted-foreground">Venta y caja</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center rounded-lg bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">Usuario</span>
                      <code className="font-mono font-semibold">vendedor</code>
                    </div>
                    <div className="flex justify-between items-center rounded-lg bg-background/70 px-3 py-2">
                      <span className="text-muted-foreground">PIN</span>
                      <code className="font-mono font-semibold">0000</code>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">Vende, opera caja (apertura y arqueo) y consulta ventas. Sin acceso a costos ni edición.</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
          <div className="text-center mt-6">
            <Button size="lg" onClick={goLogin} className="h-12 text-base shadow-lg shadow-primary/25">
              Ir al login <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center text-sm text-muted-foreground">
        <p>Droguería La Salud · Sistema POS de Droguería · {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
