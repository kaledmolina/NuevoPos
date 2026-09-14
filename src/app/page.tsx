"use client"

import { useEffect, useState, useMemo } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { useAppStore } from "@/lib/store"
import { apiFetch } from "@/lib/api"
import { ROLE_CONFIG, canAccessView, defaultViewFor, type ViewKey } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Avatar, AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  IconShoppingCart,
  IconLayoutDashboard,
  IconReceipt2,
  IconBoxSeam,
  IconWallet,
  IconMenu2,
  IconTruck,
  IconUsers,
  IconBuildingStore,
  IconArrowsExchange,
  IconCreditCard,
  IconChartBar,
  IconSettings,
  IconHammer,
  IconShirt,
  IconPill,
  IconShoppingBag,
  IconLogout,
  IconChevronDown,
  IconShieldCheck,
  IconX,
  IconHelp,
  IconDatabase,
  IconTrash,
  IconAlertTriangle,
  IconLoader2,
  IconLock,
  IconCrown,
  IconMail,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

import LoginScreen from "@/components/pos/login"
import LandingPage from "@/components/pos/landing"
import TourGuide from "@/components/pos/tour"
import SetupChecklist from "@/components/pos/setup-checklist"
import DashboardView from "@/components/pos/dashboard"
import PosTerminal from "@/components/pos/pos-terminal"
import ProductsView from "@/components/pos/products"
import ClientsView from "@/components/pos/clients"
import SuppliersView from "@/components/pos/suppliers"
import PurchasesView from "@/components/pos/purchases"
import SalesView from "@/components/pos/sales"
import CashView from "@/components/pos/cash"
import FinanceView from "@/components/pos/finance"
import CreditView from "@/components/pos/credit"
import BackupManager from "@/components/pos/backup-manager"
import SettingsView from "@/components/pos/settings"
import ReportsView from "@/components/pos/reports"
import StaffManager from "@/components/pos/staff-manager"
import SuperadminPanel from "@/components/pos/superadmin-panel"
import { NotificationsBell } from "@/components/pos/notifications-bell"
import { ThemeToggle } from "@/components/theme-toggle"

interface NavItem { key: ViewKey; label: string; icon: React.ElementType }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { key: "dashboard", label: "Panel", icon: IconLayoutDashboard },
      { key: "pos", label: "Punto de Venta", icon: IconShoppingCart },
    ],
  },
  {
    label: "Inventario",
    items: [
      { key: "products", label: "Productos", icon: IconBoxSeam },
      { key: "purchases", label: "Compras", icon: IconTruck },
    ],
  },
  {
    label: "Comercial",
    items: [
      { key: "clients", label: "Clientes", icon: IconUsers },
      { key: "suppliers", label: "Proveedores", icon: IconBuildingStore },
      { key: "sales", label: "Ventas", icon: IconReceipt2 },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { key: "cash", label: "Caja y Arqueo", icon: IconWallet },
      { key: "finance", label: "Ingresos/Egresos", icon: IconArrowsExchange },
      { key: "credit", label: "Cuentas por Cobrar", icon: IconCreditCard },
    ],
  },
  {
    label: "Sistema",
    items: [
      { key: "reports", label: "Reportes", icon: IconChartBar },
      { key: "personal", label: "Personal & Sedes", icon: IconUsers },
      { key: "settings", label: "Configuración", icon: IconSettings },
    ],
  },
]

function getRubroIcon(rubro: string) {
  switch (rubro?.toLowerCase()) {
    case "tienda":
    case "minimarket":
    case "abarrotes":
      return IconBuildingStore
    case "ferreteria":
    case "materiales":
      return IconHammer
    case "ropa":
    case "boutique":
    case "calzado":
      return IconShirt
    case "drogueria":
    case "farmacia":
      return IconPill
    default:
      return IconShoppingBag
  }
}

function getRubroLabel(rubro: string) {
  switch (rubro?.toLowerCase()) {
    case "tienda": return "Tienda de Barrio"
    case "ferreteria": return "Ferretería"
    case "ropa": return "Tienda de Ropa"
    case "drogueria": return "Droguería & Farmacia"
    default: return "Comercio"
  }
}

