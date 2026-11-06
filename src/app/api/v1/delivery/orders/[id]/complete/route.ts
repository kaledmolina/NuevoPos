import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"
import { syncOrderToSale } from "@/lib/order-sale-sync"

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
    const body = await req.json().catch(() => ({}))

    const order = await db.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id }] },
    })

    if (!order) {
      return apiError("Pedido no encontrado", 404)
    }

    if (session.role === "domiciliario" && order.deliveryDriverId && order.deliveryDriverId !== session.uid) {
      return apiError("Solo el repartidor asignado puede marcar este pedido como entregado", 403)
    }

    if (order.status === "entregado") {
      return apiError("Este pedido ya figuraba como entregado", 400)
    }

    const notes = body.notes ? String(body.notes).trim() : null

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        status: "entregado",
        paymentStatus: "pagado",
        deliveredAt: new Date(),
        notes: notes ? `${order.notes ? order.notes + " | " : ""}Entrega: ${notes}` : order.notes,
      },
      include: {
        items: true,
        tenant: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    })

    await logAudit({
      action: "api_delivery_complete",
      entityType: "order",
      entityId: order.id,
      userName: session.name,
      role: session.role,
      detail: `Domiciliario ${session.name} completó la entrega del pedido ${order.orderNumber}`,
    })

    // Registrar en ventas de inmediato
    try {
      await syncOrderToSale(updated.id)
    } catch (err) {
      console.error("Error al registrar venta desde entrega:", err)
    }

    return apiSuccess({
      order: updated,
      message: `¡Entrega finalizada con éxito! El pedido ${order.orderNumber} ha sido marcado como entregado y pagado.`,
    })
  } catch (error) {
    console.error("Error en POST /api/v1/delivery/orders/[id]/complete:", error)
    return apiError("Error al completar entrega del pedido", 500)
  }
}
