import { db } from "@/lib/db"
import { hashPin } from "@/lib/auth"
import { notifyCustomerOrderStatus } from "@/lib/order-notifications"

export interface SendTelegramOptions {
  reply_markup?: any
  parse_mode?: string
}

/**
 * Enviar mensaje directo por la API de Telegram Bot
 */
export async function sendTelegramDirect(
  botToken: string,
  chatId: string | number,
  text: string,
  options?: SendTelegramOptions
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode || "Markdown",
        reply_markup: options?.reply_markup,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.warn("[Telegram Direct Dispatch Failed]:", errText)
      return false
    }
    return true
  } catch (err) {
    console.error("[Telegram Direct Dispatch Exception]:", err)
    return false
  }
}

/**
 * Enviar pin nativo de ubicación geográfica al mapa interactivo de Telegram
 */
export async function sendTelegramLocation(
  botToken: string,
  chatId: string | number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendLocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        latitude,
        longitude,
      }),
    })
    return res.ok
  } catch (err) {
    console.warn("[Telegram sendLocation Error]:", err)
    return false
  }
}

/**
 * Responder a un Callback Query de Telegram (cuando se presiona un botón inline)
 */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || "Acción registrada",
      }),
    })
  } catch (e) {
    console.warn("[answerCallbackQuery error]:", e)
  }
}

/**
 * Detectar y extraer coordenadas de texto o enlaces de Google Maps
 */
export function extractCoordinates(text: string): { latitude: number; longitude: number } | null {
  if (!text) return null
  const qMatch = text.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/i)
  if (qMatch) {
    const lat = parseFloat(qMatch[1])
    const lng = parseFloat(qMatch[2])
    if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng }
  }

  const atMatch = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) {
    const lat = parseFloat(atMatch[1])
    const lng = parseFloat(atMatch[2])
    if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng }
  }

  const plainMatch = text.match(/(-?\d{1,2}\.\d{4,10})\s*,\s*(-?\d{1,3}\.\d{4,10})/)
  if (plainMatch) {
    const lat = parseFloat(plainMatch[1])
    const lng = parseFloat(plainMatch[2])
    if (!isNaN(lat) && !isNaN(lng)) return { latitude: lat, longitude: lng }
  }

  return null
}

/**
 * Procesa la recepción de una ubicación GPS compartida por un cliente (por WhatsApp o Telegram).
 * Actualiza el pedido activo, guarda el registro en el CRM y se la transmite de inmediato al
 * domiciliario asignado vía Telegram con mapa interactivo y enlaces a Google Maps / Waze.
 */
