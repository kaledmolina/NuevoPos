"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { type Role, ROLE_CONFIG } from "@/lib/permissions"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Pill, Shield, ShoppingCart, ArrowRight, Check, KeyRound, Lock, Info, Loader2, User, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function LoginScreen() {
  const login = useAppStore((s) => s.login)
  const setShowLanding = useAppStore((s) => s.setShowLanding)
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)

  const selectRole = (r: Role) => {
    setRole(r)
    setName(r === "admin" ? "admin" : "vendedor")
    setPin("")
  }

  // Rellena rol + usuario + PIN automáticamente (acceso rápido demo)
  const quickFill = (r: Role) => {
    setRole(r)
    setName(r === "admin" ? "admin" : "vendedor")
    setPin(r === "admin" ? "1234" : "0000")
  }

  const submit = async () => {
    if (!role) return toast.error("Selecciona un rol para continuar")
    if (!name.trim()) return toast.error("Ingresa tu nombre de usuario")
    if (!pin.trim()) return toast.error("Ingresa tu PIN")
    setLoading(true)
    try {
      await login(name.trim(), pin.trim())
      toast.success(`Bienvenido`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="w-full max-w-md">
        {/* Encabezado */}
        <div className="text-center mb-6">
          <div className="inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/25 mb-4">
            <Pill className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Droguería La Salud</h1>
          <p className="text-sm sm:text-base text-foreground/70 mt-2 flex items-center justify-center gap-1.5 font-medium">
            <Lock className="h-3.5 w-3.5" /> Sistema POS · Acceso restringido
          </p>
        </div>

        {/* Tarjeta principal del formulario */}
        <Card className="shadow-lg border-border/60">
          <CardContent className="p-5 sm:p-7 space-y-6">
            {/* Paso 1: Rol */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                <Label className="text-sm font-semibold text-foreground">Selecciona tu rol</Label>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <RoleCard
                  active={role === "admin"}
                  onClick={() => selectRole("admin")}
                  icon={Shield}
                  title="Administrador"
                  desc="Acceso completo"
                />
                <RoleCard
                  active={role === "vendedor"}
                  onClick={() => selectRole("vendedor")}
                  icon={ShoppingCart}
                  title="Vendedor"
                  desc="Venta y caja"
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
                  Usuario
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="admin o vendedor"
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
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
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
                  <>Ingresar <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Credenciales demo — sutil, debajo del formulario */}
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-foreground/70 space-y-1.5 w-full">
            <p className="font-semibold text-primary">Credenciales de demostración</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => quickFill("admin")}
                className="text-left rounded-md bg-background/70 px-2.5 py-1.5 hover:bg-background hover:ring-1 hover:ring-primary/30 transition-all active:scale-[0.98]"
              >
                <p className="font-medium text-foreground">Administrador</p>
                <p className="text-muted-foreground">admin / <span className="font-mono">1234</span></p>
              </button>
              <button
                type="button"
                onClick={() => quickFill("vendedor")}
                className="text-left rounded-md bg-background/70 px-2.5 py-1.5 hover:bg-background hover:ring-1 hover:ring-primary/30 transition-all active:scale-[0.98]"
              >
                <p className="font-medium text-foreground">Vendedor</p>
                <p className="text-muted-foreground">vendedor / <span className="font-mono">0000</span></p>
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center pt-0.5">Toca para rellenar automáticamente</p>
          </div>
        </div>

        {/* Permisos del rol seleccionado — colapsable sutil */}
        {role && (
          <div className="mt-3 rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {ROLE_CONFIG[role].label} puede:
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(role === "admin"
                ? ["Inventario", "Compras", "Clientes", "Proveedores", "Finanzas", "Reportes", "Anular ventas"]
                : ["Vender", "Abrir/caja", "Arqueo", "Ver ventas", "Inventario (lectura)"]
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
            <BookOpen className="h-4 w-4" /> Ver guía del sistema
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
