import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"
import { requireAuth, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

export interface SaleCreditInfo {
  isCredit: boolean
  totalSale: number
  initialPayment: number
  paidAmount: number
  pendingBalance: number
  status: "pagada" | "parcial" | "pendiente"
  accountBalance: number
  creditLimit: number
  availableCredit: number
  abonos: Array<{
    id: string
    voucherNumber: string
    amount: number
    method: string
    reportedBy: string
    createdAt: Date | string
    concept: string
  }>
}

// Helper para calcular deuda real, abonos y estado de créditos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enrichSalesWithCredit(sales: any[]) {
  // Agrupar ventas a crédito por cliente
  const clientSalesMap = new Map<string, typeof sales>()
  for (const s of sales) {
    if (s.paymentMethod === "credito" && s.clientId) {
      if (!clientSalesMap.has(s.clientId)) clientSalesMap.set(s.clientId, [])
      clientSalesMap.get(s.clientId)!.push(s)
    }
  }

  const creditInfoMap = new Map<string, SaleCreditInfo>()
  for (const [, cSales] of clientSalesMap.entries()) {
    const sortedSales = [...cSales].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const account = sortedSales[0]?.client?.creditAccount
    const movements = account?.movements || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const abonos = movements.filter((m: any) => m.type === "abono")

    // Estado de pagos por venta
    const saleDebt = new Map<string, number>()
    const saleAbonos = new Map<string, SaleCreditInfo["abonos"]>()
    for (const s of sortedSales) {
      const initPaid = s.amountReceived || 0
      saleDebt.set(s.id, Math.max(0, s.total - initPaid))
      saleAbonos.set(s.id, [])
    }

    // 1. Abonos específicos con saleId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unassignedAbonos: any[] = []
    for (const ab of abonos) {
      if (ab.saleId && saleDebt.has(ab.saleId)) {
        const cur = saleDebt.get(ab.saleId)!
        const applied = Math.min(cur, ab.amount)
        saleDebt.set(ab.saleId, cur - applied)
        saleAbonos.get(ab.saleId)!.push({
          id: ab.id,
          voucherNumber: `AB-${ab.id.slice(-6).toUpperCase()}`,
          amount: applied,
          method: ab.method || "efectivo",
          reportedBy: ab.reportedBy || "admin",
          createdAt: ab.createdAt,
          concept: ab.concept,
        })
        if (ab.amount > applied) {
          unassignedAbonos.push({ ...ab, amount: ab.amount - applied })
        }
      } else {
        unassignedAbonos.push(ab)
      }
    }

    // 2. Abonos generales en FIFO
    for (const ab of unassignedAbonos) {
      let rem = ab.amount
      for (const s of sortedSales) {
        if (rem <= 0) break
        const cur = saleDebt.get(s.id) || 0
        if (cur <= 0) continue
        const applied = Math.min(cur, rem)
        saleDebt.set(s.id, cur - applied)
        saleAbonos.get(s.id)!.push({
          id: ab.id,
          voucherNumber: `AB-${ab.id.slice(-6).toUpperCase()}`,
          amount: applied,
          method: ab.method || "efectivo",
          reportedBy: ab.reportedBy || "admin",
          createdAt: ab.createdAt,
          concept: ab.concept,
        })
        rem -= applied
      }
    }

    for (const s of sortedSales) {
      const remaining = saleDebt.get(s.id) || 0
      const totalPaid = Math.max(0, s.total - remaining)
      const abonosList = saleAbonos.get(s.id) || []
      const status: "pagada" | "parcial" | "pendiente" =
        remaining <= 0 ? "pagada" : (totalPaid > 0 ? "parcial" : "pendiente")
      creditInfoMap.set(s.id, {
        isCredit: true,
        totalSale: s.total,
        initialPayment: s.amountReceived || 0,
        paidAmount: totalPaid,
        pendingBalance: remaining,
        status,
        accountBalance: account?.balance ?? remaining,
        creditLimit: account?.creditLimit ?? 0,
        availableCredit: (account?.creditLimit ?? 0) - (account?.balance ?? 0),
        abonos: abonosList,
      })
    }
  }

  return sales.map((s) => {
    const ci = creditInfoMap.get(s.id) || (s.paymentMethod === "credito" ? {
      isCredit: true,
      totalSale: s.total,
      initialPayment: s.amountReceived || 0,
      paidAmount: 0,
      pendingBalance: s.total,
      status: "pendiente" as const,
      accountBalance: s.total,
      creditLimit: 0,
      availableCredit: 0,
      abonos: [],
    } : null)
    return { ...s, creditInfo: ci }
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limitParam = searchParams.get("limit")
  const limit = limitParam !== null ? Number(limitParam) : 100
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const status = searchParams.get("status")

  const where: Record<string, unknown> = {}
  if (status) {
    where.status = status
  }
  if (from || to) {
    const range: Record<string, Date> = {}
    if (from) range.gte = new Date(from)
    if (to) {
      const endDate = new Date(to)
      endDate.setHours(23, 59, 59, 999)
      range.lte = endDate
    }
    where.createdAt = range
  }

  const sales = await db.sale.findMany({
    where,
    include: {
      client: {
        include: {
          creditAccount: {
            include: { movements: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
    ...(limit > 0 ? { take: limit } : {}),
  })

  const enriched = enrichSalesWithCredit(sales)
  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth
  const session = auth.session
  try {
    const body = await req.json()
    const { items, clientId, paymentMethod, amountReceived, discount, notes } = body as {
      items: { productId: string; quantity: number; unitPrice: number; unitCost: number }[]
      clientId?: string
      paymentMethod: string
      amountReceived?: number
      discount?: number
      notes?: string
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "La venta no tiene productos" }, { status: 400 })
    }

    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
    const disc = Number(discount) || 0
    const total = Math.max(0, subtotal - disc)
    const tax = 0

    // Transacción atómica: validación de stock + creación + descuento + caja
    const sale = await db.$transaction(async (tx) => {
      // Validar stock DENTRO de la transacción (lock en SQLite)
      const productIds = items.map((i) => i.productId)
      const products = await tx.product.findMany({ where: { id: { in: productIds } } })
      if (products.length !== productIds.length) {
        throw new Error("Producto no encontrado")
      }
      for (const it of items) {
        const p = products.find((pr) => pr.id === it.productId)!
        if (it.quantity > p.stock) {
          throw new Error(`Stock insuficiente para ${p.name}. Disponible: ${p.stock}`)
        }
        if (it.quantity <= 0) {
          throw new Error(`Cantidad inválida para ${p.name}`)
        }
      }

      const lastSale = await tx.sale.findFirst({ orderBy: { invoiceNumber: "desc" } })
      const invoiceNumber = nextInvoiceNumber(lastSale?.invoiceNumber)
      const openSession = await tx.cashSession.findFirst({ where: { status: "abierta" } })

      // Validación de crédito
      let creditAccount: { id: string; balance: number; creditLimit: number; active: boolean } | null = null
      if (paymentMethod === "credito") {
        if (!clientId) {
          throw new Error("Las ventas a crédito requieren un cliente (no se permite cliente genérico)")
        }
        const client = await tx.client.findUnique({ where: { id: clientId } })
        if (!client) throw new Error("Cliente no encontrado")
        if (client.isGeneric) {
          throw new Error("No se permite venta a crédito al cliente genérico. Registra al cliente primero.")
        }
        creditAccount = await tx.creditAccount.findUnique({ where: { clientId } })
        if (!creditAccount || !creditAccount.active) {
          throw new Error("El cliente no tiene cuenta de crédito activa. El admin debe otorgarle crédito primero.")
        }
        const newBalance = creditAccount.balance + total
        if (newBalance > creditAccount.creditLimit) {
          throw new Error(`Crédito insuficiente. Saldo actual: $${creditAccount.balance.toLocaleString("es-CO")}, Límite: $${creditAccount.creditLimit.toLocaleString("es-CO")}. Faltan $${(newBalance - creditAccount.creditLimit).toLocaleString("es-CO")}.`)
        }
      }

      // Crear la venta con sus items
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          clientId: clientId || null,
          subtotal,
          tax,
          discount: disc,
          total,
          paymentMethod,
          amountReceived: paymentMethod === "credito" ? (Number(amountReceived) || 0) : (Number(amountReceived) || total),
          change: paymentMethod === "credito" ? 0 : Math.max(0, (Number(amountReceived) || 0) - total),
          cashSessionId: openSession?.id ?? null,
          notes: notes || null,
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              unitCost: it.unitCost,
              subtotal: it.unitPrice * it.quantity,
            })),
          },
        },
        include: { items: { include: { product: true } }, client: true },
      })

      // Descontar stock atómicamente
      for (const it of items) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { decrement: it.quantity } },
        })
      }

      // Registrar en caja (guardamos el saleId en reference para anulación confiable)
      if (openSession) {
        await tx.cashTransaction.create({
          data: {
            cashSessionId: openSession.id,
            type: "venta",
            amount: total,
            concept: paymentMethod === "credito" ? `Venta a crédito #${invoiceNumber}` : `Venta #${invoiceNumber}`,
            method: paymentMethod,
            reference: created.id, // referencia estable al saleId para anular
          },
        })
      }

      // Si es venta a crédito, registrar cargo en la cuenta del cliente
      if (paymentMethod === "credito" && creditAccount) {
        const prevBal = creditAccount.balance
        const nextBal = prevBal + total
        await tx.creditAccount.update({
          where: { id: creditAccount.id },
          data: { balance: { increment: total } },
        })
        await tx.creditMovement.create({
          data: {
            accountId: creditAccount.id,
            type: "cargo",
            amount: total,
            concept: `Venta a crédito #${invoiceNumber}`,
            method: "credito",
            reportedBy: session.name,
            previousBalance: prevBal,
            remainingBalance: nextBal,
            saleId: created.id,
          },
        })
      }

      return created
    })

    await logAudit({
      action: "sale_create",
      entityType: "sale",
      entityId: sale.id,
      userName: session.name,
      role: session.role,
      detail: `Venta ${sale.invoiceNumber} por ${formatTotal(sale.total)} (${paymentMethod}, ${items.length} items)`,
      meta: { invoiceNumber: sale.invoiceNumber, total: sale.total, paymentMethod, itemCount: items.length },
    })

    return NextResponse.json(sale)
  } catch (e) {
    const msg = (e as Error).message
    if (
      msg.includes("Stock insuficiente") ||
      msg.includes("Cantidad inválida") ||
      msg.includes("no encontrado") ||
      msg.includes("crédito") ||
      msg.includes("Crédito") ||
      msg.includes("genérico")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function formatTotal(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n)
}
