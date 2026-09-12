"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { formatCurrency } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  IconCrown,
  IconBuildingStore,
  IconUsers,
  IconCheck,
  IconX,
  IconLock,
  IconLockOpen,
  IconTrophy,
  IconRefresh,
  IconSearch,
  IconMail,
  IconPhone,
  IconClock,
  IconAlertTriangle,
  IconChartBar,
  IconShieldCheck,
  IconBuildingCommunity,
  IconDatabase,
  IconTrash,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface SuperAdminStats {
  totalTenants: number
  activeTenants: number
  pendingTenants: number
  disabledTenants: number
  totalBranches: number
  totalUsers: number
  totalSalesVolume: number
  totalSalesCount: number
  rubroDistribution: Record<string, number>
}

interface TenantItem {
  id: string
  name: string
  slug: string | null
  rubro: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string | null
  status: "pendiente" | "aprobado" | "inactivo"
  maxBranches: number
  branchesCount: number
  usersCount: number
  branches: { id: string; name: string; isMain: boolean; active: boolean }[]
  ownerUser: { id: string; name: string; active: boolean } | null
  totalSales: number
  salesCount: number
  approvedAt: string | null
  approvedBy: string | null
  createdAt: string
}

interface RankedAdmin {
  rank: number
  tenantId: string
  businessName: string
  rubro: string
  ownerName: string
  ownerEmail: string
  ownerPhone: string
  status: string
  totalSales: number
  salesCount: number
  avgTicket: number
  branchesCount: number
  createdAt: string
}

