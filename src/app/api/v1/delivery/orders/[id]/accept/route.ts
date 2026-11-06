import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(req, ["domiciliario", "admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { id } = await params

    const order = await db.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id }] },
    })

    if (!order) {
      return apiError("Pedido no encontrado", 404)
    }

    if (order.deliveryDriverId && order.deliveryDriverId !== session.uid) {
      return apiError(`Este pedido ya fue tomado por otro repartidor (${order.deliveryDriverName})`, 409)
    }

    if (["entregado", "cancelado"].includes(order.status)) {
      return apiError(`No puedes aceptar un pedido que ya está ${order.status}`, 400)
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        deliveryDriverId: session.uid,
        deliveryDriverName: session.name,
        assignedAt: new Date(),
        dispatchedAt: new Date(),
        status: "en_camino",
      },
      include: {
        items: true,
        tenant: { select: { id: true, name: true, ownerPhone: true } },
        branch: { select: { id: true, name: true, address: true, phone: true } },
      },
    })

    await logAudit({
      action: "api_delivery_accept",
      entityType: "order",
      entityId: order.id,
      userName: session.name,
      role: session.role,
      detail: `Domiciliario ${session.name} tomó el pedido ${order.orderNumber} para entrega inmediata`,
    })

    return apiSuccess({
      order: updated,
      message: `¡Pedido aceptado! Ya puedes dirigirte a ${updated.branch?.name || "la tienda"} a recoger el paquete.`,
    })
  } catch (error) {
    console.error("Error en POST /api/v1/delivery/orders/[id]/accept:", error)
    return apiError("Error al aceptar entrega del pedido", 500)
  }
}
