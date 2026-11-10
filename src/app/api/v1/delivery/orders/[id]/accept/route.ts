import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole, logAudit } from "@/lib/auth"
import { verifyEntityBranchAccess } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"
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

    // dispatchNow defaults to true for API v1 mobile compatibility; pass dispatchNow: false or mode: "claim" to reserve before pickup
    const dispatchNow =
      body.mode === "claim" ? false : body.dispatchNow !== undefined ? Boolean(body.dispatchNow) : true

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
      return apiError("No tienes autorización para tomar pedidos de otro comercio", 403)
    }

    if (session.role !== "superadmin") {
      const hasBranchAccess = await verifyEntityBranchAccess(session.uid, order.branchId)
      if (!hasBranchAccess) {
        return apiError("No tienes autorización para tomar pedidos de esta sede", 403)
      }
    }

    if (order.deliveryDriverId && order.deliveryDriverId !== session.uid) {
      return apiError(`Este pedido ya fue tomado por otro repartidor (${order.deliveryDriverName})`, 409)
    }

    if (["entregado", "cancelado"].includes(order.status)) {
      return apiError(`No puedes aceptar un pedido que ya está ${order.status}`, 400)
    }

    const driverUser = await db.user.findUnique({
      where: { id: session.uid },
      select: { phone: true, name: true },
    })

    const nextStatus = dispatchNow
      ? "en_camino"
      : order.status === "pendiente"
      ? "confirmado"
      : order.status

    const now = new Date()

    // Adjudicación atómica para evitar condiciones de carrera (Primero en Aceptar)
    if (!order.deliveryDriverId) {
      const claimResult = await db.order.updateMany({
        where: {
          id: order.id,
          deliveryDriverId: null,
          status: { notIn: ["cancelado", "entregado"] },
        },
        data: {
          deliveryDriverId: session.uid,
          deliveryDriverName: driverUser?.name || session.name,
          deliveryDriverPhone: driverUser?.phone || null,
          assignedAt: now,
          ...(dispatchNow ? { dispatchedAt: now } : {}),
          status: nextStatus,
        },
      })

      if (claimResult.count === 0) {
        const latest = await db.order.findUnique({
          where: { id: order.id },
          select: { deliveryDriverName: true, status: true },
        })
        if (latest?.deliveryDriverName) {
          return apiError(`Este pedido acaba de ser tomado por otro repartidor (${latest.deliveryDriverName})`, 409)
        }
        return apiError("El pedido ya no está disponible para tomar", 409)
      }
    } else {
      // Ya estaba asignado a este mismo domiciliario (ej. pasa de confirmado a en_camino)
      await db.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          ...(dispatchNow && !order.dispatchedAt ? { dispatchedAt: now } : {}),
        },
      })
    }

    const updated = await db.order.findUnique({
      where: { id: order.id },
      include: {
        items: true,
        tenant: { select: { id: true, name: true, ownerPhone: true } },
        branch: { select: { id: true, name: true, address: true, phone: true } },
      },
    })

    await logAudit({
      action: dispatchNow ? "api_delivery_accept" : "api_delivery_claim",
      entityType: "order",
      entityId: order.id,
      userName: session.name,
      role: session.role,
      detail: dispatchNow
        ? `Domiciliario ${session.name} tomó el pedido ${order.orderNumber} para entrega inmediata (en_camino)`
        : `Domiciliario ${session.name} reservó el pedido ${order.orderNumber} para recoger en tienda`,
    })

    if (updated) {
      if (dispatchNow && order.status !== "en_camino") {
        notifyCustomerOrderStatus({
          orderId: updated.id,
          newStatus: "en_camino",
          oldStatus: order.status,
        }).catch(() => {})
      } else if (!order.deliveryDriverId) {
        notifyCustomerOrderStatus({
          orderId: updated.id,
          newStatus: "asignado",
          customMessage: `🛵 *¡Repartidor asignado!*\n\nHola ${updated.customerName || "Cliente"}, tu pedido *#${updated.orderNumber}* fue tomado por el repartidor *${driverUser?.name || session.name}*. En breve saldrá hacia tu dirección.`,
        }).catch(() => {})
      }
    }

    return apiSuccess({
      order: updated,
      message: dispatchNow
        ? `¡Pedido aceptado y en camino! Dirígete a entregarlo a ${updated?.customerName || "cliente"}.`
        : `¡Pedido adjudicado a tu cuenta! Pasa por ${updated?.branch?.name || "la sede"} a recogerlo y márcalo 'En Camino'.`,
    })
  } catch (error) {
    console.error("Error en POST /api/v1/delivery/orders/[id]/accept:", error)
    return apiError("Error al aceptar entrega del pedido", 500)
  }
}
