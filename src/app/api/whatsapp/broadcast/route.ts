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

    if (templateId) {
      const template = await db.whatsAppTemplate.findUnique({
        where: { id: templateId },
      })
      if (template) {
        templateContent = template.content
      }
    }

    if (!templateContent.trim()) {
      return NextResponse.json({ error: "El contenido del mensaje es requerido" }, { status: 400 })
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
      // Si no se especificaron teléfonos, enviar a todos los clientes registrados con teléfono
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

    const sentResults: Array<{ phone: string; clientName: string; messageId: string }> = []

    for (const r of recipients) {
      // Reemplazo de variables {{nombre}} y {{saldo}}
      const personalized = templateContent
        .replace(/{{nombre}}/gi, r.name)
        .replace(/{{saldo}}/gi, r.balance.toLocaleString("es-CO"))

      // Guardar en la base de datos
      const msg = await db.whatsAppMessage.create({
        data: {
          phone: r.phone,
          sender: "agent",
          text: personalized,
          status: "sent",
          branchId,
          clientId: r.id !== "temp" ? r.id : null,
        },
      })

      sentResults.push({
        phone: r.phone,
        clientName: r.name,
        messageId: msg.id,
      })

      // Despacho a Meta API si está configurada
      const token = process.env.WHATSAPP_ACCESS_TOKEN
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
      if (token && phoneId) {
        fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: r.phone,
            type: "text",
            text: { body: personalized },
          }),
        }).catch((e) => console.error("[Meta Broadcast Error]:", e))
      }
    }

    return NextResponse.json({
      ok: true,
      totalSent: sentResults.length,
      recipients: sentResults,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