export default function SuperadminPanel() {
  const [activeTab, setActiveTab] = useState<"tenants" | "ranking" | "stats">("tenants")
  const [stats, setStats] = useState<SuperAdminStats | null>(null)
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [ranking, setRanking] = useState<RankedAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendiente" | "aprobado" | "inactivo">("todos")
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [seedingDemo, setSeedingDemo] = useState(false)
  const [resettingDemo, setResettingDemo] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  const handleGenerateDemo = async () => {
    setSeedingDemo(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/seed", {
        method: "POST",
      })
      toast.success(res.message || "Datos demo SaaS generados exitosamente")
      loadData()
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSeedingDemo(false)
    }
  }

  const handleResetDemo = async () => {
    setResettingDemo(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "BORRAR DEMO" }),
      })
      toast.success(res.message || "Datos demo limpiados exitosamente")
      setResetConfirmOpen(false)
      loadData()
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResettingDemo(false)
    }
  }

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true)
      const [statsRes, tenantsRes, rankingRes] = await Promise.all([
        apiFetch<{ ok: boolean; stats: SuperAdminStats }>("/api/superadmin/stats"),
        apiFetch<{ ok: boolean; tenants: TenantItem[] }>("/api/superadmin/tenants"),
        apiFetch<{ ok: boolean; ranking: RankedAdmin[] }>("/api/superadmin/ranking"),
      ])

      if (statsRes.ok) setStats(statsRes.stats)
      if (tenantsRes.ok) setTenants(tenantsRes.tenants)
      if (rankingRes.ok) setRanking(rankingRes.ranking)
    } catch (e) {
      toast.error("Error al cargar datos de Superadministrador: " + (e as Error).message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAction = async (tenantId: string, action: "approve" | "disable" | "enable") => {
    setActionLoadingId(tenantId)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/api/superadmin/tenants/${tenantId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        toast.success(res.message)
        await loadData()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActionLoadingId(null)
    }
  }

  // Filtrado en clientes
  const filteredTenants = tenants.filter((t) => {
    if (statusFilter !== "todos" && t.status !== statusFilter) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      t.name.toLowerCase().includes(q) ||
      t.ownerName.toLowerCase().includes(q) ||
      t.ownerEmail.toLowerCase().includes(q) ||
      (t.ownerPhone && t.ownerPhone.includes(q))
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <IconRefresh className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Cargando Panel Superadministrador SaaS...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-card via-card/80 to-primary/5 p-6 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shadow-inner shrink-0">
            <IconCrown className="h-8 w-8 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Panel Superadministrador SaaS</h1>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs">
                Master Root
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Monitoreo centralizado, control de acceso y ranking de ventas · <span className="font-semibold text-foreground">kaledmoly@gmail.com</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={handleGenerateDemo}
            disabled={seedingDemo || refreshing}
            className="h-10 px-3.5 rounded-xl text-xs font-semibold gap-1.5 shadow-xs"
            title="Genera empresas, múltiples sedes, personal y ventas demo"
          >
            {seedingDemo ? (
              <IconRefresh className="h-4 w-4 animate-spin" />
            ) : (
              <IconDatabase className="h-4 w-4" />
            )}
            Cargar Demo SaaS
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            disabled={resettingDemo || refreshing}
            className="h-10 px-3.5 rounded-xl text-xs font-semibold gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
            title="Purga todas las empresas y datos demo, conservando solo tu Superadmin con una sede vacía"
          >
            <IconTrash className="h-4 w-4" />
            Limpiar Demo (Reset)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={refreshing}
            className="h-10 px-3 rounded-xl text-xs font-semibold gap-1.5"
          >
            <IconRefresh className={cn("h-4 w-4", refreshing && "animate-spin text-primary")} />
            Refrescar
          </Button>
        </div>
      </div>

      {/* Tarjetas KPI Globales SaaS */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <Card className="rounded-2xl border-border/80 shadow-xs">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total Negocios</span>
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <IconBuildingStore className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold tracking-tight">{stats.totalTenants}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Empresas registradas</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 shadow-xs">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Activos / Aprobados</span>
                <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <IconShieldCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {stats.activeTenants}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Operando en el POS</p>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("rounded-2xl border-border/80 shadow-xs", stats.pendingTenants > 0 && "border-amber-500/40 bg-amber-500/5")}>
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Pendientes Aprobación</span>
                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center", stats.pendingTenants > 0 ? "bg-amber-500 text-white font-bold" : "bg-muted text-muted-foreground")}>
                  <IconClock className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className={cn("text-2xl font-bold tracking-tight", stats.pendingTenants > 0 ? "text-amber-600 dark:text-amber-400" : "")}>
                  {stats.pendingTenants}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Esperan tu aprobación</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 shadow-xs">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Ventas Plataforma</span>
                <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <IconChartBar className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400 truncate">
                  {formatCurrency(stats.totalSalesVolume)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stats.totalSalesCount} ventas totales</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 shadow-xs">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Infraestructura</span>
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                  <IconBuildingCommunity className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold tracking-tight">{stats.totalBranches} sedes</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stats.totalUsers} usuarios activos</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navegación por Pestañas */}
      <div className="flex border-b border-border/80 gap-6">
        <button
          onClick={() => setActiveTab("tenants")}
          className={cn(
            "pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer",
            activeTab === "tenants"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <IconBuildingStore className="h-4 w-4" />
          Negocios & Aprobaciones
          {stats && stats.pendingTenants > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {stats.pendingTenants}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("ranking")}
          className={cn(
            "pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer",
            activeTab === "ranking"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <IconTrophy className="h-4 w-4 text-amber-500" />
          Ranking de Ventas (Admins Principales)
        </button>
      </div>

      {/* PESTAÑA 1: GESTIÓN DE NEGOCIOS Y APROBACIONES */}
      {activeTab === "tenants" && (
        <div className="space-y-4">
          {/* Barra de Filtros y Búsqueda */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <Button
                variant={statusFilter === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("todos")}
                className="rounded-xl text-xs h-9"
              >
                Todos ({tenants.length})
              </Button>
              <Button
                variant={statusFilter === "pendiente" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("pendiente")}
                className={cn(
                  "rounded-xl text-xs h-9",
                  statusFilter !== "pendiente" && stats && stats.pendingTenants > 0 && "border-amber-500/50 text-amber-600"
                )}
              >
                Pendientes ({stats?.pendingTenants || 0})
              </Button>
              <Button
                variant={statusFilter === "aprobado" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("aprobado")}
                className="rounded-xl text-xs h-9"
              >
                Aprobados ({stats?.activeTenants || 0})
              </Button>
              <Button
                variant={statusFilter === "inactivo" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("inactivo")}
                className="rounded-xl text-xs h-9"
              >
                Inactivos ({stats?.disabledTenants || 0})
              </Button>
            </div>

            <div className="relative w-full sm:w-72">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar negocio o admin..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Listado de Negocios */}
          {filteredTenants.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-dashed border-border p-6">
              <IconBuildingStore className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">No se encontraron negocios</p>
              <p className="text-xs text-muted-foreground mt-1">
                No hay negocios que coincidan con el filtro actual.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredTenants.map((t) => {
                const isPending = t.status === "pendiente"
                const isActive = t.status === "aprobado"
                const isDisabled = t.status === "inactivo"
                const isLoading = actionLoadingId === t.id

                return (
                  <Card
                    key={t.id}
                    className={cn(
                      "rounded-2xl border transition-all shadow-xs hover:shadow-sm overflow-hidden",
                      isPending ? "border-amber-500/40 bg-amber-500/[0.02]" : "border-border"
                    )}
                  >
                    <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Info del Negocio */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-foreground truncate">{t.name}</h3>
                          <Badge variant="outline" className="capitalize text-[10px] font-medium">
                            {t.rubro}
                          </Badge>

                          {isPending && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] gap-1">
                              <IconClock className="h-3 w-3" /> Pendiente de Aprobación
                            </Badge>
                          )}
                          {isActive && (
                            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-medium text-[11px] gap-1">
                              <IconCheck className="h-3 w-3" /> Aprobado & Activo
                            </Badge>
                          )}
                          {isDisabled && (
                            <Badge variant="destructive" className="font-medium text-[11px] gap-1">
                              <IconLock className="h-3 w-3" /> Acceso Inhabilitado
                            </Badge>
                          )}
                        </div>

                        {/* Administrador Principal */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground pt-1">
                          <div className="flex items-center gap-1.5 truncate">
                            <IconUsers className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>
                              Admin: <strong className="text-foreground">{t.ownerName}</strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate">
                            <IconMail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{t.ownerEmail}</span>
                          </div>
                          {t.ownerPhone && (
                            <div className="flex items-center gap-1.5 truncate">
                              <IconPhone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>{t.ownerPhone}</span>
                            </div>
                          )}
                        </div>

                        {/* Sedes y Registro */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
                          <span>
                            Sedes creadas: <strong>{t.branchesCount} / {t.maxBranches}</strong> ({t.branches.map((b) => b.name).join(", ")})
                          </span>
                          <span>·</span>
                          <span>
                            Personal: <strong>{t.usersCount} usuario(s)</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Registrado: {new Date(t.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                      </div>

                      {/* Métricas de Ventas del Negocio */}
                      <div className="flex items-center gap-6 lg:border-l lg:pl-6 border-border/60 shrink-0">
                        <div className="text-right">
                          <p className="text-[11px] font-medium text-muted-foreground">Ventas Totales</p>
                          <p className="text-base sm:text-lg font-bold text-foreground">
                            {formatCurrency(t.totalSales)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{t.salesCount} facturas</p>
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex items-center gap-2">
                          {isPending && (
                            <Button
                              size="sm"
                              onClick={() => handleAction(t.id, "approve")}
                              disabled={isLoading}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-9 font-semibold gap-1.5 shadow-xs"
                            >
                              <IconCheck className="h-4 w-4" />
                              Aprobar Registro
                            </Button>
                          )}

                          {isActive && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(t.id, "disable")}
                              disabled={isLoading}
                              className="text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 rounded-xl text-xs h-9 font-medium gap-1.5"
                            >
                              <IconLock className="h-4 w-4" />
                              Inhabilitar Acceso
                            </Button>
                          )}

                          {isDisabled && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAction(t.id, "enable")}
                              disabled={isLoading}
                              className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 rounded-xl text-xs h-9 font-medium gap-1.5"
                            >
                              <IconLockOpen className="h-4 w-4" />
                              Rehabilitar Acceso
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 2: RANKING DE ADMINISTRADORES PRINCIPALES */}
      {activeTab === "ranking" && (
        <div className="space-y-6">
          {/* Podio Top 3 */}
          {ranking.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Top 2 */}
              <Card className="rounded-2xl border-border order-2 md:order-1 bg-gradient-to-t from-slate-500/5 to-transparent">
                <CardContent className="p-5 text-center space-y-2">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xl font-bold shadow-xs">
                    🥈
                  </div>
                  <h4 className="font-bold text-base text-foreground truncate">{ranking[1].businessName}</h4>
                  <p className="text-xs text-muted-foreground font-medium">{ranking[1].ownerName} ({ranking[1].ownerEmail})</p>
                  <div className="pt-2 border-t border-border/60 mt-2">
                    <p className="text-xl font-bold text-foreground">{formatCurrency(ranking[1].totalSales)}</p>
                    <p className="text-[11px] text-muted-foreground">{ranking[1].salesCount} ventas · Prom. {formatCurrency(ranking[1].avgTicket)}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Top 1 */}
              <Card className="rounded-2xl border-amber-500/30 order-1 md:order-2 bg-gradient-to-t from-amber-500/10 to-transparent shadow-md">
                <CardContent className="p-6 text-center space-y-2">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 text-2xl font-bold shadow-md shadow-amber-500/20">
                    🥇
                  </div>
                  <Badge className="bg-amber-500 text-white font-bold text-xs uppercase tracking-wide">
                    Líder de Ventas SaaS
                  </Badge>
                  <h3 className="font-extrabold text-lg text-foreground truncate">{ranking[0].businessName}</h3>
                  <p className="text-xs text-muted-foreground font-medium">{ranking[0].ownerName} ({ranking[0].ownerEmail})</p>
                  <div className="pt-2 border-t border-amber-500/20 mt-2">
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{formatCurrency(ranking[0].totalSales)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ranking[0].salesCount} ventas · Prom. {formatCurrency(ranking[0].avgTicket)}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Top 3 */}
              <Card className="rounded-2xl border-border order-3 md:order-3 bg-gradient-to-t from-amber-700/5 to-transparent">
                <CardContent className="p-5 text-center space-y-2">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-800/15 text-amber-800 dark:text-amber-300 text-xl font-bold shadow-xs">
                    🥉
                  </div>
                  <h4 className="font-bold text-base text-foreground truncate">{ranking[2].businessName}</h4>
                  <p className="text-xs text-muted-foreground font-medium">{ranking[2].ownerName} ({ranking[2].ownerEmail})</p>
                  <div className="pt-2 border-t border-border/60 mt-2">
                    <p className="text-xl font-bold text-foreground">{formatCurrency(ranking[2].totalSales)}</p>
                    <p className="text-[11px] text-muted-foreground">{ranking[2].salesCount} ventas · Prom. {formatCurrency(ranking[2].avgTicket)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tabla Clasificatoria Completa */}
          <Card className="rounded-2xl border-border shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Tabla General de Ventas por Negocio</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Métricas de facturación consolidadas de todos los administradores principales.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground text-left text-xs uppercase font-semibold">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">Negocio</th>
                    <th className="py-3 px-4">Administrador Principal</th>
                    <th className="py-3 px-4 text-center">Sedes</th>
                    <th className="py-3 px-4 text-right">Cant. Ventas</th>
                    <th className="py-3 px-4 text-right">Ticket Promedio</th>
                    <th className="py-3 px-4 text-right">Total Facturado</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ranking.map((r) => {
                    const isTop1 = r.rank === 1
                    const isTop2 = r.rank === 2
                    const isTop3 = r.rank === 3

                    return (
                      <tr key={r.tenantId} className={cn("hover:bg-muted/30 transition-colors", isTop1 && "bg-amber-500/[0.03]")}>
                        <td className="py-3.5 px-4 text-center font-bold">
                          {isTop1 ? "🥇" : isTop2 ? "🥈" : isTop3 ? "🥉" : `#${r.rank}`}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-foreground">{r.businessName}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">{r.rubro}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-foreground">{r.ownerName}</p>
                          <p className="text-[11px] text-muted-foreground">{r.ownerEmail}</p>
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium">
                          {r.branchesCount}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium">
                          {r.salesCount.toLocaleString("es-CO")}
                        </td>
                        <td className="py-3.5 px-4 text-right text-muted-foreground">
                          {formatCurrency(r.avgTicket)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-foreground">
                          {formatCurrency(r.totalSales)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] capitalize",
                              r.status === "aprobado" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                              r.status === "pendiente" && "bg-amber-500/10 text-amber-600 border-amber-500/30",
                              r.status === "inactivo" && "bg-red-500/10 text-red-600 border-red-500/30"
                            )}
                          >
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      {/* Modal de confirmación para purga de datos demo */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent className="max-w-md rounded-2xl border-destructive/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive font-bold">
              <IconAlertTriangle className="h-5 w-5" /> ¿Purgar datos demo y reiniciar sistema?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2 text-xs leading-relaxed text-muted-foreground">
              <span className="block">
                Esta acción eliminará de forma permanente todos los negocios registrados, ventas ficticias, productos, cajas, compras y personal de demostración.
              </span>
              <span className="font-semibold text-foreground bg-muted p-2.5 rounded-lg block border border-border">
                ⚠️ Únicamente se conservará tu cuenta de Superadministrador (kaledmoly@gmail.com) con una sede vacía lista para operar.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingDemo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetDemo}
              disabled={resettingDemo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold"
            >
              {resettingDemo ? (
                <>
                  <IconRefresh className="h-4 w-4 mr-1.5 animate-spin" /> Purgando…
                </>
              ) : (
                "Sí, purgar todo y reiniciar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
