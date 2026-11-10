import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import { getUserAllowedBranches } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authResult = requireRole(req, ["domiciliario", "vendedor", "admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { searchParams } = new URL(req.url)

    const scopeParam = searchParams.get("scope")?.toLowerCase()
    const assignedToMe = searchParams.get("assignedToMe") === "1"
    const scope = assignedToMe ? "mine" : scopeParam || "all"

    const status = searchParams.get("status")?.trim() || null
    const paymentStatus = searchParams.get("paymentStatus")?.trim() || null
    const q = searchParams.get("q")?.trim() || null

    const page = Math.max(1, Number(searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 30)))

    const headerBranchId = req.headers.get("x-branch-id")
    const queryBranchId = searchParams.get("branchId")
    const requestedBranchId =
      queryBranchId && queryBranchId !== "all" && queryBranchId !== "null" && queryBranchId !== "undefined"
        ? queryBranchId
        : headerBranchId && headerBranchId !== "all" && headerBranchId !== "null" && headerBranchId !== "undefined"
        ? headerBranchId
        : null

    const allowedBranches = await getUserAllowedBranches(session.uid)
    if (requestedBranchId && session.role !== "superadmin" && !allowedBranches.includes(requestedBranchId)) {
      return apiError("No tienes autorización para consultar pedidos de esta sede.", 403)
    }

    const baseAnd: Record<string, unknown>[] = []

    // Aislamiento multi-negocio
    if (session.role !== "superadmin" && session.tenantId) {
      baseAnd.push({
        OR: [{ tenantId: session.tenantId }, { branch: { tenantId: session.tenantId } }],
      })
    }

    // Aislamiento por sede activa o sedes autorizadas del repartidor
    if (requestedBranchId) {
      baseAnd.push({ OR: [{ branchId: requestedBranchId }, { branchId: null }] })
    } else if (session.role !== "superadmin" && allowedBranches.length > 0) {
      baseAnd.push({ OR: [{ branchId: { in: allowedBranches } }, { branchId: null }] })
    }

    // Filtro por alcance (disponibles sin conductor vs asignados al domiciliario)
    const scopeAnd: Record<string, unknown>[] = [...baseAnd]
    if (session.role === "domiciliario" || scope === "available" || scope === "mine" || scope === "active" || scope === "delivered") {
      if (scope === "available") {
        scopeAnd.push({
          deliveryDriverId: null,
          status: { in: ["pendiente", "confirmado", "en_preparacion"] },
        })
      } else if (scope === "active") {
        scopeAnd.push({
          deliveryDriverId: session.uid,
          status: { in: ["pendiente", "confirmado", "en_preparacion", "en_camino"] },
        })
      } else if (scope === "delivered") {
        scopeAnd.push({
          deliveryDriverId: session.uid,
          status: "entregado",
        })
      } else if (scope === "mine") {
        scopeAnd.push({
          deliveryDriverId: session.uid,
        })
      } else {
        // Por defecto ("all"): sus pedidos (activos o historial) + pedidos disponibles para tomar
        scopeAnd.push({
          OR: [
            { deliveryDriverId: session.uid },
            {
              deliveryDriverId: null,
              status: { in: ["pendiente", "confirmado", "en_preparacion"] },
            },
          ],
        })
      }
    }

    if (status && status !== "all") {
      scopeAnd.push({ status })
    }

    if (paymentStatus && paymentStatus !== "all") {
      if (paymentStatus === "unsettled" || paymentStatus === "por_liquidar") {
        scopeAnd.push({ paymentStatus: { not: "pagado" }, status: "entregado" })
      } else {
        scopeAnd.push({ paymentStatus })
      }
    }

    if (q) {
      scopeAnd.push({
        OR: [
          { orderNumber: { contains: q } },
          { customerName: { contains: q } },
          { customerPhone: { contains: q } },
          { deliveryAddress: { contains: q } },
        ],
      })
    }

    const where = scopeAnd.length > 0 ? { AND: scopeAnd } : {}
    const baseWhere = baseAnd.length > 0 ? { AND: baseAnd } : {}

    const [total, orders, availableCount, activeCount, deliveredCount, unsettledCount] =
      await Promise.all([
        db.order.count({ where }),
        db.order.findMany({
          where,
          include: {
            tenant: { select: { id: true, name: true, ownerPhone: true } },
            branch: { select: { id: true, name: true, address: true, phone: true } },
            items: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        db.order.count({
          where: {
            AND: [
              baseWhere,
              {
                deliveryDriverId: null,
                status: { in: ["pendiente", "confirmado", "en_preparacion"] },
              },
            ],
          },
        }),
        db.order.count({
          where: {
            AND: [
              baseWhere,
              {
                deliveryDriverId: session.uid,
                status: { in: ["pendiente", "confirmado", "en_preparacion", "en_camino"] },
              },
            ],
          },
        }),
        db.order.count({
          where: {
            AND: [
              baseWhere,
              {
                deliveryDriverId: session.uid,
                status: "entregado",
              },
            ],
          },
        }),
        db.order.count({
          where: {
            AND: [
              baseWhere,
              {
                deliveryDriverId: session.uid,
                status: "entregado",
                paymentStatus: { not: "pagado" },
              },
            ],
          },
        }),
      ])

    return apiSuccess({
      orders,
      counts: {
        available: availableCount,
        active: activeCount,
        delivered: deliveredCount,
        unsettled: unsettledCount,
      },
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error("Error en GET /api/v1/delivery/orders:", error)
    return apiError("Error al consultar pedidos de entrega", 500)
  }
}
