"use client"

import { useEffect, useState } from "react"
import { apiFetch } from "@/lib/api"
import { formatCurrency, formatNumber, expirationStatus, daysUntil, formatDateTime } from "@/lib/format"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DollarSign, ShoppingCart, Package, AlertTriangle, CalendarClock,
  TrendingUp, TrendingDown, Wallet, ArrowRight, Pill, Boxes, Activity,
} from "lucide-react"
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts"

interface DashboardData {
  totalToday: number
  totalMonth: number
  countToday: number
  stockValue: number
  retailValue: number
  lowStock: { id: string; name: string; stock: number; minStock: number }[]
  expiringSoon: { id: string; name: string; expirationDate: string | null }[]
  expired: { id: string; name: string; expirationDate: string | null }[]
  incomeMonth: number
  expenseMonth: number
  cashOpen: boolean
  cashBalance: number
  cashMovements: number
  recentSales: { id: string; invoiceNumber: string; total: number; createdAt: string; client?: { name: string } | null }[]
  salesByDay: { date: string; total: number }[]
  topProducts: { name: string; qty: number; total: number }[]
  totalProducts: number
}

export default function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const setView = useAppStore((s) => s.setView)
  const refreshKey = useAppStore((s) => s.refreshKey)

  useEffect(() => {
    setLoading(true)
    apiFetch<DashboardData>("/api/dashboard")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [refreshKey])

  if (loading || !data) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const stats = [
    { label: "Ventas de hoy", value: formatCurrency(data.totalToday), sub: `${data.countToday} transacciones`, icon: ShoppingCart, tone: "primary" },
    { label: "Ventas del mes", value: formatCurrency(data.totalMonth), sub: "Acumulado mensual", icon: DollarSign, tone: "emerald" },
    { label: "Valor de inventario", value: formatCurrency(data.retailValue), sub: `Costo: ${formatCurrency(data.stockValue)}`, icon: Boxes, tone: "amber" },
    { label: "Caja actual", value: formatCurrency(data.cashBalance), sub: data.cashOpen ? `${data.cashMovements} movimientos` : "Caja cerrada", icon: Wallet, tone: "teal" },
  ]

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="relative overflow-hidden">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm text-muted-foreground truncate">{s.label}</p>
                    <p className="text-xl md:text-2xl font-bold mt-1 truncate">{s.value}</p>
                    <p className="text-[11px] md:text-xs text-muted-foreground mt-1 truncate">{s.sub}</p>
                  </div>
                  <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Alertas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AlertCard
          title="Stock bajo"
          icon={AlertTriangle}
          tone="amber"
          count={data.lowStock.length}
          items={data.lowStock.map((p) => `${p.name} (${p.stock}/${p.minStock})`)}
          onAction={() => setView("products")}
        />
        <AlertCard
          title="Por vencer (30 días)"
          icon={CalendarClock}
          tone="orange"
          count={data.expiringSoon.length}
          items={data.expiringSoon.map((p) => `${p.name} — ${expirationStatus(p.expirationDate).label}`)}
          onAction={() => setView("products")}
        />
        <AlertCard
          title="Productos vencidos"
          icon={AlertTriangle}
          tone="red"
          count={data.expired.length}
          items={data.expired.map((p) => `${p.name} — vencido hace ${Math.abs(daysUntil(p.expirationDate) ?? 0)}d`)}
          onAction={() => setView("products")}
        />
      </div>

      {/* Gráfico + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-primary" /> Ventas últimos 7 días</CardTitle>
            <CardDescription>Tendencia de ingresos por día</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesByDay}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.13 162)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.55 0.13 162)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tickLine={false} axisLine={false} />
                  <YAxis className="text-xs" tickLine={false} axisLine={false} width={50} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="total" stroke="oklch(0.55 0.13 162)" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" /> Top productos del mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ventas aún este mes.</p>
            )}
            {data.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.qty} unidades</p>
                  </div>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">{formatCurrency(p.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Finanzas resumen + ventas recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Flujo del mes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 p-3">
              <span className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-emerald-600" /> Ingresos</span>
              <span className="font-semibold text-emerald-700">{formatCurrency(data.incomeMonth)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-red-500/10 p-3">
              <span className="flex items-center gap-2 text-sm"><TrendingDown className="h-4 w-4 text-red-600" /> Egresos</span>
              <span className="font-semibold text-red-700">{formatCurrency(data.expenseMonth)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Balance neto</span>
              <span className={`font-bold ${data.incomeMonth - data.expenseMonth >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {formatCurrency(data.incomeMonth - data.expenseMonth)}
              </span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setView("finance")}>
              Ver ingresos y egresos <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Ventas recientes</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView("sales")}>Ver todas</Button>
          </CardHeader>
          <CardContent className="space-y-1 max-h-80 overflow-y-auto scroll-thin">
            {data.recentSales.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay ventas registradas.</p>
            )}
            {data.recentSales.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Pill className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.client?.name ?? "Cliente genérico"} · {formatDateTime(s.createdAt)}</p>
                  </div>
                </div>
                <span className="font-semibold whitespace-nowrap">{formatCurrency(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Inventario resumen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-primary" /> Inventario</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setView("products")}>Gestionar <ArrowRight className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-primary">{formatNumber(data.totalProducts)}</p>
              <p className="text-xs text-muted-foreground mt-1">Productos activos</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-amber-600">{formatNumber(data.lowStock.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Stock bajo</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-orange-600">{formatNumber(data.expiringSoon.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Por vencer</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-2xl font-bold text-red-600">{formatNumber(data.expired.length)}</p>
              <p className="text-xs text-muted-foreground mt-1">Vencidos</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AlertCard({
  title, icon: Icon, tone, count, items, onAction,
}: {
  title: string
  icon: React.ElementType
  tone: "amber" | "orange" | "red"
  count: number
  items: string[]
  onAction: () => void
}) {
  const toneMap = {
    amber: "border-amber-500/30 bg-amber-500/5",
    orange: "border-orange-500/30 bg-orange-500/5",
    red: "border-red-500/30 bg-red-500/5",
  }
  const iconMap = {
    amber: "text-amber-600 bg-amber-500/10",
    orange: "text-orange-600 bg-orange-500/10",
    red: "text-red-600 bg-red-500/10",
  }
  return (
    <Card className={`${toneMap[tone]} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconMap[tone]}`}><Icon className="h-4 w-4" /></span>
            {title}
          </CardTitle>
          <Badge variant={count > 0 ? "destructive" : "secondary"}>{count}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Todo en orden ✓</p>
        ) : (
          <ul className="space-y-1 max-h-28 overflow-y-auto scroll-thin">
            {items.slice(0, 5).map((it, i) => (
              <li key={i} className="text-xs text-muted-foreground truncate">• {it}</li>
            ))}
            {items.length > 5 && <li className="text-xs text-muted-foreground">y {items.length - 5} más…</li>}
          </ul>
        )}
        {count > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 -ml-2 text-xs" onClick={onAction}>
            Ver detalles <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