export async function handleIncomingCustomerLocation(params: {
  phone: string
  customerName?: string
  latitude: number
  longitude: number
  addressName?: string
  branchId?: string | null
  channel: "whatsapp" | "telegram"
}): Promise<{ success: boolean; replyText: string; order?: any }> {
  try {
    const cleanPhone = params.phone.trim()
    const rawDigits = cleanPhone.replace(/\D/g, "")
    const national10 = rawDigits.startsWith("57") && rawDigits.length === 12 ? rawDigits.slice(2) : rawDigits

    const mapsUrl = `https://www.google.com/maps?q=${params.latitude},${params.longitude}`
    const wazeUrl = `https://waze.com/ul?ll=${params.latitude},${params.longitude}&navigate=yes`

    // 1. Buscar pedido activo del cliente (que aún esté en proceso logístico)
    let targetOrder = await db.order.findFirst({
      where: {
        OR: [
          { customerPhone: cleanPhone },
          { customerPhone: rawDigits },
          { customerPhone: `+${rawDigits}` },
          { customerPhone: national10 },
          { customerPhone: `+57${national10}` },
        ],
        status: { in: ["pendiente", "confirmado", "en_preparacion", "en_camino"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { id: true, name: true, phone: true } },
      },
    })

    // Fallback: si no hay en proceso activo, buscar la orden más reciente
    if (!targetOrder) {
      targetOrder = await db.order.findFirst({
        where: {
          OR: [
            { customerPhone: cleanPhone },
            { customerPhone: rawDigits },
            { customerPhone: `+${rawDigits}` },
            { customerPhone: national10 },
            { customerPhone: `+57${national10}` },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          branch: { select: { id: true, name: true, phone: true } },
        },
      })
    }

    // 2. Si encontramos pedido, actualizar con las coordenadas GPS
    if (targetOrder) {
      const existingNotes = targetOrder.deliveryNotes || ""
      const updatedNotes = existingNotes.includes("google.com/maps")
        ? existingNotes
        : existingNotes ? `${existingNotes}\n📍 Ubicación GPS: ${mapsUrl}` : `📍 Ubicación GPS: ${mapsUrl}`

      const updatedAddress =
        !targetOrder.deliveryAddress || targetOrder.deliveryAddress.trim() === ""
          ? (params.addressName || "Ubicación compartida por GPS")
          : targetOrder.deliveryAddress

      targetOrder = await db.order.update({
        where: { id: targetOrder.id },
        data: {
          deliveryLatitude: params.latitude,
          deliveryLongitude: params.longitude,
          deliveryNotes: updatedNotes,
          deliveryAddress: updatedAddress,
        },
        include: {
          branch: { select: { id: true, name: true, phone: true } },
        },
      })
    }

    // 3. Registrar el mensaje en el historial del chat para visualización en CRM
    await db.whatsAppMessage.create({
      data: {
        phone: cleanPhone,
        sender: "client",
        text: `📍 Ubicación GPS compartida: ${mapsUrl}`,
        status: "read",
        branchId: targetOrder?.branchId || params.branchId || null,
        clientId: targetOrder?.clientId || null,
        orderId: targetOrder?.id || null,
        channel: params.channel,
      },
    })

    // 4. Si el pedido YA tiene un domiciliario asignado con Telegram, notificarlo en tiempo real
    if (targetOrder?.deliveryDriverId) {
      const driver = await db.user.findUnique({
        where: { id: targetOrder.deliveryDriverId },
        select: { id: true, name: true, telegramChatId: true },
      })

      if (driver?.telegramChatId) {
        let config = targetOrder.branchId
          ? await db.whatsAppConfig.findUnique({ where: { branchId: targetOrder.branchId } })
          : null

        if (!config || !config.telegramBotToken) {
          config = await db.whatsAppConfig.findFirst({
            where: { telegramEnabled: true, telegramBotToken: { not: null } },
          })
        }

        const botToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
        if (botToken) {
          // A) Enviar el pin del mapa en Telegram
          await sendTelegramLocation(botToken, driver.telegramChatId, params.latitude, params.longitude)

          // B) Enviar mensaje con datos y botón de navegación directa
          const driverAlert =
            `📍 *¡NUEVA UBICACIÓN GPS DEL CLIENTE!*\n\n` +
            `📋 *Orden:* #${targetOrder.orderNumber}\n` +
            `👤 *Cliente:* ${targetOrder.customerName || "Cliente"} (${targetOrder.customerPhone})\n` +
            (params.addressName ? `🏠 *Referencia:* ${params.addressName}\n` : "") +
            `📍 *Dirección registrada:* ${targetOrder.deliveryAddress || "Ver en mapa"}\n\n` +
            `🗺️ *Navegación GPS directa:*\n` +
            `👉 [Abrir en Google Maps](${mapsUrl})\n` +
            `👉 [Abrir en Waze](${wazeUrl})`

          await sendTelegramDirect(botToken, driver.telegramChatId, driverAlert)
        }
      }
    }

    // 5. Construir la respuesta cordial para el cliente
    let replyText = ""
    if (targetOrder) {
      const driverPart = targetOrder.deliveryDriverName
        ? `Se la hemos transmitido en tiempo real por Telegram a tu domiciliario (*${targetOrder.deliveryDriverName}*) para que llegue directo a tu puerta sin perderse.`
        : `La dejamos vinculada a tu orden. Apenas asignemos a tu domiciliario, se le enviará automáticamente para que llegue con exactitud.`

      replyText = `¡Listo, ${params.customerName || targetOrder.customerName || "estimado cliente"}! 📍🗺️ Hemos recibido tu ubicación en el mapa y la asociamos a tu pedido *#${targetOrder.orderNumber}*.\n\n${driverPart} 🛵💨`
    } else {
      replyText = `¡Muchas gracias, ${params.customerName || "estimado cliente"}! 📍 Recibimos tu ubicación en el mapa. La dejamos guardada como referencia para tus pedidos a domicilio. 😊`
    }

    // 6. Guardar la respuesta del bot en WhatsAppMessage
    await db.whatsAppMessage.create({
      data: {
        phone: cleanPhone,
        sender: "bot",
        text: replyText,
        status: "sent",
        branchId: targetOrder?.branchId || params.branchId || null,
        clientId: targetOrder?.clientId || null,
        orderId: targetOrder?.id || null,
        channel: params.channel,
      },
    })

    return {
      success: true,
      replyText,
      order: targetOrder,
    }
  } catch (err) {
    console.error("[handleIncomingCustomerLocation Error]:", err)
    return {
      success: false,
      replyText: "📍 Recibimos tu ubicación. ¡Muchas gracias!",
    }
  }
}

/**
 * Notificar al Domiciliario por Telegram que se le ha asignado una nueva orden.
 * Incluye datos completos del pedido, coordenadas GPS si existen, y botón interactivo para confirmar recogida en tienda.
 */
export async function notifyDriverAssignedOrder(orderId: string): Promise<{ notified: boolean; reason?: string }> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        branch: { select: { id: true, name: true, phone: true, address: true } },
      },
    })

    if (!order || !order.deliveryDriverId) {
      return { notified: false, reason: "order_or_driver_not_found" }
    }

    // Buscar información del domiciliario
    const driver = await db.user.findUnique({
      where: { id: order.deliveryDriverId },
      select: { id: true, name: true, telegramChatId: true, telegramUsername: true },
    })

    if (!driver || !driver.telegramChatId) {
      return { notified: false, reason: "driver_has_no_telegram_chat_id" }
    }

    // Obtener token del bot de la sede o global
    let config = order.branchId
      ? await db.whatsAppConfig.findUnique({ where: { branchId: order.branchId } })
      : null

    if (!config || !config.telegramBotToken) {
      config = await db.whatsAppConfig.findFirst({
        where: { telegramEnabled: true, telegramBotToken: { not: null } },
      })
    }

    const botToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return { notified: false, reason: "bot_token_not_configured" }
    }

    const itemsSummary = order.items
      .map((it) => `• ${it.quantity}x ${it.productName}`)
      .join("\n")

    const totalFormatted = `$${Number(order.total || 0).toLocaleString("es-CO")}`
    const paymentLabel =
      order.paymentMethod === "efectivo"
        ? `💵 Efectivo contraentrega (*Cobrar ${totalFormatted}*)`
        : `💳 Transferencia / Prepagado (*Ya pagado / No cobrar*)`

    let gpsSection = ""
    if (order.deliveryLatitude && order.deliveryLongitude) {
      const mapsUrl = `https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`
      const wazeUrl = `https://waze.com/ul?ll=${order.deliveryLatitude},${order.deliveryLongitude}&navigate=yes`
      gpsSection = `\n🗺️ *Ubicación GPS Confirmada:*\n👉 [Abrir en Google Maps](${mapsUrl})\n👉 [Abrir en Waze](${wazeUrl})\n`
    }

    const branchName = order.branch?.name || "Sede Principal"
    const message =
      `🛵 *¡NUEVO PEDIDO ASIGNADO!*\n\n` +
      `📋 *Orden:* #${order.orderNumber}\n` +
      `🏬 *Sede:* ${branchName}\n` +
      `👤 *Cliente:* ${order.customerName || "Cliente"}\n` +
      `📞 *Teléfono:* ${order.customerPhone}\n` +
      `📍 *Dirección:* ${order.deliveryAddress || "A convenir"}\n` +
      (order.deliveryNotes ? `📝 *Notas:* ${order.deliveryNotes}\n` : "") +
      gpsSection +
      `\n🛍️ *Productos (${order.items.length}):*\n${itemsSummary}\n\n` +
      `💰 *Valor Total:* ${totalFormatted}\n` +
      `📌 *Estado de Pago:* ${paymentLabel}\n\n` +
      `⚠️ *Pasa por la tienda física a recoger el pedido antes de salir a la entrega.*`

    const inlineKeyboard = {
      inline_keyboard: [
        [
          {
            text: "📦 Ya recogí en Tienda (Salir en Camino)",
            callback_data: `pickup:${order.id}`,
          },
        ],
      ],
    }

    const sent = await sendTelegramDirect(botToken, driver.telegramChatId, message, {
      reply_markup: inlineKeyboard,
    })

    // Si tiene coordenadas GPS exactas, mandar también el pin nativo en el mapa de Telegram
    if (order.deliveryLatitude && order.deliveryLongitude) {
      await sendTelegramLocation(botToken, driver.telegramChatId, order.deliveryLatitude, order.deliveryLongitude)
    }

    return { notified: sent }
  } catch (e) {
    console.error("[notifyDriverAssignedOrder error]:", e)
    return { notified: false, reason: (e as Error).message }
  }
}

