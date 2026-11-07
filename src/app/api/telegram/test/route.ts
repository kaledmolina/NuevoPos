import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

/**
 * POST /api/telegram/test
 * Prueba la conexión con el bot de Telegram mediante BotFather Token,
 * obtiene los datos del bot (username, id), registra el webhook y guarda la configuración.
 */
export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const accessBranchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId

    const body = await req.json()
    const { token, branchId, action = "connect", webhookUrlOverride } = body
    const targetBranchId = branchId || accessBranchId

    if (!targetBranchId) {
      return NextResponse.json({ error: "El ID de sede es requerido" }, { status: 400 })
    }

    // Acción para desconectar el bot
    if (action === "disconnect") {
      const config = await db.whatsAppConfig.findUnique({ where: { branchId: targetBranchId } })
      if (config?.telegramBotToken) {
        // Eliminar webhook en Telegram
        await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/deleteWebhook`).catch(() => {})
      }

      await db.whatsAppConfig.upsert({
        where: { branchId: targetBranchId },
        create: {
          branchId: targetBranchId,
          telegramBotToken: null,
          telegramBotUsername: null,
          telegramEnabled: false,
        },
        update: {
          telegramBotToken: null,
          telegramBotUsername: null,
          telegramEnabled: false,
        },
      })

      return NextResponse.json({
        ok: true,
        message: "Bot de Telegram desconectado exitosamente.",
      })
    }

    // Verificar token proporcionado o existente
    let botToken = token?.trim()
    if (!botToken || botToken.includes("••••")) {
      const existing = await db.whatsAppConfig.findUnique({ where: { branchId: targetBranchId } })
      botToken = existing?.telegramBotToken || ""
    }

    if (!botToken) {
      return NextResponse.json(
        { error: "Debes ingresar el Token del Bot proporcionado por @BotFather" },
        { status: 400 }
      )
    }

    // 1. Probar credenciales con Telegram Bot API (getMe)
    const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET",
      cache: "no-store",
    })

    const getMeData = await getMeRes.json().catch(() => null)

    if (!getMeRes.ok || !getMeData?.ok) {
      const errorMsg = getMeData?.description || "Token de bot inválido o no reconocido por Telegram"
      return NextResponse.json(
        { error: `Error de Telegram: ${errorMsg}. Revisa el token generado en @BotFather.` },
        { status: 400 }
      )
    }

    const botInfo = getMeData.result
    const botUsername = botInfo.username ? `@${botInfo.username}` : `@bot_${botInfo.id}`

    // 2. Determinar la URL del Webhook
    // Telegram requiere una URL pública con HTTPS para webhooks en producción.
    const origin =
      webhookUrlOverride?.trim() ||
      req.headers.get("x-forwarded-proto")
        ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
        : req.nextUrl.origin

    const webhookUrl = `${origin}/api/telegram/webhook?branchId=${targetBranchId}`
    let webhookSet = false
    let webhookStatusNote = ""

    if (origin.startsWith("https://")) {
      const setWebhookRes = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`,
        { method: "POST" }
      )
      const setWebhookData = await setWebhookRes.json().catch(() => null)
      if (setWebhookData?.ok) {
        webhookSet = true
        webhookStatusNote = "Webhook HTTPS registrado y activo con éxito en Telegram."
      } else {
        webhookStatusNote = `Webhook: ${setWebhookData?.description || "No se pudo registrar automáticamente."}`
      }
    } else {
      webhookStatusNote =
        "Conectado a nivel de API. Recuerda que Telegram exige HTTPS público para despachar mensajes en tiempo real vía webhook."
    }

    // 3. Guardar en la base de datos para esta sede
    const updated = await db.whatsAppConfig.upsert({
      where: { branchId: targetBranchId },
      create: {
        branchId: targetBranchId,
        telegramBotToken: botToken,
        telegramBotUsername: botUsername,
        telegramEnabled: true,
      },
      update: {
        telegramBotToken: botToken,
        telegramBotUsername: botUsername,
        telegramEnabled: true,
      },
    })

    return NextResponse.json({
      ok: true,
      bot: {
        id: botInfo.id,
        first_name: botInfo.first_name,
        username: botUsername,
        can_join_groups: botInfo.can_join_groups,
      },
      webhookUrl,
      webhookSet,
      webhookStatusNote,
      message: `¡Bot ${botUsername} (${botInfo.first_name}) conectado con éxito!`,
    })
  } catch (error) {
    console.error("[Telegram Test Error]:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
