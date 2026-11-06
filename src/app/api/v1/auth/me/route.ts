import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authResult = requireAuth(req)
    if (authResult instanceof Response) return authResult

    const { session } = authResult

    const user = await db.user.findUnique({
      where: { id: session.uid },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        isPrimary: true,
        allowedBranchIds: true,
        tenantId: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            rubro: true,
            status: true,
            ownerEmail: true,
            ownerPhone: true,
          },
        },
      },
    })

    if (!user) {
      return apiError("Usuario no encontrado", 404)
    }

    let allowedBranchIds: string[] = []
    try {
      allowedBranchIds = JSON.parse(user.allowedBranchIds || "[]")
    } catch {
      allowedBranchIds = []
    }

    // Si es un cliente, buscar estadísticas de pedidos
    let clientStats: { ordersCount: number } | null = null
    if (user.role === "cliente") {
      const ordersCount = await db.order.count({
        where: {
          OR: [
            { createdById: user.id },
            { customerEmail: user.email || "" },
          ],
        },
      })
      clientStats = { ordersCount }
    }

    // Si es un repartidor/domiciliario, buscar entregas realizadas
    let deliveryStats: { activeDeliveries: number; completedDeliveries: number } | null = null
    if (user.role === "domiciliario") {
      const activeDeliveries = await db.order.count({
        where: {
          deliveryDriverId: user.id,
          status: "en_camino",
        },
      })
      const completedDeliveries = await db.order.count({
        where: {
          deliveryDriverId: user.id,
          status: "entregado",
        },
      })
      deliveryStats = { activeDeliveries, completedDeliveries }
    }

    return apiSuccess({
      user: {
        ...user,
        allowedBranchIds,
      },
      stats: clientStats || deliveryStats || null,
    })
  } catch (error) {
    console.error("Error en GET /api/v1/auth/me:", error)
    return apiError("Error al consultar perfil de usuario", 500)
  }
}
