import { NextRequest } from "next/server"
import { getSession } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"
import { broadcastNewOrderToDrivers } from "@/lib/telegram-driver"

export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(req)
    if (!session || !["admin", "superadmin", "vendedor"].includes(session.role)) {
      return apiError("No tienes permisos para difundir pedidos", 403)
    }

    const { id } = await params
    const result = await broadcastNewOrderToDrivers(id)

    return apiSuccess({
      notifiedCount: result.notifiedCount,
      message: result.message,
    })
  } catch (err) {
    console.error("[Order Broadcast API Error]:", err)
    return apiError("Error al difundir pedido a los domiciliarios", 500)
  }
}
