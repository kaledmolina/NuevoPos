// Definición de roles y permisos para el sistema POS de droguería
 
export type Role = "superadmin" | "admin" | "vendedor" | "domiciliario" | "cliente"

export type ViewKey =
  | "superadmin"
  | "dashboard"
  | "pos"
  | "orders"
  | "driver_settlement"
  | "products"
  | "clients"
  | "suppliers"
  | "purchases"
  | "sales"
  | "cash"
  | "finance"
  | "credit"
  | "reports"
  | "personal"
  | "settings"
  | "whatsapp"
  | "api_docs"

export interface RoleConfig {
  label: string
  description: string
  views: ViewKey[]
  canEditProducts: boolean
  canManagePurchases: boolean
  canManageClients: boolean
  canManageSuppliers: boolean
  canManageFinance: boolean
  canAnnulSales: boolean
  canSeeCosts: boolean
  canSeedData: boolean
}

export const ROLE_CONFIG: Record<Role, RoleConfig> = {
  superadmin: {
    label: "Superadministrador",
    description: "Control total de la plataforma SaaS: aprobación de registros, inhabilitación y ranking de ventas.",
    views: [
      "superadmin",
      "dashboard",
      "pos",
      "orders",
      "products",
      "purchases",
      "clients",
      "suppliers",
      "sales",
      "cash",
      "finance",
      "credit",
      "reports",
      "personal",
      "settings",
      "whatsapp",
      "api_docs",
    ],
    canEditProducts: true,
    canManagePurchases: true,
    canManageClients: true,
    canManageSuppliers: true,
    canManageFinance: true,
    canAnnulSales: true,
    canSeeCosts: true,
    canSeedData: true,
  },
  admin: {
    label: "Administrador",
    description: "Acceso completo: inventario, compras, finanzas, reportes y configuración.",
    views: [
      "dashboard",
      "pos",
      "orders",
      "products",
      "purchases",
      "clients",
      "suppliers",
      "sales",
      "cash",
      "finance",
      "credit",
      "reports",
      "personal",
      "settings",
      "whatsapp",
      "api_docs",
    ],
    canEditProducts: true,
    canManagePurchases: true,
    canManageClients: true,
    canManageSuppliers: true,
    canManageFinance: true,
    canAnnulSales: true,
    canSeeCosts: true,
    canSeedData: true,
  },
  vendedor: {
    label: "Vendedor",
    description: "Punto de venta, apertura/arqueo de caja y consulta de ventas. Sin acceso a costos ni edición de inventario.",
    views: ["dashboard", "pos", "orders", "products", "sales", "cash", "api_docs"],
    canEditProducts: false,
    canManagePurchases: false,
    canManageClients: false,
    canManageSuppliers: false,
    canManageFinance: false,
    canAnnulSales: false,
    canSeeCosts: false,
    canSeedData: false,
  },
  domiciliario: {
    label: "Domiciliario / Repartidor",
    description: "Tomar pedidos disponibles, actualizar entregas en camino/entregado, consultar mi cuadre de caja y API.",
    views: ["dashboard", "orders", "driver_settlement", "api_docs"],
    canEditProducts: false,
    canManagePurchases: false,
    canManageClients: false,
    canManageSuppliers: false,
    canManageFinance: false,
    canAnnulSales: false,
    canSeeCosts: false,
    canSeedData: false,
  },
  cliente: {
    label: "Cliente",
    description: "Acceso a catálogo de tiendas, realización y seguimiento de pedidos online.",
    views: ["dashboard", "orders", "api_docs"],
    canEditProducts: false,
    canManagePurchases: false,
    canManageClients: false,
    canManageSuppliers: false,
    canManageFinance: false,
    canAnnulSales: false,
    canSeeCosts: false,
    canSeedData: false,
  },
}

export function canAccessView(role: Role, view: ViewKey): boolean {
  return ROLE_CONFIG[role]?.views.includes(view) ?? false
}

export function defaultViewFor(role: Role): ViewKey {
  if (role === "superadmin") return "superadmin"
  if (role === "domiciliario" || role === "cliente") return "orders"
  return role === "admin" ? "dashboard" : "pos"
}
