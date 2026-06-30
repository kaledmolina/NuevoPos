import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    const fields = [
      "name", "barcode", "sku", "categoryId", "description", "unit",
      "batch", "location", "active",
    ]
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f] === "" ? null : body[f]
    }
    if (body.cost !== undefined) data.cost = Number(body.cost) || 0
    if (body.price !== undefined) data.price = Number(body.price) || 0
    if (body.stock !== undefined) data.stock = Number(body.stock) || 0
    if (body.minStock !== undefined) data.minStock = Number(body.minStock) || 0
    if (body.expirationDate !== undefined) {
      data.expirationDate = body.expirationDate ? new Date(body.expirationDate) : null
    }

    const product = await db.product.update({
      where: { id },
      data,
      include: { category: true },
    })
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.product.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
