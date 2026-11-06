import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"
import { syncOrderToSale } from "@/lib/order-sale-sync"

export const dynamic = "force-dynamic"

const VALID_STATUSES = ["pendiente", "confirmado", "en_preparacion", "en_camino", "entregado", "cancelado"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const rawStatus = body.status ? String(body.status).trim().toLowerCase() : null
    const cancelReason = body.cancelReason ? String(body.cancelReason).trim() : null
    const paymentStatus = body.paymentStatus ? String(body.paymentStatus).trim().toLowerCase() : null
    const paymentMethod = body.paymentMethod ? String(body.paymentMethod).trim().toLowerCase() : null

    if (rawStatus && !VALID_STATUSES.includes(rawStatus)) {
      return apiError(`Estado inválido. Estados permitidos: ${VALID_STATUSES.join(", ")}`, 400)
    }

    const order = await db.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        items: true,
      },
    })

    if (!order) {
      return apiError("Pedido no encontrado", 404)
    }

    const newStatus = rawStatus || order.status

    // Seguridad: verificar pertenencia al negocio si es admin o vendedor
    if (
      session &&
      session.role !== "superadmin" &&
      session.tenantId &&
      order.tenantId &&
      session.tenantId !== order.tenantId
    ) {
      return apiError("No tienes autorización para modificar pedidos de otro comercio", 403)
    }

    if (order.status === "cancelado" && rawStatus && rawStatus !== "cancelado") {
      return apiError("Este pedido ya se encuentra cancelado y no puede cambiar de estado", 400)
    }

    if (order.status === "entregado" && rawStatus && rawStatus !== "entregado") {
      return apiError("Este pedido ya ha sido entregado exitosamente y no puede retroceder de estado", 400)
    }

    // Permisos:
    // Si es cliente, solo puede cancelar si el pedido sigue en "pendiente"
    if (session && session.role === "cliente") {
      if (rawStatus && rawStatus !== "cancelado") {
        return apiError("Los clientes solo pueden solicitar la cancelación de sus pedidos pendientes", 403)
      }
      if (order.status !== "pendiente") {
        return apiError("El pedido ya fue confirmado o procesado por el comercio y no puede cancelarse desde la app", 400)
      }
    }

    // Si es domiciliario, puede cambiar entre en_preparacion -> en_camino -> entregado
    if (session && session.role === "domiciliario") {
      if (rawStatus && !["en_camino", "entregado"].includes(rawStatus)) {
        return apiError("Los domiciliarios solo pueden actualizar pedidos a 'en_camino' o 'entregado'", 403)
      }
    }

    const updateData: Record<string, unknown> = {}

    if (rawStatus) {
      updateData.status = newStatus
      if (newStatus === "en_camino" && !order.dispatchedAt) {
        updateData.dispatchedAt = new Date()
      }
      if (newStatus === "entregado") {
        updateData.deliveredAt = new Date()
        updateData.paymentStatus = "pagado"
      }
      if (newStatus === "cancelado") {
        updateData.cancelledAt = new Date()
        updateData.cancelReason = cancelReason || "Cancelado por solicitud del usuario"
      }
    }

    if (paymentStatus) {
      updateData.paymentStatus = paymentStatus
    }

    if (paymentMethod) {
      updateData.paymentMethod = paymentMethod
    }

    // Transacción: si se cancela, restaurar stock de los productos
    const updated = await db.$transaction(async (tx) => {
      if (newStatus === "cancelado") {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          })
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          items: true,
          tenant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      })
    })

    // Si el pedido quedó entregado o pagado, registrar o actualizar automáticamente su venta oficial
    if (updated.paymentStatus === "pagado" || updated.status === "entregado") {
      try {
        await syncOrderToSale(updated.id)
      } catch (err) {
        console.error("Error sincronizando pedido a venta oficial:", err)
      }
    }

    await logAudit({
      action: "api_order_status_update",
      entityType: "order",
      entityId: order.id,
      userName: session?.name || "Sistema",
      role: session?.role || "sistema",
      detail: `Estado del pedido ${order.orderNumber} cambiado de '${order.status}' a '${newStatus}'`,
    })

    return apiSuccess({
      order: updated,
      message: `Estado del pedido actualizado a '${newStatus}'`,
    })
  } catch (error) {
    console.error("Error en PATCH /api/v1/orders/[id]/status:", error)
    return apiError("Error al actualizar estado del pedido", 500)
  }
}
