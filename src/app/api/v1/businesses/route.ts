import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    const rubro = searchParams.get("rubro")?.trim()
    const page = Math.max(1, Number(searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)))

    // Condición de búsqueda: Solo negocios aprobados y activos
    const where: Record<string, unknown> = {
      status: "aprobado",
    }

    if (rubro && rubro !== "todos") {
      where.rubro = rubro
    }

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { slug: { contains: q } },
        { rubro: { contains: q } },
      ]
    }

    const [total, businesses] = await Promise.all([
      db.tenant.count({ where }),
      db.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          rubro: true,
          ownerName: true,
          ownerEmail: true,
          ownerPhone: true,
          createdAt: true,
          branches: {
            where: { active: true },
            select: {
              id: true,
              name: true,
              code: true,
              address: true,
              phone: true,
              isMain: true,
            },
            orderBy: [{ isMain: "desc" }, { name: "asc" }],
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    // Enriquecer cada negocio con el conteo de productos activos en sus sedes
    const businessesWithCounts = await Promise.all(
      businesses.map(async (b) => {
        const branchIds = b.branches.map((br) => br.id)
        const productsCount = branchIds.length > 0
          ? await db.product.count({
              where: {
                active: true,
                branchId: { in: branchIds },
              },
            })
          : 0

        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          rubro: b.rubro,
          contact: {
            owner: b.ownerName,
            email: b.ownerEmail,
            phone: b.ownerPhone,
          },
          branchesCount: b.branches.length,
          branches: b.branches,
          productsCount,
          createdAt: b.createdAt,
        }
      })
    )

    return apiSuccess(
      {
        businesses: businessesWithCounts,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      {
        availableRubros: [
          { key: "drogueria", label: "Droguería & Farmacia" },
          { key: "tienda", label: "Tienda / Minimarket" },
          { key: "ferreteria", label: "Ferretería & Construcción" },
          { key: "ropa", label: "Boutique & Ropa" },
          { key: "general", label: "Comercio General" },
        ],
      }
    )
  } catch (error) {
    console.error("Error en GET /api/v1/businesses:", error)
    return apiError("Error al listar negocios disponibles", 500)
  }
}
