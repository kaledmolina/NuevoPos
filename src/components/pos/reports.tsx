"use client"

import { useEffect, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { formatCurrency, formatNumber } from "@/lib/format"
import { useAppStore } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  BarChart3, DollarSign, TrendingUp, ShoppingCart, Receipt, Wallet,
  ArrowDownRight, ArrowUpRight, Package, AlertTriangle, CalendarClock,
  Boxes, Trophy, Users, CreditCard, PieChart as PieIcon, Activity,
  PackageCheck,
} from "lucide-react"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie,
  PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

// ---------- Tipos ----------
interface ReportsData {
  range: number
  totalSales: number
  salesCount: number
  avgTicket: number
  totalProfit: number
  totalPurchases: number
  totalIncome: number
  totalExpenses: number
  salesByDay: { date: string; total: number; count: number }[]
  salesByCategory: { name: string; total: number; qty: number }[]
  salesByPaymentMethod: { method: string; total: number; count: number }[]
  topProducts: { name: string; qty: number; total: number; profit: number }[]
  inventorySummary: {
    totalProducts: number
    stockUnits: number
    stockCostValue: number
    stockRetailValue: number
    lowStockCount: number
    expiredCount: number
    expiringCount: number
  }
  bestClients: { name: string; total: number; count: number }[]
}

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  credito: "Crédito",
}

// Paleta esmeralda (farmacia) — alineada con --chart-1..5
const CHART_COLORS = [
  "oklch(0.55 0.13 162)", // emerald primary
  "oklch(0.65 0.15 200)", // teal
  "oklch(0.7 0.16 130)",  // lime
  "oklch(0.72 0.17 80)",  // amber
  "oklch(0.62 0.2 25)",   // red-orange
  "oklch(0.7 0.13 50)",   // soft orange
  "oklch(0.62 0.03 165)", // gris-verde (Otros)
]

const RANGE_LABEL: Record<string, string> = {
  "7": "Últimos 7 días",
  "30": "Últimos 30 días",
  "90": "Últimos 90 días",
}

