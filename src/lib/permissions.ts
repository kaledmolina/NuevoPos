// Definición de roles y permisos para el sistema POS de droguería
 
export type Role = "superadmin" | "admin" | "vendedor"

export type ViewKey =
  | "superadmin"
  | "dashboard"
  | "pos"
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
    views: ["dashboard", "pos", "products", "purchases", "clients", "suppliers", "sales", "cash", "finance", "credit", "reports", "personal", "settings"],
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
    views: ["dashboard", "pos", "products", "sales", "cash"],
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
  return role === "admin" ? "dashboard" : "pos"
}

