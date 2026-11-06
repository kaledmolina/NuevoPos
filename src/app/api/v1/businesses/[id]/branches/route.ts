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
        OR: [{ id }, { slug: id }],
      },
      select: { id: true, name: true, status: true },
    })

    if (!business) {
      return apiError("Negocio no encontrado", 404)
    }

    const branches = await db.branch.findMany({
      where: {
        tenantId: business.id,
        active: true,
      },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    })

    return apiSuccess({
      businessId: business.id,
      businessName: business.name,
      branches,
    })
  } catch (error) {
    console.error("Error en GET /api/v1/businesses/[id]/branches:", error)
    return apiError("Error al listar las sedes del negocio", 500)
  }
}
