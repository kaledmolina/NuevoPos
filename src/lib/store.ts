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

interface AppState {
  // Autenticación (sesión validada server-side vía cookie httpOnly)
  hydrated: boolean
  role: Role | null
  userName: string | null
  hydrate: () => Promise<void>
  login: (name: string, pin: string) => Promise<void>
  logout: () => Promise<void>

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
    (set) => ({
      hydrated: false,
      role: null,
      userName: null,

      // Consulta al servidor quién es el usuario actual (cookie httpOnly)
      hydrate: async () => {
        try {
          const data = await apiFetch<{ user: { name: string; role: Role } | null }>("/api/auth/me")
          if (data.user) {
            const initialView = getSavedView(data.user.role)
            set({
              role: data.user.role,
              userName: data.user.name,
              view: initialView,
              hydrated: true,
            })
            return
          }
        } catch {
          /* noop */
        }
        set({ hydrated: true, role: null, userName: null })
      },

      // Login: valida PIN contra la BD; el servidor setea la cookie firmada
      login: async (name, pin) => {
        const data = await apiFetch<{ ok: boolean; user: { name: string; role: Role } }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ name, pin }),
        })
        const initialView = getSavedView(data.user.role)
        set({
          role: data.user.role,
          userName: data.user.name,
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
