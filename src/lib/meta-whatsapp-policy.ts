import { db } from "@/lib/db"

export interface MetaQuotaStats {
  monthlyLimit: number // 1.000 mensajes de servicio gratis al mes por número (nueva política Meta)
  usedThisMonth: number // Total mensajes salientes entregados (Bot + Agente)
  remainingFree: number
  percentUsed: number
  resetsAt: string
  isExceeded: boolean
  botMessagesCount: number
  agentMessagesCount: number
  customerIncomingCount: number // Mensajes entrantes de clientes (100% gratis)
  model: "per_message" // Nueva política oficial de Meta por mensaje entregado
}

export interface CareWindowStatus {
  isOpen: boolean
  expiresAt: string | null
  hoursLeft: number
  minutesLeft: number
  formattedTimeLeft: string
}

/**
 * Calcula el consumo mensual bajo la NUEVA POLÍTICA DE META (Esquema por mensaje individual entregado):
 * - Los primeros 1.000 mensajes salientes de servicio del mes por número son 100% GRATIS.
 * - Aplica tanto a mensajes enviados por el Bot IA como por Agentes Humanos.
 * - A partir del mensaje 1.001 se factura tarifa fija por mensaje entregado.
 * - Mensajes entrantes de clientes: 100% GRATIS siempre.
 * - No acumulables: se reinician el 1º de cada mes calendario.
 */
export async function getMetaMonthlyConversations(branchId?: string | null): Promise<MetaQuotaStats> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const branchFilter = branchId ? { branchId } : {}

  // 1. Contar mensajes salientes del negocio (Bot IA) en el mes actual
  const botMessagesCount = await db.whatsAppMessage.count({
    where: {
      ...branchFilter,
      sender: "bot",
      channel: "whatsapp",
      createdAt: { gte: startOfMonth },
    },
  })

  // 2. Contar mensajes salientes del negocio (Agente Humano) en el mes actual
  const agentMessagesCount = await db.whatsAppMessage.count({
    where: {
      ...branchFilter,
      sender: "agent",
      channel: "whatsapp",
      createdAt: { gte: startOfMonth },
    },
  })

  // 3. Contar mensajes entrantes de clientes (100% Gratis según política de Meta)
  const customerIncomingCount = await db.whatsAppMessage.count({
    where: {
      ...branchFilter,
      sender: "customer",
      channel: "whatsapp",
      createdAt: { gte: startOfMonth },
    },
  })

  // Total de mensajes de servicio salientes que consumen la cuota de Meta
  const usedThisMonth = botMessagesCount + agentMessagesCount
  const monthlyLimit = 1000
  const remainingFree = Math.max(0, monthlyLimit - usedThisMonth)
  const percentUsed = Math.min(100, Math.round((usedThisMonth / monthlyLimit) * 100))
  const isExceeded = usedThisMonth >= monthlyLimit

  return {
    monthlyLimit,
    usedThisMonth,
    remainingFree,
    percentUsed,
    resetsAt: nextMonth.toISOString(),
    isExceeded,
    botMessagesCount,
    agentMessagesCount,
    customerIncomingCount,
    model: "per_message",
  }
}

/**
 * Calcula el estado de la ventana de servicio de 24 horas de Meta para un chat.
 * Dentro de las 24 horas desde el último mensaje del cliente, las respuestas son libres.
 * Pasadas las 24 horas, Meta exige plantilla pre-aprobada para iniciar contacto.
 */
