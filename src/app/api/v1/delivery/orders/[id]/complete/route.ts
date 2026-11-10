import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole, logAudit } from "@/lib/auth"
import { verifyEntityBranchAccess } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"
import { syncOrderToSale } from "@/lib/order-sale-sync"
import { notifyCustomerOrderStatus } from "@/lib/order-notifications"

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

    if (
      session.role !== "superadmin" &&
      session.tenantId &&
      order.tenantId &&
      session.tenantId !== order.tenantId
    ) {
      return apiError("No tienes autorización para completar pedidos de otro comercio", 403)
    }

    if (session.role !== "superadmin") {
      const hasBranchAccess = await verifyEntityBranchAccess(session.uid, order.branchId)
      if (!hasBranchAccess) {
        return apiError("No tienes autorización para completar pedidos de esta sede", 403)
      }
    }

    if (session.role === "domiciliario" && order.deliveryDriverId && order.deliveryDriverId !== session.uid) {
      return apiError("Solo el repartidor asignado puede marcar este pedido como entregado", 403)
    }

    if (order.status === "cancelado") {
      return apiError("No puedes marcar como entregado un pedido que fue cancelado", 400)
    }

    if (order.status === "entregado") {
      return apiError("Este pedido ya figuraba como entregado", 400)
    }

    const notes = body.notes ? String(body.notes).trim() : null
    // Solo un humano en caja/admin reporta el pedido como 'pagado' al recibir el efectivo.
    // Si ya estaba prepagado (ej. transferencia verificada), se conserva 'pagado'; de lo contrario pasa a 'por_cobrar'.
    const nextPaymentStatus = order.paymentStatus === "pagado" ? "pagado" : "por_cobrar"
    const now = new Date()

    const driverUser = !order.deliveryDriverId
      ? await db.user.findUnique({ where: { id: session.uid }, select: { name: true, phone: true } })
      : null

    let updated
    if (!order.deliveryDriverId) {
      const claimAndComplete = await db.order.updateMany({
        where: {
          id: order.id,
          deliveryDriverId: null,
          status: { notIn: ["cancelado", "entregado"] },
        },
        data: {
          status: "entregado",
          paymentStatus: nextPaymentStatus,
          deliveredAt: now,
          deliveryDriverId: session.uid,
          deliveryDriverName: driverUser?.name || session.name,
          deliveryDriverPhone: driverUser?.phone || null,
          assignedAt: order.assignedAt || now,
          notes: notes ? `${order.notes ? order.notes + " | " : ""}Entrega: ${notes}` : order.notes,
        },
      })
      if (claimAndComplete.count === 0) {
        const latest = await db.order.findUnique({
          where: { id: order.id },
          select: { deliveryDriverName: true, status: true },
        })
        if (latest?.deliveryDriverName) {
          return apiError(`Este pedido ya pertenece a otro repartidor (${latest.deliveryDriverName})`, 409)
        }
        return apiError("El pedido ya no se puede completar en su estado actual", 409)
      }
      updated = await db.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          tenant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      })
    } else {
      updated = await db.order.update({
        where: { id: order.id },
        data: {
          status: "entregado",
          paymentStatus: nextPaymentStatus,
          deliveredAt: now,
          notes: notes ? `${order.notes ? order.notes + " | " : ""}Entrega: ${notes}` : order.notes,
        },
        include: {
          items: true,
          tenant: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
        },
      })
    }

    await logAudit({
      action: "api_delivery_complete",
      entityType: "order",
      entityId: order.id,
      userName: session.name,
      role: session.role,
      detail: `Domiciliario ${session.name} completó la entrega del pedido ${order.orderNumber} (Pago: ${nextPaymentStatus})`,
    })

    // Notificar al cliente (sin tokens de IA) y cerrar sesión de conversación
    notifyCustomerOrderStatus({
      orderId: updated.id,
      newStatus: "entregado",
      oldStatus: order.status,
    }).catch(() => {})

    if (updated.customerPhone) {
      try {
        const { closeConversationSession } = await import("@/lib/conversation-session")
        await closeConversationSession(updated.customerPhone, "order_created", updated.orderNumber)
      } catch {
        /* noop */
      }
    }

    // Solo sincronizar a ventas si ya estaba previamente pagado
    if (updated.paymentStatus === "pagado") {
      try {
        await syncOrderToSale(updated.id)
      } catch (err) {
        console.error("Error al registrar venta desde entrega:", err)
      }
    }

    return apiSuccess({
      order: updated,
      message:
        updated.paymentStatus === "pagado"
          ? `¡Entrega finalizada con éxito! El pedido ${order.orderNumber} fue entregado (ya figuraba pagado).`
          : `¡Entrega finalizada! El pedido ${order.orderNumber} quedó marcado como entregado y pendiente por liquidar en caja.`,
    })
  } catch (error) {
    console.error("Error en POST /api/v1/delivery/orders/[id]/complete:", error)
    return apiError("Error al completar entrega del pedido", 500)
  }
}
