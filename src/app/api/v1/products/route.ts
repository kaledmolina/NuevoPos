import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, requireRole, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const businessId = searchParams.get("businessId") || searchParams.get("tenantId")
    const branchId = searchParams.get("branchId")
    const categoryId = searchParams.get("categoryId")
    const q = searchParams.get("q")?.trim()
    const inStock = searchParams.get("inStock") === "1"
    const minPrice = searchParams.get("minPrice") ? Number(searchParams.get("minPrice")) : null
    const maxPrice = searchParams.get("maxPrice") ? Number(searchParams.get("maxPrice")) : null
    const page = Math.max(1, Number(searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 30)))

    const where: Record<string, unknown> = {
      active: true,
    }

    // Filtrar por sede específica o por negocio completo
    if (branchId) {
      where.branchId = branchId
    } else if (businessId) {
      // Obtener todas las sedes del negocio
      const tenant = await db.tenant.findFirst({
        where: { OR: [{ id: businessId }, { slug: businessId }] },
        include: { branches: { select: { id: true } } },
      })
      if (tenant) {
        const branchIds = tenant.branches.map((b) => b.id)
        where.branchId = { in: branchIds }
      }
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    if (inStock) {
      where.stock = { gt: 0 }
    }

    if (minPrice !== null || maxPrice !== null) {
      const priceFilter: Record<string, number> = {}
      if (minPrice !== null && !isNaN(minPrice)) priceFilter.gte = minPrice
      if (maxPrice !== null && !isNaN(maxPrice)) priceFilter.lte = maxPrice
      if (Object.keys(priceFilter).length > 0) where.price = priceFilter
    }

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { barcode: { contains: q } },
        { sku: { contains: q } },
        { description: { contains: q } },
      ]
    }

    const [total, products] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          unit: true,
          image: true,
          description: true,
          sku: true,
          barcode: true,
          location: true,
          branchId: true,
          categoryId: true,
          category: {
            select: { id: true, name: true },
          },
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return apiSuccess({
      products,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error("Error en GET /api/v1/products:", error)
    return apiError("Error al consultar catálogo de productos", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireRole(req, ["admin", "vendedor", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const body = await req.json().catch(() => ({}))

    const name = (body.name || "").toString().trim()
    const price = Number(body.price ?? 0)
    const cost = Number(body.cost ?? 0)
    const stock = Number(body.stock ?? 0)
    const minStock = Number(body.minStock ?? 5)
    const branchId = body.branchId ? body.branchId.toString().trim() : null
    const categoryId = body.categoryId ? body.categoryId.toString().trim() : null
    const barcode = body.barcode ? body.barcode.toString().trim() : null
    const sku = body.sku ? body.sku.toString().trim() : null
    const unit = (body.unit || "unidad").toString().trim()
    const image = body.image ? body.image.toString().trim() : null
    const description = body.description ? body.description.toString().trim() : null

    if (!name) {
      return apiError("El nombre del producto es obligatorio", 400)
    }

    if (price < 0) {
      return apiError("El precio de venta no puede ser negativo", 400)
    }

    // Verificar sede
    if (branchId) {
      const branch = await db.branch.findUnique({ where: { id: branchId } })
      if (!branch) {
        return apiError("La sede especificada no existe", 400)
      }
      if (session.role !== "superadmin" && session.tenantId && branch.tenantId !== session.tenantId) {
        return apiError("No tienes permiso para agregar productos a sedes de otro negocio", 403)
      }
    }

    const product = await db.product.create({
      data: {
        name,
        price,
        cost,
        stock,
        minStock,
        branchId,
        categoryId,
        barcode,
        sku,
        unit,
        image,
        description,
        active: true,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    })

    await logAudit({
      action: "api_product_create",
      entityType: "product",
      entityId: product.id,
      userName: session.name,
      role: session.role,
      detail: `Producto creado vía API: ${product.name} ($${product.price})`,
    })

    return apiSuccess({ product }, { message: "Producto creado con éxito" }, 201)
  } catch (error) {
    console.error("Error en POST /api/v1/products:", error)
    return apiError("Error al crear producto", 500)
  }
}