/**
 * Difunde un nuevo pedido disponible a todos los domiciliarios activos de la sede vía Telegram.
 * Cada repartidor recibe los datos de la entrega y el botón interactivo "🛵 Tomar este Pedido" (First-to-Claim).
 */
export async function broadcastNewOrderToDrivers(orderId: string): Promise<{ notifiedCount: number; message: string }> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        branch: { select: { id: true, name: true, phone: true, address: true, tenantId: true } },
      },
    })

    if (!order) {
      return { notifiedCount: 0, message: "Pedido no encontrado" }
    }

    if (order.deliveryDriverId) {
      return { notifiedCount: 0, message: "El pedido ya tiene un conductor asignado" }
    }

    if (order.status === "cancelado" || order.status === "entregado") {
      return { notifiedCount: 0, message: "El pedido está cancelado o ya entregado" }
    }

    // 1. Obtener la lista de usuarios con rol "domiciliario" que tengan telegramChatId vinculado
    const candidates = await db.user.findMany({
      where: {
        active: true,
        role: "domiciliario",
        telegramChatId: { not: null },
        ...(order.tenantId ? { tenantId: order.tenantId } : {}),
      },
    })

    // Filtrar por sede si el domiciliario tiene sedes específicas restringidas
    const driversToNotify = candidates.filter((u) => {
      if (u.isPrimary) return true
      if (!order.branchId) return true
      try {
        const allowed: string[] = JSON.parse(u.allowedBranchIds || "[]")
        return allowed.length === 0 || allowed.includes(order.branchId)
      } catch {
        return true
      }
    })

    if (driversToNotify.length === 0) {
      return { notifiedCount: 0, message: "No hay domiciliarios con Telegram vinculado para esta sede" }
    }

    // 2. Obtener el bot token de la sede
    let config = order.branchId
      ? await db.whatsAppConfig.findUnique({ where: { branchId: order.branchId } })
      : null

    if (!config || !config.telegramBotToken) {
      config = await db.whatsAppConfig.findFirst({
        where: { telegramEnabled: true, telegramBotToken: { not: null } },
      })
    }

    const botToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return { notifiedCount: 0, message: "No hay bot de Telegram configurado en la sede" }
    }

    const totalFormatted = `$${Number(order.total || 0).toLocaleString("es-CO")}`
    const feeFormatted = `$${Number(order.deliveryFee || 0).toLocaleString("es-CO")}`
    const paymentLabel = order.paymentMethod === "efectivo" ? `💵 Efectivo contraentrega (*Cobrar ${totalFormatted}*)` : `💳 Prepagado / Transferencia (*No cobrar*)`
    const branchName = order.branch?.name || "Tienda Principal"

    let gpsNotice = ""
    if (order.deliveryLatitude && order.deliveryLongitude) {
      gpsNotice = `📍 *Ubicación GPS:* Confirmada por el cliente 🗺️\n`
    }

    const broadcastMessage =
      `⚡ *¡NUEVO PEDIDO DISPONIBLE PARA REPARTO!*\n\n` +
      `📋 *Orden:* #${order.orderNumber}\n` +
      `🏬 *Sede de recogida:* ${branchName}\n` +
      `📍 *Destino:* ${order.deliveryAddress || "A convenir"}\n` +
      gpsNotice +
      `📦 *Productos:* ${order.items.length} artículo(s)\n` +
      `🛵 *Tarifa Domicilio:* ${feeFormatted}\n` +
      `💰 *Cobro al Cliente:* ${paymentLabel}\n\n` +
      `🚀 *El primer repartidor en presionar el botón se queda con el servicio:*`

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "🛵 ¡Tomar este Pedido!",
            callback_data: `claim:${order.id}`,
          },
        ],
      ],
    }

    let sentCount = 0
    await Promise.all(
      driversToNotify.map(async (d) => {
        if (!d.telegramChatId) return
        const ok = await sendTelegramDirect(botToken, d.telegramChatId, broadcastMessage, {
          reply_markup: keyboard,
        })
        if (ok) sentCount++
      })
    )

    return {
      notifiedCount: sentCount,
      message: `Difundido con éxito a ${sentCount} domiciliario(s) vía Telegram`,
    }
  } catch (error) {
    console.error("[broadcastNewOrderToDrivers Error]:", error)
    return { notifiedCount: 0, message: (error as Error).message }
  }
}

