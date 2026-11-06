import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export interface ConversationItem {
  phone: string
  channel: "whatsapp" | "telegram"
  client: {
    id: string
    name: string
    document: string | null
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    creditBalance: number
    creditLimit: number
    totalPurchases: number
  } | null
  lastMessage: {
    text: string
    sender: "customer" | "bot" | "agent"
    createdAt: string
    status: string
  } | null
  unreadCount: number
  latestOrder: {
    id: string
    orderNumber: string
    status: string
    total: number
    deliveryAddress: string | null
    createdAt: string
    itemsCount: number
    paymentMethod: string
    paymentStatus: string
    deliveryDriverName: string | null
    deliveryDriverPhone: string | null
    deliveryNotes: string | null
    notes: string | null
    items?: {
      id: string
      name: string
      quantity: number
      unitPrice: number
      subtotal: number
    }[]
  } | null
  totalOrders: number
}

/**
 * GET: Obtiene todas las conversaciones del CRM de WhatsApp con su último mensaje,
 * conteo de no leídos, datos del cliente y estado de su último pedido.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const paramBranchId = searchParams.get("branchId")
    const branchAccess = await requireBranchAccess(req)
    const branchId = paramBranchId || (branchAccess instanceof NextResponse ? null : branchAccess.branchId)
    const branchFilter = branchId ? { branchId } : {}

    // Obtener todos los mensajes de WhatsApp ordenados por fecha descendente
    const allMessages = await db.whatsAppMessage.findMany({
      where: { ...branchFilter },
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          include: {
            creditAccount: true,
            _count: { select: { sales: true } },
          },
        },
        order: {
          include: {
            _count: { select: { items: true } },
          },
        },
      },
      take: 1000,
    })

    // Agrupar por número de teléfono
    const convMap = new Map<string, {
      messages: typeof allMessages
      client: (typeof allMessages)[0]["client"]
    }>()

    for (const msg of allMessages) {
      if (!convMap.has(msg.phone)) {
        convMap.set(msg.phone, { messages: [], client: msg.client })
      }
      convMap.get(msg.phone)!.messages.push(msg)
      if (!convMap.get(msg.phone)!.client && msg.client) {
        convMap.get(msg.phone)!.client = msg.client
      }
    }

    // También buscar clientes que tengan teléfono pero quizás aún no tengan mensajes
    const clientsWithPhone = await db.client.findMany({
      where: {
        phone: { not: null },
        ...branchFilter,
      },
      include: {
        creditAccount: true,
        _count: { select: { sales: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { _count: { select: { items: true } } },
        },
      },
      take: 100,
    })

    for (const c of clientsWithPhone) {
      if (c.phone && !convMap.has(c.phone)) {
        convMap.set(c.phone, {
          messages: [],
          client: c as any,
        })
      }
    }

    const conversations: ConversationItem[] = []

    for (const [phone, data] of convMap.entries()) {
      const msgs = data.messages
      const lastMsg = msgs[0] || null
      const unreadCount = msgs.filter((m) => m.sender === "customer" && m.status === "unread").length

      // Buscar pedidos asociados al teléfono o cliente
      const orders = await db.order.findMany({
        where: {
          OR: [
            { customerPhone: phone },
            ...(data.client ? [{ clientId: data.client.id }] : []),
          ],
          ...branchFilter,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          _count: { select: { items: true } },
          items: true,
        },
      })

      const totalOrdersCount = await db.order.count({
        where: {
          OR: [
            { customerPhone: phone },
            ...(data.client ? [{ clientId: data.client.id }] : []),
          ],
          ...branchFilter,
        },
      })

      const latestOrder = orders[0]
        ? {
            id: orders[0].id,
            orderNumber: orders[0].orderNumber,
            status: orders[0].status,
            total: orders[0].total,
            deliveryAddress: orders[0].deliveryAddress,
            createdAt: orders[0].createdAt.toISOString(),
            itemsCount: orders[0]._count.items,
            paymentMethod: orders[0].paymentMethod || "efectivo",
            paymentStatus: orders[0].paymentStatus || "pendiente",
            deliveryDriverName: orders[0].deliveryDriverName,
            deliveryDriverPhone: orders[0].deliveryDriverPhone,
            deliveryNotes: orders[0].deliveryNotes,
            notes: orders[0].notes,
            items: orders[0].items.map((it) => ({
              id: it.id,
              name: it.productName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              subtotal: it.subtotal,
            })),
          }
        : null

      const isTelegram = phone.startsWith("tg_") || (lastMsg as any)?.channel === "telegram"

      conversations.push({
        phone,
        channel: isTelegram ? "telegram" : "whatsapp",
        client: data.client
          ? {
              id: data.client.id,
              name: data.client.name,
              document: data.client.document,
              phone: data.client.phone,
              email: data.client.email,
              address: data.client.address,
              notes: data.client.notes,
              creditBalance: data.client.creditAccount?.balance || 0,
              creditLimit: data.client.creditAccount?.creditLimit || 0,
              totalPurchases: data.client._count?.sales || 0,
            }
          : null,
        lastMessage: lastMsg
          ? {
              text: lastMsg.text,
              sender: lastMsg.sender as "customer" | "bot" | "agent",
              createdAt: lastMsg.createdAt.toISOString(),
              status: lastMsg.status,
            }
          : null,
        unreadCount,
        latestOrder,
        totalOrders: totalOrdersCount,
      })
    }

    // Ordenar: primero los que tienen mensajes no leídos, luego los más recientes
    conversations.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1
      if (b.unreadCount > 0 && a.unreadCount === 0) return 1
      const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0
      const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0
      return timeB - timeA
    })

    return NextResponse.json({
      ok: true,
      total: conversations.length,
      unreadTotal: conversations.reduce((acc, c) => acc + c.unreadCount, 0),
      conversations,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Error al cargar conversaciones: " + (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * POST: Enviar un mensaje manual desde el agente humano en el CRM hacia el cliente
 */
