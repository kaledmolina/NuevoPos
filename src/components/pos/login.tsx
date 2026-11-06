"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { useAppStore } from "@/lib/store"
import { type Role, ROLE_CONFIG } from "@/lib/permissions"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Shield, ShoppingCart, ArrowRight, ArrowLeft, Check, KeyRound, Lock, Info,
  Loader2, User, BookOpen, Store, Pill, Hammer, Shirt, ShoppingBag,
  Crown, Sparkles, Building2, Clock, Eye, EyeOff, Zap, CheckCircle2,
  AlertCircle, Phone, Mail, ChevronRight, HelpCircle, Truck
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ThemeToggle } from "@/components/theme-toggle"

function getRubroIcon(rubro: string) {
  switch (rubro?.toLowerCase()) {
    case "tienda":
    case "minimarket":
    case "abarrotes":
      return Store
    case "ferreteria":
    case "materiales":
      return Hammer
    case "ropa":
    case "boutique":
    case "calzado":
      return Shirt
    case "drogueria":
    case "farmacia":
      return Pill
    default:
      return ShoppingBag
  }
}

const RUBRO_OPTIONS = [
  { id: "drogueria", name: "Droguería & Farmacia", icon: Pill, desc: "Control de lotes y fechas de vencimiento" },
  { id: "tienda", name: "Tienda & Minimarket", icon: Store, desc: "Abarrotes, canasta familiar y fiados" },
  { id: "ferreteria", name: "Ferretería", icon: Hammer, desc: "Herramientas, medidas y materiales" },
  { id: "ropa", name: "Tienda de Ropa", icon: Shirt, desc: "Tallas, referencias y calzado" },
  { id: "otro", name: "Comercio General", icon: ShoppingBag, desc: "Retail, variedades y tecnología" },
]

