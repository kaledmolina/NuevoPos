import { useState, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { type Role, ROLE_CONFIG } from "@/lib/permissions"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Shield, ShoppingCart, ArrowRight, Check, KeyRound, Lock, Info,
  Loader2, User, BookOpen, Store, Pill, Hammer, Shirt, ShoppingBag,
  Crown, Sparkles, Building2, Clock,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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

export default function LoginScreen() {
  const login = useAppStore((s) => s.login)
  const setShowLanding = useAppStore((s) => s.setShowLanding)
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [storeName, setStoreName] = useState("Sistema POS")
  const [storeRubro, setStoreRubro] = useState("drogueria")

  // Estado del modal de auto-registro
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const [regBusinessName, setRegBusinessName] = useState("")
  const [regOwnerName, setRegOwnerName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [regPin, setRegPin] = useState("")
  const [regPinConfirm, setRegPinConfirm] = useState("")
  const [regRubro, setRegRubro] = useState("drogueria")
  const [regBranchName, setRegBranchName] = useState("Sede Principal")

  useEffect(() => {
    apiFetch<Record<string, string>>("/api/settings")
      .then((s) => {
        if (s.store_name) setStoreName(s.store_name)
        if (s.store_rubro) setStoreRubro(s.store_rubro)
      })
      .catch(() => {})
  }, [])

  const selectRole = (r: Role) => {
    setRole(r)
    if (r === "superadmin") {
      setName("kaledmoly@gmail.com")
    } else if (!name || name === "admin" || name === "vendedor" || name === "kaledmoly@gmail.com") {
      setName(r === "admin" ? "admin" : "vendedor")
    }
    setPin("")
  }

  // Rellena rol + usuario + PIN automáticamente (acceso rápido demo)
  const quickFill = (r: Role) => {
    setRole(r)
    if (r === "superadmin") {
      setName("kaledmoly@gmail.com")
      setPin("9999")
    } else {
      setName(r === "admin" ? "admin" : "vendedor")
      setPin(r === "admin" ? "1234" : "0000")
    }
  }

  const submit = async () => {
    if (!role) return toast.error("Selecciona un rol para continuar")
    if (!name.trim()) return toast.error("Ingresa tu usuario o correo electrónico")
    if (!pin.trim()) return toast.error("Ingresa tu PIN")
    setLoading(true)
    try {
      await login(name.trim(), pin.trim())
      toast.success(`Bienvenido al sistema`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regBusinessName.trim()) return toast.error("Ingresa el nombre de tu negocio")
    if (!regOwnerName.trim()) return toast.error("Ingresa el nombre del administrador principal")
    if (!regEmail.trim() || !regEmail.includes("@")) return toast.error("Ingresa un correo válido")
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
      toast.error((err as Error).message)
    } finally {
      setRegisterLoading(false)
    }
  }

  const resetRegisterModal = () => {
    setRegisterOpen(false)
    setRegisterSuccess(false)
    setRegBusinessName("")
    setRegOwnerName("")
    setRegEmail("")
    setRegPhone("")
    setRegPin("")
    setRegPinConfirm("")
    setRegBranchName("Sede Principal")
  }

  const StoreIcon = getRubroIcon(storeRubro)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-background via-muted/30 to-background relative">
      {/* Botón flotante para cambiar tema */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Encabezado */}
        <div className="text-center mb-6">
          <div className="inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/25 mb-4">
            <StoreIcon className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{storeName}</h1>
          <p className="text-sm sm:text-base text-foreground/70 mt-2 flex items-center justify-center gap-1.5 font-medium">
            <Lock className="h-3.5 w-3.5" /> Plataforma SaaS · Acceso Seguro
          </p>
        </div>

        {/* Tarjeta principal del formulario */}
        <Card className="shadow-lg border-border/80 rounded-2xl">
          <CardContent className="p-5 sm:p-7 space-y-6">
            {/* Paso 1: Rol */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                <Label className="text-sm font-semibold text-foreground">Selecciona tu rol</Label>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <RoleCard
                  active={role === "admin"}
                  onClick={() => selectRole("admin")}
                  icon={Shield}
                  title="Admin"
                  desc="Acceso negocio"
                />
                <RoleCard
                  active={role === "vendedor"}
                  onClick={() => selectRole("vendedor")}
                  icon={ShoppingCart}
                  title="Vendedor"
                  desc="Caja y venta"
                />
                <RoleCard
                  active={role === "superadmin"}
                  onClick={() => selectRole("superadmin")}
                  icon={Crown}
                  title="Superadmin"
                  desc="Control SaaS"
                />
              </div>
            </div>

            {/* Separador */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-3 text-xs text-muted-foreground uppercase tracking-wide">Datos de acceso</span>
              </div>
            </div>

            {/* Paso 2: Credenciales */}
            <div className={cn("space-y-5 transition-opacity", !role && "opacity-50 pointer-events-none")}>
              {/* Usuario */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-foreground/80">
                  Usuario o Correo Electrónico
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === "superadmin" ? "kaledmoly@gmail.com" : "Usuario o correo@dominio.com"}
                    autoComplete="username"
                    className="h-12 pl-10 text-base"
                  />
                </div>
              </div>

              {/* PIN */}
              <div className="space-y-2">
                <Label htmlFor="pin" className="text-sm font-medium text-foreground/80">
                  PIN de acceso
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    autoComplete="current-password"
                    className="h-12 pl-10 text-base tracking-[0.4em]"
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                </div>
              </div>

              {/* Botón */}
              <Button
                className="w-full h-12 text-base font-semibold shadow-sm"
                disabled={!role || loading}
                onClick={submit}
              >
                {loading ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Verificando…</>
                ) : (
                  <>Ingresar al POS <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Botón de Auto-Registro para Nuevos Negocios */}
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setRegisterOpen(true); setRegisterSuccess(false); }}
            className="w-full h-11 border-dashed border-primary/50 text-primary hover:bg-primary/5 rounded-xl font-semibold gap-2 shadow-xs transition-all"
          >
            <Building2 className="h-4 w-4" /> ¿Tienes un negocio? Regístrate gratis aquí
          </Button>
        </div>

        {/* Credenciales demo */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-foreground/70 space-y-1.5 w-full">
            <p className="font-semibold text-primary">Credenciales de demostración</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickFill("admin")}
                className="text-left rounded-md bg-background/70 px-2 py-1.5 hover:bg-background hover:ring-1 hover:ring-primary/30 transition-all active:scale-[0.98]"
              >
                <p className="font-medium text-foreground">Admin</p>
                <p className="text-muted-foreground text-[11px]">admin / <span className="font-mono">1234</span></p>
              </button>
              <button
                type="button"
                onClick={() => quickFill("vendedor")}
                className="text-left rounded-md bg-background/70 px-2 py-1.5 hover:bg-background hover:ring-1 hover:ring-primary/30 transition-all active:scale-[0.98]"
              >
                <p className="font-medium text-foreground">Vendedor</p>
                <p className="text-muted-foreground text-[11px]">vendedor / <span className="font-mono">0000</span></p>
              </button>
              <button
                type="button"
                onClick={() => quickFill("superadmin")}
                className="text-left rounded-md bg-background/70 px-2 py-1.5 hover:bg-background hover:ring-1 hover:ring-primary/30 transition-all active:scale-[0.98]"
              >
                <p className="font-medium text-foreground flex items-center gap-1">
                  <Crown className="h-3 w-3 text-amber-500" /> Superadmin
                </p>
                <p className="text-muted-foreground text-[11px]">kaledmoly@... / <span className="font-mono">9999</span></p>
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center pt-0.5">Toca una tarjeta para autocompletar</p>
          </div>
        </div>

        {/* Modal de Registro de Negocio (SaaS Tenant Self-Registration) */}
        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogContent className="sm:max-w-lg rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Building2 className="h-5 w-5 text-primary" />
                Registra tu Negocio en el Sistema
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Crea tu cuenta de empresa como Administrador Principal. Podrás gestionar hasta 3 sedes y tu propio personal.
              </DialogDescription>
            </DialogHeader>

            {registerSuccess ? (
              <div className="py-6 text-center space-y-4">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                  <Clock className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground">¡Solicitud de Registro Recibida!</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Tu negocio <strong>{regBusinessName}</strong> ha sido registrado exitosamente y se encuentra en estado <strong>Pendiente de Aprobación</strong>.
                  </p>
                </div>
                <div className="bg-muted/50 p-4 rounded-xl border border-border text-xs text-left space-y-1.5">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-primary" /> Información importante:
                  </p>
                  <p className="text-muted-foreground">
                    El Superadministrador (<strong>kaledmoly@gmail.com</strong>) validará tu registro para activar el acceso al POS. Una vez aprobado, podrás ingresar con tu correo <strong>{regEmail}</strong> y tu PIN registrado.
                  </p>
                </div>
                <Button onClick={resetRegisterModal} className="w-full rounded-xl font-semibold">
                  Entendido, volver al inicio
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold">Nombre del Negocio / Droguería *</Label>
                    <Input
                      placeholder="Ej. Droguería San Juan, Minimarket Los Andes..."
                      value={regBusinessName}
                      onChange={(e) => setRegBusinessName(e.target.value)}
                      required
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Nombre Administrador Principal *</Label>
                    <Input
                      placeholder="Ej. Carlos Gómez"
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      required
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
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

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Teléfono / WhatsApp</Label>
                    <Input
                      placeholder="+57 300 1234567"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Rubro del Negocio</Label>
                    <select
                      value={regRubro}
                      onChange={(e) => setRegRubro(e.target.value)}
                      className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"
                    >
                      <option value="drogueria">Droguería & Farmacia</option>
                      <option value="tienda">Tienda / Minimarket</option>
                      <option value="ferreteria">Ferretería & Materiales</option>
                      <option value="ropa">Tienda de Ropa / Calzado</option>
                      <option value="otro">Comercio General</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">PIN de Acceso (4-8 dígitos) *</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      placeholder="••••"
                      value={regPin}
                      onChange={(e) => setRegPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      required
                      className="h-10 text-xs rounded-xl tracking-widest font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Confirmar PIN *</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      placeholder="••••"
                      value={regPinConfirm}
                      onChange={(e) => setRegPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      required
                      className="h-10 text-xs rounded-xl tracking-widest font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold">Nombre de tu Primera Sede</Label>
                    <Input
                      placeholder="Ej. Sede Principal, Sede Centro..."
                      value={regBranchName}
                      onChange={(e) => setRegBranchName(e.target.value)}
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setRegisterOpen(false)}
                    className="rounded-xl text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={registerLoading}
                    className="rounded-xl text-xs font-semibold px-5"
                  >
                    {registerLoading ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Registrando…</>
                    ) : (
                      <>Completar Registro <ArrowRight className="h-4 w-4 ml-1.5" /></>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Permisos del rol seleccionado */}
        {role && (
          <div className="mt-3 rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {ROLE_CONFIG[role].label} tiene acceso a:
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(role === "admin"
                ? ["Inventario", "Compras", "Clientes", "Proveedores", "Finanzas", "Reportes", "Backups", "Anular ventas"]
                : ["Punto de Venta", "Apertura de caja", "Arqueo de turno", "Ver ventas", "Consultar productos"]
              ).map((p) => (
                <span key={p} className="flex items-center gap-1 text-xs text-foreground/70">
                  <Check className="h-3 w-3 text-primary shrink-0" /> {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Enlace a la landing educativa */}
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShowLanding(true)}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <BookOpen className="h-4 w-4" /> Conoce todas las funciones y tipos de negocio
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleCard({
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
        "text-left rounded-xl border-2 p-3 sm:p-4 transition-all min-h-[92px] active:scale-[0.98] flex flex-col",
        active
          ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl mb-2.5 transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold text-sm leading-tight">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
    </button>
  )
}