export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId

    const body = await req.json()
    const { phone, text } = body

    if (!phone || !text || !text.trim()) {
      return NextResponse.json({ error: "Teléfono y texto son requeridos" }, { status: 400 })
    }

    const isTelegram = String(phone).startsWith("tg_")
    const cleanPhone = isTelegram ? String(phone) : String(phone).replace(/[^0-9+]/g, "")

    // Buscar cliente asociado
    const client = await db.client.findFirst({
      where: {
        OR: [
          { phone: cleanPhone },
          ...(isTelegram ? [] : [{ phone: cleanPhone.replace("+", "") }]),
        ],
        ...(branchId ? { branchId } : {}),
      },
    })

    // Guardar en la base de datos como mensaje de "agent"
    const saved = await db.whatsAppMessage.create({
      data: {
        phone: cleanPhone,
        sender: "agent",
        text: text.trim(),
        status: "sent",
        branchId: branchId || null,
        clientId: client?.id || null,
        channel: isTelegram ? "telegram" : "whatsapp",
      },
    })

    // Despachar por Telegram Bot API o Meta Cloud API (credenciales de la sede o globales)
    const config = branchId
      ? await db.whatsAppConfig.findUnique({ where: { branchId } })
      : null

    if (isTelegram) {
      const tgToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
      if (tgToken) {
        const chatId = cleanPhone.replace("tg_", "")
        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.trim(),
          }),
        }).catch((e) => console.error("[Telegram Dispatch Error]:", e))
      }
    } else {
      const token = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
      const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
      if (token && phoneId) {
        await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: cleanPhone,
            type: "text",
            text: { body: text.trim() },
          }),
        }).catch((e) => console.error("[Meta Dispatch Error]:", e))
      }
    }

    return NextResponse.json({
      ok: true,
      message: saved,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Limpiar historial de mensajes de un chat o eliminar contacto completo del CRM
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get("phone")
    const action = searchParams.get("action") || "clear_chat" // "clear_chat" | "delete_contact"

    if (!phone) {
      return NextResponse.json({ error: "El teléfono es requerido" }, { status: 400 })
    }

    const isTelegram = String(phone).startsWith("tg_")
    const cleanPhone = isTelegram ? String(phone) : String(phone).replace(/[^0-9+]/g, "")
    const altPhone = isTelegram ? cleanPhone : cleanPhone.replace("+", "")

    // 1. Eliminar todos los mensajes asociados a este teléfono
    const deletedMsgs = await db.whatsAppMessage.deleteMany({
      where: {
        OR: [{ phone: cleanPhone }, { phone: altPhone }],
      },
    })

    // 2. Si se solicitó eliminar el contacto completamente
    if (action === "delete_contact") {
      const client = await db.client.findFirst({
        where: {
          OR: [{ phone: cleanPhone }, { phone: altPhone }],
        },
      })

      if (client) {
        // Desvincular o eliminar cuenta fiado
        await db.creditAccount.deleteMany({ where: { clientId: client.id } }).catch(() => {})
        // Desvincular órdenes
        await db.order.updateMany({ where: { clientId: client.id }, data: { clientId: null } }).catch(() => {})
        // Eliminar cliente
        await db.client.delete({ where: { id: client.id } }).catch(() => {})
      }
    }

    return NextResponse.json({
      ok: true,
      deletedMessagesCount: deletedMsgs.count,
      actionTaken: action,
      message:
        action === "delete_contact"
          ? "Contacto y conversaciones eliminados con éxito"
          : "Historial de chat limpiado con éxito",
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Error al procesar eliminación: " + (error as Error).message },
      { status: 500 }
    )
  }
}
