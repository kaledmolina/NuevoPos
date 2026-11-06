import { NextRequest, NextResponse } from "next/server"
import { processWhatsAppMessage } from "@/lib/whatsapp-agent"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * GET: Verificación de estado del Webhook de Telegram
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "OmniPOS Telegram Bot Webhook",
    timestamp: new Date().toISOString(),
  })
}

/**
 * POST: Recepción de mensajes y eventos entrantes desde Telegram
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let branchId = searchParams.get("branchId")

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ ok: true, ignored: "no_body" })
    }

    // Telegram envía el mensaje en body.message o body.edited_message
    const message = body.message || body.edited_message
    if (!message) {
      return NextResponse.json({ ok: true, ignored: "no_message" })
    }

    const chatId = message.chat?.id
    const rawText = message.text || message.caption || ""
    const text = rawText.trim()

    if (!chatId || !text) {
      return NextResponse.json({ ok: true, ignored: "empty_or_unsupported_media" })
    }

    // Identificar nombre del usuario en Telegram
    const firstName = message.from?.first_name || ""
    const lastName = message.from?.last_name || ""
    const tgUsername = message.from?.username ? `@${message.from.username}` : ""
    const fullName = [firstName, lastName].filter(Boolean).join(" ")
    const customerName = fullName || tgUsername || `Usuario Telegram (${chatId})`

    // 1. Identificar sede y configuración del bot de Telegram
    let config: any = null
    if (branchId) {
      config = await db.whatsAppConfig.findUnique({
        where: { branchId },
      })
    }

    // Si no viene branchId o la sede no tiene telegram activo, buscar la primera sede con telegram activo
    if (!config || !config.telegramEnabled || !config.telegramBotToken) {
      config = await db.whatsAppConfig.findFirst({
        where: { telegramEnabled: true, telegramBotToken: { not: null } },
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
        })
      }
    }

    if (!config?.telegramBotToken) {
      console.warn("[Telegram Webhook]: No se encontró token configurado para responder.")
      return NextResponse.json({ ok: true, warning: "no_bot_token_configured" })
    }

    // 2. Procesar con el motor omnicanal de IA (Catálogo de la sede, RAG, confirmación de pedidos)
    const cleanPhone = `tg_${chatId}`
    const result = await processWhatsAppMessage({
      phone: cleanPhone,
      customerName,
      message: text,
      branchId,
      channel: "telegram",
    })

    // 3. Despachar la respuesta al chat de Telegram
    const botToken = config.telegramBotToken
    const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: result.reply,
      }),
    })

    if (!sendRes.ok) {
      const errText = await sendRes.text()
      console.error("[Telegram Send Error]:", errText)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Telegram Webhook Exception]:", error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 200 })
  }
}
