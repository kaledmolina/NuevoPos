import { NextRequest, NextResponse } from "next/server"
import { processWhatsAppMessage } from "@/lib/whatsapp-agent"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * GET: Verificación de Webhook para Meta Cloud API (WhatsApp Business)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe") {
    // Verificar si coincide con alguna sede registrada o con el token global
    const matchingConfig = await db.whatsAppConfig.findFirst({
      where: { metaVerifyToken: token || "" },
    })

    const globalToken = process.env.WHATSAPP_VERIFY_TOKEN || "omnipos_verify_token_2026"

    if (matchingConfig || token === globalToken) {
      console.log("[WhatsApp Webhook] Verificado con éxito con Meta Cloud API.")
      return new NextResponse(challenge, { status: 200 })
    }
  }

  return NextResponse.json({ error: "Token de verificación inválido" }, { status: 403 })
}

/**
 * POST: Recepción de mensajes entrantes desde WhatsApp con enrutamiento por Sede
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Estructura oficial de Meta Cloud API
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const message = value?.messages?.[0]
    const incomingPhoneId = value?.metadata?.phone_number_id

    if (!message || message.type !== "text") {
      return NextResponse.json({ status: "ignored_non_text" }, { status: 200 })
    }

    const from = message.from // Teléfono del cliente
    const text = message.text?.body || ""
    const customerName = value?.contacts?.[0]?.profile?.name || "Cliente WhatsApp"

    // 1. Identificar a qué Sede pertenece este número de WhatsApp
    let branchId: string | null = null
    let config: any = null

    if (incomingPhoneId) {
      config = await db.whatsAppConfig.findFirst({
        where: { metaPhoneNumberId: String(incomingPhoneId) },
      })
      if (config) {
        branchId = config.branchId
      }
    }

    // Si no hubo coincidencia por Phone ID, usar la sede principal
    if (!branchId) {
      const main = await db.branch.findFirst({
        where: { active: true },
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      })
      branchId = main?.id || null
      if (branchId) {
        config = await db.whatsAppConfig.findUnique({ where: { branchId } })
      }
    }

    // 2. Procesar con el motor IA DeepSeek y catálogo exclusivo de la sede
    const result = await processWhatsAppMessage({
      phone: from,
      customerName,
      message: text,
      branchId,
    })

    // 3. Despachar respuesta de vuelta por Meta Cloud API si la sede tiene credenciales
    if (!config && branchId) {
      config = await db.whatsAppConfig.findUnique({ where: { branchId } })
    }
    const token = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
    const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID

    if (token && phoneId && result?.reply) {
      try {
        console.log(`[WhatsApp Webhook] Despachando respuesta a ${from} via Meta Cloud API...`)
        const metaRes = await fetch(
          `https://graph.facebook.com/v18.0/${phoneId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: from,
              type: "text",
              text: { body: result.reply },
            }),
          }
        )
        if (!metaRes.ok) {
          const errText = await metaRes.text()
          console.error(`[WhatsApp Meta Send Error] Status ${metaRes.status}:`, errText)
        } else {
          console.log(`[WhatsApp Webhook] Respuesta entregada con éxito a Meta Cloud API para ${from}`)
        }
      } catch (metaErr) {
        console.error("[WhatsApp Send Network Error]:", metaErr)
      }
    } else {
      console.warn("[WhatsApp Webhook] Mensaje procesado en CRM pero no despachado a Meta Cloud API:", {
        hasToken: !!token,
        hasPhoneId: !!phoneId,
        hasReply: !!result?.reply,
      })
    }

    return NextResponse.json({ ok: true, result, branchId })
  } catch (error) {
    console.error("[WhatsApp Webhook Error]:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