export default function Home() {
  const hydrated = useAppStore((s) => s.hydrated)
  const hydrate = useAppStore((s) => s.hydrate)
  const role = useAppStore((s) => s.role)
  const userName = useAppStore((s) => s.userName)
  const logout = useAppStore((s) => s.logout)
  const showLanding = useAppStore((s) => s.showLanding)
  const setShowLanding = useAppStore((s) => s.setShowLanding)

  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const userEmail = useAppStore((s) => s.userEmail)
  const cartCount = useAppStore((s) => s.cart.reduce((n, c) => n + c.quantity, 0))

  const branches = useAppStore((s) => s.branches)
  const activeBranch = useAppStore((s) => s.activeBranch)
  const setActiveBranch = useAppStore((s) => s.setActiveBranch)
  const isPrimaryAdmin = useAppStore((s) => s.isPrimaryAdmin)
  const allowedBranchIds = useAppStore((s) => s.allowedBranchIds)
  const tenantName = useAppStore((s) => s.tenantName)
  const tenantOwnerName = useAppStore((s) => s.tenantOwnerName)
  const tenantOwnerEmail = useAppStore((s) => s.tenantOwnerEmail)

  // Sedes autorizadas para el usuario activo

  const userBranches = useMemo(() => {
    const activeOnly = branches.filter((b) => b.active)
    if (isPrimaryAdmin) return activeOnly
    if (!allowedBranchIds || allowedBranchIds.length === 0) return activeOnly
    return activeOnly.filter((b) => allowedBranchIds.includes(b.id))
  }, [branches, isPrimaryAdmin, allowedBranchIds])

  // Asegurar que la sede activa pertenezca a las sedes autorizadas del usuario
  useEffect(() => {
    if (userBranches.length > 0 && activeBranch && !userBranches.some((b) => b.id === activeBranch.id)) {
      setActiveBranch(userBranches[0])
    }
  }, [userBranches, activeBranch, setActiveBranch])

  const [storeName, setStoreName] = useState("Sistema POS")
  const [storeRubro, setStoreRubro] = useState("drogueria")
  const [seedOpen, setSeedOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [cashOpen, setCashOpen] = useState(false)
  const [logoutCashConfirmOpen, setLogoutCashConfirmOpen] = useState(false)

  // Estado de grupos colapsados en el sidebar (efecto acordeón)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("pos_sidebar_collapsed_groups")
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return {}
  })

  const toggleGroup = (groupLabel: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupLabel]: !prev[groupLabel] }
      try {
        localStorage.setItem("pos_sidebar_collapsed_groups", JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // Asegurar que el grupo con el item activo se expanda automáticamente
  useEffect(() => {
    const activeGroup = NAV.find((g) => g.items.some((it) => it.key === view))
    if (activeGroup && collapsedGroups[activeGroup.label]) {
      setCollapsedGroups((prev) => {
        const next = { ...prev, [activeGroup.label]: false }
        try {
          localStorage.setItem("pos_sidebar_collapsed_groups", JSON.stringify(next))
        } catch {}
        return next
      })
    }
  }, [view])

  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const refreshKey = useAppStore((s) => s.refreshKey)

  // Al salir del POS con items en el carrito, se pasa automáticamente a la cola de espera
  const handleSetView = (v: typeof view) => {
    // Bloqueo estricto: Las cuentas demo (admin / vendedor) NUNCA pueden acceder al Superadmin
    if (v === "superadmin" && (role !== "superadmin" || (userEmail !== "kaledmoly@gmail.com" && userName !== "Superadmin Kaled"))) {
      toast.error("Acceso restringido: Solo el Superadministrador (kaledmoly@gmail.com) puede acceder a este panel.")
      return
    }
    if (view === "pos" && v !== "pos" && cartCount > 0) {
      toast.info(`Venta de ${cartCount} producto(s) guardada en espera`, {
        description: "Tu carrito se pausó automáticamente. Puedes retomarlo en la cola del POS cuando desees.",
      })
    }
    setView(v)
  }

  // Redirección de seguridad si un usuario sin rol superadmin cae en la vista superadmin
  useEffect(() => {
    if (view === "superadmin" && (role !== "superadmin" || (userEmail !== "kaledmoly@gmail.com" && userName !== "Superadmin Kaled"))) {
      setView(role === "admin" ? "dashboard" : "pos")
    }
  }, [view, role, userEmail, userName, setView])

  // Hidratar sesión consultando al servidor (cookie httpOnly firmada)
  useEffect(() => { hydrate() }, [hydrate])

  // Cargar configuración de la tienda
  useEffect(() => {
    if (!role) return
    apiFetch<Record<string, string>>("/api/settings")
      .then((s) => {
        if (s.store_name) setStoreName(s.store_name)
        if (s.store_rubro) setStoreRubro(s.store_rubro)
      })
      .catch(() => {})
  }, [role, refreshKey])

  // Verificar si hay caja abierta (para avisar al cerrar sesión)
  useEffect(() => {
    if (!role) return
    let active = true
    const checkCash = () => {
      apiFetch<{ status?: string } | null>("/api/cash")
        .then((s) => { if (active) setCashOpen(!!s && s.status === "abierta") })
        .catch(() => {})
    }
    checkCash()
    const interval = setInterval(checkCash, 15000)
    return () => { active = false; clearInterval(interval) }
  }, [role, refreshKey])

  // Logout con modal moderno cuando hay caja abierta
  const handleLogout = () => {
    if (cashOpen) {
      setLogoutCashConfirmOpen(true)
      return
    }
    executeLogout()
  }

  const executeLogout = async () => {
    setLogoutCashConfirmOpen(false)
    await logout()
    toast.info("Sesión cerrada")
  }

  // Si la vista actual no está permitida para el rol, redirigir
  useEffect(() => {
    if (role && !canAccessView(role, view)) {
      setView(defaultViewFor(role))
    }
  }, [role, view, setView])

  const runSeed = async () => {
    setSeeding(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/seed", {
        method: "POST",
        body: JSON.stringify({ type: storeRubro }),
      })
      toast.success(res.message)
      setSeedOpen(false)
      triggerRefresh()
      setView("dashboard")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSeeding(false)
    }
  }

  const runReset = async () => {
    setResetting(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "BORRAR" }),
      })
      toast.success(res.message)
      setResetOpen(false)
      triggerRefresh()
      setView("dashboard")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResetting(false)
    }
  }

  // Pantalla de carga mientras se hidrata la sesión
  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <IconLoader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando sistema…</p>
      </div>
    )
  }

  // Si no hay sesión, mostrar login o landing
  if (!role) {
    return showLanding ? <LandingPage /> : <LoginScreen />
  }

  const perms = ROLE_CONFIG[role]

  const superadminGroup: NavGroup = {
    label: "Superadmin SaaS",
    items: [
      { key: "superadmin", label: "Panel Superadmin", icon: IconCrown },
    ],
  }

  const allowedGroups = (
    role === "superadmin"
      ? [superadminGroup, ...NAV]
      : NAV
  ).map((g) => ({
    ...g,
    items: g.items.filter((it) => canAccessView(role, it.key)),
  })).filter((g) => g.items.length > 0)

  const StoreIcon = getRubroIcon(storeRubro)

  const TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
    superadmin: { title: "Panel Superadministrador SaaS", subtitle: "Control global de plataforma, aprobación de negocios y ranking de ventas" },
    dashboard: { title: "Panel principal", subtitle: `Resumen general de tu ${getRubroLabel(storeRubro).toLowerCase()}` },
    pos: { title: "Punto de venta", subtitle: "Registra ventas y cobra de forma rápida" },
    products: { title: "Inventario de productos", subtitle: "Gestiona catálogo, precios, stock y categorías" },
    purchases: { title: "Compras y proveedores", subtitle: "Registro de entradas de mercancía" },
    clients: { title: "Directorio de clientes", subtitle: "Administración de clientes y crédito" },
    suppliers: { title: "Directorio de proveedores", subtitle: "Administración de proveedores y contactos" },
    sales: { title: "Historial de ventas", subtitle: "Consultas, comprobantes y anulación de ventas" },
    cash: { title: "Caja y arqueo", subtitle: "Apertura, cierre y cuadre de turnos" },
    finance: { title: "Ingresos y egresos", subtitle: "Control de movimientos financieros y gastos" },
    credit: { title: "Cuentas por cobrar", subtitle: "Créditos otorgados y abonos de clientes" },
    reports: { title: "Reportes y estadísticas", subtitle: "Análisis de ventas, utilidad y rendimiento" },
    personal: { title: "Personal y Sedes", subtitle: "Gestión de colaboradores, credenciales PIN y sucursales físicas" },
    settings: { title: "Configuración del sistema", subtitle: "Datos de la tienda, seguridad, backups y reseteo" },
  }

  const NavContent = () => (
    <div className="flex h-full w-full flex-col overflow-hidden bg-sidebar select-none">
      {/* Header del comercio */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-sidebar-border/70 bg-sidebar shrink-0">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 border border-border/60 overflow-hidden shrink-0 shadow-xs ring-1 ring-primary/20">
          <Image
            src="/logo.svg"
            alt="OmniPOS Logo"
            width={40}
            height={40}
            className="h-full w-full object-cover"
            priority
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-sidebar-foreground truncate tracking-tight" title={storeName}>{storeName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn("inline-block w-2 h-2 rounded-full shrink-0", cashOpen ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            <p className="text-[11px] font-medium text-muted-foreground truncate">
              {getRubroLabel(storeRubro)} · {cashOpen ? "Caja abierta" : "Caja cerrada"}
            </p>
          </div>
        </div>
      </div>

      {/* Menú de navegación con efecto acordeón animado y contraste ultra-nítido 2026 */}
      <nav data-tour="sidebar-nav" className="flex-1 overflow-y-auto scroll-thin px-3 py-3 space-y-2">
        {allowedGroups.map((group) => {
          const isCollapsed = !!collapsedGroups[group.label]
          const hasActiveItem = group.items.some((it) => it.key === view)

          return (
            <div key={group.label} className="space-y-0.5">
              {/* Cabecera del Grupo con botón interactivo de Acordeón */}
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 hover:text-foreground hover:bg-sidebar-accent/50 rounded-lg transition-colors group select-none"
                title={isCollapsed ? `Expandir ${group.label}` : `Colapsar ${group.label}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate">{group.label}</span>
                  {/* Indicador pulsante si el grupo está cerrado pero adentro está la sección actual */}
                  {isCollapsed && hasActiveItem && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" title="Sección activa adentro" />
                  )}
                </div>

                <div className="flex items-center gap-1 text-muted-foreground/60 group-hover:text-foreground">
                  <span className="text-[9px] font-medium opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                    {isCollapsed ? "Mostrar" : "Ocultar"}
                  </span>
                  <IconChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-200",
                      isCollapsed ? "-rotate-90 text-muted-foreground/50" : "rotate-0 text-muted-foreground/80"
                    )}
                  />
                </div>
              </button>

              {/* Contenido colapsable con animación suave */}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeInOut" }}
                    className="overflow-hidden space-y-0.5 pt-0.5"
                  >
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active = view === item.key
                      return (
                        <motion.button
                          key={item.key}
                          data-tour={`nav-${item.key}`}
                          onClick={() => handleSetView(item.key)}
                          whileTap={{ scale: 0.98 }}
                          className={cn(
                            "relative w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors text-left group",
                            active
                              ? "text-primary-foreground font-bold"
                              : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/70 font-medium"
                          )}
                        >
                          {/* Active Background Pill Solid Animation */}
                          {active && (
                            <motion.div
                              layoutId="sidebar-active-pill"
                              className="absolute inset-0 rounded-xl bg-primary shadow-xs shadow-primary/25"
                              transition={{ type: "spring", stiffness: 450, damping: 32 }}
                            />
                          )}

                          <Icon className={cn(
                            "h-4 w-4 shrink-0 relative z-10 transition-transform group-hover:scale-105",
                            active ? "text-primary-foreground stroke-[2.3]" : "text-muted-foreground stroke-[1.8]"
                          )} />
                          <span className="truncate relative z-10 flex-1">{item.label}</span>

                          {/* Badge para el carrito POS */}
                          {item.key === "pos" && cartCount > 0 && (
                            <span className={cn(
                              "relative z-10 flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold px-1.5 shadow-xs",
                              active ? "bg-white text-primary font-black" : "bg-primary text-primary-foreground"
                            )}>
                              {cartCount}
                            </span>
                          )}
                        </motion.button>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      {/* Footer del sidebar */}
      <div className="border-t border-sidebar-border/70 p-3 space-y-2 bg-sidebar shrink-0">
        <div className="px-2.5 py-2 rounded-xl bg-sidebar-accent/60 text-sidebar-foreground space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className={cn("text-[11px] font-bold", role === "admin" ? "bg-primary text-primary-foreground" : "bg-slate-700 text-white")}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate text-sidebar-foreground">{userName}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{perms?.label ?? role}</p>
              </div>
            </div>
            <ThemeToggle variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" />
          </div>

          {(tenantOwnerEmail || tenantOwnerName) && role !== "superadmin" && (
            <div className="pt-1.5 border-t border-sidebar-border/50 text-[10px] text-muted-foreground leading-tight">
              <span className="text-[9px] uppercase font-bold text-muted-foreground/70 block">Pertenece a:</span>
              <p className="font-semibold text-sidebar-foreground truncate">{tenantOwnerName || "Admin Principal"}</p>
              <p className="text-primary truncate flex items-center gap-1 mt-0.5 font-medium">
                <IconMail className="h-2.5 w-2.5 shrink-0" />
                {tenantOwnerEmail}
              </p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-sidebar-accent text-xs h-8 rounded-lg"
          onClick={handleLogout}
          disabled={seeding}
        >
          <IconLogout className="h-3.5 w-3.5 mr-2 shrink-0 text-muted-foreground" /> Cerrar sesión
        </Button>
      </div>
    </div>
  )

  const meta = TITLES[view] || { title: "Sistema POS", subtitle: "Gestión de punto de venta" }
  const initials = (userName ?? "?").slice(0, 2).toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-64 min-w-[16rem] max-w-[16rem] shrink-0 bg-sidebar border-r border-sidebar-border h-screen overflow-hidden shadow-xs">
        <NavContent />
      </aside>

      {/* Sidebar móvil (drawer) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-r border-sidebar-border">
          <SheetTitle className="sr-only">Menú de Navegación</SheetTitle>
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center gap-2.5 sm:gap-3 border-b bg-background/90 backdrop-blur-md px-3 sm:px-4 py-2.5 sm:py-3 sticky top-0 z-30 shrink-0">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-muted text-foreground transition-colors shrink-0"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú completo"
          >
            <IconMenu2 className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base md:text-lg font-bold leading-tight truncate">{meta.title}</h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate hidden sm:block">{meta.subtitle}</p>
          </div>

          {/* Botón rápido de Carrito en móvil si no estamos en POS y hay items */}
          {view !== "pos" && cartCount > 0 && (
            <button
              onClick={() => handleSetView("pos")}
              className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs animate-bounce"
            >
              <IconShoppingCart className="h-4 w-4" />
              <span>{cartCount}</span>
            </button>
          )}

          {/* Selector de Sede Activa (Multi-Sede hasta 3 sedes) */}
          {userBranches.length <= 1 && role !== "admin" ? (
            <div
              className="flex items-center gap-1.5 sm:gap-2 rounded-xl border bg-card/60 px-2 sm:px-2.5 py-1.5 text-left shadow-xs shrink-0 max-w-[170px] sm:max-w-[240px] select-none cursor-default"
              title={`Sede asignada: ${activeBranch?.name ?? "Sede Principal"} (Pertenece a: ${activeBranch?.tenant?.ownerEmail || tenantOwnerEmail || "Admin Principal"})`}
            >
              <IconBuildingStore className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1 hidden sm:block">
                <p className="text-[9px] text-muted-foreground uppercase font-semibold leading-none truncate flex items-center gap-1">
                  Sede Asignada <IconLock className="h-2.5 w-2.5" />
                </p>
                <p className="text-xs font-bold truncate leading-tight text-foreground">{activeBranch?.name ?? "Sede Principal"}</p>
                {(activeBranch?.tenant?.ownerEmail || tenantOwnerEmail) && (
                  <p className="text-[10px] text-primary truncate leading-tight flex items-center gap-1 mt-0.5 font-medium">
                    <IconMail className="h-2.5 w-2.5 shrink-0" />
                    {activeBranch?.tenant?.ownerEmail || tenantOwnerEmail}
                  </p>
                )}
              </div>
              <span className="sm:hidden text-xs font-bold truncate max-w-[70px]">{activeBranch?.name ?? "Sede"}</span>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl border bg-card/80 hover:bg-muted/80 px-2 sm:px-2.5 py-1.5 transition-colors text-left shadow-xs shrink-0 max-w-[170px] sm:max-w-[240px]"
                  title={`Sede activa: ${activeBranch?.name ?? "Sede Principal"} (Pertenece a: ${activeBranch?.tenant?.ownerEmail || tenantOwnerEmail || "Admin Principal"})`}
                >
                  <IconBuildingStore className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1 hidden sm:block">
                    <p className="text-[9px] text-muted-foreground uppercase font-semibold leading-none truncate">Sede Activa</p>
                    <p className="text-xs font-bold truncate leading-tight text-foreground">{activeBranch?.name ?? "Sede Principal"}</p>
                    {(activeBranch?.tenant?.ownerEmail || tenantOwnerEmail) && (
                      <p className="text-[10px] text-primary truncate leading-tight flex items-center gap-1 mt-0.5 font-medium">
                        <IconMail className="h-2.5 w-2.5 shrink-0" />
                        {activeBranch?.tenant?.ownerEmail || tenantOwnerEmail}
                      </p>
                    )}
                  </div>
                  <span className="sm:hidden text-xs font-bold truncate max-w-[70px]">{activeBranch?.name ?? "Sede"}</span>
                  <IconChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl">
                <DropdownMenuLabel className="text-xs font-semibold flex items-center justify-between pb-1">
                  <span>Sedes Autorizadas</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    ({userBranches.length} {userBranches.length === 1 ? "sede" : "sedes"})
                  </span>
                </DropdownMenuLabel>

                {/* Bloque de pertenencia del Negocio / Admin Principal */}
                {(tenantOwnerEmail || tenantOwnerName) && role !== "superadmin" && (
                  <div className="mx-1 mb-1.5 p-2 rounded-lg bg-primary/5 border border-primary/15 text-[11px] space-y-0.5">
                    <p className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                      <IconShieldCheck className="h-3 w-3 text-primary" /> Admin Principal
                    </p>
                    <p className="font-semibold text-foreground truncate">{tenantOwnerName || "Admin Principal"}</p>
                    <p className="text-[10px] text-primary truncate flex items-center gap-1 font-medium">
                      <IconMail className="h-2.5 w-2.5 shrink-0" />
                      {tenantOwnerEmail}
                    </p>
                  </div>
                )}
                <DropdownMenuSeparator />
                {userBranches.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => {
                      if (activeBranch?.id === b.id) return
                      setActiveBranch(b)
                      toast.success(`Sede activa: ${b.name}`)
                    }}
                    className={cn(
                      "flex items-center justify-between text-xs py-2 cursor-pointer rounded-lg",
                      activeBranch?.id === b.id && "bg-muted font-bold text-primary"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                      <IconBuildingStore className="h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{b.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {b.tenant?.ownerEmail || tenantOwnerEmail || "Admin Principal"}
                        </p>
                      </div>
                    </div>
                    {b.isMain && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30 shrink-0">Principal</Badge>}
                  </DropdownMenuItem>
                ))}
                {role === "admin" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleSetView("personal")}
                      className="text-xs font-semibold text-primary cursor-pointer rounded-lg"
                    >
                      <IconSettings className="h-3.5 w-3.5 mr-2" /> Administrar Sedes ({branches.length}/3)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Centro de Notificaciones y Alertas (Campanita) */}
          <NotificationsBell onNavigate={handleSetView} />

          {/* Botón selector de tema claro/oscuro */}
          <ThemeToggle />

          {/* Usuario + rol */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-tour="user-menu" className="flex items-center gap-1.5 sm:gap-2 rounded-full border bg-card px-2 py-1.5 hover:bg-muted transition-colors shrink-0 shadow-xs">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={cn("text-[11px] font-bold", role === "admin" ? "bg-primary text-primary-foreground" : "bg-slate-700 text-white")}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left leading-tight pr-1">
                  <p className="text-xs font-semibold truncate max-w-[120px]">{userName}</p>
                  <p className="text-[10px] text-muted-foreground">{perms.label}</p>
                </div>
                <IconChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block mr-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-xl">
              <DropdownMenuLabel className="flex items-start gap-2.5 p-2.5">
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarFallback className={cn("text-xs font-bold", role === "admin" ? "bg-primary text-primary-foreground" : "bg-slate-700 text-white")}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <div>
                    <p className="text-sm font-bold text-foreground truncate">{userName}</p>
                    <p className="text-xs text-muted-foreground font-normal capitalize">{perms.label}</p>
                  </div>
                  {(tenantOwnerEmail || tenantOwnerName) && role !== "superadmin" && (
                    <div className="pt-1.5 border-t border-border/60 text-[11px] space-y-0.5">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground">Pertenece a:</p>
                      <p className="font-semibold text-foreground truncate">{tenantOwnerName || "Admin Principal"}</p>
                      <p className="text-[10px] text-primary truncate flex items-center gap-1 font-medium">
                        <IconMail className="h-3 w-3 shrink-0" />
                        {tenantOwnerEmail}
                      </p>
                    </div>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => useAppStore.getState().startTour()}>
                <IconHelp className="h-4 w-4 mr-2 text-primary" /> Tour Guiado
              </DropdownMenuItem>
              {role === "admin" && (
                <DropdownMenuItem onClick={() => handleSetView("personal")}>
                  <IconUsers className="h-4 w-4 mr-2 text-primary" /> Personal & Sedes
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleSetView("settings")}>
                <IconSettings className="h-4 w-4 mr-2" /> Configuración
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                <IconLogout className="h-4 w-4 mr-2" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Contenido Principal con animación fluida entre vistas */}
        <main className={cn("flex-1 min-w-0 overflow-y-auto overflow-x-hidden scroll-thin", view === "pos" ? "pb-0" : "pb-20 lg:pb-0")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="min-h-full w-full min-w-0 flex flex-col"
            >
              {view === "superadmin" && role === "superadmin" && (userEmail === "kaledmoly@gmail.com" || userName === "Superadmin Kaled") && <SuperadminPanel />}
              {view === "dashboard" && (
                <>
                  <SetupChecklist />
                  <DashboardView />
                </>
              )}
              {view === "pos" && <PosTerminal />}
              {view === "products" && <ProductsView />}
              {view === "purchases" && <PurchasesView />}
              {view === "clients" && <ClientsView />}
              {view === "suppliers" && <SuppliersView />}
              {view === "sales" && <SalesView />}
              {view === "cash" && <CashView />}
              {view === "finance" && <FinanceView />}
              {view === "credit" && <CreditView />}
              {view === "reports" && <ReportsView />}
              {view === "personal" && <StaffManager />}
              {view === "settings" && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer desktop */}
        <footer className="hidden lg:block mt-auto border-t bg-background px-4 py-2.5 text-center text-xs text-muted-foreground">
          {storeName} · Sistema POS Multirubro · {new Date().getFullYear()}
        </footer>

        {/* Barra de Navegación Inferior Móvil (Mobile Bottom Bar) */}
        {view !== "pos" && (
          <nav aria-label="Navegación móvil rápida" className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-lg safe-pad">
            <div className="grid grid-cols-5 items-center justify-around px-1 py-1.5">
              {/* Botón POS */}
              <button
                onClick={() => handleSetView("pos")}
                className="flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors relative active:scale-95"
              >
                <div className="relative">
                  <IconShoppingCart className="h-5 w-5 stroke-[1.8]" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold px-1">
                      {cartCount}
                    </span>
                  )}
                </div>
                <span className="mt-0.5">Cobrar</span>
              </button>

              {/* Botón Panel / Ventas */}
              {role === "admin" ? (
                <button
                  onClick={() => handleSetView("dashboard")}
                  className={cn(
                    "flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                    view === "dashboard" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <IconLayoutDashboard className="h-5 w-5 stroke-[1.8]" />
                  <span className="mt-0.5">Panel</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSetView("sales")}
                  className={cn(
                    "flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                    view === "sales" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <IconReceipt2 className="h-5 w-5 stroke-[1.8]" />
                  <span className="mt-0.5">Ventas</span>
                </button>
              )}

              {/* Botón Productos */}
              <button
                onClick={() => handleSetView("products")}
                className={cn(
                  "flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-medium transition-colors active:scale-95",
                  view === "products" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <IconBoxSeam className="h-5 w-5 stroke-[1.8]" />
                <span className="mt-0.5">Stock</span>
              </button>

              {/* Botón Caja */}
              <button
                onClick={() => handleSetView("cash")}
                className={cn(
                  "flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-medium transition-colors relative active:scale-95",
                  view === "cash" ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <IconWallet className="h-5 w-5 stroke-[1.8]" />
                  {cashOpen && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-card" />
                  )}
                </div>
                <span className="mt-0.5">Caja</span>
              </button>

              {/* Botón Menú Completo */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors active:scale-95"
              >
                <IconMenu2 className="h-5 w-5 stroke-[1.8]" />
                <span className="mt-0.5">Menú</span>
              </button>
            </div>
          </nav>
        )}
      </div>

      {/* Tour interactivo */}
      <TourGuide />

      {/* Gestor de backups */}
      <BackupManager open={backupOpen} onOpenChange={setBackupOpen} />

      {/* Dialog datos demo */}
      <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconDatabase className="h-5 w-5 text-primary" /> Cargar datos de demostración</DialogTitle>
            <DialogDescription>
              Esto reemplazará todos los datos actuales con un set de demostración configurado para tu tipo de negocio.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeedOpen(false)}><IconX className="h-4 w-4 mr-1" /> Cancelar</Button>
            <Button onClick={runSeed} disabled={seeding}>{seeding ? "Cargando…" : "Cargar datos"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog borrar datos de prueba */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><IconTrash className="h-5 w-5" /> Borrar todos los datos</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">Esta acción es irreversible.</strong> Se eliminarán todos los productos, ventas, compras, clientes, proveedores, cajas, categorías y movimientos financieros. Solo se conservan los usuarios.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            ⚠️ Asegúrate de haber hecho un backup si necesitas conservar algún dato.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={runReset} disabled={resetting}>
              {resetting ? "Borrando…" : "Sí, borrar todo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal moderno de confirmación de cierre de sesión con caja abierta */}
      <AlertDialog open={logoutCashConfirmOpen} onOpenChange={setLogoutCashConfirmOpen}>
        <AlertDialogContent className="max-w-md rounded-2xl border-border bg-card text-card-foreground shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
              <IconAlertTriangle className="h-5 w-5 shrink-0" />
              ¿Cerrar sesión con caja abierta?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed pt-1 space-y-2">
              <p>
                Actualmente tienes una sesión de caja abierta en este turno.
              </p>
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-900 dark:text-amber-200">
                ⚠️ Si sales sin realizar el arqueo, el turno quedará pendiente de cuadre y los valores en gaveta física no estarán conciliados con el sistema.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0 mt-2">
            <AlertDialogCancel className="rounded-xl">
              Permanecer en el sistema
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeLogout}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold rounded-xl"
            >
              Cerrar sesión de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
