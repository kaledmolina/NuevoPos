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
 * 1. WABA ID explícito proporcionado por el usuario o guardado en Setting
 * 2. /debug_token granular_scopes (donde Meta lista los target_ids asignados al token)
 * 3. /me/assigned_whatsapp_business_accounts (asignaciones del System User)
 * 4. /me/businesses -> owned_whatsapp_business_accounts & client_whatsapp_business_accounts
 */
export async function findWabaId(
  token: string,
  phoneId?: string | null,
  explicitWabaId?: string | null,
  branchId?: string | null
): Promise<string | null> {
  // Limpiar caracteres no-ASCII (como viñetas •) y espacios
  const cleanToken = token.replace(/[\u2022\u2023\u25E6\u2043\u2219•]/g, "").trim()
  if (!cleanToken) return null

  const cleanPhoneId = phoneId ? String(phoneId).trim() : ""
  const settingKey = branchId ? `meta_waba_id_${branchId}` : "meta_waba_id"

  // Validador estricto: un WABA ID nunca puede ser igual al Phone Number ID
  const isValidWabaCandidate = (id?: string | null): boolean => {
    if (!id) return false
    const str = String(id).trim()
    if (!str || str.length < 5) return false
    if (cleanPhoneId && str === cleanPhoneId) return false
    return true
  }

  // 1. WABA ID explícito proporcionado por el usuario
  if (explicitWabaId && String(explicitWabaId).trim().length > 0) {
    const candidate = String(explicitWabaId).trim()
    if (isValidWabaCandidate(candidate)) {
      try {
        await db.setting.upsert({
          where: { key: settingKey },
          create: { key: settingKey, value: candidate },
          update: { value: candidate },
        })
      } catch (e) {
        console.warn("[Meta Sync] Error guardando setting explicitWabaId:", e)
      }
      return candidate
    } else {
      console.warn(`[Meta Sync] explicitWabaId descartado por ser idéntico al phoneId: ${candidate}`)
    }
  }

  // 2. Verificar si ya fue guardado previamente en la tabla Setting (y limpiar si se había guardado el phoneId por error)
  try {
    const saved = await db.setting.findFirst({
      where: {
        OR: [{ key: settingKey }, { key: "meta_waba_id" }],
      },
    })
    if (saved?.value?.trim()) {
      const savedVal = saved.value.trim()
      if (isValidWabaCandidate(savedVal)) {
        return savedVal
      } else {
        // Limpiar registro erróneo donde se guardó el phoneId en vez del WABA ID
        await db.setting.deleteMany({
          where: { OR: [{ key: settingKey }, { key: "meta_waba_id" }] },
        })
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] Error buscando setting previo:", e)
  }

  // 3. Variable de entorno
  if (process.env.WHATSAPP_WABA_ID && isValidWabaCandidate(process.env.WHATSAPP_WABA_ID)) {
    return process.env.WHATSAPP_WABA_ID.trim()
  }

  // 4. /me?fields=whatsapp_business_accounts (cuentas asociadas directamente al usuario o System User)
  try {
    const meWabaRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number}}`,
      { headers: { Authorization: `Bearer ${cleanToken}` } }
    )
    if (meWabaRes.ok) {
      const meWabaJson = await meWabaRes.json()
      const wabas = meWabaJson?.whatsapp_business_accounts?.data || []
      // 4.1 Priorizar WABA que contenga el phoneId vinculado
      for (const w of wabas) {
        const phoneList = w?.phone_numbers?.data || []
        const hasPhone = phoneList.some((p: any) => String(p.id).trim() === cleanPhoneId)
        if (hasPhone && isValidWabaCandidate(w.id)) {
          const candidate = String(w.id).trim()
          console.log(`[Meta Sync] WABA ID vinculado encontrado por Phone Number ID en /me: ${candidate}`)
          try {
            await db.setting.upsert({
              where: { key: settingKey },
              create: { key: settingKey, value: candidate },
              update: { value: candidate },
            })
          } catch {}
          return candidate
        }
      }
      // 4.2 Si solo hay 1 WABA disponible y válida
      for (const w of wabas) {
        if (isValidWabaCandidate(w.id)) {
          const candidate = String(w.id).trim()
          console.log(`[Meta Sync] WABA ID único detectado vía /me: ${candidate}`)
          try {
            await db.setting.upsert({
              where: { key: settingKey },
              create: { key: settingKey, value: candidate },
              update: { value: candidate },
            })
          } catch {}
          return candidate
        }
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] me?fields=whatsapp_business_accounts warning:", e)
  }

  // 5. debug_token (extrae los target_ids bajo granular_scopes)
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
          for (const targetId of gs.target_ids) {
            const candidate = String(targetId).trim()
            if (isValidWabaCandidate(candidate)) {
              console.log(`[Meta Sync] WABA ID detectado vía debug_token granular_scopes: ${candidate}`)
              try {
                await db.setting.upsert({
                  where: { key: settingKey },
                  create: { key: settingKey, value: candidate },
                  update: { value: candidate },
                })
              } catch {}
              return candidate
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] debug_token warning:", e)
  }

  // 6. /me/assigned_whatsapp_business_accounts (para System Users con WABA asignado)
  try {
    const assignedRes = await fetch(
      `https://graph.facebook.com/v21.0/me/assigned_whatsapp_business_accounts?fields=id,name,phone_numbers{id,display_phone_number}`,
      { headers: { Authorization: `Bearer ${cleanToken}` } }
    )
    if (assignedRes.ok) {
      const assignedJson = await assignedRes.json()
      if (Array.isArray(assignedJson?.data) && assignedJson.data.length > 0) {
        for (const item of assignedJson.data) {
          const phoneList = item?.phone_numbers?.data || []
          const hasPhone = phoneList.some((p: any) => String(p.id).trim() === cleanPhoneId)
          if (hasPhone && isValidWabaCandidate(item.id)) {
            const candidate = String(item.id).trim()
            console.log(`[Meta Sync] WABA ID encontrado por Phone ID en assigned_wabas: ${candidate}`)
            try {
              await db.setting.upsert({
                where: { key: settingKey },
                create: { key: settingKey, value: candidate },
                update: { value: candidate },
              })
            } catch {}
            return candidate
          }
        }
        for (const item of assignedJson.data) {
          const candidate = String(item.id).trim()
          if (isValidWabaCandidate(candidate)) {
            console.log(`[Meta Sync] WABA ID detectado vía assigned_whatsapp_business_accounts: ${candidate}`)
            try {
              await db.setting.upsert({
                where: { key: settingKey },
                create: { key: settingKey, value: candidate },
                update: { value: candidate },
              })
            } catch {}
            return candidate
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Meta Sync] assigned_whatsapp_business_accounts warning:", e)
  }

  // 6. /me/businesses -> owned_whatsapp_business_accounts & client_whatsapp_business_accounts
  try {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses`, {
      headers: { Authorization: `Bearer ${cleanToken}` },
    })
    if (meRes.ok) {
      const meJson = await meRes.json()
      const businesses = meJson?.data || []
      for (const biz of businesses) {
        for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
          const ownedRes = await fetch(
            `https://graph.facebook.com/v21.0/${biz.id}/${edge}`,
            { headers: { Authorization: `Bearer ${cleanToken}` } }
          )
          if (ownedRes.ok) {
            const ownedJson = await ownedRes.json()
            if (Array.isArray(ownedJson?.data) && ownedJson.data.length > 0) {
              for (const item of ownedJson.data) {
                const candidate = String(item.id).trim()
                if (isValidWabaCandidate(candidate)) {
                  console.log(`[Meta Sync] WABA ID detectado vía owned_whatsapp_business_accounts: ${candidate}`)
                  try {
                    await db.setting.upsert({
                      where: { key: settingKey },
                      create: { key: settingKey, value: candidate },
                      update: { value: candidate },
                    })
                  } catch {}
                  return candidate
                }
              }
            }
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

  const rawToken = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!rawToken || !phoneId) {
    return {
      ok: false,
      error: "No hay Token o Phone Number ID de Meta configurado en esta sede.",
      syncedCount: 0,
      requiresWabaId: false,
    }
  }

  // Limpiar cualquier caracter de enmascaramiento o no ByteString
  const token = rawToken.replace(/[\u2022\u2023\u25E6\u2043\u2219•]/g, "").trim()
  if (!token) {
    return {
      ok: false,
      error: "El Access Token de Meta guardado no es válido. Ingresa el token real en Configuración.",
      syncedCount: 0,
      requiresWabaId: false,
    }
  }

  try {
    // 1. Resolver el WABA ID de forma inteligente
    const wabaId = await findWabaId(token, phoneId, explicitWabaId, branchId)

    if (!wabaId) {
      return {
        ok: false,
        requiresWabaId: true,
        error:
          "Meta requiere el Identificador de la Cuenta de WhatsApp Business (WABA ID). Encuéntralo en Meta Developers > WhatsApp > Configuración de la API (está en la misma pantalla, etiquetado como 'Identificador de la cuenta de WhatsApp Business', justo al lado del Phone Number ID).",
        syncedCount: 0,
      }
    }

    // 2. Obtener plantillas aprobadas desde Meta
    const templatesRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    if (!templatesRes.ok) {
      const errText = await templatesRes.text().catch(() => "")
      let parsedErr: any = {}
      try {
        parsedErr = JSON.parse(errText)
      } catch {}
      const msg = parsedErr?.error?.message || errText || `Error HTTP ${templatesRes.status}`

      // Si el error indica que el campo message_templates no existe en el nodo, significa que se usó un Phone Number ID
      if (msg.includes("message_templates") || msg.includes("nonexisting field")) {
        try {
          const settingKey = branchId ? `meta_waba_id_${branchId}` : "meta_waba_id"
          await db.setting.deleteMany({
            where: { OR: [{ key: settingKey }, { key: "meta_waba_id" }] },
          })
        } catch {}
        return {
          ok: false,
          requiresWabaId: true,
          error: `El ID '${wabaId}' es tu Phone Number ID (identificador de número), no el WABA ID. Meta requiere el 'Identificador de la cuenta de WhatsApp Business (WABA ID)'. Búscalo en Meta Developers > WhatsApp > Configuración de la API e ingrésalo.`,
          syncedCount: 0,
        }
      }

      return {
        ok: false,
        requiresWabaId: false,
        error: `Error de Meta al obtener plantillas de la cuenta ${wabaId}: ${msg}`,
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

      // Metadata de Meta guardada en el contenido como encabezado
      const metaMetadata = `<!--meta:${JSON.stringify({
        name: tpl.name,
        language: tpl.language || "es",
        status: tpl.status || "APPROVED",
        category: tpl.category || "UTILITY",
      })}-->\n`

      const contentToStore = `${metaMetadata}${text}`

      // Mapear categoría interna
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
            content: contentToStore,
            category,
          },
        })
      } else {
        await db.whatsAppTemplate.create({
          data: {
            name: tpl.name,
            content: contentToStore,
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

/**
 * Crea una plantilla oficial de WhatsApp en Meta Cloud API
 * y la registra en la base de datos con estado PENDING/APPROVED.
 */
export async function createMetaCloudTemplate(params: {
  branchId?: string | null
  name: string
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION"
  language?: string
  bodyText: string
  headerText?: string
  footerText?: string
}) {
  const { branchId, name, category, language = "es", bodyText, headerText, footerText } = params

  // 1. Obtener credenciales
  const config = branchId
    ? await db.whatsAppConfig.findUnique({ where: { branchId } })
    : await db.whatsAppConfig.findFirst()

  const rawToken = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID

  const token = rawToken ? rawToken.replace(/[\u2022\u2023\u25E6\u2043\u2219•]/g, "").trim() : ""
  if (!token || !phoneId) {
    return {
      ok: false,
      error: "No hay Token o Phone Number ID de Meta configurado en esta sede.",
    }
  }

  // 2. Obtener WABA ID
  const wabaId = await findWabaId(token, phoneId, null, branchId)
  if (!wabaId) {
    return {
      ok: false,
      requiresWabaId: true,
      error: "Se requiere el WABA ID para enviar plantillas a Meta. Vincúlalo en la pestaña Difusión.",
    }
  }

  // 3. Normalizar nombre (Meta solo admite minúsculas, números y guiones bajos: ^[a-z0-9_]+$)
  let cleanName = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 512)

  if (!cleanName) {
    return {
      ok: false,
      error: "El nombre de la plantilla debe contener letras o números (ej: promo_navidad_2026).",
    }
  }

  // 4. Normalizar texto de la plantilla: convertir {{nombre}} o {{saldo}} a variables posicionales de Meta {{1}}, {{2}}
  let metaBodyText = bodyText
    .replace(/{{nombre}}/gi, "{{1}}")
    .replace(/{{saldo}}/gi, "{{2}}")

  // Detectar variables en el texto de Meta ({{1}}, {{2}}, etc.)
  const varMatches = metaBodyText.match(/\{\{(\d+)\}\}/g) || []
  const uniqueVars = Array.from(new Set(varMatches))
  const sampleValues: string[] = []
  for (let i = 0; i < uniqueVars.length; i++) {
    sampleValues.push(i === 0 ? "Carlos" : i === 1 ? "50.000" : `Dato_${i + 1}`)
  }

  // 5. Construir componentes para Meta Graph API
  const components: any[] = []

  if (headerText && headerText.trim()) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: headerText.trim(),
    })
  }

  const bodyComponent: any = {
    type: "BODY",
    text: metaBodyText.trim(),
  }

  if (sampleValues.length > 0) {
    bodyComponent.example = {
      body_text: [sampleValues],
    }
  }
  components.push(bodyComponent)

  if (footerText && footerText.trim()) {
    components.push({
      type: "FOOTER",
      text: footerText.trim(),
    })
  }

  const metaPayload = {
    name: cleanName,
    category: category || "MARKETING",
    language: language || "es",
    components,
  }

  try {
    // 6. Enviar a Meta Cloud API
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    })

    const metaData = await metaRes.json().catch(() => ({}))

    if (!metaRes.ok) {
      const errorMsg =
        metaData?.error?.error_user_msg ||
        metaData?.error?.message ||
        `Error HTTP ${metaRes.status} de Meta`
      return {
        ok: false,
        error: `Error de Meta al crear plantilla: ${errorMsg}`,
      }
    }

    const initialStatus = metaData.status || "PENDING"
    const metaId = metaData.id

    // 7. Guardar en Base de Datos
    const metaMetadata = `<!--meta:${JSON.stringify({
      name: cleanName,
      language: language || "es",
      status: initialStatus,
      category: category || "MARKETING",
      metaId,
    })}-->\n`

    const contentToStore = `${metaMetadata}${metaBodyText.trim()}`
    const catLower = (category || "MARKETING").toLowerCase()
    const dbCategory = catLower.includes("market")
      ? "promocion"
      : catLower.includes("util")
      ? "recordatorio"
      : "novedad"

    // Upsert por si ya existía localmente con ese nombre
    const existing = await db.whatsAppTemplate.findFirst({
      where: {
        name: cleanName,
        ...(branchId ? { branchId } : {}),
      },
    })

    let templateRecord
    if (existing) {
      templateRecord = await db.whatsAppTemplate.update({
        where: { id: existing.id },
        data: {
          content: contentToStore,
          category: dbCategory,
        },
      })
    } else {
      templateRecord = await db.whatsAppTemplate.create({
        data: {
          name: cleanName,
          category: dbCategory,
          content: contentToStore,
          branchId: branchId || null,
        },
      })
    }

    return {
      ok: true,
      template: templateRecord,
      metaStatus: initialStatus,
      metaId,
      message:
        initialStatus === "APPROVED"
          ? "¡Plantilla aprobada instantáneamente por Meta! Ya está disponible para difusiones."
          : "Plantilla enviada exitosamente a Meta. Está en revisión (PENDING). Por políticas de Meta, no se podrá enviar en difusiones hasta ser aprobada.",
    }
  } catch (err: any) {
    return {
      ok: false,
      error: "Error de red al conectar con Meta Graph API: " + err.message,
    }
  }
}

