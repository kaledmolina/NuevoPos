import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"
import { buildDriverSettlementReport } from "@/lib/driver-settlement"

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

    // Si es un repartidor/domiciliario, buscar entregas realizadas y resumen de cuadre
    let deliveryStats: {
      activeDeliveries: number
      completedDeliveries: number
      availableOrdersCount: number
      unsettledCashCount: number
      unsettledCashProductsTotal: number
      unsettledCashDeliveryTotal: number
      unsettledCashGrossTotal: number
      settledTodayCount: number
      settledTodayGrossTotal: number
    } | null = null
    if (user.role === "domiciliario") {
      const branchScope =
        allowedBranchIds.length > 0
          ? { OR: [{ branchId: { in: allowedBranchIds } }, { branchId: null }] }
          : {}
      const tenantScope = user.tenantId
        ? { OR: [{ tenantId: user.tenantId }, { branch: { tenantId: user.tenantId } }] }
        : {}

      const [activeDeliveries, completedDeliveries, availableOrdersCount, settlementReport] =
        await Promise.all([
          db.order.count({
            where: {
              deliveryDriverId: user.id,
              status: { in: ["pendiente", "confirmado", "en_preparacion", "en_camino"] },
            },
          }),
          db.order.count({
            where: {
              deliveryDriverId: user.id,
              status: "entregado",
            },
          }),
          db.order.count({
            where: {
              AND: [
                tenantScope,
                branchScope,
                {
                  deliveryDriverId: null,
                  status: { in: ["pendiente", "confirmado", "en_preparacion"] },
                },
              ],
            },
          }),
          buildDriverSettlementReport({
            session,
            branchId: allowedBranchIds[0] || null,
            range: "all",
          }),
        ])

      const my = settlementReport.mySettlement
      deliveryStats = {
        activeDeliveries,
        completedDeliveries,
        availableOrdersCount,
        unsettledCashCount: my?.unsettledCashCount ?? 0,
        unsettledCashProductsTotal: my?.unsettledCashProductsTotal ?? 0,
        unsettledCashDeliveryTotal: my?.unsettledCashDeliveryTotal ?? 0,
        unsettledCashGrossTotal: my?.unsettledCashGrossTotal ?? 0,
        settledTodayCount: my?.settledTodayCount ?? 0,
        settledTodayGrossTotal: my?.settledTodayGrossTotal ?? 0,
      }
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
