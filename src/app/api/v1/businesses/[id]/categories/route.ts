import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const business = await db.tenant.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        branches: { select: { id: true } },
      },
    })

    if (!business) {
      return apiError("Negocio no encontrado", 404)
    }

    const branchIds = business.branches.map((b) => b.id)

    // Categorías con productos existentes en las sedes de este negocio
    const products = await db.product.findMany({
      where: {
        branchId: { in: branchIds },
        active: true,
      },
      select: { categoryId: true },
    })

    const catIds = Array.from(new Set(products.map((p) => p.categoryId).filter(Boolean))) as string[]

    const categories = catIds.length > 0
      ? await db.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true, createdAt: true },
          orderBy: { name: "asc" },
        })
      : []

    return apiSuccess({
      businessId: business.id,
      categories,
    })
  } catch (error) {
    console.error("Error en GET /api/v1/businesses/[id]/categories:", error)
    return apiError("Error al listar categorías del negocio", 500)
  }
}
