import { db } from "@/lib/db"

interface NotifyOrderStatusOptions {
  orderId: string
  newStatus: string
  oldStatus?: string
  cancelReason?: string
  customMessage?: string
}

/**
 * Envía una notificación transaccional automática y gratuita (sin gastar tokens de IA)
 * al cliente a través de su canal de mensajería (Telegram o WhatsApp)
 * cuando el pedido cambia de estado en el POS.
 */
export async function notifyCustomerOrderStatus(options: NotifyOrderStatusOptions): Promise<{
  notified: boolean
  channel?: "telegram" | "whatsapp"
  error?: string
}> {
  const { orderId, newStatus, oldStatus, cancelReason, customMessage } = options

  // Si el estado no cambió realmente, no enviar notificación duplicada
  if (oldStatus && oldStatus === newStatus) {
    return { notified: false }
  }

  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        branch: { select: { id: true, name: true, phone: true } },
      },
    })

    if (!order || !order.customerPhone) {
      return { notified: false }
    }

    const cleanPhone = order.customerPhone.trim()
    const isTelegram = cleanPhone.startsWith("tg_")
    const channel = isTelegram ? "telegram" : "whatsapp"
    const customerName = order.customerName ? order.customerName.trim() : "Cliente"
    const orderNumber = order.orderNumber
    const totalFormatted = `$${Number(order.total || 0).toLocaleString("es-CO")}`
    const branchName = order.branch?.name || "nuestra tienda"
    const driverName = order.deliveryDriverName ? ` ${order.deliveryDriverName}` : ""

    let messageText = customMessage || ""

    if (!messageText) {
      switch (newStatus) {
        case "en_preparacion":
          messageText = `📦 *¡Tu pedido está en preparación!*\n\nHola ${customerName}, estamos alistando tu pedido *#${orderNumber}* en ${branchName}. Te avisaremos apenas el domiciliario salga en camino con tu entrega. 🛵`
          break

        case "en_camino":
          const addressPart = order.deliveryAddress ? `\n📍 *Entrega:* ${order.deliveryAddress}` : ""
          const feeBreakdown =
            order.deliveryFee && order.deliveryFee > 0
              ? `\n🧾 *Productos:* $${Number(order.subtotal || order.total - order.deliveryFee).toLocaleString("es-CO")}\n🛵 *Costo Domicilio:* $${Number(order.deliveryFee).toLocaleString("es-CO")}`
              : ""
          const paymentPart =
            order.paymentStatus !== "pagado" && order.paymentMethod === "efectivo"
              ? `\n💵 *A cobrar contraentrega:* ${totalFormatted}`
              : order.paymentStatus === "pagado"
              ? `\n✅ *Pago:* Ya verificado y liquidado.`
              : ""

          messageText = `🛵 *¡Tu pedido ya va en camino!*\n\nHola ${customerName}, tu pedido *#${orderNumber}* ya salió con el repartidor${driverName}.${addressPart}${feeBreakdown}${paymentPart}\n\n¡Pronto estará en tu puerta!`
          break

        case "entregado":
          messageText = `✅ *¡Pedido Entregado con Éxito!*\n\nHola ${customerName}, tu pedido *#${orderNumber}* por ${totalFormatted} ha sido marcado como entregado.\n\n¡Muchas gracias por tu compra en ${branchName}! Esperamos que disfrutes tus productos. ⭐`
          break

        case "cancelado":
          const reasonPart = cancelReason ? `\nMotivo: ${cancelReason}` : ""
          messageText = `❌ *Notificación de Pedido Cancelado*\n\nHola ${customerName}, te informamos que tu pedido *#${orderNumber}* ha sido cancelado.${reasonPart}\n\nSi necesitas realizar un nuevo pedido o tienes alguna duda, escríbenos por aquí con gusto.`
          break

        case "confirmado":
          messageText = `👍 *Pedido Confirmado*\n\nHola ${customerName}, tu pedido *#${orderNumber}* (${totalFormatted}) ha sido confirmado y pasó a fila de despacho en ${branchName}.`
          break

        default:
          // Otros estados secundarios no envían mensaje automático
          return { notified: false }
      }
    }

    // 1. Guardar mensaje en el historial del chat en OmniPOS para que el operador y el cliente lo vean
    await db.whatsAppMessage.create({
      data: {
        phone: cleanPhone,
        sender: "bot",
        text: messageText,
        status: "sent",
        branchId: order.branchId || null,
        clientId: order.clientId || null,
        channel,
      },
    })

    // 2. Obtener credenciales de la sede para el despacho externo
    const config = order.branchId
      ? await db.whatsAppConfig.findUnique({ where: { branchId: order.branchId } })
      : null

    // 3. Despachar mensaje por Telegram Bot API o Meta WhatsApp API
    if (isTelegram) {
      const tgToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
      if (tgToken) {
        const chatId = cleanPhone.replace("tg_", "")
        const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: messageText,
          }),
        }).catch((err) => {
          console.error("[Telegram Auto-Notification Error]:", err)
          return null
        })

        if (!tgRes || !tgRes.ok) {
          const errBody = tgRes ? await tgRes.text().catch(() => "") : ""
          console.warn("[Telegram Dispatch Warning]:", errBody)
        }
      }
    } else {
      const token = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
      const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
      if (token && phoneId) {
        const targetNumber = cleanPhone.replace("+", "")
        await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: targetNumber,
            type: "text",
            text: { body: messageText },
          }),
        }).catch((err) => console.error("[WhatsApp Auto-Notification Error]:", err))
      }
    }

    return { notified: true, channel }
  } catch (error) {
    console.error("[Order Notification Exception]:", error)
    return { notified: false, error: (error as Error).message }
  }
}
