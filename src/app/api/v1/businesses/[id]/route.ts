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
      where: {
        OR: [
          { id },
          { slug: id },
        ],
      },
      include: {
        branches: {
          where: { active: true },
          orderBy: [{ isMain: "desc" }, { name: "asc" }],
        },
      },
    })

    if (!business) {
      return apiError("Negocio no encontrado", 404)
    }

    if (business.status !== "aprobado") {
      return apiError("El negocio consultado no se encuentra habilitado para recibir pedidos", 403)
    }

    const branchIds = business.branches.map((b) => b.id)

    // Consultar categorías que tienen productos en este negocio
    const productsInTenant = await db.product.findMany({
      where: {
        active: true,
        branchId: { in: branchIds },
      },
      select: {
        categoryId: true,
      },
    })

    const categoryIds = Array.from(new Set(productsInTenant.map((p) => p.categoryId).filter(Boolean))) as string[]

    const categories = categoryIds.length > 0
      ? await db.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : []

    return apiSuccess({
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        rubro: business.rubro,
        ownerName: business.ownerName,
        ownerEmail: business.ownerEmail,
        ownerPhone: business.ownerPhone,
        notes: business.notes,
        createdAt: business.createdAt,
        branches: business.branches,
        availableCategories: categories,
        productsCount: productsInTenant.length,
      },
    })
  } catch (error) {
    console.error("Error en GET /api/v1/businesses/[id]:", error)
    return apiError("Error al consultar información del negocio", 500)
  }
}