/**
 * Elimina una plantilla en Meta y en la base de datos local
 */
export async function deleteMetaCloudTemplate(templateId: string, branchId?: string | null) {
  const template = await db.whatsAppTemplate.findUnique({
    where: { id: templateId },
  })

  if (!template) {
    return { ok: false, error: "Plantilla no encontrada" }
  }

  // Extraer metadata si es de Meta
  const metaMatch = template.content.match(/<!--meta:(\{.*?\})-->/)
  let metaName: string | null = null
  if (metaMatch) {
    try {
      metaName = JSON.parse(metaMatch[1]).name
    } catch {}
  } else if (/^[a-z0-9_]+$/.test(template.name)) {
    metaName = template.name
  }

  // Si tiene nombre en Meta y credenciales, intentar eliminar de Meta
  if (metaName) {
    try {
      const config = branchId
        ? await db.whatsAppConfig.findUnique({ where: { branchId } })
        : await db.whatsAppConfig.findFirst()
      const rawToken = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
      const phoneId = config?.metaPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
      const token = rawToken ? rawToken.replace(/[\u2022\u2023\u25E6\u2043\u2219•]/g, "").trim() : ""
      if (token && phoneId) {
        const wabaId = await findWabaId(token, phoneId, null, branchId)
        if (wabaId) {
          await fetch(
            `https://graph.facebook.com/v21.0/${wabaId}/message_templates?name=${encodeURIComponent(metaName)}`,
            {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }
          )
        }
      }
    } catch (e) {
      console.warn("[Meta Template DELETE Warning]:", e)
    }
  }

  // Eliminar de base de datos local
  await db.whatsAppTemplate.delete({
    where: { id: templateId },
  })

  return { ok: true, message: "Plantilla eliminada correctamente." }
}
