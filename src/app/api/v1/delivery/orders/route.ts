import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authResult = requireRole(req, ["domiciliario", "admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { searchParams } = new URL(req.url)
    const assignedToMe = searchParams.get("assignedToMe") === "1"
    const status = searchParams.get("status")
    const page = Math.max(1, Number(searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)))

    const where: Record<string, unknown> = {}

    if (assignedToMe || session.role === "domiciliario") {
      if (assignedToMe) {
        where.deliveryDriverId = session.uid
      } else {
        // Por defecto: pedidos asignados al domiciliario o pedidos disponibles para recoger
        where.OR = [
          { deliveryDriverId: session.uid },
          {
            deliveryDriverId: null,
            status: { in: ["confirmado", "en_preparacion"] },
          },
        ]
      }
    }

    if (status) {
      where.status = status
    }

    const [total, orders] = await Promise.all([
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
    ])

    return apiSuccess({
      orders,
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
