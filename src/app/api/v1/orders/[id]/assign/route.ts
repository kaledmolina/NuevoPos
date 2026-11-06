import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

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

    let driverId = (body.driverId || "").toString().trim()
    let driverName = (body.driverName || "").toString().trim()
    let driverPhone = (body.driverPhone || "").toString().trim()

    // Si el usuario autenticado es un domiciliario, auto-asignarse
    if (session && session.role === "domiciliario") {
      driverId = session.uid
      driverName = session.name
      // buscar teléfono del domiciliario si existe
      const driverUser = await db.user.findUnique({ where: { id: session.uid } })
      driverPhone = driverPhone || driverUser?.email || ""
    }

    if (!driverName) {
      return apiError("Debes especificar el nombre o ID del repartidor ('driverName')", 400)
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        deliveryDriverId: driverId || null,
        deliveryDriverName: driverName,
        deliveryDriverPhone: driverPhone || null,
        assignedAt: new Date(),
        status: order.status === "pendiente" ? "confirmado" : order.status,
      },
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

    return apiSuccess({
      order: updated,
      message: `Repartidor ${driverName} asignado correctamente al pedido`,
    })
  } catch (error) {
    console.error("Error en POST /api/v1/orders/[id]/assign:", error)
    return apiError("Error al asignar domiciliario al pedido", 500)
  }
}
