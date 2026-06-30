"use client"

import { useState } from "react"
import { useAppStore } from "@/lib/store"
import { type Role, ROLE_CONFIG } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pill, Shield, ShoppingCart, ArrowRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function LoginScreen() {
  const login = useAppStore((s) => s.login)
  const [role, setRole] = useState<Role | null>(null)
  const [name, setName] = useState("")

  const submit = () => {
    if (!role) return toast.error("Selecciona un rol para continuar")
    const finalName = name.trim() || (role === "admin" ? "Administrador" : "Vendedor")
    login(role, finalName)
    toast.success(`Bienvenido, ${finalName}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 mb-4">
            <Pill className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Droguería La Salud</h1>
          <p className="text-sm text-muted-foreground mt-1">Sistema POS · Selecciona tu rol para iniciar sesión</p>
        </div>

        {/* Selector de rol */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <RoleCard
            active={role === "admin"}
            onClick={() => setRole("admin")}
            icon={Shield}
            title="Administrador"
            desc="Acceso completo"
          />
          <RoleCard
            active={role === "vendedor"}
            onClick={() => setRole("vendedor")}
            icon={ShoppingCart}
            title="Vendedor"
            desc="Venta y caja"
          />
        </div>

        {/* Nombre */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Tu nombre</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={role === "admin" ? "Administrador" : "Nombre del vendedor"}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="h-11"
            />
          </div>
          <Button className="w-full h-11 text-base" disabled={!role} onClick={submit}>
            Ingresar <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* Descripción del rol seleccionado */}
        {role && (
          <div className="mt-5 rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1.5">
              {ROLE_CONFIG[role].label} — permisos
            </p>
            <p className="text-sm text-muted-foreground mb-3">{ROLE_CONFIG[role].description}</p>
            <ul className="space-y-1">
              {getPerms(role).map((p) => (
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

function getPerms(role: Role): string[] {
  if (role === "admin") {
    return [
      "Gestionar inventario y productos",
      "Registrar compras a proveedores",
      "Administrar clientes y proveedores",
      "Ingresos, egresos y reportes",
      "Anular ventas y arqueo de caja",
    ]
  }
  return [
    "Vender en el punto de venta",
    "Abrir y cerrar caja (arqueo)",
    "Registrar ingresos/egresos de caja",
    "Consultar historial de ventas",
    "Ver inventario (solo lectura)",
  ]
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
        "text-left rounded-xl border-2 p-4 transition-all",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg mb-2 transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  )
}
