import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/products/[id]/batches — listar lotes de un producto
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const batches = await db.productBatch.findMany({
    where: { productId: id },
    orderBy: { expirationDate: "asc" },
  })
  return NextResponse.json(batches)
}

// POST /api/products/[id]/batches — crear un lote (solo admin)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const body = await req.json()
    const stock = Number(body.stock) || 0
    const cost = Number(body.cost) || 0
    const expirationDate = body.expirationDate ? new Date(body.expirationDate) : null
    const batch = String(body.batch ?? "").trim() || null

    const created = await db.$transaction(async (tx) => {
      const b = await tx.productBatch.create({
        data: { productId: id, batch, stock, cost, expirationDate },
      })
      // Actualizar stock total del producto
      await tx.product.update({
        where: { id },
        data: { stock: { increment: stock } },
      })
      // Actualizar expirationDate legacy del producto si es menor (más próximo)
      if (expirationDate) {
        const product = await tx.product.findUnique({ where: { id } })
        if (product && (!product.expirationDate || expirationDate < product.expirationDate)) {
          await tx.product.update({ where: { id }, data: { expirationDate, batch } })
        }
      }
      return b
    })

    try {
      await logAudit({
        action: "batch_create",
        entityType: "product",
        entityId: id,
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Lote creado: ${batch ?? "sin lote"}, ${stock} unidades`,
      })
    } catch { /* noop */ }

    return NextResponse.json(created)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

import { logAudit } from "@/lib/auth"
