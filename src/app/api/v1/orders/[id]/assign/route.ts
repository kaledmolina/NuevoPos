import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { verifyEntityBranchAccess } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"
import { notifyCustomerOrderStatus } from "@/lib/order-notifications"
import { notifyDriverAssignedOrder } from "@/lib/telegram-driver"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req)
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const order = await db.order.findFirst({
      where: { OR: [{ id }, { orderNumber: id }] },
    })

    if (!order) {
      return apiError("Pedido no encontrado", 404)
    }

    // Seguridad: verificar permisos de rol y pertenencia al negocio
    if (!session || !["admin", "superadmin", "vendedor", "domiciliario"].includes(session.role)) {
      return apiError("No tienes permisos para asignar conductores a este pedido", 403)
    }

    if (
      session.role !== "superadmin" &&
      session.tenantId &&
      order.tenantId &&
      session.tenantId !== order.tenantId
    ) {
      return apiError("No tienes autorización para modificar pedidos de otro comercio", 403)
    }

    if (order.status === "cancelado") {
      return apiError("No se puede asignar un domiciliario a un pedido cancelado", 400)
    }

    if (order.status === "entregado" && session.role === "domiciliario") {
      return apiError("Los domiciliarios no pueden auto-asignarse un pedido que ya figura como entregado", 403)
    }

    let driverId = (body.driverId || body.deliveryDriverId || "").toString().trim()
    let driverName = (body.driverName || body.deliveryDriverName || "").toString().trim()
    let driverPhone = (body.driverPhone || body.deliveryDriverPhone || "").toString().trim()
    const dispatchNow = Boolean(body.dispatchNow)

    // Si el usuario autenticado es un domiciliario, validar sede, First-to-Claim y auto-asignarse
    if (session && session.role === "domiciliario") {
      const hasBranchAccess = await verifyEntityBranchAccess(session.uid, order.branchId)
      if (!hasBranchAccess) {
        return apiError("No tienes autorización para tomar pedidos de esta sede", 403)
      }
      if (order.deliveryDriverId && order.deliveryDriverId !== session.uid) {
        return apiError(
          `Este pedido ya fue tomado por otro repartidor (${order.deliveryDriverName})`,
          409
        )
      }
      driverId = session.uid
      driverName = session.name
      const driverUser = await db.user.findUnique({
        where: { id: session.uid },
        select: { phone: true, name: true },
      })
      driverName = driverUser?.name || driverName
      driverPhone = driverPhone || driverUser?.phone || ""
    }

    if (!driverName) {
      return apiError("Debes especificar el nombre o ID del repartidor ('driverName')", 400)
    }

    const now = new Date()
    const targetStatus = dispatchNow
      ? "en_camino"
      : order.status === "pendiente"
      ? "confirmado"
      : order.status

    // Adjudicación atómica cuando el domiciliario se auto-asigna un pedido libre
    if (session.role === "domiciliario" && !order.deliveryDriverId) {
      const claimed = await db.order.updateMany({
        where: {
          id: order.id,
          deliveryDriverId: null,
          status: { notIn: ["cancelado", "entregado"] },
        },
        data: {
          deliveryDriverId: driverId || null,
          deliveryDriverName: driverName,
          deliveryDriverPhone: driverPhone || null,
          assignedAt: now,
          ...(dispatchNow ? { dispatchedAt: now } : {}),
          status: targetStatus,
        },
      })

      if (claimed.count === 0) {
        const latest = await db.order.findUnique({
          where: { id: order.id },
          select: { deliveryDriverName: true },
        })
        return apiError(
          latest?.deliveryDriverName
            ? `Este pedido acaba de ser tomado por otro repartidor (${latest.deliveryDriverName})`
            : "El pedido ya no está disponible",
          409
        )
      }
    } else {
      await db.order.update({
        where: { id: order.id },
        data: {
          deliveryDriverId: driverId || null,
          deliveryDriverName: driverName,
          deliveryDriverPhone: driverPhone || null,
          assignedAt: order.assignedAt || now,
          ...(dispatchNow && !order.dispatchedAt ? { dispatchedAt: now } : {}),
          status: targetStatus,
        },
      })
    }

    const updated = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        items: true,
        tenant: { select: { id: true, name: true, ownerPhone: true } },
        branch: { select: { id: true, name: true, address: true, phone: true } },
      },
    })

    await logAudit({
      action: "api_order_assign_delivery",
      entityType: "order",
      entityId: order.id,
      userName: session?.name || driverName,
      role: session?.role || "domiciliario",
      detail: `Repartidor ${driverName} asignado al pedido ${order.orderNumber}`,
    })

    // Notificar al cliente que ya tiene repartidor asignado (Telegram o WhatsApp, sin IA)
    if (dispatchNow && order.status !== "en_camino") {
      notifyCustomerOrderStatus({
        orderId: updated.id,
        newStatus: "en_camino",
        oldStatus: order.status,
      }).catch(() => {})
    } else {
      notifyCustomerOrderStatus({
        orderId: updated.id,
        newStatus: "asignado",
        customMessage: `🛵 *¡Repartidor asignado!*\n\nHola ${updated.customerName || "Cliente"}, tu pedido *#${updated.orderNumber}* fue asignado al repartidor *${driverName}*. Pronto saldrá en camino.`,
      }).catch(() => {})
    }

    // Notificar al domiciliario asignado vía Telegram (si tiene cuenta vinculada)
    notifyDriverAssignedOrder(updated.id).catch((err) => {
      console.warn("[Assign Order]: Error notificando al domiciliario vía Telegram:", err)
    })

    return apiSuccess({
      order: updated,
      message: `Repartidor ${driverName} asignado correctamente al pedido`,
    })
  } catch (error) {
    console.error("Error en POST /api/v1/orders/[id]/assign:", error)
    return apiError("Error al asignar domiciliario al pedido", 500)
  }
}
