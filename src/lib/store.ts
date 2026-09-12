"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { apiFetch } from "@/lib/api"
import { type Role, type ViewKey, canAccessView, defaultViewFor } from "@/lib/permissions"

export interface CartItem {
  productId: string
  name: string
  price: number
  cost: number
  stock: number
  quantity: number
  unit?: string
}

export interface HeldCart {
  id: string
  note: string
  clientName?: string
  clientId?: string
  discount?: string
  paymentMethod?: string
  items: CartItem[]
  total: number
  itemCount: number
  createdAt: string
}

export interface BranchItem {
  id: string
  name: string
  code?: string | null
  address?: string | null
  phone?: string | null
  isMain: boolean
  active: boolean
  createdAt: string
  updatedAt?: string
  tenant?: {
    id: string
    name: string
    ownerName: string
    ownerEmail: string
    ownerPhone?: string | null
  } | null
}

interface AppState {
  // Autenticación (sesión validada server-side vía cookie httpOnly)
  hydrated: boolean
  role: Role | null
  userName: string | null
  userEmail: string | null
  isPrimaryAdmin: boolean
  tenantId: string | null
  tenantName: string | null
  tenantOwnerName: string | null
  tenantOwnerEmail: string | null
  allowedBranchIds: string[]
  hydrate: () => Promise<void>
  login: (name: string, pin: string) => Promise<void>
  logout: () => Promise<void>

  // Multi-Sedes (máximo 3 sedes)
  branches: BranchItem[]
  activeBranch: BranchItem | null
  setActiveBranch: (b: BranchItem) => void
  fetchBranches: () => Promise<BranchItem[]>

  // Landing page (vista educativa antes del login)
  showLanding: boolean
  setShowLanding: (v: boolean) => void

  // Navegación (con persistencia tras F5)
  view: ViewKey
  setView: (v: ViewKey) => void
  sidebarOpen: boolean
  setSidebarOpen: (o: boolean) => void

