import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const branchFilter = branchId ? { branchId } : {}

    const body = await req.json()
    const { templateId, customMessage, targetPhones = [] } = body

    let templateContent = customMessage || ""
    let metaTemplateInfo: { name: string; language: string; isMeta: boolean } = {
      name: "",
      language: "es",
      isMeta: false,
    }

    if (templateId) {
      const template = await db.whatsAppTemplate.findUnique({
        where: { id: templateId },
      })
      if (template) {
        templateContent = template.content
        const metaMatch = template.content.match(/<!--meta:(\{.*?\})-->/)
        if (metaMatch) {
          try {
            const metaParsed = JSON.parse(metaMatch[1])
            metaTemplateInfo = {
              name: metaParsed.name || template.name,
              language: metaParsed.language || "es",
              isMeta: true,
            }
          } catch {}
        } else if (/^[a-z0-9_]+$/.test(template.name)) {
          metaTemplateInfo = {
            name: template.name,
            language: "es",
            isMeta: true,
          }
        }
      }
    }

    // Limpiar metadata de la vista para texto plano
    const cleanTemplateText = templateContent.replace(/<!--meta:\{.*?\}-->\n?/, "").trim()

    if (!cleanTemplateText && !metaTemplateInfo.isMeta) {
      return NextResponse.json({ error: "El contenido del mensaje o plantilla es requerido" }, { status: 400 })
    }

    // Obtener los clientes destinatarios
    let recipients: { id: string; name: string; phone: string; balance: number }[] = []

    if (Array.isArray(targetPhones) && targetPhones.length > 0) {
      const clients = await db.client.findMany({
        where: {
          phone: { in: targetPhones },
          ...branchFilter,
        },
        include: { creditAccount: true },
      })
      recipients = targetPhones.map((p) => {
        const found = clients.find((c) => c.phone === p)
        return {
          id: found?.id || "temp",
          name: found?.name || "Cliente",
          phone: p,
          balance: found?.creditAccount?.balance || 0,
        }
      })
    } else {
      // Si no se especificaron teléfonos, enviar a clientes registrados con teléfono
      const allClients = await db.client.findMany({
        where: {
          phone: { not: null },
          ...branchFilter,
        },
        include: { creditAccount: true },
        take: 50,
      })
      recipients = allClients.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone!,
        balance: c.creditAccount?.balance || 0,
      }))
    }

    if (recipients.length === 0) {
      return NextResponse.json({ error: "No se encontraron contactos destinatarios para la difusión." }, { status: 400 })
    }

    // Credenciales de Meta y Telegram de la sede activa
    const config = branchId
      ? await db.whatsAppConfig.findUnique({ where: { branchId } })
      : await db.whatsAppConfig.findFirst()

    const rawToken = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
    const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
    const token = rawToken ? rawToken.replace(/[\u2022\u2023\u25E6\u2043\u2219•]/g, "").trim() : ""

    const sentResults: Array<{ phone: string; clientName: string; messageId: string }> = []
    const errors: Array<{ phone: string; error: string }> = []

    for (const r of recipients) {
      const isTg = r.phone.startsWith("tg_")
      const numericPhone = r.phone.replace(/[^0-9]/g, "")

      // Reemplazo de variables {{nombre}} y {{saldo}} o {{1}}, {{2}}
      const personalized = cleanTemplateText
        .replace(/{{nombre}}/gi, r.name)
        .replace(/{{1}}/g, r.name)
        .replace(/{{saldo}}/gi, r.balance.toLocaleString("es-CO"))
        .replace(/{{2}}/g, r.balance.toLocaleString("es-CO"))

      // Despachar a Meta Cloud API
      let metaError: string | null = null

      if (!isTg && token && phoneId) {
        try {
          let metaPayload: any

          if (metaTemplateInfo.isMeta) {
            // Despacho como Plantilla Oficial de Meta Cloud API (Permitido para difusión según políticas de Meta)
            metaPayload = {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: numericPhone,
              type: "template",
              template: {
                name: metaTemplateInfo.name,
                language: { code: metaTemplateInfo.language },
                components: [
                  {
                    type: "body",
                    parameters: [
                      { type: "text", text: r.name || "Cliente" },
                      { type: "text", text: r.balance.toLocaleString("es-CO") },
                    ],
                  },
                ],
              },
            }
          } else {
            // Si no es plantilla oficial de Meta, enviar como texto plano (solo funciona en ventana 24h)
            metaPayload = {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: numericPhone,
              type: "text",
              text: { body: personalized },
            }
          }

          const metaRes = await fetch(
            `https://graph.facebook.com/v21.0/${encodeURIComponent(String(phoneId).trim())}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(metaPayload),
            }
          )

          if (!metaRes.ok) {
            const errData = await metaRes.json().catch(() => ({}))
            const msg = errData?.error?.message || `HTTP ${metaRes.status}`
            metaError = msg
            console.error(`[Meta Broadcast Error] Destinatario ${r.phone}:`, msg)
            errors.push({ phone: r.phone, error: msg })
          }
        } catch (e) {
          metaError = (e as Error).message
          errors.push({ phone: r.phone, error: metaError })
        }
      }

      // Guardar en la base de datos
      const msg = await db.whatsAppMessage.create({
        data: {
          phone: r.phone,
          sender: "agent",
          text: personalized,
          status: metaError ? "failed" : "sent",
          branchId,
          clientId: r.id !== "temp" ? r.id : null,
          channel: isTg ? "telegram" : "whatsapp",
        },
      })

      if (!metaError) {
        sentResults.push({
          phone: r.phone,
          clientName: r.name,
          messageId: msg.id,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      totalSent: sentResults.length,
      failedCount: errors.length,
      recipients: sentResults,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