export function calculateCareWindow(lastCustomerMessageDate?: Date | string | null): CareWindowStatus {
  if (!lastCustomerMessageDate) {
    return {
      isOpen: false,
      expiresAt: null,
      hoursLeft: 0,
      minutesLeft: 0,
      formattedTimeLeft: "Expirada",
    }
  }

  const lastDate = typeof lastCustomerMessageDate === "string" 
    ? new Date(lastCustomerMessageDate) 
    : lastCustomerMessageDate

  const lastTime = lastDate.getTime()
  if (isNaN(lastTime)) {
    return {
      isOpen: false,
      expiresAt: null,
      hoursLeft: 0,
      minutesLeft: 0,
      formattedTimeLeft: "Expirada",
    }
  }

  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
  const expiresTime = lastTime + TWENTY_FOUR_HOURS_MS
  const now = Date.now()
  const diffMs = expiresTime - now

  if (diffMs <= 0) {
    return {
      isOpen: false,
      expiresAt: new Date(expiresTime).toISOString(),
      hoursLeft: 0,
      minutesLeft: 0,
      formattedTimeLeft: "Expirada (Requiere Plantilla)",
    }
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  const hoursLeft = Math.floor(totalMinutes / 60)
  const minutesLeft = totalMinutes % 60

  return {
    isOpen: true,
    expiresAt: new Date(expiresTime).toISOString(),
    hoursLeft,
    minutesLeft,
    formattedTimeLeft: `${hoursLeft}h ${minutesLeft}m restantes`,
  }
}

/**
 * Resuelve el ID de la cuenta de WhatsApp Business (WABA ID) usando múltiples estrategias:
 * 1. WABA ID explícito proporcionado por el usuario o configuración
 * 2. /debug_token granular_scopes (donde Meta lista los target_ids asignados al token)
 * 3. /me/assigned_whatsapp_business_accounts (asignaciones del System User)
 * 4. /me/businesses -> owned_whatsapp_business_accounts
 */
export async function findWabaId(
  token: string,
  phoneId?: string | null,
  explicitWabaId?: string | null
): Promise<string | null> {
  if (explicitWabaId && String(explicitWabaId).trim().length > 0) {
    return String(explicitWabaId).trim()
  }

  const cleanToken = token.trim()

  // Estrategia 1: debug_token (extrae los target_ids bajo granular_scopes)
  try {
    const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(cleanToken)}&access_token=${encodeURIComponent(cleanToken)}`
    const debugRes = await fetch(debugUrl)
    if (debugRes.ok) {
      const debugJson = await debugRes.json()
      const granularScopes = debugJson?.data?.granular_scopes || []
      for (const gs of granularScopes) {
        if (
          (gs.scope === "whatsapp_business_management" || gs.scope === "whatsapp_business_messaging") &&
          Array.isArray(gs.target_ids) &&
          gs.target_ids.length > 0
        ) {
          const candidate = String(gs.target_ids[0])
          console.log(`[Meta Sync] WABA ID detectado vía debug_token granular_scopes: ${candidate}`)
          return candidate
        }
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] debug_token warning:", e)
  }

  // Estrategia 2: /me/assigned_whatsapp_business_accounts (para System Users con WABA asignado)
  try {
    const assignedRes = await fetch(
      `https://graph.facebook.com/v21.0/me/assigned_whatsapp_business_accounts`,
      { headers: { Authorization: `Bearer ${cleanToken}` } }
    )
    if (assignedRes.ok) {
      const assignedJson = await assignedRes.json()
      if (Array.isArray(assignedJson?.data) && assignedJson.data.length > 0) {
        const candidate = String(assignedJson.data[0].id)
        console.log(`[Meta Sync] WABA ID detectado vía assigned_whatsapp_business_accounts: ${candidate}`)
        return candidate
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] assigned_whatsapp_business_accounts warning:", e)
  }

  // Estrategia 3: /me/businesses -> owned_whatsapp_business_accounts
  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses`, {
      headers: { Authorization: `Bearer ${cleanToken}` },
    })
    if (meRes.ok) {
      const meJson = await meRes.json()
      const businesses = meJson?.data || []
      for (const biz of businesses) {
        const ownedRes = await fetch(
          `https://graph.facebook.com/v21.0/${biz.id}/owned_whatsapp_business_accounts`,
          { headers: { Authorization: `Bearer ${cleanToken}` } }
        )
        if (ownedRes.ok) {
          const ownedJson = await ownedRes.json()
          if (Array.isArray(ownedJson?.data) && ownedJson.data.length > 0) {
            const candidate = String(ownedJson.data[0].id)
            console.log(`[Meta Sync] WABA ID detectado vía owned_whatsapp_business_accounts: ${candidate}`)
            return candidate
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] businesses warning:", e)
  }

  return null
}

/**
 * Sincroniza plantillas de WhatsApp Cloud API desde Meta Graph API
 */
export async function syncMetaCloudTemplates(branchId?: string | null, explicitWabaId?: string | null) {
  // Buscar credenciales de la sede
  const config = branchId
    ? await db.whatsAppConfig.findUnique({ where: { branchId } })
    : await db.whatsAppConfig.findFirst()

  const token = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!token || !phoneId) {
    return {
      ok: false,
      error: "No hay Token o Phone Number ID de Meta configurado en esta sede.",
      syncedCount: 0,
      requiresWabaId: false,
    }
  }

  try {
    // 1. Resolver el WABA ID de forma inteligente
    const wabaId = await findWabaId(token, phoneId, explicitWabaId)

    if (!wabaId) {
      return {
        ok: false,
        requiresWabaId: true,
        error:
          "Meta requiere el Identificador de la Cuenta de WhatsApp Business (WABA ID). Encuéntralo en Meta Developers > WhatsApp > Configuración de la API (está justo al lado del Phone Number ID).",
        syncedCount: 0,
      }
    }

    // 2. Obtener plantillas aprobadas desde Meta
    const templatesRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
      {
        headers: { Authorization: `Bearer ${token.trim()}` },
      }
    )

    if (!templatesRes.ok) {
      const err = await templatesRes.text()
      return {
        ok: false,
        requiresWabaId: false,
        error: `Error de Meta al obtener plantillas de la cuenta ${wabaId}: ${err}`,
        syncedCount: 0,
      }
    }

    const tplData = await templatesRes.json()
    const metaTemplates: any[] = tplData.data || []

    if (metaTemplates.length === 0) {
      return {
        ok: true,
        message: "Conexión exitosa con Meta, pero aún no tienes plantillas creadas o aprobadas en tu Administrador de WhatsApp.",
        syncedCount: 0,
        totalMetaTemplates: 0,
        wabaId,
      }
    }

    let syncedCount = 0

    for (const tpl of metaTemplates) {
      // Extraer el texto de la plantilla (componente BODY)
      const bodyComp = tpl.components?.find((c: any) => c.type === "BODY")
      const text = bodyComp?.text || `Plantilla oficial ${tpl.name}`

      // Mapear categoría
      const catLower = (tpl.category || "UTILITY").toLowerCase()
      const category = catLower.includes("market")
        ? "promocion"
        : catLower.includes("remind") || catLower.includes("util")
        ? "recordatorio"
        : "novedad"

      // Upsert por nombre y branchId
      const existing = await db.whatsAppTemplate.findFirst({
        where: {
          name: tpl.name,
          ...(branchId ? { branchId } : {}),
        },
      })

      if (existing) {
        await db.whatsAppTemplate.update({
          where: { id: existing.id },
          data: {
            content: text,
            category,
          },
        })
      } else {
        await db.whatsAppTemplate.create({
          data: {
            name: tpl.name,
            content: text,
            category,
            branchId: branchId || null,
          },
        })
      }
      syncedCount++
    }

    return {
      ok: true,
      syncedCount,
      totalMetaTemplates: metaTemplates.length,
      wabaId,
    }
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      syncedCount: 0,
      requiresWabaId: false,
    }
  }
}
