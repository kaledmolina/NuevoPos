import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const branchFilter = branchId ? { branchId } : {}

    const { searchParams } = new URL(req.url)
    const phone = searchParams.get("phone")

    if (!phone) {
      return NextResponse.json({ error: "Parámetro 'phone' es requerido" }, { status: 400 })
    }

    const cleanPhone = phone.replace(/[^0-9+]/g, "")

    // Marcar mensajes no leídos como leídos
    await db.whatsAppMessage.updateMany({
      where: {
        phone: cleanPhone,
        sender: "customer",
        status: "unread",
        ...branchFilter,
      },
      data: { status: "read" },
    })

    // Cargar historial de mensajes ordenado cronológicamente
    const messages = await db.whatsAppMessage.findMany({
      where: {
        OR: [
          { phone: cleanPhone },
          { phone: cleanPhone.replace("+", "") },
        ],
        ...branchFilter,
      },
      orderBy: { createdAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            deliveryAddress: true,
          },
        },
      },
      take: 200,
    })

    return NextResponse.json({
      ok: true,
      phone: cleanPhone,
      count: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        order: m.order,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
