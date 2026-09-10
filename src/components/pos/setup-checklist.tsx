"use client"

import { useEffect, useState } from "react"
import { useAppStore } from "@/lib/store"
import { apiFetch } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Package, Wallet, ShoppingCart, Tag, X, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "pos-setup-checklist-done"

interface ChecklistState {
  hasCategory: boolean
  hasProduct: boolean
  cashOpen: boolean
  hasSale: boolean
}

export default function SetupChecklist() {
  const role = useAppStore((s) => s.role)
  const setView = useAppStore((s) => s.setView)
  const refreshKey = useAppStore((s) => s.refreshKey)
  const [state, setState] = useState<ChecklistState>({
    hasCategory: false, hasProduct: false, cashOpen: false, hasSale: false,
  })
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window === "undefined") return
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1")
  }, [])

  useEffect(() => {
    if (role !== "admin" || dismissed) return
    let active = true
    setLoading(true)
    Promise.all([
      apiFetch<unknown[]>("/api/categories").catch(() => []),
      apiFetch<unknown[]>("/api/products").catch(() => []),
      apiFetch<{ status?: string } | null>("/api/cash").catch(() => null),
      apiFetch<unknown[]>("/api/sales?limit=1").catch(() => []),
    ]).then(([cats, prods, cash, sales]) => {
      if (!active) return
      setState({
        hasCategory: cats.length > 0,
        hasProduct: prods.length > 0,
        cashOpen: !!cash && cash.status === "abierta",
        hasSale: sales.length > 0,
      })
      setLoading(false)
    })
    return () => { active = false }
  }, [role, dismissed, refreshKey])

  if (role !== "admin" || dismissed || loading) return null

  const completed = state.hasCategory && state.hasProduct && state.cashOpen && state.hasSale
  const completedCount = Object.values(state).filter(Boolean).length

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setDismissed(true)
  }

  const steps = [
    {
      done: state.hasCategory,
      icon: Tag,
      title: "Crea una categoría",
      desc: "Organiza tus productos por tipo",
      action: () => setView("products"),
      actionLabel: "Ir a productos → Categorías",
    },
    {
      done: state.hasProduct,
      icon: Package,
      title: "Registra un producto",
      desc: "Con precio, stock y vencimiento",
      action: () => setView("products"),
      actionLabel: "Nuevo producto",
    },
    {
      done: state.cashOpen,
      icon: Wallet,
      title: "Abre la caja",
      desc: "Inicia tu turno de trabajo",
      action: () => setView("cash"),
      actionLabel: "Abrir caja",
    },
    {
      done: state.hasSale,
      icon: ShoppingCart,
      title: "Haz una venta",
      desc: "Prueba el punto de venta",
      action: () => setView("pos"),
      actionLabel: "Ir al POS",
    },
  ]

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                {completed ? "¡Configuración completa! 🎉" : "Configura tu droguería"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {completed ? "Ya puedes operar el sistema con normalidad." : `${completedCount} de 4 pasos completados`}
              </p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Barra de progreso */}
        <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${(completedCount / 4) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {steps.map((s, i) => {
            const Icon = s.icon
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 transition-all",
                  s.done ? "border-primary/20 bg-primary/5" : "border-border"
                )}
              >
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  s.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {s.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", s.done && "line-through text-muted-foreground")}>{s.title}</p>
                  <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                </div>
                {!s.done && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={s.action}>
                    {s.actionLabel}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        {completed && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-emerald-600 font-medium">✓ Todo listo para vender</p>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dismiss}>Ocultar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
