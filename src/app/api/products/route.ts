import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const categoryId = searchParams.get("categoryId")
  const lowStock = searchParams.get("lowStock") === "1"
  const expiring = searchParams.get("expiring") === "1"

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { barcode: { contains: q } },
      { sku: { contains: q } },
    ]
  }
  if (categoryId) where.categoryId = categoryId

  let products = await db.product.findMany({
    where,
    include: { category: true },
    orderBy: { name: "asc" },
  })

  if (lowStock) {
    products = products.filter((p) => p.stock <= p.minStock)
  }

  if (expiring) {
    const now = Date.now()
    const limit = now + 30 * 24 * 60 * 60 * 1000
    products = products.filter((p) => {
      if (!p.expirationDate) return false
      const t = new Date(p.expirationDate).getTime()
      return t <= limit
    })
  }

  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const product = await db.product.create({
      data: {
        name: body.name,
        barcode: body.barcode || null,
        sku: body.sku || body.barcode || null,
        categoryId: body.categoryId || null,
        description: body.description || null,
        cost: Number(body.cost) || 0,
        price: Number(body.price) || 0,
        stock: Number(body.stock) || 0,
        minStock: Number(body.minStock) ?? 5,
        unit: body.unit || "unidad",
        expirationDate: body.expirationDate ? new Date(body.expirationDate) : null,
        batch: body.batch || null,
        location: body.location || null,
        active: body.active ?? true,
      },
      include: { category: true },
    })
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
