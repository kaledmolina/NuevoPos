import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const order = await db.order.findFirst({
      where: {
        OR: [
          { id },
          { orderNumber: id },
        ],
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            rubro: true,
            ownerEmail: true,
            ownerPhone: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
          },
        },
        items: true,
      },
    })

    if (!order) {
      return apiError("Pedido no encontrado", 404)
    }

    // Historial y línea de tiempo sugerida según estado
    const timeline = [
      { status: "pendiente", label: "Pedido Recibido", time: order.createdAt, done: true },
      {
        status: "confirmado",
        label: "Confirmado por el Comercio",
        done: ["confirmado", "en_preparacion", "en_camino", "entregado"].includes(order.status),
      },
      {
        status: "en_preparacion",
        label: "En Preparación / Empaque",
        done: ["en_preparacion", "en_camino", "entregado"].includes(order.status),
      },
      {
        status: "en_camino",
        label: "En Camino con Domiciliario",
        time: order.dispatchedAt,
        done: ["en_camino", "entregado"].includes(order.status),
      },
      {
        status: "entregado",
        label: "Entregado con Éxito",
        time: order.deliveredAt,
        done: order.status === "entregado",
      },
    ]

    return apiSuccess({
      order,
      timeline,
    })
  } catch (error) {
    console.error("Error en GET /api/v1/orders/[id]:", error)
    return apiError("Error al consultar detalle del pedido", 500)
  }
}
