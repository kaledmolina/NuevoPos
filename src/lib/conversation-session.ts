import { db } from "@/lib/db"

export type ConversationSessionStatus = "abierta" | "pendiente" | "cerrada"

export interface ConversationSession {
  phone: string
  status: ConversationSessionStatus
  openedAt: string
  closedAt: string | null
  closedReason?: "order_created" | "manual" | "inactivity" | "farewell" | null
  lastOrderNumber?: string | null
}

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 60 * 1000 // 3 horas de inactividad cierran la sesión automáticamente

/**
 * Obtiene la sesión actual de conversación para un teléfono
 */
export async function getConversationSession(phone: string): Promise<ConversationSession> {
  const cleanPhone = phone.trim()
  const key = `conv_session:${cleanPhone}`

  try {
    const record = await db.setting.findUnique({
      where: { key },
    })

    if (record?.value) {
      const parsed: ConversationSession = JSON.parse(record.value)

      // Si estaba abierta pero pasaron más de 3 horas desde el último mensaje/apertura, marcar cerrada por inactividad
      if (parsed.status !== "cerrada") {
        const timeSinceOpen = Date.now() - new Date(parsed.openedAt).getTime()
        if (timeSinceOpen > INACTIVITY_TIMEOUT_MS) {
          parsed.status = "cerrada"
          parsed.closedAt = new Date().toISOString()
          parsed.closedReason = "inactivity"
          await db.setting.update({
            where: { key },
            data: { value: JSON.stringify(parsed) },
          }).catch(() => {})
        }
      }

      return parsed
    }
  } catch (err: any) {
    console.warn(`[ConversationSession] Error leyendo sesión de ${cleanPhone}:`, err.message)
  }

  // Si no existe, estado por defecto inicial es abierta
  return {
    phone: cleanPhone,
    status: "abierta",
    openedAt: new Date().toISOString(),
    closedAt: null,
  }
}

/**
 * Abre o asegura una sesión activa cuando llega un mensaje entrante
 */
export async function ensureActiveConversationSession(phone: string): Promise<ConversationSession> {
  const current = await getConversationSession(phone)

  // Si la sesión anterior estaba cerrada, se inicia una NUEVA sesión fresca limpia
  if (current.status === "cerrada") {
    const newSession: ConversationSession = {
      phone: current.phone,
      status: "abierta",
      openedAt: new Date().toISOString(),
      closedAt: null,
      closedReason: null,
      lastOrderNumber: null,
    }

    try {
      await db.setting.upsert({
        where: { key: `conv_session:${current.phone}` },
        update: { value: JSON.stringify(newSession) },
        create: { key: `conv_session:${current.phone}`, value: JSON.stringify(newSession) },
      })
    } catch {
      /* noop */
    }

    return newSession
  }

  return current
}

/**
 * Cierra la sesión de conversación (por pedido completado, despedida o acción manual)
 */
export async function closeConversationSession(
  phone: string,
  reason: "order_created" | "manual" | "inactivity" | "farewell" = "manual",
  orderNumber?: string
): Promise<ConversationSession> {
  const cleanPhone = phone.trim()
  const key = `conv_session:${cleanPhone}`
  const now = new Date().toISOString()

  let current = await getConversationSession(cleanPhone)
  current = {
    ...current,
    status: "cerrada",
    closedAt: now,
    closedReason: reason,
    lastOrderNumber: orderNumber || current.lastOrderNumber || null,
  }

  try {
    await db.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(current) },
      create: { key, value: JSON.stringify(current) },
    })
  } catch (err: any) {
    console.warn(`[ConversationSession] Error cerrando sesión de ${cleanPhone}:`, err.message)
  }

  return current
}

/**
 * Reabre manualmente o cambia de estado una conversación (abierta, pendiente o cerrada)
 */
export async function setConversationSessionStatus(
  phone: string,
  status: ConversationSessionStatus,
  reason?: "manual" | "order_created"
): Promise<ConversationSession> {
  const cleanPhone = phone.trim()
  const key = `conv_session:${cleanPhone}`

  if (status === "cerrada") {
    return closeConversationSession(cleanPhone, reason || "manual")
  }

  const session: ConversationSession = {
    phone: cleanPhone,
    status,
    openedAt: new Date().toISOString(),
    closedAt: null,
    closedReason: null,
  }

  try {
    await db.setting.upsert({
      where: { key },
      update: { value: JSON.stringify(session) },
      create: { key, value: JSON.stringify(session) },
    })
  } catch (err: any) {
    console.warn(`[ConversationSession] Error actualizando estado de ${cleanPhone}:`, err.message)
  }

  return session
}
