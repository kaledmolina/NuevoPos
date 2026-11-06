import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const businessId = searchParams.get("businessId") || searchParams.get("tenantId")

    let categories

    if (businessId) {
      const tenant = await db.tenant.findFirst({
        where: { OR: [{ id: businessId }, { slug: businessId }] },
        include: { branches: { select: { id: true } } },
      })

      if (tenant) {
        const branchIds = tenant.branches.map((b) => b.id)
        const products = await db.product.findMany({
          where: { branchId: { in: branchIds }, active: true },
          select: { categoryId: true },
        })
        const catIds = Array.from(new Set(products.map((p) => p.categoryId).filter(Boolean))) as string[]

        categories = await db.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true, createdAt: true },
          orderBy: { name: "asc" },
        })
      } else {
        categories = []
      }
    } else {
      categories = await db.category.findMany({
        select: { id: true, name: true, createdAt: true },
        orderBy: { name: "asc" },
      })
    }

    return apiSuccess({ categories })
  } catch (error) {
    console.error("Error en GET /api/v1/categories:", error)
    return apiError("Error al consultar categorías", 500)
  }
}
