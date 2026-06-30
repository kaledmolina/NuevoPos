import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { daysUntil } from "@/lib/format"

export const dynamic = "force-dynamic"

export async function GET() {
  const now = new Date()
  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [salesToday, salesMonth, products, salesAll, openSession, transactionsMonth] =
    await Promise.all([
      db.sale.findMany({
        where: { createdAt: { gte: startToday }, status: "completada" },
      }),
      db.sale.findMany({
        where: { createdAt: { gte: startMonth }, status: "completada" },
      }),
      db.product.findMany(),
      db.sale.findMany({
        where: { status: "completada" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { client: true, items: true },
      }),
      db.cashSession.findFirst({
        where: { status: "abierta" },
        include: { transactions: true },
      }),
      db.transaction.findMany({ where: { date: { gte: startMonth } } }),
    ])

  const totalToday = salesToday.reduce((s, x) => s + x.total, 0)
  const totalMonth = salesMonth.reduce((s, x) => s + x.total, 0)
  const countToday = salesToday.length

  // Stock
  const stockValue = products.reduce((s, p) => s + p.cost * p.stock, 0)
  const retailValue = products.reduce((s, p) => s + p.price * p.stock, 0)
  const lowStock = products.filter((p) => p.stock <= p.minStock)

  // Vencimientos
  const expiringSoon = products.filter((p) => {
    const d = daysUntil(p.expirationDate)
    return d !== null && d <= 30
  })
  const expired = products.filter((p) => {
    const d = daysUntil(p.expirationDate)
    return d !== null && d < 0
  })

  // Ingresos/Egresos del mes
  const incomeMonth = transactionsMonth
    .filter((t) => t.type === "ingreso")
    .reduce((s, t) => s + t.amount, 0)
  const expenseMonth = transactionsMonth
    .filter((t) => t.type === "egreso")
    .reduce((s, t) => s + t.amount, 0)

  // Caja actual
  let cashBalance = 0
  let cashMovements = 0
  if (openSession) {
    cashBalance = openSession.openingAmount
    for (const t of openSession.transactions) {
      if (t.method !== "efectivo") continue
      if (t.type === "venta" || t.type === "ingreso") cashBalance += t.amount
      else cashBalance -= t.amount
    }
    cashMovements = openSession.transactions.length
  }

  // Ventas por día (últimos 7 días)
  const days: { date: string; total: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const next = new Date(d)
    next.setDate(d.getDate() + 1)
    const total = salesAll
      ? 0 // recalculamos abajo
      : 0
    void total
    const daySales = await db.sale.findMany({
      where: { createdAt: { gte: d, lt: next }, status: "completada" },
    })
    days.push({
      date: d.toLocaleDateString("es-CO", { weekday: "short", day: "2-digit" }),
      total: daySales.reduce((s, x) => s + x.total, 0),
    })
  }

  // Top productos vendidos (mes)
  const monthSaleItems = await db.saleItem.findMany({
    where: { sale: { createdAt: { gte: startMonth }, status: "completada" } },
    include: { product: true },
  })
  const topMap = new Map<string, { name: string; qty: number; total: number }>()
  for (const it of monthSaleItems) {
    const cur = topMap.get(it.productId) || { name: it.product.name, qty: 0, total: 0 }
    cur.qty += it.quantity
    cur.total += it.subtotal
    topMap.set(it.productId, cur)
  }
  const topProducts = [...topMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)

  return NextResponse.json({
    totalToday,
    totalMonth,
    countToday,
    stockValue,
    retailValue,
    lowStock,
    expiringSoon,
    expired,
    incomeMonth,
    expenseMonth,
    cashOpen: !!openSession,
    cashBalance,
    cashMovements,
    recentSales: salesAll,
    salesByDay: days,
    topProducts,
    totalProducts: products.length,
  })
}