export default function ReportsView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState("30")

  const load = useCallback(() => {
    setLoading(true)
    apiFetch<ReportsData>(`/api/reports?range=${range}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // ---------- Estados de carga ----------
  if (loading || !data) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  const netCash = data.totalIncome - data.totalExpenses

  const kpis = [
    {
      label: "Ventas totales",
      value: formatCurrency(data.totalSales),
      sub: `${formatNumber(data.salesCount)} transacciones`,
      icon: DollarSign,
      tone: "primary" as const,
    },
    {
      label: "Utilidad bruta",
      value: formatCurrency(data.totalProfit),
      sub: "Margen sobre costo",
      icon: TrendingUp,
      tone: "emerald" as const,
    },
    {
      label: "# Ventas",
      value: formatNumber(data.salesCount),
      sub: `En ${data.range} días`,
      icon: ShoppingCart,
      tone: "teal" as const,
    },
    {
      label: "Ticket promedio",
      value: formatCurrency(data.avgTicket),
      sub: "Por venta",
      icon: Receipt,
      tone: "amber" as const,
    },
    {
      label: "Compras",
      value: formatCurrency(data.totalPurchases),
      sub: "A proveedores",
      icon: PackageCheck,
      tone: "orange" as const,
    },
    {
      label: "Flujo neto",
      value: formatCurrency(netCash),
      sub: `${formatCurrency(data.totalIncome)} / ${formatCurrency(data.totalExpenses)}`,
      icon: Wallet,
      tone: netCash >= 0 ? ("emerald" as const) : ("red" as const),
    },
  ]

  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    teal: "bg-teal-500/10 text-teal-600",
    amber: "bg-amber-500/10 text-amber-600",
    orange: "bg-orange-500/10 text-orange-600",
    red: "bg-red-500/10 text-red-600",
  }

  const hasSales = data.salesCount > 0
  const hasCategoryData = data.salesByCategory.length > 0
  const hasPaymentData = data.salesByPaymentMethod.length > 0

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Reportes
          </h2>
          <p className="text-sm text-muted-foreground">
            Análisis de tu droguería · {RANGE_LABEL[range]}
          </p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className="relative overflow-hidden">
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] md:text-xs text-muted-foreground truncate uppercase tracking-wide">
                      {k.label}
                    </p>
                    <div className={`shrink-0 rounded-lg p-1.5 ${toneMap[k.tone]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <p className="text-lg md:text-xl font-bold leading-tight truncate">
                    {k.value}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{k.sub}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* ---------- Ventas por día / semana ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            {data.range === 7 ? "Ventas por día" : "Ventas por semana"}
          </CardTitle>
          <CardDescription>
            Tendencia de ingresos en el período seleccionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            {hasSales ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.salesByDay} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.13 162)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="oklch(0.55 0.13 162)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis
                    dataKey="date"
                    className="text-[11px]"
                    tickLine={false}
                    axisLine={false}
                    interval={data.range === 7 ? 0 : "preserveStartEnd"}
                  />
                  <YAxis
                    className="text-[11px]"
                    tickLine={false}
                    axisLine={false}
                    width={55}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Ventas"]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      fontSize: 12,
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                    cursor={{ stroke: "oklch(0.55 0.13 162)", strokeWidth: 1, strokeDasharray: "4 4" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="oklch(0.55 0.13 162)"
                    strokeWidth={2.5}
                    fill="url(#gradSales)"
                    dot={{ r: 3, fill: "oklch(0.55 0.13 162)", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="Sin ventas en este período" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------- Categorías + Métodos de pago ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Categorías */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieIcon className="h-4 w-4 text-primary" /> Ventas por categoría
            </CardTitle>
            <CardDescription>Distribución de ingresos por categoría</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {hasCategoryData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.salesByCategory}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {data.salesByCategory.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n: string) => [formatCurrency(v), n]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Sin ventas para clasificar por categoría" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Métodos de pago */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" /> Métodos de pago
            </CardTitle>
            <CardDescription>Preferencias de pago de los clientes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {hasPaymentData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.salesByPaymentMethod.map((p) => ({
                      ...p,
                      label: METHOD_LABEL[p.method] ?? p.method,
                    }))}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                    <XAxis
                      type="number"
                      className="text-[11px]"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      className="text-[11px]"
                      tickLine={false}
                      axisLine={false}
                      width={88}
                    />
                    <Tooltip
                      formatter={(v: number, _n: string, p: { payload?: { count?: number } }) => [
                        formatCurrency(v),
                        `${p?.payload?.count ?? 0} ventas`,
                      ]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                      }}
                      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    />
                    <Bar
                      dataKey="total"
                      radius={[0, 6, 6, 0]}
                      barSize={28}
                    >
                      {data.salesByPaymentMethod.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Sin transacciones en este período" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---------- Top productos + Mejores clientes ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-primary" /> Top productos
            </CardTitle>
            <CardDescription>Los 8 más vendidos por cantidad</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.topProducts.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                Sin ventas registradas en el período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Utilidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm max-w-[180px] truncate">
                          {p.name}
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatNumber(p.qty)}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          {formatCurrency(p.total)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-emerald-600 hidden sm:table-cell">
                          {formatCurrency(p.profit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Mejores clientes
            </CardTitle>
            <CardDescription>Top 5 por monto comprado</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.bestClients.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                No hay ventas asociadas a clientes en el período.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-center"># Compras</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bestClients.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">
                          {c.name}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {formatNumber(c.count)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-sm">
                          {formatCurrency(c.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- Resumen de inventario ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4 text-primary" /> Resumen de inventario
          </CardTitle>
          <CardDescription>Estado actual del inventario y alertas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <SummaryTile
              icon={Package}
              label="Productos activos"
              value={formatNumber(data.inventorySummary.totalProducts)}
              tone="primary"
            />
            <SummaryTile
              icon={Boxes}
              label="Unidades en stock"
              value={formatNumber(data.inventorySummary.stockUnits)}
              tone="teal"
            />
            <SummaryTile
              icon={DollarSign}
              label="Valor en costo"
              value={formatCurrency(data.inventorySummary.stockCostValue)}
              tone="amber"
            />
            <SummaryTile
              icon={TrendingUp}
              label="Valor en venta"
              value={formatCurrency(data.inventorySummary.stockRetailValue)}
              tone="emerald"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AlertTile
              icon={AlertTriangle}
              label="Stock bajo"
              count={data.inventorySummary.lowStockCount}
              tone="amber"
            />
            <AlertTile
              icon={CalendarClock}
              label="Por vencer (30 días)"
              count={data.inventorySummary.expiringCount}
              tone="orange"
            />
            <AlertTile
              icon={AlertTriangle}
              label="Vencidos"
              count={data.inventorySummary.expiredCount}
              tone="red"
            />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm">
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <span className="text-muted-foreground">Margen potencial de inventario</span>
            </div>
            <span className="font-bold text-emerald-700">
              {formatCurrency(data.inventorySummary.stockRetailValue - data.inventorySummary.stockCostValue)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Sub-componentes ----------

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  tone: "primary" | "teal" | "amber" | "emerald"
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    teal: "bg-teal-500/10 text-teal-600",
    amber: "bg-amber-500/10 text-amber-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
  }
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneMap[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
      </div>
      <p className="text-lg font-bold truncate">{value}</p>
    </div>
  )
}

function AlertTile({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: React.ElementType
  label: string
  count: number
  tone: "amber" | "orange" | "red"
}) {
  const toneMap: Record<string, string> = {
    amber: "border-amber-500/30 bg-amber-500/5",
    orange: "border-orange-500/30 bg-orange-500/5",
    red: "border-red-500/30 bg-red-500/5",
  }
  const iconMap: Record<string, string> = {
    amber: "text-amber-600 bg-amber-500/10",
    orange: "text-orange-600 bg-orange-500/10",
    red: "text-red-600 bg-red-500/10",
  }
  return (
    <div className={`flex items-center justify-between rounded-xl border ${toneMap[tone]} p-3`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconMap[tone]} shrink-0`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium truncate">{label}</span>
      </div>
      <Badge variant={count > 0 ? "destructive" : "secondary"} className="shrink-0">
        {formatNumber(count)}
      </Badge>
    </div>
  )
}
