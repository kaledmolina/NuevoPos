import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET /api/purchases — lista de compras con proveedor e items
// Query opcional ?q= filtra por referencia o nombre del proveedor
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()

    const where: Record<string, unknown> = {}
    if (q) {
      where.OR = [
        { reference: { contains: q } },
        { supplier: { name: { contains: q } } },
      ]
    }

    const purchases = await db.purchase.findMany({
      where,
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })

    return NextResponse.json(purchases)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/purchases — registra una compra y actualiza stock/costos de productos
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const { reference, supplierId, notes, items } = body as {
      reference?: string
      supplierId?: string
      notes?: string
      items: {
        productId: string
        quantity: number
        unitCost: number
        expirationDate?: string
        batch?: string
      }[]
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "La compra debe tener al menos un producto" },
        { status: 400 }
      )
    }

    // Validar items: cantidad y costo positivos, productos existentes
    for (const it of items) {
      if (!it.productId) {
        return NextResponse.json({ error: "Falta producto en un ítem" }, { status: 400 })
      }
      if (!Number.isFinite(Number(it.quantity)) || Number(it.quantity) <= 0) {
        return NextResponse.json(
          { error: "Las cantidades deben ser mayores a 0" },
          { status: 400 }
        )
      }
      if (!Number.isFinite(Number(it.unitCost)) || Number(it.unitCost) < 0) {
        return NextResponse.json(
          { error: "Los costos unitarios no son válidos" },
          { status: 400 }
        )
      }
    }

    const productIds = items.map((i) => i.productId)
    const products = await db.product.findMany({ where: { id: { in: productIds } } })
    if (products.length !== new Set(productIds).size) {
      return NextResponse.json(
        { error: "Uno o más productos no existen" },
        { status: 400 }
      )
    }

    const subtotal = items.reduce(
      (s, it) => s + Number(it.quantity) * Number(it.unitCost),
      0
    )
    const tax = 0 // droguería simplificado sin IVA
    const total = subtotal

    const cleanSupplierId =
      supplierId && supplierId !== "none" ? supplierId : null

    // Crear compra + actualizar productos atómicamente
    const purchase = await db.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          reference: reference?.trim() || null,
          supplierId: cleanSupplierId,
          notes: notes?.trim() || null,
          subtotal,
          tax,
          total,
          status: "recibida",
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              quantity: Number(it.quantity),
              unitCost: Number(it.unitCost),
              subtotal: Number(it.quantity) * Number(it.unitCost),
              expirationDate: it.expirationDate
                ? new Date(it.expirationDate)
                : null,
              batch: it.batch?.trim() || null,
            })),
          },
        },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      })

      // Actualizar cada producto: incrementar stock, actualizar costo,
      // crear un lote individual y asignar vencimiento/lote legacy si no tiene.
      for (const it of items) {
        const product = products.find((p) => p.id === it.productId)!
        const data: Record<string, unknown> = {
          stock: { increment: Number(it.quantity) },
          cost: Number(it.unitCost),
        }
        if (it.expirationDate && !product.expirationDate) {
          data.expirationDate = new Date(it.expirationDate)
        }
        if (it.batch && it.batch.trim() && !product.batch) {
          data.batch = it.batch.trim()
        }
        await tx.product.update({
          where: { id: it.productId },
          data,
        })
        // Crear un lote individual para esta línea de compra
        await tx.productBatch.create({
          data: {
            productId: it.productId,
            batch: it.batch?.trim() || null,
            stock: Number(it.quantity),
            cost: Number(it.unitCost),
            expirationDate: it.expirationDate ? new Date(it.expirationDate) : null,
          },
        })
      }

      return created
    })

    const session = getSession(req)
    try {
      await logAudit({
        action: "purchase_create",
        entityType: "purchase",
        entityId: purchase.id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Compra registrada: ${purchase.total}`,
        meta: {
          supplierId: cleanSupplierId ?? "",
          total: Number(purchase.total),
          itemCount: items.length,
        },
      })
    } catch {
      // noop: logging failure must not break the operation
    }

    return NextResponse.json(purchase)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
