import { db } from "@/lib/db"

export interface ClientAiUsageHistoryItem {
  at: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  isFree: boolean
}

export interface ClientAiUsage {
  phone: string
  clientId?: string | null
  clientName?: string | null
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalReplies: number
  estimatedCostUsd: number
  isFreePlan: boolean
  lastModelUsed: string
  lastUsedAt: string
  history?: ClientAiUsageHistoryItem[]
}

/**
 * Calcula el costo estimado en USD según el proveedor y modelo de IA utilizado
 */
export function calculateTokenCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): { costUsd: number; isFree: boolean } {
  const m = (model || "").toLowerCase().trim()

  // 1. Modelos 100% gratuitos (OpenRouter Free Router o variantes :free)
  if (m === "openrouter/free" || m.includes(":free")) {
    return { costUsd: 0, isFree: true }
  }

  // 2. DeepSeek Chat (V3)
  // Entrada: $0.14 por 1M tokens ($0.00000014) | Salida: $0.28 por 1M tokens ($0.00000028)
  if (m.includes("deepseek-chat") || m.includes("deepseek/deepseek-chat")) {
    const cost = (promptTokens * 0.14 + completionTokens * 0.28) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // 3. DeepSeek R1 (Reasoner)
  // Entrada: $0.55 por 1M tokens | Salida: $2.19 por 1M tokens
  if (m.includes("deepseek-reasoner") || m.includes("deepseek-r1")) {
    const cost = (promptTokens * 0.55 + completionTokens * 2.19) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // 4. OpenAI GPT-4o mini
  // Entrada: $0.15 por 1M tokens | Salida: $0.60 por 1M tokens
  if (m.includes("gpt-4o-mini")) {
    const cost = (promptTokens * 0.15 + completionTokens * 0.60) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // 5. Claude 3.5 Haiku
  // Entrada: $0.80 por 1M tokens | Salida: $4.00 por 1M tokens
  if (m.includes("haiku")) {
    const cost = (promptTokens * 0.80 + completionTokens * 4.00) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // 6. Claude 3.5 Sonnet
  // Entrada: $3.00 por 1M tokens | Salida: $15.00 por 1M tokens
  if (m.includes("sonnet")) {
    const cost = (promptTokens * 3.00 + completionTokens * 15.00) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // 7. Meta Llama 3.3 70B
  // Entrada: $0.35 por 1M tokens | Salida: $0.40 por 1M tokens
  if (m.includes("llama-3.3-70b")) {
    const cost = (promptTokens * 0.35 + completionTokens * 0.40) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // 8. OpenAI GPT-4o estándar
  if (m.includes("gpt-4o")) {
    const cost = (promptTokens * 2.50 + completionTokens * 10.00) / 1_000_000
    return { costUsd: Number(cost.toFixed(6)), isFree: false }
  }

  // Fallback estándar para otros modelos de pago (~$0.30 / 1M prompt, $0.60 / 1M completion)
  const cost = (promptTokens * 0.30 + completionTokens * 0.60) / 1_000_000
  return { costUsd: Number(cost.toFixed(6)), isFree: false }
}

/**
 * Registra y acumula el consumo de tokens para un cliente específico
 */
export async function recordClientAiUsage(params: {
  phone: string
  clientId?: string | null
  clientName?: string | null
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}): Promise<ClientAiUsage> {
  const { phone, clientId, clientName, model } = params
  const promptTokens = Math.max(0, Number(params.promptTokens) || 0)
  const completionTokens = Math.max(0, Number(params.completionTokens) || 0)
  const totalTokens = Math.max(0, Number(params.totalTokens) || promptTokens + completionTokens)

  const { costUsd, isFree } = calculateTokenCost(model, promptTokens, completionTokens)
  const settingKey = `ai_usage:${phone}`

  let currentUsage: ClientAiUsage = {
    phone,
    clientId: clientId || null,
    clientName: clientName || null,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalReplies: 0,
    estimatedCostUsd: 0,
    isFreePlan: isFree,
    lastModelUsed: model,
    lastUsedAt: new Date().toISOString(),
    history: [],
  }

  try {
    const existing = await db.setting.findUnique({
      where: { key: settingKey },
    })

    if (existing?.value) {
      try {
        const parsed = JSON.parse(existing.value)
        currentUsage = {
          ...currentUsage,
          ...parsed,
          history: Array.isArray(parsed.history) ? parsed.history : [],
        }
      } catch {
        /* fallback to defaults */
      }
    }
  } catch (err: any) {
    console.warn(`[AI Token Tracker] Error leyendo consumo previo de ${phone}:`, err.message)
  }

  // Acumular
  const updatedUsage: ClientAiUsage = {
    phone,
    clientId: clientId || currentUsage.clientId || null,
    clientName: clientName || currentUsage.clientName || null,
    totalTokens: currentUsage.totalTokens + totalTokens,
    promptTokens: currentUsage.promptTokens + promptTokens,
    completionTokens: currentUsage.completionTokens + completionTokens,
    totalReplies: currentUsage.totalReplies + 1,
    estimatedCostUsd: Number((currentUsage.estimatedCostUsd + costUsd).toFixed(6)),
    isFreePlan: currentUsage.totalReplies === 0 ? isFree : (currentUsage.isFreePlan && isFree),
    lastModelUsed: model,
    lastUsedAt: new Date().toISOString(),
    history: [
      {
        at: new Date().toISOString(),
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        isFree,
      },
      ...(currentUsage.history || []).slice(0, 9), // conservar últimas 10 interacciones
    ],
  }

  try {
    await db.setting.upsert({
      where: { key: settingKey },
      update: { value: JSON.stringify(updatedUsage) },
      create: { key: settingKey, value: JSON.stringify(updatedUsage) },
    })
  } catch (err: any) {
    console.warn(`[AI Token Tracker] Error guardando consumo de ${phone}:`, err.message)
  }

  return updatedUsage
}

/**
 * Obtiene el consumo acumulado de un cliente por su teléfono
 */
export async function getClientAiUsage(phone: string): Promise<ClientAiUsage | null> {
  try {
    const record = await db.setting.findUnique({
      where: { key: `ai_usage:${phone}` },
    })
    if (!record?.value) return null
    return JSON.parse(record.value) as ClientAiUsage
  } catch {
    return null
  }
}

/**
 * Obtiene el ranking de todos los clientes con consumo de tokens de IA
 */
export async function getAllClientsAiUsage(): Promise<{
  clients: ClientAiUsage[]
  summary: {
    totalTokens: number
    promptTokens: number
    completionTokens: number
    totalCostUsd: number
    totalClients: number
    totalReplies: number
    freeModelReplies: number
  }
}> {
  try {
    const records = await db.setting.findMany({
      where: { key: { startsWith: "ai_usage:" } },
    })

    const clients: ClientAiUsage[] = []
    let totalTokens = 0
    let promptTokens = 0
    let completionTokens = 0
    let totalCostUsd = 0
    let totalReplies = 0
    let freeModelReplies = 0

    for (const r of records) {
      try {
        const parsed = JSON.parse(r.value) as ClientAiUsage
        clients.push(parsed)
        totalTokens += parsed.totalTokens || 0
        promptTokens += parsed.promptTokens || 0
        completionTokens += parsed.completionTokens || 0
        totalCostUsd += parsed.estimatedCostUsd || 0
        totalReplies += parsed.totalReplies || 0

        const freeReplies = (parsed.history || []).filter((h) => h.isFree).length
        freeModelReplies += freeReplies
      } catch {
        /* skip invalid json */
      }
    }

    // Ordenar de mayor a menor consumo de tokens
    clients.sort((a, b) => b.totalTokens - a.totalTokens)

    return {
      clients,
      summary: {
        totalTokens,
        promptTokens,
        completionTokens,
        totalCostUsd: Number(totalCostUsd.toFixed(4)),
        totalClients: clients.length,
        totalReplies,
        freeModelReplies,
      },
    }
  } catch (error) {
    console.error("[getAllClientsAiUsage Error]:", error)
    return {
      clients: [],
      summary: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalCostUsd: 0,
        totalClients: 0,
        totalReplies: 0,
        freeModelReplies: 0,
      },
    }
  }
}

/**
 * Restablece a 0 el consumo de tokens de un cliente
 */
export async function resetClientAiUsage(phone: string): Promise<boolean> {
  try {
    await db.setting.delete({
      where: { key: `ai_usage:${phone}` },
    })
    return true
  } catch {
    return false
  }
}
