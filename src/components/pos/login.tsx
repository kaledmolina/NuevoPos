"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { type Role, ROLE_CONFIG } from "@/lib/permissions"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pill, Shield, ShoppingCart, ArrowRight, Check, KeyRound, Lock, Info, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function LoginScreen() {
  const login = useAppStore((s) => s.login)
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)

  const selectRole = (r: Role) => {
    setRole(r)
    setName(r === "admin" ? "admin" : "vendedor")
    setPin("")
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="w-full max-w-md px-1">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/25 mb-4">
            <Pill className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Droguería La Salud</h1>
          <p className="text-sm sm:text-base text-foreground/70 mt-1.5 flex items-center justify-center gap-1.5 font-medium">
            <Lock className="h-3.5 w-3.5" /> Sistema POS · Acceso restringido
          </p>
        </div>

        {/* Selector de rol */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 mb-5">
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

        {/* Credenciales */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Usuario</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="admin o vendedor"
              autoComplete="username"
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="pin">PIN de acceso</Label>
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
                className="h-11 pl-10 tracking-[0.3em]"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          </div>
          <Button className="w-full h-12 text-base font-semibold" disabled={!role || loading} onClick={submit}>
            {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Verificando…</> : <>Ingresar <ArrowRight className="h-4 w-4 ml-2" /></>}
          </Button>
        </div>

        {/* Credenciales demo */}
        <div className="mt-5 rounded-xl border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Credenciales de demostración
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="font-semibold">Administrador</p>
              <p className="text-muted-foreground">Usuario: <code className="font-mono">admin</code></p>
              <p className="text-muted-foreground">PIN: <code className="font-mono">1234</code></p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="font-semibold">Vendedor</p>
              <p className="text-muted-foreground">Usuario: <code className="font-mono">vendedor</code></p>
              <p className="text-muted-foreground">PIN: <code className="font-mono">0000</code></p>
            </div>
          </div>
        </div>

        {/* Descripción del rol seleccionado */}
        {role && (
          <div className="mt-4 rounded-xl border bg-primary/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1.5">
              {ROLE_CONFIG[role].label} — permisos
            </p>
            <ul className="space-y-1">
              {(role === "admin"
                ? [
                    "Gestionar inventario y productos",
                    "Registrar compras a proveedores",
                    "Administrar clientes y proveedores",
                    "Ingresos, egresos y reportes",
                    "Anular ventas y arqueo de caja",
                  ]
                : [
                    "Vender en el punto de venta",
                    "Abrir y cerrar caja (arqueo)",
                    "Registrar ingresos/egresos de caja",
                    "Consultar historial de ventas",
                    "Ver inventario (solo lectura)",
                  ]
              ).map((p) => (
                <li key={p} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3 w-3 text-primary shrink-0" /> {p}
                </li>
              ))}
            </ul>
          </div>
        )}
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
        "text-left rounded-xl border-2 p-3 sm:p-4 transition-all min-h-[88px] active:scale-[0.98]",
        active
          ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl mb-2 transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </div>
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  )
}