/**
 * Procesador principal de eventos de Telegram originados por Domiciliarios o para vinculación.
 * Devuelve handled: true si el mensaje era de un domiciliario o comando de gestión logística,
 * evitando que pase al bot de ventas de clientes.
 */
export async function handleDriverTelegramAction(params: {
  chatId: string | number
  text?: string
  callbackData?: string
  callbackQueryId?: string
  username?: string
  firstName?: string
  botToken: string
  branchId?: string | null
}): Promise<{ handled: boolean; reply?: string }> {
  const { chatId, text = "", callbackData, callbackQueryId, username, firstName, botToken, branchId } = params
  const strChatId = String(chatId)
  const cleanText = text.trim()

  // 1. Manejo de Callback Queries (Clics en botones interactivos)
  if (callbackData) {
    // Buscar si el usuario que pulsó es un domiciliario vinculado
    const driver = await db.user.findFirst({
      where: { telegramChatId: strChatId, active: true },
    })

    if (!driver) {
      if (callbackQueryId) {
        await answerCallbackQuery(botToken, callbackQueryId, "Usuario no vinculado como domiciliario. Usa /vincular.")
      }
      return { handled: true }
    }

    // A) CLAIM: Tomar pedido disponible (Primero en Aceptar / Concurrencia atómica estricta)
    if (callbackData.startsWith("claim:")) {
      const orderId = callbackData.replace("claim:", "").trim()

      // Intento de adjudicación atómica: solo tiene éxito si deliveryDriverId sigue siendo estrictamente NULL
      const claimResult = await db.order.updateMany({
        where: {
          id: orderId,
          deliveryDriverId: null,
          status: { notIn: ["cancelado", "entregado"] },
        },
        data: {
          deliveryDriverId: driver.id,
          deliveryDriverName: driver.name,
          deliveryDriverPhone: driver.phone || null,
          assignedAt: new Date(),
          status: "confirmado",
        },
      })

      if (claimResult.count === 1) {
        // ¡ÉL GANÓ LA CARRERA!
        if (callbackQueryId) {
          await answerCallbackQuery(botToken, callbackQueryId, "🎉 ¡Te quedaste con el servicio!")
        }

        const order = await db.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            branch: { select: { name: true, address: true, phone: true } },
          },
        })

        if (!order) return { handled: true }

        // Notificar al cliente que ya tiene repartidor asignado
        notifyCustomerOrderStatus({
          orderId: order.id,
          newStatus: "asignado",
          customMessage: `🛵 *¡Repartidor asignado!*\n\nHola ${order.customerName || "Cliente"}, tu pedido *#${order.orderNumber}* fue tomado por el repartidor *${driver.name}*. En breve iniciará el recorrido.`,
        }).catch(() => {})

        const totalFormatted = `$${Number(order.total || 0).toLocaleString("es-CO")}`
        const feeFormatted = `$${Number(order.deliveryFee || 0).toLocaleString("es-CO")}`
        const paymentLabel =
          order.paymentMethod === "efectivo"
            ? `💵 Cobrar en efectivo: *${totalFormatted}*`
            : `💳 Ya Pagado (No cobrar)`

        const branchName = order.branch?.name || "Tienda Principal"

        let gpsPart = ""
        if (order.deliveryLatitude && order.deliveryLongitude) {
          const mapsUrl = `https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`
          const wazeUrl = `https://waze.com/ul?ll=${order.deliveryLatitude},${order.deliveryLongitude}&navigate=yes`
          gpsPart = `\n🗺️ *Ubicación GPS:* [Abrir en Google Maps](${mapsUrl}) | [Abrir en Waze](${wazeUrl})\n`
        }

        const winMsg =
          `🎉 *¡PEDIDO ADJUDICADO A TI CON ÉXITO!*\n\n` +
          `📋 *Orden:* #${order.orderNumber}\n` +
          `🏬 *Sede de recogida:* ${branchName}\n` +
          `👤 *Cliente:* ${order.customerName} (${order.customerPhone})\n` +
          `📍 *Dirección de entrega:* ${order.deliveryAddress || "A convenir"}\n` +
          (order.deliveryNotes ? `📝 *Notas:* ${order.deliveryNotes}\n` : "") +
          gpsPart +
          `🛵 *Tu Tarifa Domicilio:* ${feeFormatted}\n` +
          `💰 *Cobro al Cliente:* ${paymentLabel}\n\n` +
          `⚠️ *Pasa por la sede física a recoger el pedido antes de salir a la entrega.*`

        const nextKeyboard = {
          inline_keyboard: [
            [
              {
                text: "📦 Ya recogí en Tienda (Salir en Camino)",
                callback_data: `pickup:${order.id}`,
              },
            ],
          ],
        }

        await sendTelegramDirect(botToken, strChatId, winMsg, {
          reply_markup: nextKeyboard,
        })

        if (order.deliveryLatitude && order.deliveryLongitude) {
          await sendTelegramLocation(botToken, strChatId, order.deliveryLatitude, order.deliveryLongitude)
        }

        return { handled: true }
      } else {
        // LLEGÓ TARDE (Otro repartidor fue más rápido o el pedido ya fue asignado/cancelado)
        const currentOrder = await db.order.findUnique({
          where: { id: orderId },
          select: { deliveryDriverName: true, orderNumber: true, status: true },
        })

        if (currentOrder?.deliveryDriverName) {
          if (currentOrder.deliveryDriverName === driver.name) {
            if (callbackQueryId) {
              await answerCallbackQuery(botToken, callbackQueryId, "Ya tienes este pedido asignado a ti.")
            }
          } else {
            if (callbackQueryId) {
              await answerCallbackQuery(botToken, callbackQueryId, `⚠️ Ya fue tomado por ${currentOrder.deliveryDriverName}`)
            }
            const lateMsg =
              `⚠️ *Lo sentimos:* El pedido #${currentOrder.orderNumber} acaba de ser tomado por *${currentOrder.deliveryDriverName}*.\n\n` +
              `¡Queda atento a las próximas alertas de despacho!`
            await sendTelegramDirect(botToken, strChatId, lateMsg)
          }
        } else {
          if (callbackQueryId) {
            await answerCallbackQuery(botToken, callbackQueryId, "El pedido ya no está disponible.")
          }
        }
        return { handled: true }
      }
    }

    if (callbackData.startsWith("pickup:")) {
      const orderId = callbackData.replace("pickup:", "").trim()
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: { branch: true },
      })

      if (!order) {
        if (callbackQueryId) await answerCallbackQuery(botToken, callbackQueryId, "Pedido no encontrado.")
        return { handled: true }
      }

      // Actualizar estado a "en_camino"
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "en_camino",
          dispatchedAt: new Date(),
        },
      })

      // Notificar automáticamente al cliente sin gastar tokens de IA
      notifyCustomerOrderStatus({
        orderId: order.id,
        newStatus: "en_camino",
      }).catch(() => {})

      if (callbackQueryId) {
        await answerCallbackQuery(botToken, callbackQueryId, "¡Pedido marcado EN CAMINO!")
      }

      // Enviar confirmación al domiciliario con el botón de Entrega
      const totalFormatted = `$${Number(order.total || 0).toLocaleString("es-CO")}`
      let deliveryMsg =
        `🛵 *¡Pedido #${order.orderNumber} en camino!*\n\n` +
        `📍 *Dirección de entrega:* ${order.deliveryAddress || "A convenir"}\n` +
        `👤 *Cliente:* ${order.customerName} (${order.customerPhone})\n` +
        `💰 *Valor a cobrar:* ${order.paymentMethod === "efectivo" ? totalFormatted : "$0 (Ya pagado)"}\n`

      if (order.deliveryLatitude && order.deliveryLongitude) {
        const mapsUrl = `https://www.google.com/maps?q=${order.deliveryLatitude},${order.deliveryLongitude}`
        const wazeUrl = `https://waze.com/ul?ll=${order.deliveryLatitude},${order.deliveryLongitude}&navigate=yes`
        deliveryMsg +=
          `\n🗺️ *Navegación GPS:*\n` +
          `👉 [Abrir en Google Maps](${mapsUrl})\n` +
          `👉 [Abrir en Waze](${wazeUrl})\n`
      }

      deliveryMsg += `\nCuando llegues donde el cliente y entregues el producto, presiona el botón abajo:`

      const deliverKeyboard = {
        inline_keyboard: [
          [
            {
              text: "✅ Marcar Entregado al Cliente",
              callback_data: `deliver:${order.id}`,
            },
          ],
        ],
      }

      await sendTelegramDirect(botToken, strChatId, deliveryMsg, {
        reply_markup: deliverKeyboard,
      })

      // Mandar pin de ubicación en Telegram para navegación inmediata
      if (order.deliveryLatitude && order.deliveryLongitude) {
        await sendTelegramLocation(botToken, strChatId, order.deliveryLatitude, order.deliveryLongitude)
      }

      return { handled: true }
    }

    if (callbackData.startsWith("deliver:")) {
      const orderId = callbackData.replace("deliver:", "").trim()
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: { branch: true },
      })

      if (!order) {
        if (callbackQueryId) await answerCallbackQuery(botToken, callbackQueryId, "Pedido no encontrado.")
        return { handled: true }
      }

      // Marcar orden como entregada
      // REGLA CLAVE DE NEGOCIO: Si el pago fue en efectivo, se mantiene 'por_cobrar'
      // hasta que el domiciliario entregue físicamente todo el dinero en la caja de la sede.
      const isCash = order.paymentMethod === "efectivo"
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "entregado",
          deliveredAt: new Date(),
          paymentStatus: order.paymentStatus === "pagado" ? "pagado" : "por_cobrar",
        },
      })

      // Notificar automáticamente al cliente de la entrega
      notifyCustomerOrderStatus({
        orderId: order.id,
        newStatus: "entregado",
      }).catch(() => {})

      if (callbackQueryId) {
        await answerCallbackQuery(botToken, callbackQueryId, "¡Pedido marcado ENTREGADO!")
      }

      const totalFormatted = `$${Number(order.total || 0).toLocaleString("es-CO")}`
      let completionMsg =
        `🎉 *¡Pedido #${order.orderNumber} entregado con éxito!*\n\n` +
        `Cliente: ${order.customerName}\n`

      if (isCash) {
        completionMsg +=
          `\n💵 *Efectivo cobrado:* ${totalFormatted}\n` +
          `⚠️ *IMPORTANTE:* Este dinero queda bajo tu custodia. Al finalizar tu recorrido, debes entregar el efectivo total en la caja física de la tienda para que el cajero liquide y cierre los pedidos.`
      } else {
        completionMsg += `\n💳 *Pago:* Verificado previamente por transferencia.`
      }

      completionMsg += `\n\nEscribe /pedidos para consultar tus próximas entregas.`

      await sendTelegramDirect(botToken, strChatId, completionMsg)
      return { handled: true }
    }

    return { handled: true }
  }

  // 2. Verificar si el usuario que escribe ya está vinculado como domiciliario
  let linkedDriver = await db.user.findFirst({
    where: { telegramChatId: strChatId, active: true },
  })

  // 3. Si no está vinculado por chatId, verificar si podemos auto-vincularlo por su username de Telegram
  if (!linkedDriver && username) {
    const formattedUsername = `@${username.replace(/^@/, "").toLowerCase()}`
    const candidate = await db.user.findFirst({
      where: {
        active: true,
        telegramUsername: { equals: formattedUsername },
      },
    })

    if (candidate) {
      linkedDriver = await db.user.update({
        where: { id: candidate.id },
        data: { telegramChatId: strChatId },
      })
    }
  }

  // 4. Intento manual de vinculación: /vincular <PIN o TELEFONO> o /start <PIN>
  const vincularMatch = cleanText.match(/^\/(?:vincular|start)\s+([a-zA-Z0-9]+)$/i)
  if (vincularMatch) {
    const token = vincularMatch[1].trim()
    const hashed = hashPin(token)

    // Buscar si coincide con el PIN o el teléfono de algún colaborador
    const matchedUser = await db.user.findFirst({
      where: {
        active: true,
        OR: [
          { pinHash: hashed },
          { phone: token },
          { phone: `+${token}` },
        ],
      },
    })

    if (matchedUser) {
      linkedDriver = await db.user.update({
        where: { id: matchedUser.id },
        data: {
          telegramChatId: strChatId,
          telegramUsername: username ? `@${username.replace(/^@/, "")}` : matchedUser.telegramUsername,
        },
      })

      const welcomeMsg =
        `🎉 *¡Vinculación Exitosa!*\n\n` +
        `Hola *${linkedDriver.name}*, tu cuenta de repartidor ha sido conectada con el sistema OmniPOS.\n\n` +
        `A partir de este momento, cada vez que se te asigne un pedido recibirás aquí todos los datos con botones para:\n` +
        `• Confirmar cuando lo recojas en la tienda\n` +
        `• Marcar cuando lo entregues al cliente\n\n` +
        `Comandos útiles:\n` +
        `🛵 /pedidos - Ver tus pedidos asignados\n` +
        `📊 /estado - Ver tu balance y efectivo recaudado\n` +
        `ℹ️ /ayuda - Ver instrucciones`

      await sendTelegramDirect(botToken, strChatId, welcomeMsg)
      return { handled: true }
    } else {
      const errMsg =
        `❌ *No se encontró ningún repartidor con esos datos.*\n\n` +
        `Verifica que el PIN o número de teléfono coincida con el registrado en el POS por tu administrador.\n\n` +
        `Formato: \`/vincular 1234\``
      await sendTelegramDirect(botToken, strChatId, errMsg)
      return { handled: true }
    }
  }

  // 5. Si el usuario escribió un comando de repartidor pero no está vinculado
  if (!linkedDriver) {
    if (cleanText.toLowerCase() === "/vincular" || cleanText.toLowerCase() === "/domiciliario" || cleanText.toLowerCase() === "/repartidor") {
      const infoMsg =
        `🛵 *Vinculación de Domiciliarios OmniPOS*\n\n` +
        `Para recibir tus pedidos asignados por Telegram, debes vincular tu cuenta escribiendo:\n\n` +
        `👉 \`/vincular TU_PIN\` (Ej. \`/vincular 1234\`)\n` +
        `o también:\n` +
        `👉 \`/vincular TU_CELULAR\`\n\n` +
        `Solicita tu PIN de acceso al administrador o cajero de tu sede.`
      await sendTelegramDirect(botToken, strChatId, infoMsg)
      return { handled: true }
    }

    // No es repartidor ni comando de vinculación -> dejar que el bot de atención al cliente lo atienda
    return { handled: false }
  }

  // 6. Si ES un domiciliario vinculado, procesar sus comandos operativos
  const cmd = cleanText.toLowerCase()

  if (cmd === "/pedidos" || cmd === "pedidos" || cmd === "/mispedidos") {
    const activeOrders = await db.order.findMany({
      where: {
        deliveryDriverId: linkedDriver.id,
        status: { in: ["confirmado", "en_preparacion", "en_camino"] },
      },
      include: {
        items: true,
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    if (activeOrders.length === 0) {
      await sendTelegramDirect(
        botToken,
        strChatId,
        `🛵 *Hola ${linkedDriver.name}*\n\nNo tienes pedidos pendientes ni en camino en este momento. Te notificaremos automáticamente apenas se te asigne un nuevo despacho.`
      )
      return { handled: true }
    }

    let summaryText = `📦 *TUS PEDIDOS ACTIVOS (${activeOrders.length})*\n\n`

    for (const ord of activeOrders) {
      const isEnCamino = ord.status === "en_camino"
      const statusIcon = isEnCamino ? "🛵 EN CAMINO" : "🏬 EN TIENDA (Pendiente recoger)"
      const totalFormatted = `$${Number(ord.total || 0).toLocaleString("es-CO")}`
      const paymentInfo = ord.paymentMethod === "efectivo" ? `💵 Cobrar: ${totalFormatted}` : `💳 Ya Pagado`

      let gpsPart = ""
      if (ord.deliveryLatitude && ord.deliveryLongitude) {
        const mapsUrl = `https://www.google.com/maps?q=${ord.deliveryLatitude},${ord.deliveryLongitude}`
        gpsPart = `\n🗺️ [Ver en Google Maps](${mapsUrl})`
      }

      summaryText +=
        `🔹 *#${ord.orderNumber}* — ${statusIcon}\n` +
        `📍 ${ord.deliveryAddress || "Sin dirección"}${gpsPart}\n` +
        `👤 ${ord.customerName} (${ord.customerPhone})\n` +
        `💰 ${paymentInfo}\n`

      // Botón para la acción correspondiente
      const buttonText = isEnCamino ? "✅ Marcar Entregado" : "📦 Recoger en Tienda"
      const callbackAction = isEnCamino ? `deliver:${ord.id}` : `pickup:${ord.id}`

      await sendTelegramDirect(botToken, strChatId, summaryText, {
        reply_markup: {
          inline_keyboard: [[{ text: buttonText, callback_data: callbackAction }]],
        },
      })
      summaryText = "" // reset para enviar cada pedido con su botón individual
    }

    return { handled: true }
  }

  if (cmd === "/estado" || cmd === "estado" || cmd === "/balance") {
    // Pedidos en curso
    const enCaminoCount = await db.order.count({
      where: {
        deliveryDriverId: linkedDriver.id,
        status: "en_camino",
      },
    })

    // Pedidos entregados pendientes de liquidación en caja física
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const deliveredOrders = await db.order.findMany({
      where: {
        deliveryDriverId: linkedDriver.id,
        status: "entregado",
        deliveredAt: { gte: today },
      },
      select: {
        total: true,
        paymentStatus: true,
        paymentMethod: true,
      },
    })

    // Calcular efectivo cobrado que aún NO ha sido liquidado en caja
    let cashToReconcile = 0
    let totalCashCollectedToday = 0

    for (const ord of deliveredOrders) {
      if (ord.paymentMethod === "efectivo") {
        totalCashCollectedToday += Number(ord.total || 0)
        if (ord.paymentStatus !== "pagado") {
          cashToReconcile += Number(ord.total || 0)
        }
      }
    }

    const reconcileFormatted = `$${cashToReconcile.toLocaleString("es-CO")}`
    const totalCollectedFormatted = `$${totalCashCollectedToday.toLocaleString("es-CO")}`

    const balanceMsg =
      `📊 *RESUMEN DE TURNO - ${linkedDriver.name}*\n\n` +
      `🛵 *Entregas en camino:* ${enCaminoCount}\n` +
      `✅ *Entregas completadas hoy:* ${deliveredOrders.length}\n\n` +
      `💰 *EFECTIVO EN CUSTODIA (Por entregar en caja):*\n` +
      `👉 *${reconcileFormatted}*\n` +
      `(Total efectivo recaudado hoy: ${totalCollectedFormatted})\n\n` +
      `⚠️ *Nota:* Este saldo debe ser entregado en efectivo al cajero de la sede al cerrar tu turno para que los pedidos queden liquidados.`

    await sendTelegramDirect(botToken, strChatId, balanceMsg)
    return { handled: true }
  }

  if (cmd === "/desvincular") {
    await db.user.update({
      where: { id: linkedDriver.id },
      data: { telegramChatId: null },
    })

    await sendTelegramDirect(
      botToken,
      strChatId,
      `👋 *Cuenta desvinculada.*\n\nTu Telegram ha sido desconectado del perfil de ${linkedDriver.name}. Si deseas reconectar más tarde, usa /vincular.`
    )
    return { handled: true }
  }

  if (cmd === "/ayuda" || cmd === "ayuda" || cmd === "/start") {
    const helpMsg =
      `🛵 *Menú de Domiciliario - OmniPOS*\n\n` +
      `Hola *${linkedDriver.name}*, estos son tus comandos disponibles:\n\n` +
      `• /pedidos - Ver lista de pedidos asignados y botones de acción\n` +
      `• /estado - Ver pedidos completados y total de efectivo en mano para liquidar en caja\n` +
      `• /desvincular - Desconectar tu Telegram de este perfil\n` +
      `• /ayuda - Mostrar esta ayuda\n\n` +
      `💡 *Flujo de entrega:*\n` +
      `1. Recibes la notificación del pedido asignado (con GPS si el cliente lo envió).\n` +
      `2. Pasas por la sede física y presionas *"📦 Ya recogí en Tienda"*.\n` +
      `3. Entregas al cliente y presionas *"✅ Marcar Entregado"*.\n` +
      `4. Al finalizar tus entregas, entregas todo el efectivo al cajero de la sede.`

    await sendTelegramDirect(botToken, strChatId, helpMsg)
    return { handled: true }
  }

  // Cualquier otro texto de un domiciliario vinculado
  const defaultMsg =
    `🛵 *Panel de Domiciliario*\n\n` +
    `Hola ${linkedDriver.name}. Para gestionar tus entregas usa:\n` +
    `👉 /pedidos — Ver pedidos activos\n` +
    `👉 /estado — Ver saldo de efectivo a entregar en caja`

  await sendTelegramDirect(botToken, strChatId, defaultMsg)
  return { handled: true }
}
