import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"

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

    // Validar stock y obtener productos
    const productIds = items.map((i) => i.productId)
    const products = await db.product.findMany({ where: { id: { in: productIds } } })
    if (products.length !== productIds.length) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 400 })
    }
    for (const it of items) {
      const p = products.find((pr) => pr.id === it.productId)!
      if (it.quantity > p.stock) {
        return NextResponse.json(
          { error: `Stock insuficiente para ${p.name}. Disponible: ${p.stock}` },
          { status: 400 }
        )
      }
    }

    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0)
    const disc = Number(discount) || 0
    const total = Math.max(0, subtotal - disc)
    const tax = 0 // droguería simplificado sin IVA

    const lastSale = await db.sale.findFirst({ orderBy: { invoiceNumber: "desc" } })
    const invoiceNumber = nextInvoiceNumber(lastSale?.invoiceNumber)

    const openSession = await db.cashSession.findFirst({ where: { status: "abierta" } })

    const sale = await db.sale.create({
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

    // Descontar stock
    for (const it of items) {
      await db.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.quantity } },
      })
    }

    // Registrar en caja (solo efectivo u otros que afecten caja)
    if (openSession && (paymentMethod === "efectivo" || paymentMethod === "tarjeta" || paymentMethod === "transferencia")) {
      await db.cashTransaction.create({
        data: {
          cashSessionId: openSession.id,
          type: "venta",
          amount: total,
          concept: `Venta ${invoiceNumber}`,
          method: paymentMethod,
        },
      })
    }

    return NextResponse.json(sale)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