  // Carrito POS activo
  cart: CartItem[]
  addToCart: (item: Omit<CartItem, "quantity">, qty?: number) => void
  updateCartQty: (productId: string, qty: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void

  // Cola de ventas en espera / carritos pausados
  heldCarts: HeldCart[]
  holdCurrentCart: (params?: {
    note?: string
    clientId?: string
    clientName?: string
    discount?: string
    paymentMethod?: string
  }) => HeldCart | null
  resumeHeldCart: (heldCartId: string) => HeldCart | null
  deleteHeldCart: (heldCartId: string) => void
  clearHeldCarts: () => void

  // Refresco global
  refreshKey: number
  triggerRefresh: () => void

  // Tour interactivo guiado
  tourOpen: boolean
  startTour: () => void
  closeTour: () => void
}

function getSavedView(role: Role | null): ViewKey {
  if (typeof window === "undefined") return "dashboard"
  try {
    const saved = localStorage.getItem("pos_active_view") as ViewKey | null
    if (saved && role && canAccessView(role, saved)) {
      return saved
    }
  } catch {
    /* noop */
  }
  return role ? defaultViewFor(role) : "dashboard"
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      role: null,
      userName: null,
      userEmail: null,
      isPrimaryAdmin: false,
      tenantId: null,
      tenantName: null,
      tenantOwnerName: null,
      tenantOwnerEmail: null,
      allowedBranchIds: [],

      branches: [],
      activeBranch: null,

      fetchBranches: async () => {
        try {
          const res = await apiFetch<{ ok: boolean; branches: BranchItem[] }>("/api/branches")
          if (res.ok && Array.isArray(res.branches)) {
            const list = res.branches.filter((b) => b.active)
            const currentActive = get().activeBranch
            let selected = list.find((b) => b.id === currentActive?.id)
            if (!selected) {
              // Intentar leer de localStorage
              if (typeof window !== "undefined") {
                const savedId = localStorage.getItem("pos_active_branch_id")
                selected = list.find((b) => b.id === savedId)
              }
            }
            if (!selected) {
              selected = list.find((b) => b.isMain) || list[0] || null
            }
            set({ branches: res.branches, activeBranch: selected })
            if (selected && typeof window !== "undefined") {
              localStorage.setItem("pos_active_branch_id", selected.id)
            }
            return res.branches
          }
        } catch {
          /* noop */
        }
        return []
      },

      setActiveBranch: (b: BranchItem) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("pos_active_branch_id", b.id)
        }
        set((s) => ({
          activeBranch: b,
          cart: [], // Limpiar carrito de la sede previa para evitar mezclas
          refreshKey: s.refreshKey + 1, // Refresca todas las vistas y componentes de inmediato
        }))
      },

      // Consulta al servidor quién es el usuario actual (cookie httpOnly)
      hydrate: async () => {
        try {
          const [authData, branchList] = await Promise.all([
            apiFetch<{
              user: {
                name: string
                role: Role
                email?: string | null
                isPrimary?: boolean
                tenantId?: string | null
                tenantName?: string | null
                tenantOwnerName?: string | null
                tenantOwnerEmail?: string | null
                allowedBranchIds?: string[]
              } | null
            }>("/api/auth/me"),
            get().fetchBranches(),
          ])
          if (authData.user) {
            const initialView = getSavedView(authData.user.role)
            const allowedIds = authData.user.allowedBranchIds || []
            const isFullAccess = authData.user.role === "superadmin" || authData.user.isPrimary
            const userBranches = isFullAccess
              ? branchList
              : branchList.filter((b) => allowedIds.includes(b.id))

            let selected = userBranches.find((b) => b.id === get().activeBranch?.id)
            if (!selected && typeof window !== "undefined") {
              const savedId = localStorage.getItem("pos_active_branch_id")
              selected = userBranches.find((b) => b.id === savedId)
            }
            if (!selected) {
              selected = userBranches.find((b) => b.isMain) || userBranches[0] || null
            }
            if (selected && typeof window !== "undefined") {
              localStorage.setItem("pos_active_branch_id", selected.id)
            }

            set({
              role: authData.user.role,
              userName: authData.user.name,
              userEmail: authData.user.email ?? null,
              isPrimaryAdmin: Boolean(authData.user.isPrimary),
              tenantId: authData.user.tenantId ?? null,
              tenantName: authData.user.tenantName ?? null,
              tenantOwnerName: authData.user.tenantOwnerName ?? null,
              tenantOwnerEmail: authData.user.tenantOwnerEmail ?? null,
              allowedBranchIds: allowedIds,
              activeBranch: selected,
              view: initialView,
              hydrated: true,
            })
            return
          }
        } catch {
          /* noop */
        }
        set({
          hydrated: true,
          role: null,
          userName: null,
          userEmail: null,
          isPrimaryAdmin: false,
          tenantId: null,
          tenantName: null,
          tenantOwnerName: null,
          tenantOwnerEmail: null,
          allowedBranchIds: [],
        })
      },

      // Login: valida PIN contra la BD; el servidor setea la cookie firmada
      login: async (name, pin) => {
        const data = await apiFetch<{
          ok: boolean
          user: {
            name: string
            role: Role
            email?: string | null
            isPrimary?: boolean
            tenantId?: string | null
            tenantName?: string | null
            tenantOwnerName?: string | null
            tenantOwnerEmail?: string | null
            allowedBranchIds?: string[]
          }
        }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ name, pin }),
        })
        const initialView = getSavedView(data.user.role)
        const branchList = await get().fetchBranches()
        const allowedIds = data.user.allowedBranchIds || []
        const isFullAccess = data.user.role === "superadmin" || data.user.isPrimary
        const userBranches = isFullAccess
          ? branchList
          : branchList.filter((b) => allowedIds.includes(b.id))

        let selected = userBranches.find((b) => b.isMain) || userBranches[0] || null
        if (selected && typeof window !== "undefined") {
          localStorage.setItem("pos_active_branch_id", selected.id)
        }

        set({
          role: data.user.role,
          userName: data.user.name,
          userEmail: data.user.email ?? null,
          isPrimaryAdmin: Boolean(data.user.isPrimary),
          tenantId: data.user.tenantId ?? null,
          tenantName: data.user.tenantName ?? null,
          tenantOwnerName: data.user.tenantOwnerName ?? null,
          tenantOwnerEmail: data.user.tenantOwnerEmail ?? null,
          allowedBranchIds: allowedIds,
          activeBranch: selected,
          view: initialView,
          cart: [],
          sidebarOpen: false,
        })
      },

      // Logout: el servidor borra la cookie
      logout: async () => {
        try {
          await apiFetch("/api/auth/logout", { method: "POST" })
        } catch {
          /* noop */
        }
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem("pos_active_view")
          }
        } catch {
          /* noop */
        }
        set({
          role: null,
          userName: null,
          userEmail: null,
          isPrimaryAdmin: false,
          tenantId: null,
          tenantName: null,
          tenantOwnerName: null,
          tenantOwnerEmail: null,
          allowedBranchIds: [],
          view: "dashboard",
          cart: [],
          heldCarts: [],
          sidebarOpen: false,
          showLanding: true,
        })
      },

      showLanding: true,
      setShowLanding: (v) => set({ showLanding: v }),

      view: "dashboard",
      setView: (v) => {
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("pos_active_view", v)
          }
        } catch {
          /* noop */
        }
        set((s) => {
          let newHeld = s.heldCarts
          let newCart = s.cart
          // Si sale del POS con items en el carrito, pasar automáticamente a espera
          if (s.view === "pos" && v !== "pos" && s.cart.length > 0) {
            const total = s.cart.reduce((sum, it) => sum + it.price * it.quantity, 0)
            const itemCount = s.cart.reduce((sum, it) => sum + it.quantity, 0)
            const autoHeld: HeldCart = {
              id: `held_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              note: `Venta en espera (${itemCount} ${itemCount === 1 ? "producto" : "productos"})`,
              paymentMethod: "efectivo",
              items: [...s.cart],
              total,
              itemCount,
              createdAt: new Date().toISOString(),
            }
            newHeld = [autoHeld, ...s.heldCarts]
            newCart = []
          }
          return { view: v, sidebarOpen: false, heldCarts: newHeld, cart: newCart }
        })
      },
      sidebarOpen: false,
      setSidebarOpen: (o) => set({ sidebarOpen: o }),

      // Carrito POS
      cart: [],
      addToCart: (item, qty = 1) =>
        set((s) => {
          const existing = s.cart.find((c) => c.productId === item.productId)
          if (existing) {
            return {
              cart: s.cart.map((c) =>
                c.productId === item.productId
                  ? { ...c, quantity: Math.min(c.quantity + qty, item.stock) }
                  : c
              ),
            }
          }
          return { cart: [...s.cart, { ...item, quantity: Math.min(qty, item.stock) }] }
        }),
      updateCartQty: (productId, qty) =>
        set((s) => ({
          cart: s.cart
            .map((c) => (c.productId === productId ? { ...c, quantity: qty } : c))
            .filter((c) => c.quantity > 0),
        })),
      removeFromCart: (productId) =>
        set((s) => ({ cart: s.cart.filter((c) => c.productId !== productId) })),
      clearCart: () => set({ cart: [] }),

      // Cola de ventas en espera / pausar venta
      heldCarts: [],
      holdCurrentCart: (params) => {
        let created: HeldCart | null = null
        set((s) => {
          if (s.cart.length === 0) return s
          const total = s.cart.reduce((sum, it) => sum + it.price * it.quantity, 0)
          const itemCount = s.cart.reduce((sum, it) => sum + it.quantity, 0)
          const defaultLabel = params?.clientName
            ? `Cliente: ${params.clientName}`
            : `Cliente en espera #${s.heldCarts.length + 1}`
          const note = params?.note?.trim() || defaultLabel

          created = {
            id: `held_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            note,
            clientId: params?.clientId,
            clientName: params?.clientName,
            discount: params?.discount,
            paymentMethod: params?.paymentMethod || "efectivo",
            items: [...s.cart],
            total,
            itemCount,
            createdAt: new Date().toISOString(),
          }

          return {
            heldCarts: [created, ...s.heldCarts],
            cart: [],
          }
        })
        return created
      },

      resumeHeldCart: (heldCartId) => {
        let resumed: HeldCart | null = null
        set((s) => {
          const target = s.heldCarts.find((c) => c.id === heldCartId)
          if (!target) return s
          resumed = target
          return {
            heldCarts: s.heldCarts.filter((c) => c.id !== heldCartId),
            cart: [...target.items],
          }
        })
        return resumed
      },

      deleteHeldCart: (heldCartId) =>
        set((s) => ({
          heldCarts: s.heldCarts.filter((c) => c.id !== heldCartId),
        })),

      clearHeldCarts: () => set({ heldCarts: [] }),

      refreshKey: 0,
      triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

      // Tour interactivo
      tourOpen: false,
      startTour: () => set({ tourOpen: true }),
      closeTour: () => set({ tourOpen: false }),
    }),
    {
      name: "pos-cart",
      // Persistir carrito activo y cola de ventas en espera
      partialize: (state) =>
        ({
          cart: state.cart,
          heldCarts: state.heldCarts,
        }) as unknown as AppState,
    }
  )
)

export function useRole() {
  return useAppStore((s) => s.role)
}
