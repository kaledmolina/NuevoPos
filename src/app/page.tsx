"use client"

import { useEffect, useState } from "react"
import { useAppStore, type ViewKey } from "@/lib/store"
import { apiFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, Building2,
  ReceiptText, Wallet, ArrowLeftRight, BarChart3, Menu, Pill, Database,
  Store, X,
} from "lucide-react"
import { cn } from "@/lib/utils"

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
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const [storeName, setStoreName] = useState("Droguería La Salud")
  const [seedOpen, setSeedOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    apiFetch<Record<string, string>>("/api/settings")
      .then((s) => { if (s.store_name) setStoreName(s.store_name) })
      .catch(() => {})
  }, [])

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
        {NAV.map((group) => (
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
      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSeedOpen(true)}>
          <Database className="h-4 w-4 mr-2" /> Cargar datos demo
        </Button>
      </div>
    </div>
  )

  const meta = TITLES[view]

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
          <div className="hidden md:flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 text-xs"><Store className="h-3 w-3" /> {storeName}</Badge>
          </div>
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
