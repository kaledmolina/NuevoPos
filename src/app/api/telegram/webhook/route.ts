import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { handleDriverTelegramAction } from "@/lib/telegram-driver"

export const dynamic = "force-dynamic"

/**
 * GET: Verificación de estado del Webhook de Telegram
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "OmniPOS Telegram Delivery Driver Bot",
    role: "exclusive_drivers",
    timestamp: new Date().toISOString(),
  })
}

/**
 * POST: Recepción de eventos entrantes desde Telegram
 * Canal EXCLUSIVO para Domiciliarios y Repartidores de la tienda.
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let branchId = searchParams.get("branchId")

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ ok: true, ignored: "no_body" })
    }

    // 1. Identificar si es un Callback Query (clic en botón interactivo) o un Mensaje tradicional
    const callbackQuery = body.callback_query
    const message = body.message || body.edited_message || callbackQuery?.message

    if (!message && !callbackQuery) {
      return NextResponse.json({ ok: true, ignored: "no_message_or_callback" })
    }

    const chatId = callbackQuery ? callbackQuery.message?.chat?.id || callbackQuery.from?.id : message?.chat?.id
    const rawText = callbackQuery ? "" : message?.text || message?.caption || ""
    const text = rawText.trim()
    const callbackData = callbackQuery?.data
    const callbackQueryId = callbackQuery?.id

    const senderUser = callbackQuery ? callbackQuery.from : message?.from
    const firstName = senderUser?.first_name || ""
    const rawUsername = senderUser?.username || ""

    if (!chatId || (!text && !callbackData)) {
      return NextResponse.json({ ok: true, ignored: "empty_or_unsupported_media" })
    }

    // 2. Identificar sede y configuración del bot de Telegram
    let config: any = null
    if (branchId) {
      config = await db.whatsAppConfig.findUnique({
        where: { branchId },
        include: { branch: true },
      })
    }

    // Si no viene branchId o la sede no tiene telegram activo, buscar la primera sede con telegram activo
    if (!config || !config.telegramEnabled || !config.telegramBotToken) {
      config = await db.whatsAppConfig.findFirst({
        where: { telegramEnabled: true, telegramBotToken: { not: null } },
        include: { branch: true },
      })
      if (config) {
        branchId = config.branchId
      }
    }

    // Fallback a sede principal
    if (!config || !config.telegramBotToken) {
      const mainBranch = await db.branch.findFirst({
        where: { active: true },
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      })
      if (mainBranch) {
        branchId = mainBranch.id
        config = await db.whatsAppConfig.findUnique({
          where: { branchId: mainBranch.id },
          include: { branch: true },
        })
      }
    }

    if (!config?.telegramBotToken) {
      console.warn("[Telegram Webhook]: No se encontró token configurado para responder.")
      return NextResponse.json({ ok: true, warning: "no_bot_token_configured" })
    }

    const botToken = config.telegramBotToken

    // 3. CAPA DE DOMICILIARIOS / REPARTIDORES:
    // Procesa vinculación (/vincular, /start), comandos operativos (/pedidos, /estado)
    // y botones interactivos (claim, pickup, deliver).
    const driverResult = await handleDriverTelegramAction({
      chatId,
      text,
      callbackData,
      callbackQueryId,
      username: rawUsername,
      firstName,
      botToken,
      branchId,
    })

    if (driverResult.handled) {
      return NextResponse.json({ ok: true, handledBy: "driver_logistics" })
    }

    // 4. CANAL EXCLUSIVO PARA REPARTIDORES:
    // Si la persona que escribe no está vinculada como repartidor, se le orienta amablemente
    // con las instrucciones de vinculación y se le indica que las compras de clientes son por WhatsApp.
    const branchName = config?.branch?.name || "OmniPOS"
    const whatsappNotice = config?.phoneNumber
      ? `\n\n📲 *¿Deseas comprar productos?*\nEscríbenos a nuestra línea oficial de WhatsApp: *${config.phoneNumber}*`
      : ""

    const driverExclusiveMsg =
      `🛵 *Portal de Domiciliarios — ${branchName}*\n\n` +
      `Este canal de Telegram es de uso exclusivo para la gestión y asignación de despachos de nuestros repartidores.\n\n` +
      `🔑 *¿Eres domiciliario del equipo?*\n` +
      `Para activar tu cuenta y empezar a recibir pedidos, escribe aquí:\n` +
      `👉 \`/vincular TU_PIN\` (Ejemplo: \`/vincular 1234\`)\n` +
      `o también:\n` +
      `👉 \`/vincular TU_CELULAR\`\n\n` +
      `*(Solicita tu PIN de acceso al cajero o administrador de tu sede).*` +
      whatsappNotice

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: driverExclusiveMsg,
        parse_mode: "Markdown",
      }),
    }).catch((err) => console.error("[Telegram Send Error]:", err))

    return NextResponse.json({ ok: true, handledBy: "driver_portal_exclusive" })
  } catch (error) {
    console.error("[Telegram Webhook Exception]:", error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 200 })
  }
}