export default function LoginScreen() {
  const login = useAppStore((s) => s.login)
  const setShowLanding = useAppStore((s) => s.setShowLanding)

  // Modo: "login" o "register"
  const [authMode, setAuthMode] = useState<"login" | "register">("login")
  const [showNumpad, setShowNumpad] = useState(false)

  const handleNumpadPress = (digit: string) => {
    if (digit === "clear") {
      setPin("")
      return
    }
    if (digit === "backspace") {
      setPin((prev) => prev.slice(0, -1))
      return
    }
    if (pin.length < 8) {
      setPin((prev) => prev + digit)
    }
  }

  // Estado del Login
  const [role, setRole] = useState<Role | null>("admin")
  const [name, setName] = useState("admin")
  const [pin, setPin] = useState("1234")
  const [showPin, setShowPin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [storeName, setStoreName] = useState("Sistema POS")
  const [storeRubro, setStoreRubro] = useState("drogueria")
  const [showSuperAdmin, setShowSuperAdmin] = useState(false)
  const [lockClicks, setLockClicks] = useState(0)

  // Estado del Registro de Negocio
  const [regStep, setRegStep] = useState<1 | 2>(1)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const [regBusinessName, setRegBusinessName] = useState("")
  const [regOwnerName, setRegOwnerName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [regPin, setRegPin] = useState("")
  const [regPinConfirm, setRegPinConfirm] = useState("")
  const [showRegPin, setShowRegPin] = useState(false)
  const [regRubro, setRegRubro] = useState("drogueria")
  const [regBranchName, setRegBranchName] = useState("Sede Principal")

  useEffect(() => {
    apiFetch<Record<string, string>>("/api/settings")
      .then((s) => {
        if (s.store_name) setStoreName(s.store_name)
        if (s.store_rubro) setStoreRubro(s.store_rubro)
      })
      .catch(() => {})

    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get("sa") === "1" || sp.get("superadmin") === "1" || sp.get("role") === "superadmin") {
        setShowSuperAdmin(true)
      }
      if (sp.get("mode") === "register") {
        setAuthMode("register")
      }
    }
  }, [])

  const handleLockClick = () => {
    const next = lockClicks + 1
    setLockClicks(next)
    if (next >= 3) {
      setShowSuperAdmin((prev) => {
        const newVal = !prev
        if (newVal) toast.info("Modo Superadministrador habilitado")
        return newVal
      })
      setLockClicks(0)
    }
  }

  const selectRole = (r: Role) => {
    setRole(r)
    if (r === "superadmin") {
      setName("kaledmoly@gmail.com")
      setPin("9999")
    } else if (r === "admin") {
      setName("admin")
      setPin("1234")
    } else if (r === "domiciliario") {
      setName("repartidor@demo.com")
      setPin("1234")
    } else {
      setName("vendedor")
      setPin("0000")
    }
  }

  // Rellena rol + usuario + PIN automáticamente (acceso rápido demo)
  const quickFill = (r: Role) => {
    setRole(r)
    if (r === "superadmin") {
      setName("kaledmoly@gmail.com")
      setPin("9999")
    } else if (r === "domiciliario") {
      setName("repartidor@demo.com")
      setPin("1234")
    } else {
      setName(r === "admin" ? "admin" : "vendedor")
      setPin(r === "admin" ? "1234" : "0000")
    }
  }

  const submitLogin = async () => {
    if (!name.trim()) return toast.error("Ingresa tu usuario o correo electrónico")
    if (!pin.trim()) return toast.error("Ingresa tu PIN")
    setLoading(true)
    try {
      await login(name.trim(), pin.trim())
      toast.success(`Bienvenido al sistema`)
    } catch (e) {
      toast.error((e as Error).message || "Error al iniciar sesión")
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regBusinessName.trim()) return toast.error("Ingresa el nombre de tu negocio")
    if (!regOwnerName.trim()) return toast.error("Ingresa el nombre del administrador principal")
    if (!regEmail.trim() || !regEmail.includes("@")) return toast.error("Ingresa un correo electrónico válido")
    if (regPin.length < 4) return toast.error("El PIN debe tener al menos 4 dígitos")
    if (regPin !== regPinConfirm) return toast.error("Los PIN ingresados no coinciden")

    setRegisterLoading(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          businessName: regBusinessName.trim(),
          ownerName: regOwnerName.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim(),
          pin: regPin.trim(),
          rubro: regRubro,
          branchName: regBranchName.trim(),
        }),
      })

      if (res.ok) {
        setRegisterSuccess(true)
        toast.success("Negocio registrado exitosamente")
      }
    } catch (err) {
      toast.error((err as Error).message || "Error al registrar negocio")
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleGoToLoginWithRegistered = () => {
    setName(regEmail)
    setPin(regPin)
    setAuthMode("login")
    setRole("admin")
    setRegisterSuccess(false)
  }

  const pinMatch = regPin && regPinConfirm ? regPin === regPinConfirm : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-white dark:bg-black text-foreground relative selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-950">
      
      {/* Background ambient glows en verde esmeralda estilo ClaPos */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-zinc-300/20 dark:bg-zinc-800/20 blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-zinc-200/20 dark:bg-zinc-800/20 blur-[130px]" />
      </div>

      {/* Barra superior con botón volver a Landing y Toggle de tema */}
      <div className="w-full max-w-lg flex items-center justify-between mb-4 z-20">
        <motion.button
          whileHover={{ x: -3 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setShowLanding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-foreground transition-colors bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 shadow-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Volver al Inicio</span>
        </motion.button>

        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg z-10">

        {/* Encabezado con Logo y Marca */}
        <div className="text-center mb-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="inline-flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-black/10 ring-2 ring-zinc-300/30 dark:ring-zinc-700/30 mb-3"
          >
            <Zap className="h-7 w-7 fill-white" />
          </motion.div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {storeName}
          </h1>

          <p
            onClick={handleLockClick}
            className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1 font-medium cursor-pointer select-none hover:text-foreground transition-colors"
            title="Plataforma SaaS Multirubro · Acceso Seguro"
          >
            <Lock className="h-3 w-3" /> Plataforma SaaS Multirubro · Acceso Seguro
          </p>
        </div>

        {/* Pestañas de modo: [ Iniciar Sesión ] vs [ Registrar Negocio ] */}
        <div className="grid grid-cols-2 p-1.5 mb-5 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs font-bold relative">
          <button
            type="button"
            onClick={() => setAuthMode("login")}
            className={cn(
              "relative py-2.5 rounded-xl transition-all select-none text-center",
              authMode === "login"
                ? "text-foreground font-black"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {authMode === "login" && (
              <motion.div
                layoutId="authTabSlider"
                className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-xl shadow-sm -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            Iniciar Sesión
          </button>

          <button
            type="button"
            onClick={() => { setAuthMode("register"); setRegisterSuccess(false); }}
            className={cn(
              "relative py-2.5 rounded-xl transition-all select-none text-center flex items-center justify-center gap-1.5",
              authMode === "register"
                ? "text-foreground font-black"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {authMode === "register" && (
              <motion.div
                layoutId="authTabSlider"
                className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-xl shadow-sm -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span>Registrar Negocio</span>
            <span className="rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-[9px] font-black uppercase px-1.5 py-0.2">
              Gratis
            </span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* CONTENIDO SEGÚN LA PESTAÑA ACTIVA CON ANIMACIÓN FLUIDA    */}
        {/* ========================================================= */}
        <AnimatePresence mode="wait">
          
          {/* ==================== MODO 1: INICIAR SESIÓN ============ */}
          {authMode === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="shadow-xl shadow-black/5 border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md">
                <CardContent className="p-6 sm:p-7 space-y-5">
                  
                  {/* Selector de Rol */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        1. Selecciona tu perfil de acceso
                      </Label>
                      {showSuperAdmin && (
                        <span className="text-[10px] font-bold text-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                          Superadmin Activo
                        </span>
                      )}
                    </div>

                    <div className={cn("grid gap-2", showSuperAdmin ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
                      <RoleButton
                        active={role === "admin"}
                        onClick={() => selectRole("admin")}
                        icon={Shield}
                        title="Administrador"
                        desc="Control total del negocio"
                      />
                      <RoleButton
                        active={role === "vendedor"}
                        onClick={() => selectRole("vendedor")}
                        icon={ShoppingCart}
                        title="Vendedor"
                        desc="Punto de venta y caja"
                      />
                      <RoleButton
                        active={role === "domiciliario"}
                        onClick={() => selectRole("domiciliario")}
                        icon={Truck}
                        title="Repartidor"
                        desc="Entregas a domicilio"
                      />
                      {showSuperAdmin && (
                        <RoleButton
                          active={role === "superadmin"}
                          onClick={() => selectRole("superadmin")}
                          icon={Crown}
                          title="Superadmin"
                          desc="Control global SaaS"
                        />
                      )}
                    </div>
                  </div>

                  {/* Formulario de Credenciales */}
                  <form onSubmit={(e) => { e.preventDefault(); submitLogin(); }} className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-username" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Usuario o Correo Electrónico
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-username"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={showSuperAdmin && role === "superadmin" ? "kaledmoly@gmail.com" : "admin o vendedor"}
                          autoComplete="username"
                          className="h-11 pl-10 text-sm rounded-xl border-zinc-200 dark:border-zinc-800 focus:border-zinc-950 dark:focus:border-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-pin" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          PIN Numérico
                        </Label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowNumpad(!showNumpad)}
                            className="text-[11px] font-semibold text-foreground underline hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3" />
                            {showNumpad ? "Ocultar teclado táctil" : "Teclado táctil"}
                          </button>
                          <span className="text-[10px] text-muted-foreground font-mono">4-8 dígitos</span>
                        </div>
                      </div>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-pin"
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                          placeholder="••••"
                          autoComplete="current-password"
                          className="h-11 pl-10 pr-10 text-sm tracking-[0.3em] font-mono rounded-xl border-zinc-200 dark:border-zinc-800 focus:border-zinc-950 dark:focus:border-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 active:scale-[0.96]"
                          tabIndex={-1}
                          title={showPin ? "Ocultar PIN" : "Mostrar PIN"}
                        >
                          {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>

                      {/* Teclado numérico táctil interactivo para POS / Tablets */}
                      <AnimatePresence>
                        {showNumpad && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="pt-2 overflow-hidden"
                          >
                            <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
                              {/* Visual PIN dots indicator */}
                              <div className="flex items-center justify-center gap-2.5 py-1">
                                {[0, 1, 2, 3].map((idx) => {
                                  const filled = pin.length > idx
                                  return (
                                    <span
                                      key={idx}
                                      className={cn(
                                        "h-3 w-3 rounded-full transition-all duration-150",
                                        filled
                                          ? "bg-zinc-950 dark:bg-white scale-110 shadow-xs"
                                          : "bg-zinc-300 dark:bg-zinc-700"
                                      )}
                                    />
                                  )
                                })}
                              </div>

                              <div className="grid grid-cols-3 gap-1.5">
                                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleNumpadPress(num)}
                                    className="h-11 sm:h-12 rounded-xl text-base font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-foreground shadow-2xs active:scale-[0.96] transition-transform duration-100 ease-out"
                                  >
                                    {num}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => handleNumpadPress("clear")}
                                  className="h-11 sm:h-12 rounded-xl text-xs font-bold text-destructive hover:bg-destructive/10 border border-transparent active:scale-[0.96] transition-transform duration-100 ease-out"
                                  title="Borrar todo"
                                >
                                  C
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNumpadPress("0")}
                                  className="h-11 sm:h-12 rounded-xl text-base font-bold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-foreground shadow-2xs active:scale-[0.96] transition-transform duration-100 ease-out"
                                >
                                  0
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleNumpadPress("backspace")}
                                  className="h-11 sm:h-12 rounded-xl text-xs font-bold text-muted-foreground hover:bg-muted/80 border border-transparent active:scale-[0.96] transition-transform duration-100 ease-out flex items-center justify-center"
                                  title="Borrar último"
                                >
                                  ⌫
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 text-sm font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-xl shadow-md transition-all active:scale-[0.96]"
                      disabled={loading}
                    >
                      {loading ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verificando credenciales…</>
                      ) : (
                        <>Ingresar al Sistema <ArrowRight className="h-4 w-4 ml-2" /></>
                      )}
                    </Button>
                  </form>

                  {/* Acceso Rápido Demo 1-Clic */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-foreground" /> Cuentas de demostración rápida
                    </p>
                    <div className={cn("grid gap-2 text-xs", showSuperAdmin ? "grid-cols-3" : "grid-cols-2")}>
                      <button
                        type="button"
                        onClick={() => quickFill("admin")}
                        className="text-left p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 hover:border-foreground transition-all active:scale-[0.96]"
                      >
                        <p className="font-bold text-zinc-800 dark:text-zinc-200">Admin</p>
                        <p className="text-[11px] text-muted-foreground">admin / <span className="font-mono font-bold text-foreground">1234</span></p>
                      </button>

                      <button
                        type="button"
                        onClick={() => quickFill("vendedor")}
                        className="text-left p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 hover:border-foreground transition-all active:scale-[0.96]"
                      >
                        <p className="font-bold text-zinc-800 dark:text-zinc-200">Vendedor</p>
                        <p className="text-[11px] text-muted-foreground">vendedor / <span className="font-mono font-bold text-foreground">0000</span></p>
                      </button>

                      {showSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => quickFill("superadmin")}
                          className="text-left p-2.5 rounded-xl border border-border bg-muted/30 hover:border-foreground transition-all active:scale-[0.96]"
                        >
                          <p className="font-bold text-foreground">Superadmin</p>
                          <p className="text-[11px] text-muted-foreground">kaled / <span className="font-mono font-bold text-foreground">9999</span></p>
                        </button>
                      )}
                    </div>
                  </div>

                </CardContent>
              </Card>

              {/* Permisos del rol seleccionado */}
              {role && (
                <div className="mt-3 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-3.5 text-xs">
                  <span className="font-bold text-foreground block mb-1">
                    Permisos de {ROLE_CONFIG[role].label}:
                  </span>
                  <div className="flex flex-wrap gap-2 text-muted-foreground text-[11px]">
                    {(role === "admin"
                      ? ["Inventario & Stock", "Compras Proveedores", "Clientes & Fiados", "Finanzas & Gastos", "Reportes de Utilidad", "Backups"]
                      : ["Terminal POS Rápido", "Apertura de Caja", "Arqueo de Turnos", "Tickets Térmicos", "Consulta de Stock"]
                    ).map((p) => (
                      <span key={p} className="flex items-center gap-1 bg-muted/40 text-foreground px-2 py-0.5 rounded-md font-medium">
                        <Check className="h-3 w-3" /> {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ==================== MODO 2: REGISTRAR NEGOCIO ========== */}
          {authMode === "register" && (
            <motion.div
              key="register"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="shadow-xl shadow-black/5 border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md">
                <CardContent className="p-6 sm:p-7 space-y-5">
                  
                  {registerSuccess ? (
                    <div className="py-6 text-center space-y-4">
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-foreground shadow-md">
                        <CheckCircle2 className="h-9 w-9" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white">
                          ¡Registro Enviado con Éxito!
                        </h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                          Tu negocio <strong>{regBusinessName}</strong> ha sido registrado como Administrador Principal y está en proceso de validación.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-left space-y-1.5">
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5 text-foreground" /> Tus datos de acceso:
                        </p>
                        <p className="text-muted-foreground">
                          Correo: <strong className="text-foreground">{regEmail}</strong>
                        </p>
                        <p className="text-muted-foreground">
                          Sede: <strong className="text-foreground">{regBranchName}</strong> ({regRubro})
                        </p>
                      </div>

                      <Button
                        onClick={handleGoToLoginWithRegistered}
                        className="w-full rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold h-11"
                      >
                        Ir a Iniciar Sesión con mi Cuenta <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleRegisterSubmit} className="space-y-4">
                      
                      {/* Cabecera del formulario de registro */}
                      <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                        <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                          <Building2 className="h-5 w-5 text-foreground" /> Crea tu Cuenta de Empresa
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Podrás gestionar inventario, ventas, sucursales y colaboradores.
                        </p>
                      </div>

                      {/* Campos organizados */}
                      <div className="space-y-3 text-xs">
                        
                        {/* Nombre del negocio */}
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Nombre del Negocio / Establecimiento *</Label>
                          <Input
                            placeholder="Ej. Droguería Santa María, Minimarket Los Andes..."
                            value={regBusinessName}
                            onChange={(e) => setRegBusinessName(e.target.value)}
                            required
                            className="h-10 text-xs rounded-xl"
                          />
                        </div>

                        {/* Selector de rubro */}
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Rubro Comercial</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {RUBRO_OPTIONS.map((r) => {
                              const Icon = r.icon
                              const isSelected = regRubro === r.id
                              return (
                                <button
                                  type="button"
                                  key={r.id}
                                  onClick={() => setRegRubro(r.id)}
                                  className={cn(
                                    "flex items-center gap-1.5 p-2 rounded-xl border text-left transition-all",
                                    isSelected
                                      ? "border-zinc-950 dark:border-white bg-zinc-100 dark:bg-zinc-800 text-foreground font-bold"
                                      : "border-zinc-200 dark:border-zinc-800 hover:border-foreground text-muted-foreground"
                                  )}
                                >
                                  <Icon className="h-3.5 w-3.5 shrink-0 text-foreground" />
                                  <span className="truncate text-[11px]">{r.name.split("&")[0]}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Nombre del dueño & Sede */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Nombre del Administrador *</Label>
                            <Input
                              placeholder="Ej. Andrea Gómez"
                              value={regOwnerName}
                              onChange={(e) => setRegOwnerName(e.target.value)}
                              required
                              className="h-10 text-xs rounded-xl"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Nombre de la Sede</Label>
                            <Input
                              placeholder="Sede Principal"
                              value={regBranchName}
                              onChange={(e) => setRegBranchName(e.target.value)}
                              className="h-10 text-xs rounded-xl"
                            />
                          </div>
                        </div>

                        {/* Correo y Teléfono */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Correo Electrónico *</Label>
                            <Input
                              type="email"
                              placeholder="admin@tunegocio.com"
                              value={regEmail}
                              onChange={(e) => setRegEmail(e.target.value)}
                              required
                              className="h-10 text-xs rounded-xl"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Teléfono / WhatsApp</Label>
                            <Input
                              placeholder="+57 300 1234567"
                              value={regPhone}
                              onChange={(e) => setRegPhone(e.target.value)}
                              className="h-10 text-xs rounded-xl"
                            />
                          </div>
                        </div>

                        {/* PIN y Confirmación de PIN */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">PIN de Acceso (4-8 dígitos) *</Label>
                            <div className="relative">
                              <Input
                                type={showRegPin ? "text" : "password"}
                                inputMode="numeric"
                                placeholder="••••"
                                value={regPin}
                                onChange={(e) => setRegPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                                required
                                className="h-10 text-xs rounded-xl tracking-widest font-mono pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setShowRegPin(!showRegPin)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground p-0.5"
                                tabIndex={-1}
                              >
                                {showRegPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-semibold">Confirmar PIN *</Label>
                              {pinMatch !== null && (
                                <span className={cn("text-[10px] font-bold", pinMatch ? "text-foreground" : "text-muted-foreground")}>
                                  {pinMatch ? "✓ Coinciden" : "✗ No coinciden"}
                                </span>
                              )}
                            </div>
                            <Input
                              type={showRegPin ? "text" : "password"}
                              inputMode="numeric"
                              placeholder="••••"
                              value={regPinConfirm}
                              onChange={(e) => setRegPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                              required
                              className="h-10 text-xs rounded-xl tracking-widest font-mono"
                            />
                          </div>
                        </div>

                      </div>

                      {/* Botón de envío */}
                      <Button
                        type="submit"
                        disabled={registerLoading || (pinMatch === false)}
                        className="w-full h-12 text-sm font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-xl shadow-md transition-all mt-2"
                      >
                        {registerLoading ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando tu empresa…</>
                        ) : (
                          <>Crear Cuenta de Negocio <ArrowRight className="h-4 w-4 ml-1.5" /></>
                        )}
                      </Button>
                    </form>
                  )}

                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>

      </div>
    </div>
  )
}

function RoleButton({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: React.ElementType
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-2xl border-2 p-3 transition-transform duration-100 ease-out active:scale-[0.96] flex flex-col justify-between select-none cursor-pointer",
        active
          ? "border-zinc-950 dark:border-white bg-zinc-100 dark:bg-zinc-800 shadow-md ring-1 ring-border"
          : "border-zinc-200 dark:border-zinc-800 hover:border-foreground bg-card"
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl mb-2 transition-colors",
          active ? "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950" : "bg-zinc-100 dark:bg-zinc-800 text-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="font-bold text-xs leading-tight text-zinc-800 dark:text-white">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </button>
  )
}

