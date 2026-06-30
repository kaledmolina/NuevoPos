"use client"

import { create } from "zustand"

export type ViewKey =
  | "dashboard"
  | "pos"
  | "products"
  | "clients"
  | "suppliers"
  | "purchases"
  | "sales"
  | "cash"
  | "finance"
  | "reports"

interface CartItem {
  productId: string
  name: string
  price: number
  cost: number
  stock: number
  quantity: number
}

interface AppState {
  view: ViewKey
  setView: (v: ViewKey) => void
  sidebarOpen: boolean
  setSidebarOpen: (o: boolean) => void
  // carrito POS
  cart: CartItem[]
  addToCart: (item: Omit<CartItem, "quantity">, qty?: number) => void
  updateCartQty: (productId: string, qty: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  // contador de refresco global para forzar recarga de datos
  refreshKey: number
  triggerRefresh: () => void
}

export const useAppStore = create<AppState>((set) => ({
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
