import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { verifyEntityBranchAccess } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"
import { syncOrderToSale } from "@/lib/order-sale-sync"
import { notifyCustomerOrderStatus } from "@/lib/order-notifications"

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
    const notifyClient = Boolean(body.notifyClient)
    const rawDeliveryFee = body.deliveryFee !== undefined && body.deliveryFee !== null ? Number(body.deliveryFee) : null

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

    // Si es domiciliario, puede cambiar entre en_preparacion -> en_camino -> entregado,
    // pero NUNCA puede alterar manualmente el estado de pago (ni marcar 'pagado' ni revertirlo — eso corresponde únicamente a caja/admin al recibir el dinero).
    if (session && (session.role === "domiciliario" || session.role === "cliente") && paymentStatus) {
      return apiError("Solo el personal de caja o administrador puede modificar o confirmar el estado de pago de un pedido.", 403)
    }

    if (session && session.role === "domiciliario") {
      const hasBranchAccess = await verifyEntityBranchAccess(session.uid, order.branchId)
      if (!hasBranchAccess) {
        return apiError("No tienes autorización para actualizar pedidos de esta sede", 403)
      }
      if (!order.deliveryDriverId) {
        return apiError("Primero debes tomar este pedido antes de cambiar su estado", 403)
      }
      if (order.deliveryDriverId !== session.uid) {
        return apiError("Solo el repartidor asignado puede actualizar este pedido", 403)
      }
      if (rawStatus && !["en_camino", "entregado"].includes(rawStatus)) {
        return apiError("Los domiciliarios solo pueden actualizar pedidos a 'en_camino' o 'entregado'", 403)
      }
      if (rawDeliveryFee !== null) {
        return apiError("Solo el comercio puede modificar la tarifa de domicilio", 403)
      }
      if (paymentMethod) {
        return apiError("Solo el comercio puede modificar el método de pago del pedido", 403)
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
        // Si el pago no fue marcado previamente como pagado (ej. cobro en efectivo contraentrega),
        // se conserva como 'por_cobrar' hasta que el domiciliario entregue físicamente todo el efectivo en caja.
        if (!paymentStatus && order.paymentStatus !== "pagado") {
          updateData.paymentStatus = "por_cobrar"
        }
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

    if (rawDeliveryFee !== null && !isNaN(rawDeliveryFee) && rawDeliveryFee >= 0) {
      updateData.deliveryFee = rawDeliveryFee
      const currentSubtotal = order.subtotal || order.total
      const currentDiscount = order.discount || 0
      const currentTax = order.tax || 0
      updateData.total = Math.max(0, currentSubtotal + rawDeliveryFee - currentDiscount + currentTax)
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

    // ÚNICAMENTE registrar o actualizar la venta oficial cuando un humano confirma el pago ('pagado')
    if (updated.paymentStatus === "pagado") {
      try {
        await syncOrderToSale(updated.id)
      } catch (err) {
        console.error("Error sincronizando pedido a venta oficial:", err)
      }
    } else if (paymentStatus && paymentStatus !== "pagado" && order.paymentStatus === "pagado") {
      // Si un humano revirtió un pago confirmado a pendiente / por_cobrar, retirar la venta auto-sincronizada del pedido
      try {
        await db.sale.deleteMany({
          where: {
            notes: { contains: `[Pedido: ${order.orderNumber}]` },
          },
        })
      } catch (err) {
        console.error("Error revirtiendo venta auto-sincronizada del pedido:", err)
      }
    }

    // Notificación transaccional automática directa al cliente (WhatsApp o Telegram, sin costo de IA)
    if (rawStatus && rawStatus !== order.status) {
      notifyCustomerOrderStatus({
        orderId: updated.id,
        newStatus,
        oldStatus: order.status,
        cancelReason: cancelReason || undefined,
      }).catch((notifErr) => {
        console.error("Error en notificación automática de pedido al cliente:", notifErr)
      })
    } else if (rawDeliveryFee !== null && notifyClient && order.customerPhone) {
      const feeFormatted = `$${rawDeliveryFee.toLocaleString("es-CO")}`
      const newTotalFormatted = `$${Number(updated.total).toLocaleString("es-CO")}`
      notifyCustomerOrderStatus({
        orderId: updated.id,
        newStatus: "tarifa_fijada",
        customMessage: `🛵 *Costo de Envío Confirmado*\n\nHola ${order.customerName || "Cliente"}, para tu dirección en *${order.deliveryAddress || "tu ubicación"}* el costo de domicilio es de *${feeFormatted}*.\n\n💵 *Total actualizado del pedido #${order.orderNumber}:* ${newTotalFormatted}`,
      }).catch(() => {})
    }

    // Si la orden fue entregada, cerrar la conversación automáticamente para que la próxima compra inicie en limpio
    if (newStatus === "entregado" && updated.customerPhone) {
      try {
        const { closeConversationSession } = await import("@/lib/conversation-session")
        await closeConversationSession(updated.customerPhone, "order_created", updated.orderNumber)
      } catch (err: any) {
        console.warn("[Order Delivered] Error cerrando sesión:", err.message)
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
