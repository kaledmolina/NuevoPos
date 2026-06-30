"use client"

import { create } from "zustand"
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
  // Autenticación
  hydrated: boolean
  role: Role | null
  userName: string | null
  hydrate: () => void
  login: (role: Role, name: string) => void
  logout: () => void

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

const SESSION_KEY = "pos-session"

export const useAppStore = create<AppState>((set) => ({
  hydrated: false,
  role: null,
  userName: null,
  hydrate: () => {
    if (typeof window === "undefined") return
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const { role, name } = JSON.parse(raw)
        if (role === "admin" || role === "vendedor") {
          set({ role, userName: name, hydrated: true })
          return
        }
      }
    } catch {
      /* noop */
    }
    set({ hydrated: true })
  },
  login: (role, name) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ role, name }))
    }
    set({
      role,
      userName: name,
      view: role === "admin" ? "dashboard" : "pos",
      cart: [],
      sidebarOpen: false,
    })
  },
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(SESSION_KEY)
    }
    set({ role: null, userName: null, view: "dashboard", cart: [], sidebarOpen: false })
  },

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

// Hook de conveniencia para obtener los permisos del rol actual
export function useRole() {
  return useAppStore((s) => s.role)
}
