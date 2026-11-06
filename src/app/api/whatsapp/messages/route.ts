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

    const isTelegram = phone.startsWith("tg_")
    const cleanPhone = isTelegram ? phone : phone.replace(/[^0-9+]/g, "")
    const phoneFilter = [
      { phone: cleanPhone },
      ...(isTelegram ? [] : [{ phone: cleanPhone.replace("+", "") }]),
    ]

    // Marcar mensajes no leídos como leídos solo si existen para evitar escrituras y bloqueos en SQLite
    const unreadCount = await db.whatsAppMessage.count({
      where: {
        OR: phoneFilter,
        sender: "customer",
        status: "unread",
        ...branchFilter,
      },
    })

    if (unreadCount > 0) {
      await db.whatsAppMessage.updateMany({
        where: {
          OR: phoneFilter,
          sender: "customer",
          status: "unread",
          ...branchFilter,
        },
        data: { status: "read" },
      })
    }

    // Cargar historial de mensajes ordenado cronológicamente
    const messages = await db.whatsAppMessage.findMany({
      where: {
        OR: phoneFilter,
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
