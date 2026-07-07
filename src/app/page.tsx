"use client"

import { useEffect, useState } from "react"
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
import { toast } from "sonner"
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, Building2,
  ReceiptText, Wallet, ArrowLeftRight, BarChart3, Menu, Pill, Database,
  Store, X, LogOut, ChevronDown, ShieldCheck, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

import LoginScreen from "@/components/pos/login"
import LandingPage from "@/components/pos/landing"
import DashboardView from "@/components/pos/dashboard"
import PosTerminal from "@/components/pos/pos-terminal"
import ProductsView from "@/components/pos/products"
import ClientsView from "@/components/pos/clients"
import SuppliersView from "@/components/pos/suppliers"
import PurchasesView from "@/components/pos/purchases"
import SalesView from "@/components/pos/sales"
import CashView from "@/components/pos/cash"
import FinanceView from "@/components/pos/finance"
import ReportsView from "@/components/pos/reports"

interface NavItem { key: ViewKey; label: string; icon: React.ElementType }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { key: "dashboard", label: "Panel", icon: LayoutDashboard },
      { key: "pos", label: "Punto de Venta", icon: ShoppingCart },
    ],
  },
  {
    label: "Inventario",
    items: [
      { key: "products", label: "Productos", icon: Package },
      { key: "purchases", label: "Compras", icon: Truck },
    ],
  },
  {
    label: "Comercial",
    items: [
      { key: "clients", label: "Clientes", icon: Users },
      { key: "suppliers", label: "Proveedores", icon: Building2 },
      { key: "sales", label: "Ventas", icon: ReceiptText },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { key: "cash", label: "Caja y Arqueo", icon: Wallet },
      { key: "finance", label: "Ingresos/Egresos", icon: ArrowLeftRight },
      { key: "reports", label: "Reportes", icon: BarChart3 },
    ],
  },
]

const TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Panel principal", subtitle: "Resumen general de tu droguería" },
  pos: { title: "Punto de venta", subtitle: "Registra ventas y cobra" },
  products: { title: "Inventario", subtitle: "Gestiona productos, stock y vencimientos" },
  purchases: { title: "Compras", subtitle: "Registro de compras a proveedores" },
  clients: { title: "Clientes", subtitle: "Administración de clientes" },
  suppliers: { title: "Proveedores", subtitle: "Administración de proveedores" },
  sales: { title: "Ventas", subtitle: "Historial y detalle de ventas" },
  cash: { title: "Caja y arqueo", subtitle: "Apertura, cierre y cuadre de caja" },
  finance: { title: "Ingresos y egresos", subtitle: "Movimientos financieros" },
  reports: { title: "Reportes", subtitle: "Análisis y estadísticas" },
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
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const [storeName, setStoreName] = useState("Droguería La Salud")
  const [seedOpen, setSeedOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)

  // Hidratar sesión consultando al servidor (cookie httpOnly firmada)
  useEffect(() => { hydrate() }, [hydrate])

  // Cargar nombre de la tienda
  useEffect(() => {
    if (!role) return
    apiFetch<Record<string, string>>("/api/settings")
      .then((s) => { if (s.store_name) setStoreName(s.storeName) })
      .catch(() => {})
  }, [role])

  // Si la vista actual no está permitida para el rol, redirigir
  useEffect(() => {
    if (role && !canAccessView(role, view)) {
      setView(defaultViewFor(role))
    }
  }, [role, view, setView])

  const runSeed = async () => {
    setSeeding(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/seed", { method: "POST" })
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

  // Pantalla de carga mientras se hidrata la sesión
  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Cargando sistema…</p>
      </div>
    )
  }

  // Si no hay sesión, mostrar login o landing
  if (!role) {
    return showLanding ? <LandingPage /> : <LoginScreen />
  }

  const perms = ROLE_CONFIG[role]
  const allowedGroups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((it) => canAccessView(role, it.key)),
  })).filter((g) => g.items.length > 0)

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
          <Pill className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-sidebar-foreground truncate">{storeName}</p>
          <p className="text-[11px] text-sidebar-foreground/60">Sistema POS</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 py-4 space-y-5">
        {allowedGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = view === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setView(item.key)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3 space-y-1">
        {perms.canSeedData && (
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSeedOpen(true)}>
            <Database className="h-4 w-4 mr-2" /> Cargar datos demo
          </Button>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => { logout(); toast.info("Sesión cerrada") }} disabled={seeding}>
          <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
        </Button>
      </div>
    </div>
  )

  const meta = TITLES[view]
  const initials = (userName ?? "?").slice(0, 2).toUpperCase()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-sidebar">
        <NavContent />
      </aside>

      {/* Sidebar móvil */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 border-b bg-background/80 backdrop-blur px-4 py-3 sticky top-0 z-30">
          <button
            className="lg:hidden -ml-1 p-2 rounded-lg hover:bg-muted"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base md:text-lg font-bold leading-tight truncate">{meta.title}</h1>
            <p className="text-xs text-muted-foreground truncate hidden sm:block">{meta.subtitle}</p>
          </div>

          {/* Usuario + rol */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 hover:bg-muted transition-colors">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={cn("text-[11px] font-semibold", role === "admin" ? "bg-primary text-primary-foreground" : "bg-teal-500/15 text-teal-700")}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="text-xs font-semibold truncate max-w-[120px]">{userName}</p>
                  <p className="text-[10px] text-muted-foreground">{perms.label}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="flex items-center gap-2">
                <ShieldCheck className={cn("h-4 w-4", role === "admin" ? "text-primary" : "text-teal-600")} />
                <div>
                  <p className="text-sm font-semibold">{userName}</p>
                  <p className="text-xs text-muted-foreground font-normal">{perms.label}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { logout(); toast.info("Sesión cerrada") }}>
                <LogOut className="h-4 w-4 mr-2" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-y-auto scroll-thin">
          {view === "dashboard" && <DashboardView />}
          {view === "pos" && <PosTerminal />}
          {view === "products" && <ProductsView />}
          {view === "purchases" && <PurchasesView />}
          {view === "clients" && <ClientsView />}
          {view === "suppliers" && <SuppliersView />}
          {view === "sales" && <SalesView />}
          {view === "cash" && <CashView />}
          {view === "finance" && <FinanceView />}
          {view === "reports" && <ReportsView />}
        </main>

        <footer className="mt-auto border-t bg-background px-4 py-2.5 text-center text-xs text-muted-foreground">
          {storeName} · Sistema POS de Droguería · {new Date().getFullYear()}
        </footer>
      </div>

      {/* Dialog datos demo */}
      <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Cargar datos de demostración</DialogTitle>
            <DialogDescription>
              Esto reemplazará todos los datos actuales con un set de demostración que incluye productos, clientes, proveedores, una venta de ejemplo y una caja abierta. Útil para explorar el sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeedOpen(false)}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
            <Button onClick={runSeed} disabled={seeding}>{seeding ? "Cargando…" : "Cargar datos"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
