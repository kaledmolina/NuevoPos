"use client"

import { create } from "zustand"
import { apiFetch } from "@/lib/api"
import type { Role, ViewKey } from "@/lib/permissions"

interface CartItem {
  productId: string
  name: string
  price: number
  cost: number
  stock: number
  quantity: number
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

  // Navegación
  view: ViewKey
  setView: (v: ViewKey) => void
  sidebarOpen: boolean
  setSidebarOpen: (o: boolean) => void

  // Carrito POS
  cart: CartItem[]
  addToCart: (item: Omit<CartItem, "quantity">, qty?: number) => void
  updateCartQty: (productId: string, qty: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void

  // Refresco global
  refreshKey: number
  triggerRefresh: () => void
}

export const useAppStore = create<AppState>((set) => ({
  hydrated: false,
  role: null,
  userName: null,

  // Consulta al servidor quién es el usuario actual (cookie httpOnly)
  hydrate: async () => {
    try {
      const data = await apiFetch<{ user: { name: string; role: Role } | null }>("/api/auth/me")
      if (data.user) {
        set({
          role: data.user.role,
          userName: data.user.name,
          view: data.user.role === "admin" ? "dashboard" : "pos",
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
    set({
      role: data.user.role,
      userName: data.user.name,
      view: data.user.role === "admin" ? "dashboard" : "pos",
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
    set({ role: null, userName: null, view: "dashboard", cart: [], sidebarOpen: false, showLanding: true })
  },

  showLanding: true,
  setShowLanding: (v) => set({ showLanding: v }),

  view: "dashboard",
  setView: (v) => set({ view: v, sidebarOpen: false }),
  sidebarOpen: false,
  setSidebarOpen: (o) => set({ sidebarOpen: o }),

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

  refreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}))

export function useRole() {
  return useAppStore((s) => s.role)
}
