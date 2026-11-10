import { NextRequest, NextResponse } from "next/server"
import { processWhatsAppMessage } from "@/lib/whatsapp-agent"
import { db } from "@/lib/db"
import { handleIncomingCustomerLocation, extractCoordinates } from "@/lib/telegram-driver"

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

    if (!message || (message.type !== "text" && message.type !== "location")) {
      return NextResponse.json({ status: "ignored_non_supported" }, { status: 200 })
    }

    const from = String(message.from || "").trim() // Teléfono del cliente
    const messageId = String(message.id || "").trim()
    const text = (message.text?.body || "").trim()
    const customerName = value?.contacts?.[0]?.profile?.name || "Cliente WhatsApp"

    // 0. Idempotencia anti-reintentos de Meta Cloud API (evitar procesar dos veces el mismo wamid)
    if (messageId) {
      const dedupKey = `wa_last_msg:${from}`
      try {
        const existingDedup = await db.setting.findUnique({ where: { key: dedupKey } })
        let recentIds: string[] = []
        if (existingDedup?.value) {
          recentIds = JSON.parse(existingDedup.value)
          if (Array.isArray(recentIds) && recentIds.includes(messageId)) {
            console.log(`[WhatsApp Webhook] Mensaje duplicado ignorado (${messageId}) para ${from}`)
            return NextResponse.json({ status: "duplicate_ignored", messageId })
          }
        }
        const nextIds = [messageId, ...(Array.isArray(recentIds) ? recentIds : [])].slice(0, 15)
        await db.setting.upsert({
          where: { key: dedupKey },
          update: { value: JSON.stringify(nextIds) },
          create: { key: dedupKey, value: JSON.stringify(nextIds) },
        })
      } catch (dedupErr) {
        console.warn("[WhatsApp Dedup Check Warning]:", dedupErr)
      }
    }

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

    const token = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
    const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID

    // 2. DETECCIÓN DE UBICACIÓN GPS (Pin de WhatsApp o enlace de Google Maps)
    let coordinates: { latitude: number; longitude: number } | null = null
    let locationAddressName = ""

    if (message.type === "location" && message.location) {
      const lat = parseFloat(message.location.latitude)
      const lng = parseFloat(message.location.longitude)
      if (!isNaN(lat) && !isNaN(lng)) {
        coordinates = { latitude: lat, longitude: lng }
        locationAddressName = [message.location.name, message.location.address].filter(Boolean).join(" - ")
      }
    } else if (message.type === "text" && text) {
      coordinates = extractCoordinates(text)
    }

    if (coordinates) {
      console.log(`[WhatsApp Webhook] Ubicación GPS detectada de ${from}: (${coordinates.latitude}, ${coordinates.longitude})`)
      const locResult = await handleIncomingCustomerLocation({
        phone: from,
        customerName,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        addressName: locationAddressName,
        branchId,
        channel: "whatsapp",
      })

      // Despachar respuesta de confirmación al cliente por WhatsApp
      if (token && phoneId && locResult.replyText) {
        await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            type: "text",
            text: { body: locResult.replyText },
          }),
        }).catch((err) => console.error("[WhatsApp Location Reply Error]:", err))
      }

      return NextResponse.json({ status: "location_processed", orderId: locResult.order?.id })
    }

    // 3. Procesar con el motor IA DeepSeek y catálogo exclusivo de la sede (Consultas y Ventas)
    const result = await processWhatsAppMessage({
      phone: from,
      customerName,
      message: text,
      branchId,
    })

    // 4. Despachar respuesta de vuelta por Meta Cloud API si la sede tiene credenciales
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
        console.error("[WhatsApp Meta Fetch Exception]:", metaErr)
      }
    }

    return NextResponse.json({ status: "processed", response: result?.reply || null })
  } catch (error) {
    console.error("[WhatsApp Webhook General Error]:", error)
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
