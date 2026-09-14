import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { resolveBranchId, requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const categoryId = searchParams.get("categoryId")
  const lowStock = searchParams.get("lowStock") === "1"
  const expiring = searchParams.get("expiring") === "1"
  const page = Math.max(1, Number(searchParams.get("page") ?? 1))
  const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? 50))
  const paginate = searchParams.get("paginate") === "1"

  const session = getSession(req)
  let branchId = ""
  if (session) {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    branchId = branchAccess.branchId
  } else {
    branchId = await resolveBranchId(req)
  }

  const where: Record<string, unknown> = {}
  if (branchId) {
    where.branchId = branchId
  }

  if (q) {
    where.OR = [
      { name: { contains: q } },
      { barcode: { contains: q } },
      { sku: { contains: q } },
    ]
  }
  if (categoryId) where.categoryId = categoryId
  const activeParam = searchParams.get("active")
  if (activeParam === "1") {
    where.active = true
  } else if (activeParam === "0") {
    where.active = false
  }

  let products = await db.product.findMany({
    where,
    include: {
      category: true,
      saleItems: {
        where: {
          sale: {
            status: "completada",
          },
        },
        select: {
          quantity: true,
          unitPrice: true,
          unitCost: true,
          subtotal: true,
          sale: {
            select: {
              subtotal: true,
              discount: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
    ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
  })

  // Mapear métricas de ventas reales para cada producto considerando descuentos
  const productsWithMetrics = products.map((p) => {
    let soldUnits = 0
    let totalRevenue = 0
    let totalRealCost = 0

    if (p.saleItems && Array.isArray(p.saleItems)) {
      for (const item of p.saleItems) {
        soldUnits += item.quantity
        const saleSubtotal = item.sale?.subtotal || item.subtotal
        const saleDiscount = item.sale?.discount || 0
        const discountFraction = saleSubtotal > 0 ? (saleDiscount / saleSubtotal) : 0
        const netItemRevenue = item.subtotal * (1 - discountFraction)

        totalRevenue += netItemRevenue
        totalRealCost += (item.unitCost || p.cost || 0) * item.quantity
      }
    }

    const totalRealProfit = totalRevenue - totalRealCost

    // Omitir el array pesado de saleItems en la respuesta para mantenerla liviana
    const { saleItems: _, ...rest } = p
    return {
      ...rest,
      soldUnits,
      totalRevenue,
      totalRealProfit,
    }
  })

  products = productsWithMetrics as any

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

  // Si se pidió paginación, devolver { items, total, page, pageSize }
  if (paginate) {
    const total = await db.product.count({ where })
    return NextResponse.json({ items: products, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  }

  return NextResponse.json(products)
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId, session } = branchAccess
  try {
    const body = await req.json()
    const product = await db.product.create({
      data: {
        name: body.name,
        barcode: body.barcode || null,
        sku: body.sku || body.barcode || null,
        categoryId: body.categoryId || null,
        branchId: branchId || null,
        description: body.description || null,
        image: body.image || null,
        cost: Number(body.cost) || 0,
        price: Number(body.price) || 0,
        stock: Number(body.stock) || 0,
        minStock: Number(body.minStock) || 5,
        unit: body.unit || "unidad",
        expirationDate: body.expirationDate ? new Date(body.expirationDate) : null,
        batch: body.batch || null,
        location: body.location || null,
        active: body.active ?? true,
      },
      include: { category: true },
    })
    try {
      await logAudit({
        action: "product_create",
        entityType: "product",
        entityId: product.id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Producto creado: ${product.name}`,
        meta: {
          name: product.name,
          price: Number(product.price),
          stock: Number(product.stock),
        },
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
