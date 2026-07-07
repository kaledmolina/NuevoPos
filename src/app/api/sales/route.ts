import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"
import { requireAuth, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get("limit") ?? 50)
  const sales = await db.sale.findMany({
    include: { client: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return NextResponse.json(sales)
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
          amountReceived: Number(amountReceived) || total,
          change: Math.max(0, (Number(amountReceived) || 0) - total),
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
      if (openSession && (paymentMethod === "efectivo" || paymentMethod === "tarjeta" || paymentMethod === "transferencia")) {
        await tx.cashTransaction.create({
          data: {
            cashSessionId: openSession.id,
            type: "venta",
            amount: total,
            concept: `Venta ${invoiceNumber}`,
            method: paymentMethod,
            reference: created.id, // referencia estable al saleId para anular
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
    if (msg.includes("Stock insuficiente") || msg.includes("Cantidad inválida") || msg.includes("no encontrado")) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    console.error(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function formatTotal(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n)
}
