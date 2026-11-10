import { db, ensureMySqlTextColumns } from "@/lib/db"
import { getDeliveryConfig, resolveDeliveryFee, formatDeliveryPromptContext } from "@/lib/delivery-config"
import { broadcastNewOrderToDrivers, sendTelegramDirect } from "@/lib/telegram-driver"
import {
  ensureActiveConversationSession,
  closeConversationSession,
  getConversationSession,
  setConversationSessionStatus,
} from "@/lib/conversation-session"

export interface BotProcessResult {
  reply: string
  actionTaken?: "order_created" | "stock_checked" | "credit_checked" | "menu_shown" | "registered_client" | "ai_answered" | "order_status_checked"
  orderNumber?: string
  total?: number
  items?: { name: string; quantity: number; subtotal: number }[]
  tokensUsed?: number
  modelUsed?: string
}

/**
 * Palabras comunes y de control conversacional que NO deben ser interpretadas como nombres de productos
 */
export const GENERAL_QUERY_WORDS = new Set([
  "hola", "buenas", "buenos", "dias", "dia", "tardes", "tarde", "noches", "noche",
  "como", "estas", "esta", "estan", "va", "todo", "bien", "amigo", "amiga", "senor", "senora",
  "vecino", "vecina", "cordial", "saludos", "por", "favor", "porfa", "gracias", "muchas",
  "muchisimas", "para", "quiero", "tienen", "tiene", "venden", "vende", "vendes", "hay",
  "que", "cual", "cuales", "productos", "producto", "catalogo", "disponible", "disponibles",
  "lista", "precios", "precio", "costo", "cuanto", "cuantos", "cuantas", "vale", "valen",
  "cuesta", "cuestan", "muestrame", "menu", "servicios", "articulos", "stock", "medicamentos",
  "medicamento", "remedios", "remedio", "droga", "drogas", "farmacia", "drogueria", "tienda",
  "consigues", "consigue", "pides", "pide", "das", "da", "regalas", "regala", "ofreces", "ofrece",
  "manejan", "maneja", "llevas", "lleva", "traes", "trae", "haces", "hace", "enviar", "envias",
  "envia", "mandas", "manda", "pedir", "pido", "comprar", "compro", "ordenar", "recomiendas",
  "recomienda", "casa", "domicilio", "domicilios", "envio", "envios", "mi", "un", "una",
  "unos", "unas", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
  "vender", "saber", "conocer", "informacion", "ayuda", "colaborar", "colaboras", "atencion",
  "si", "no", "nop", "sip", "ok", "dale", "listo", "claro", "bueno", "correcto",
  "efectivo", "transferencia", "nequi", "daviplata", "bancolombia", "tarjeta", "cambio", "billete",
  "direccion", "barrio", "calle", "carrera", "cra", "cll", "av", "apto", "casa", "lote", "manzana",
  "saldo", "deuda", "debo", "cuenta", "fiado", "abono", "pagar", "pago", "cancelo", "cancelar"
])

/**
 * Detecta si el cliente pidió explícitamente un SEGUNDO pedido o pedido adicional distinto.
 */
function isExplicitNewOrderRequest(rawText: string): boolean {
  const norm = (rawText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return /\b(otro\s+pedido|segundo\s+pedido|otra\s+orden|pedido\s+adicional|pedir\s+otro|quiero\s+otro|manda(?:me)?\s+otro|haz(?:me)?\s+otro|nuevo\s+pedido|pedido\s+aparte)\b/i.test(norm)
}

/**
 * Detecta si el mensaje del cliente es una respuesta de seguimiento de pago/billete/confirmación
 * (ej. "Un billete de 20", "monto exacto", "sí", "listo", "efectivo") y NO un nuevo pedido.
 */
function isFollowUpPaymentOrConfirmMessage(rawText: string): boolean {
  const norm = (rawText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  return (
    /\b(billete|cambio|vuelto|vueltos|exacto|monto\s+exacto|justo|cabal|pago\s+con|pagar\s+con|te\s+pago\s+con|efectivo|transferencia|nequi|daviplata|contraentrega)\b/i.test(norm) ||
    /^(?:si|ok|dale|listo|perfecto|claro|gracias|muchas\s+gracias|de\s+\d+|con\s+(?:uno\s+de\s+)?\d+|\$?\s*\d[\d\.,]*\s*(?:mil|k)?|un\s+billete\s+de\s+\d+|uno\s+de\s+\d+)$/i.test(norm)
  )
}

/**
 * Normaliza denominaciones abreviadas de billetes en pesos colombianos (ej: "20" -> 20000 cuando el pedido es >= 1000).
 */
function normalizeCashBillAmount(rawCash: number, orderTotal: number): number {
  if (!Number.isFinite(rawCash) || rawCash <= 0) return 0
  if (rawCash < 500 && orderTotal >= 1000 && [2, 5, 10, 20, 50, 100, 200].includes(Math.round(rawCash))) {
    return Math.round(rawCash) * 1000
  }
  return Math.round(rawCash)
}

function parseCopNumericString(numStr: string): number {
  const cleaned = numStr.trim()
  if (/^\d{1,3}(?:[\.,]\d{3})+$/.test(cleaned)) {
    return parseInt(cleaned.replace(/[\.,]/g, ""), 10) || 0
  }
  return parseFloat(cleaned.replace(/,/g, ".")) || 0
}

/**
 * Extrae monto de billete o pago exacto desde texto natural (ej. "Un billete de 20", "con 50 mil", "monto exacto").
 */
function parseCashBillFromText(rawText: string, orderTotal: number): { detected: boolean; isExact: boolean; amount: number } {
  const clean = (rawText || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  if (!clean) return { detected: false, isExact: false, amount: 0 }

  // Excluir dosis médicas (ej. "500mg", "100ml")
  if (/\d+\s*(?:mg|ml|mcg|ui|%)/i.test(clean)) {
    return { detected: false, isExact: false, amount: 0 }
  }

  if (/\b(monto\s+exacto|pago\s+exacto|exacto|sin\s+cambio|no\s+necesito\s+cambio|no\s+requiero\s+cambio|cabal|lo\s+justo)\b/i.test(clean)) {
    return { detected: true, isExact: true, amount: orderTotal }
  }

  const milMatch = clean.match(/\b(\d[\d\.,]*)\s*(?:mil|k)\b/i)
  if (milMatch) {
    const val = Math.round(parseCopNumericString(milMatch[1]) * 1000)
    if (val > 0) return { detected: true, isExact: false, amount: val }
  }

  const cashPrefixMatch = clean.match(
    /(?:billete\s+de|un\s+billete\s+de|uno\s+de|pago\s+con|pagar\s+con|pagare\s+con|con\s+(?:uno\s+de)?|con\s+billete\s+de|con)\s*\$?\s*(\d[\d\.,]*)/i
  )
  if (cashPrefixMatch) {
    const rawVal = parseCopNumericString(cashPrefixMatch[1])
    const norm = normalizeCashBillAmount(rawVal, Math.max(orderTotal, 1000))
    if (norm >= 1000) {
      return { detected: true, isExact: false, amount: norm }
    }
  }

  const pureAmountMatch = clean.match(/^[\s\$]*(\d[\d\.,]*)[\s\.\!]*$/i)
  if (pureAmountMatch) {
    const rawVal = parseCopNumericString(pureAmountMatch[1])
    const norm = normalizeCashBillAmount(rawVal, Math.max(orderTotal, 1000))
    if (norm >= 2000) {
      return { detected: true, isExact: false, amount: norm }
    }
  }

  return { detected: false, isExact: false, amount: 0 }
}

/**
 * Construye la nota legible de cobro y cambio para deliveryNotes.
 */
function buildPaymentDeliveryNote(
  method: string,
  total: number,
  subtotal: number,
  deliveryFee: number,
  cashPaid?: number,
  isExactCash?: boolean
): string {
  const isTransfer = method === "transferencia"
  if (isTransfer) {
    return `💳 Pago por Transferencia: Pendiente verificar comprobante por $${total.toLocaleString("es-CO")}. Una vez verificado por caja, el repartidor no cobra ($0).`
  }

  const normalizedCash = cashPaid ? normalizeCashBillAmount(cashPaid, total) : 0
  if (normalizedCash > total) {
    const cambio = normalizedCash - total
    return `💵 Pago en Efectivo: Paga con $${normalizedCash.toLocaleString("es-CO")} (Llevar cambio de $${cambio.toLocaleString("es-CO")}). Cobrar $${total.toLocaleString("es-CO")} contraentrega.`
  }
  if (isExactCash || (normalizedCash > 0 && normalizedCash === total)) {
    return `💵 Pago en Efectivo: Paga con monto exacto ($${total.toLocaleString("es-CO")}). Cobrar contraentrega ($${subtotal.toLocaleString("es-CO")} productos + $${deliveryFee.toLocaleString("es-CO")} envío).`
  }
  return `💵 Pago en Efectivo: Cobrar $${total.toLocaleString("es-CO")} contraentrega ($${subtotal.toLocaleString("es-CO")} productos + $${deliveryFee.toLocaleString("es-CO")} envío).`
}

/**
 * Actualiza únicamente las líneas de pago en deliveryNotes preservando coordenadas GPS u otras notas.
 */
function mergePaymentIntoDeliveryNotes(
  existingNotes: string | null | undefined,
  newPaymentNote: string,
  extraNote?: string
): string {
  const preservedLines = (existingNotes || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("💵 Pago en Efectivo:") && !l.startsWith("💳 Pago por Transferencia:"))

  const parts = [newPaymentNote, ...preservedLines]
  if (extraNote && extraNote.trim()) {
    parts.push(`📝 Nota: ${extraNote.trim()}`)
  }
  return parts.join("\n")
}

/**
 * Si un pedido actualizado ya tenía un domiciliario asignado con Telegram, le notifica el nuevo detalle de pago/cambio.
 */
async function notifyAssignedDriverPaymentUpdate(
  order: { orderNumber: string; branchId: string | null; deliveryDriverId: string | null; total: number; paymentMethod: string },
  newPaymentNote: string
): Promise<void> {
  if (!order.deliveryDriverId) return
  try {
    const driver = await db.user.findUnique({
      where: { id: order.deliveryDriverId },
      select: { telegramChatId: true },
    })
    if (!driver?.telegramChatId) return

    let config = order.branchId
      ? await db.whatsAppConfig.findUnique({ where: { branchId: order.branchId } })
      : null
    if (!config || !config.telegramBotToken) {
      config = await db.whatsAppConfig.findFirst({
        where: { telegramEnabled: true, telegramBotToken: { not: null } },
      })
    }
    const botToken = config?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) return

    await sendTelegramDirect(
      botToken,
      driver.telegramChatId,
      `🔄 *ACTUALIZACIÓN DE PAGO — Orden #${order.orderNumber}*\n\n${newPaymentNote}`
    )
  } catch (err) {
    console.warn("[notifyAssignedDriverPaymentUpdate warning]:", err)
  }
}

/**
 * Detecta si un mensaje es ajeno a la actividad comercial de la tienda
 * (cálculos matemáticos, tareas, chistes, preguntas de cultura general, etc.)
 * para rechazarlo de inmediato sin gastar tokens ni llamar a la API LLM.
 */
export function detectOffTopicQuery(message: string): { isOffTopic: boolean; reason?: string } {
  const text = (message || "").trim()
  if (!text) return { isOffTopic: false }

  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

  // Si contiene palabras comerciales explícitas o de compra, NO es off-topic
  const commercialKeywords = [
    "precio", "precios", "costo", "costos", "cuanto vale", "cuanto cuesta", "cuanto cobran",
    "domicilio", "domicilios", "envio", "envios", "entrega", "pedido", "pedidos", "orden",
    "comprar", "compro", "quiero", "necesito", "tienen", "venden", "vende", "hay",
    "disponible", "disponibles", "catalogo", "menu", "stock", "medicamento", "pastilla",
    "jarabe", "droga", "farmacia", "tienda", "direccion", "barrio", "efectivo", "transferencia",
    "nequi", "daviplata", "bancolombia", "fiado", "deuda", "abono", "saldo", "cuenta"
  ]

  const hasCommercialContext = commercialKeywords.some((kw) => clean.includes(kw))

  // 1. Detección de operaciones matemáticas / cálculos numéricos
  // Ejemplos: "3222 + 6262", "me ayudas con una suma 3222 + 6262", "cuanto es 50 * 30", "calcula 100 / 5"
  const isMathOperation =
    // Palabras explícitas de cálculo matemático acompañadas de números u operadores
    /(?:ayuda(?:me|s)?\s*(?:con)?\s*(?:un[a]?\s*)?(?:suma|resta|multiplicacion|division|calculo|operacion))|(?:(?:cuanto\s+(?:es|da)|calcula(?:r)?|resuelve)\s+[\d\.,\s\+\-\*\/xX÷]+)/i.test(clean) ||
    // Operaciones aritméticas explícitas entre dos números (sin contexto comercial)
    (/\b\d+(?:[\.,]\d+)?\s*[\+\*\/÷xX]\s*\d+(?:[\.,]\d+)?\b/i.test(clean) && !hasCommercialContext) ||
    // Expresión puramente matemática e.g. "3222 + 6262 = ?" o "1500 - 300"
    (/^\s*[\d\.,\s\+\-\*\/xX÷=]+\s*$/.test(clean) && /[\+\*\/÷=]/.test(clean))

  if (isMathOperation && !hasCommercialContext) {
    return { isOffTopic: true, reason: "math_calculation" }
  }

  // 2. Solicitudes de tareas, poemas, cartas, ensayos, historias, chistes, código
  const isCreativeOrAcademic =
    /\b(?:hazme|escribe(?:me)?|redacta|crea(?:me)?)\s+(?:un[a]?\s+)?(?:poema|carta|cancion|cuento|ensayo|resumen|tarea|codigo|script|novela|verso)\b/i.test(clean) ||
    /\b(?:ayuda(?:me)?\s+con\s+(?:mi\s+)?(?:tarea|ensayo|examen|codigo))\b/i.test(clean) ||
    /\b(?:cuentame|dime)\s+(?:un\s+)?(?:chiste|adivinanza|historia|acertijo)\b/i.test(clean)

  if (isCreativeOrAcademic) {
    return { isOffTopic: true, reason: "creative_academic" }
  }

  // 3. Cultura general, política, cocina/recetas, traducción, horóscopos ajenos a la tienda
  const isGeneralTrivia =
    /\bquien\s+(?:fue|es|descubrio|invento|gano|creo|gobierna|preside)\b/i.test(clean) ||
    /\bcapital\s+de\s+[a-z]+/i.test(clean) ||
    /\b(?:receta\s+de\s+|como\s+(?:cocinar|hacer)\s+(?!suero|gasa))\b/i.test(clean) ||
    /\b(?:traduce\s+|traduccion\s+(?:de|al)|que\s+significa\s+en\s+ingles)\b/i.test(clean) ||
    /\b(?:horoscopo|pronostico\s+del\s+tiempo|clima\s+(?:de\s+hoy|en\s+|para\s+hoy))\b/i.test(clean)

  if (isGeneralTrivia && !hasCommercialContext) {
    return { isOffTopic: true, reason: "general_trivia" }
  }

  return { isOffTopic: false }
}

/**
 * Sanitiza la respuesta del LLM para evitar fugas de razonamiento interno (Chain of Thought),
 * etiquetas <think>, o listas de pasos tipo "1. **Analyze the user's input:**",
 * y bloquea cuentas bancarias inventadas o respuestas de cálculos matemáticos.
 */
function sanitizeBotReply(reply: string, clientName?: string, activeOrder?: any): string {
  let cleaned = (reply || "").trim()

  // 1. Eliminar etiquetas <think>...</think> o <think> sin cerrar
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "")
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, "")

  // 2. Detectar si el modelo generó formato de razonamiento / Chain-of-Thought (ej: 1. **Analyze... 2. Check catalog...)
  const isReasoningLeak =
    /(?:^|\n)(?:\d+\.\s*\*\*(?:Analyze|Check|Evaluate|Formulate|Reasoning)|(?:\*\*(?:Thinking Process|Analysis|Razonamiento|Análisis)\*\*)|(?:\*Rule\s*\d+:))/i.test(cleaned)

  if (isReasoningLeak) {
    // Si el modelo puso la respuesta final al final (ej: "Omnipos: ...", "Respuesta: ...", "Bot: ...")
    const matchExplicitReply = cleaned.match(/(?:Omnipos|Bot|Asistente|Respuesta(?: al cliente)?):\s*([\s\S]+)$/i)
    if (matchExplicitReply && matchExplicitReply[1].trim()) {
      cleaned = matchExplicitReply[1].trim()
    } else {
      // Intentar extraer el último bloque que no sea parte de la lista de pasos analíticos
      const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      const nonStepParagraphs = paragraphs.filter(
        (p) => !/^(?:\d+\.\s*\*|\*Rule|\*\*Analyze|\*\*Check|\*\*Evaluate|\*\*Formulate|\* Politely|\* Suggest|\* Keep|\* Current real-time|\* Check the catalog|\* Evaluate against|\* Formulate response)/i.test(p)
      )
      if (nonStepParagraphs.length > 0) {
        cleaned = nonStepParagraphs[nonStepParagraphs.length - 1]
      } else {
        // Si todo el texto era exclusivamente razonamiento sin respuesta conversacional:
        if (activeOrder && activeOrder.orderNumber) {
          cleaned = `Tu pedido #${activeOrder.orderNumber} se encuentra registrado en estado pendiente. Un asesor de nuestro equipo confirmará tu pedido para su despacho.`
        } else {
          cleaned = `¡Hola${clientName ? ` ${clientName}` : ""}! Con gusto te colaboramos con tu pedido o consulta. ¿Qué producto necesitas a domicilio?`
        }
      }
    }
  }

  // 3. Limpiar cualquier resto de "Omnipos:", "Bot:" al principio del mensaje
  cleaned = cleaned.replace(/^(?:Omnipos|Bot|Asistente|Respuesta):\s*/i, "").trim()

  // 4. Bloqueo de Cuentas Bancarias Inventadas:
  // Si el modelo alucina números de cuenta falsos o placeholders (ej: 300 123 4567, 123-456789-00),
  // se reemplazan por la indicación oficial de que un asesor humano entregará los datos.
  if (/(?:nequi|daviplata|bancolombia|cuenta|ahorros)[\s\S]*?(?:300\s*123\s*4567|123-?456789|\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b|\b\d{3}-\d{6}-\d{2}\b)/i.test(cleaned)) {
    cleaned = cleaned.replace(
      /(?:(?:Te comparto los datos|Datos para la transferencia|Nequi|Daviplata|Bancolombia|Cuenta de ahorros)[^\n]*?(?:300\s*123\s*4567|123-?456789|\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b|\b\d{3}-\d{6}-\d{2}\b)[^\n]*\n?)+/gi,
      "Un asesor humano de nuestro equipo se comunicará por este chat en breve para compartirte los datos oficiales de la cuenta para que puedas realizar la transferencia.\n"
    )
  }

  // 5. Bloqueo de Respuestas Matemáticas Accidentales:
  if (/(?:\d+\s*[\+\-\*\/xX÷]\s*\d+\s*=\s*\*\*?\d+\*\*?)|(?:=\s*\*\*?\d+\*\*?\s*\n*\s*¿Te colaboro)/i.test(cleaned)) {
    cleaned = `Disculpa${clientName ? ` ${clientName}` : ""}, como asesor comercial solo puedo ayudarte con información de nuestros productos, precios y pedidos de la tienda. 😊 ¿En qué producto te podemos colaborar?`
  }

  return cleaned
}

// Cola de procesamiento secuencial para atención "uno a uno" similar a un humano
interface QueuedMessageTask {
  params: {
    phone: string
    customerName?: string
    message: string
    branchId?: string | null
    channel?: "whatsapp" | "telegram"
  }
  resolve: (res: BotProcessResult) => void
  reject: (err: any) => void
}

const messageQueue: QueuedMessageTask[] = []
let isQueueProcessing = false

async function runQueueWorker() {
  if (isQueueProcessing) return
  isQueueProcessing = true

  while (messageQueue.length > 0) {
    const task = messageQueue.shift()
    if (!task) break

    try {
      // Espaciado humano entre respuestas (1.2s) para dar tiempo natural de lectura y proteger cuota de API
      await new Promise((r) => setTimeout(r, 1200))
      const res = await executeWhatsAppMessage(task.params)
      task.resolve(res)
    } catch (err) {
      task.reject(err)
    }
  }

  isQueueProcessing = false
}

/**
 * Punto de entrada público: encola peticiones concurrentes para atender "uno a uno"
 * Los chats en espera quedan marcados en estado "pendiente" en el CRM
 */
export async function processWhatsAppMessage(params: {
  phone: string
  customerName?: string
  message: string
  branchId?: string | null
  channel?: "whatsapp" | "telegram"
}): Promise<BotProcessResult> {
  const { phone, channel } = params
  const isTelegram = channel === "telegram" || phone.startsWith("tg_")
  const cleanPhone = isTelegram ? (phone.startsWith("tg_") ? phone : `tg_${phone}`) : phone.replace(/[^0-9+]/g, "")

  // 1. Asegurar sesión activa y marcar de inmediato como "pendiente" mientras está en espera
  try {
    await ensureActiveConversationSession(cleanPhone)
    await setConversationSessionStatus(cleanPhone, "pendiente")
  } catch {
    /* noop */
  }

  // 2. Procesar secuencialmente en la cola
  return new Promise<BotProcessResult>((resolve, reject) => {
    messageQueue.push({ params, resolve, reject })
    runQueueWorker()
  })
}

/**
 * Motor de Inteligencia de WhatsApp & DeepSeek para OmniPOS
 * Multi-Sede: Opera con el catálogo, inventario, precios y pedidos exclusivos de la sede vinculada.
 */
async function executeWhatsAppMessage(params: {
  phone: string
  customerName?: string
  message: string
  branchId?: string | null
  channel?: "whatsapp" | "telegram"
}): Promise<BotProcessResult> {
  const { phone, message, branchId, channel } = params
  const isTelegram = channel === "telegram" || phone.startsWith("tg_")
  const cleanPhone = isTelegram ? (phone.startsWith("tg_") ? phone : `tg_${phone}`) : phone.replace(/[^0-9+]/g, "")
  const effectiveChannel = isTelegram ? "telegram" : "whatsapp"
  const text = message.trim()

  // Asegurar compatibilidad de columnas TEXT en MySQL (evitar VARCHAR(191))
  await ensureMySqlTextColumns().catch(() => {})

  // 1. Identificar la Sede y su Configuración
  let resolvedBranchId = branchId
  if (!resolvedBranchId) {
    const mainBranch = await db.branch.findFirst({
      where: { active: true },
      orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
    })
    resolvedBranchId = mainBranch?.id || null
  }

  const branch = resolvedBranchId
    ? await db.branch.findUnique({
        where: { id: resolvedBranchId },
        include: { whatsappConfig: true },
      })
    : null

  const config = branch?.whatsappConfig
  const branchFilter = resolvedBranchId ? { branchId: resolvedBranchId } : {}

  // 1.1 Obtener configuración oficial de tarifas de domicilio para esta sede
  const deliveryConfig = await getDeliveryConfig(resolvedBranchId)

  // 2. Identificar o registrar cliente en el CRM de esta sede
  let client = await db.client.findFirst({
    where: {
      OR: [
        { phone: cleanPhone },
        ...(isTelegram ? [] : [{ phone: cleanPhone.replace("+", "") }]),
      ],
      ...branchFilter,
    },
    include: { creditAccount: true },
  })

  if (!client) {
    client = await db.client.create({
      data: {
        name: params.customerName || (isTelegram ? `Usuario Telegram (@${cleanPhone.replace("tg_", "")})` : `Cliente WhatsApp (${cleanPhone.slice(-4)})`),
        phone: cleanPhone,
        branchId: resolvedBranchId,
        creditAccount: {
          create: {
            active: false,
            creditLimit: 0,
            balance: 0,
          },
        },
      },
      include: { creditAccount: true },
    })
  }

  // 0. Asegurar sesión activa de conversación (Estrategia Abrir / Cerrar Conversación)
  // Si la conversación anterior fue concluida o cerrada, este nuevo mensaje abre una nueva sesión limpia
  await ensureActiveConversationSession(cleanPhone)

  // Guardar mensaje entrante del cliente en el CRM
  try {
    await db.whatsAppMessage.create({
      data: {
        phone: cleanPhone,
        sender: "customer",
        text: message,
        status: "unread",
        branchId: resolvedBranchId,
        clientId: client.id,
        channel: effectiveChannel,
      },
    })
  } catch (crmSaveErr) {
    console.error("[WhatsApp CRM Save Inbound Error]:", crmSaveErr)
  }

  // 0.1 BLINDAJE ANTI-DESPERDICIO DE TOKENS (Off-Topic Pre-Filter)
  // Rechazar de inmediato preguntas no comerciales (cálculos matemáticos, poemas, tareas, chistes, etc.)
  // sin gastar tokens en DeepSeek / OpenRouter y protegiendo el rol de ventas.
  const offTopicCheck = detectOffTopicQuery(text)
  if (offTopicCheck.isOffTopic) {
    const branchName = branch?.name || "nuestra tienda"
    const politeRedirect = `Disculpa${client.name ? ` ${client.name}` : ""}, como asesor comercial de ${branchName} mi función es exclusivamente orientarte sobre nuestros productos, precios, domicilios y toma de pedidos. 😊 ¿En qué producto o medicamento te podemos colaborar hoy?`

    // Guardar respuesta del bot en el CRM
    try {
      await db.whatsAppMessage.create({
        data: {
          phone: cleanPhone,
          sender: "bot",
          text: politeRedirect,
          status: "delivered",
          branchId: resolvedBranchId,
          clientId: client.id,
          channel: effectiveChannel,
        },
      })
    } catch {
      /* noop */
    }

    try {
      const currentSession = await getConversationSession(cleanPhone)
      if (currentSession.status === "pendiente") {
        await setConversationSessionStatus(cleanPhone, "abierta")
      }
    } catch {
      /* noop */
    }

    return {
      reply: politeRedirect,
      actionTaken: "ai_answered",
      tokensUsed: 0,
      modelUsed: "guardrail:off_topic_shield",
    }
  }

  let result: BotProcessResult | null = null
  let createdOrderId: string | null = null

  // 3. INTENTO 1: Si la IA (OpenRouter o DeepSeek) está habilitada y tiene API Key (en BD o en variables de entorno)
  const openrouterKey = config?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || ""
  const deepseekKey = config?.deepseekApiKey?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || ""
  const isOpenerConfigured = config?.aiProvider === "openrouter" ? !!openrouterKey : !deepseekKey && !!openrouterKey
  const isDeepSeekConfigured = config?.aiProvider === "deepseek" ? !!deepseekKey : !openrouterKey && !!deepseekKey
  const hasAnyAiKey = !!openrouterKey || !!deepseekKey
  const aiEnabled = config?.aiEnabled ?? true

  // Intentar pasar por LLM; si devuelve pedido creado, aseguramos sesión actualizada con último número de orden
  if (aiEnabled && hasAnyAiKey) {
    try {
      result = await processWithLLMAI({
        message,
        cleanPhone,
        client,
        branch,
        config: {
          ...config,
          openrouterApiKey: openrouterKey,
          deepseekApiKey: deepseekKey,
        },
        channel: effectiveChannel,
      })
      if (result && result.orderNumber) {
        // Encontrar el ID de la orden creada o actualizada para vincularla al mensaje
        const ord = await db.order.findUnique({
          where: { orderNumber: result.orderNumber },
          select: { id: true },
        })
        if (ord) createdOrderId = ord.id
        if (result.actionTaken === "order_created") {
          await closeConversationSession(cleanPhone, "order_created", result.orderNumber).catch(() => {})
        }
      }
    } catch (aiErr) {
      console.warn("[LLM AI Fallback to Local Engine]", (aiErr as Error).message)
      // Si falla el proveedor principal (ej. token agotado, timeout o red), continúa al motor local abajo
      result = null
    }
  }

  // 4. INTENTO 2: Motor Local (Fallback y Reglas Deterministas con Memoria de Conversación)
  if (!result) {
    const lowerText = text.toLowerCase()
    const cleanLowerText = lowerText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

    const session = await getConversationSession(cleanPhone)
    const sessionStart = session.status !== "cerrada" && session.openedAt
      ? new Date(session.openedAt)
      : new Date(Date.now() - 3 * 60 * 60 * 1000)

    // Consultar el último mensaje del bot de la sesión activa para reconstruir el estado de la conversación
    const lastBotMsg = await db.whatsAppMessage.findFirst({
      where: {
        phone: cleanPhone,
        sender: "bot",
        createdAt: { gte: sessionStart },
      },
      orderBy: { createdAt: "desc" },
    })
    const lastBotText = (lastBotMsg?.text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const deliveryConfig = await getDeliveryConfig(resolvedBranchId || undefined)

    // Regla 0.0: Anti-Duplicado — Si el cliente ya tiene un pedido activo reciente (< 30 min)
    // y envía el monto del billete ("Un billete de 20", "monto exacto") o confirmación, actualizar ESE pedido en lugar de duplicar.
    if (!isExplicitNewOrderRequest(text)) {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
      const recentActiveOrder = await db.order.findFirst({
        where: {
          OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
          ...branchFilter,
          status: { in: ["pendiente", "confirmado", "en_preparacion", "en_camino"] },
          paymentStatus: { not: "pagado" },
          createdAt: { gte: thirtyMinutesAgo },
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      })

      if (recentActiveOrder) {
        const cashBill = parseCashBillFromText(text, recentActiveOrder.total)
        if (cashBill.detected) {
          const newPaymentNote = buildPaymentDeliveryNote(
            "efectivo",
            recentActiveOrder.total,
            recentActiveOrder.subtotal,
            recentActiveOrder.deliveryFee,
            cashBill.isExact ? undefined : cashBill.amount,
            cashBill.isExact
          )
          const updatedNotes = mergePaymentIntoDeliveryNotes(recentActiveOrder.deliveryNotes, newPaymentNote)

          await db.order.update({
            where: { id: recentActiveOrder.id },
            data: {
              paymentMethod: "efectivo",
              deliveryNotes: updatedNotes,
            },
          })

          notifyAssignedDriverPaymentUpdate(recentActiveOrder, newPaymentNote).catch(() => {})
          createdOrderId = recentActiveOrder.id

          const changeAmount = !cashBill.isExact && cashBill.amount > recentActiveOrder.total
            ? cashBill.amount - recentActiveOrder.total
            : 0
          const cashLine = cashBill.isExact
            ? `💵 Pago registrado con *monto exacto* ($${recentActiveOrder.total.toLocaleString("es-CO")}).`
            : changeAmount > 0
              ? `💵 Pagas con *$${cashBill.amount.toLocaleString("es-CO")}* → **Cambio: $${changeAmount.toLocaleString("es-CO")}**`
              : `💵 Total a cobrar contraentrega: *$${recentActiveOrder.total.toLocaleString("es-CO")}*.`

          result = {
            reply: `✅ ¡Perfecto! Actualicé tu pedido *#${recentActiveOrder.orderNumber}*:\n\n${cashLine}\n\n¡Ya quedó listo para el domiciliario! 😊`,
            actionTaken: "ai_answered",
            orderNumber: recentActiveOrder.orderNumber,
            total: recentActiveOrder.total,
          }
        } else if (
          Date.now() - new Date(recentActiveOrder.createdAt).getTime() <= 5 * 60 * 1000 &&
          /^(si|claro|dale|ok|listo|perfecto|correcto|efectivo|contraentrega|transferencia|nequi|daviplata|super|vale|bueno)$/i.test(cleanLowerText)
        ) {
          createdOrderId = recentActiveOrder.id
          result = {
            reply: `✅ Tu pedido *#${recentActiveOrder.orderNumber}* por *$${recentActiveOrder.total.toLocaleString("es-CO")}* ya se encuentra registrado en estado *${recentActiveOrder.status.toUpperCase()}*. ¡En breve coordinamos tu entrega! 😊`,
            actionTaken: "ai_answered",
            orderNumber: recentActiveOrder.orderNumber,
            total: recentActiveOrder.total,
          }
        }
      }
    }

    // Regla 0.1: Cliente elige método de pago ("Efectivo", "Transferencia", "Nequi") o responde cambio tras cotización
    const thirtyMinMsgs = !result
      ? await db.whatsAppMessage.findMany({
          where: {
            phone: cleanPhone,
            sender: "bot",
            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
          },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: { text: true },
        })
      : []
    const recentBotCombined = thirtyMinMsgs
      .map((m) => (m.text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      .join("\n")
    const cashReplyInfo = parseCashBillFromText(text, 10000)

    const isPaymentResponse =
      /^(efectivo|transferencia|nequi|daviplata|contraentrega|pago en efectivo|por transferencia|en efectivo|transfer)$/i.test(cleanLowerText) ||
      (cleanLowerText.length < 30 && (cleanLowerText.includes("efectivo") || cleanLowerText.includes("transfer") || cleanLowerText.includes("nequi") || cleanLowerText.includes("davi")))

    const isAwaitingPayment =
      lastBotText.includes("prefieres") ||
      lastBotText.includes("total a pagar") ||
      lastBotText.includes("cancelar:") ||
      lastBotText.includes("contraentrega o por transferencia") ||
      lastBotText.includes("efectivo contraentrega")

    const isAwaitingChangeQuestion =
      cashReplyInfo.detected &&
      (recentBotCombined.includes("monto exacto") || recentBotCombined.includes("requieres cambio") || recentBotCombined.includes("necesitas cambio") || recentBotCombined.includes("billete"))

    const botQuoteSource = isAwaitingChangeQuestion ? recentBotCombined : lastBotText

    if (!result && ((isPaymentResponse && isAwaitingPayment) || isAwaitingChangeQuestion)) {
      const isTransfer = cleanLowerText.includes("transf") || cleanLowerText.includes("nequi") || cleanLowerText.includes("davi")
      const paymentMethod = isTransfer ? "transferencia" : "efectivo"

      // Extraer total y costo de envío de la cotización previa del bot
      const totalMatch = botQuoteSource.match(/total[^\$\d]*\$\s*([\d\.,]+)/i)
      const deliveryMatch = botQuoteSource.match(/env[ií]o[^\$\d]*\$\s*([\d\.,]+)/i) || botQuoteSource.match(/domicilio[^\$\d]*\$\s*([\d\.,]+)/i)

      let total = 0
      if (totalMatch) {
        total = parseFloat(totalMatch[1].replace(/\./g, "").replace(/,/g, ".")) || 0
      }

      let deliveryFee = 0
      if (deliveryMatch) {
        deliveryFee = parseFloat(deliveryMatch[1].replace(/\./g, "").replace(/,/g, ".")) || 0
      }
      if (deliveryFee <= 0) {
        deliveryFee = deliveryConfig.globalFee || 5000
      }

      const allActiveProds = await db.product.findMany({
        where: { active: true, ...branchFilter },
        select: { id: true, name: true, price: true, stock: true, unit: true },
      })

      // Buscar qué producto(s) estaban en la cotización
      const itemsToCreate: { product: any; qty: number }[] = []
      for (const p of allActiveProds) {
        const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        if (botQuoteSource.includes(pNorm)) {
          let qty = 1
          const escapedPrefix = pNorm.slice(0, 6).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const qMatch = botQuoteSource.match(new RegExp(`(\\d+)\\s*x\\s*${escapedPrefix}`, "i"))
          if (qMatch) qty = parseInt(qMatch[1], 10) || 1
          itemsToCreate.push({ product: p, qty })
        }
      }

      // Si no coincidió por nombre completo, buscar por palabra clave principal
      if (itemsToCreate.length === 0) {
        for (const p of allActiveProds) {
          const pWords = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((w) => w.length >= 4)
          if (pWords.some((w) => botQuoteSource.includes(w))) {
            itemsToCreate.push({ product: p, qty: 1 })
            break
          }
        }
      }

      if (itemsToCreate.length > 0) {
        const subtotal = itemsToCreate.reduce((acc, it) => acc + it.product.price * it.qty, 0)
        if (total <= 0) total = subtotal + deliveryFee

        const parsedBill = parseCashBillFromText(text, total)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
        const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
        const genOrderNum = `PED-${dateStr}-${randomSuffix}`
        const finalAddress = client.address || (isTelegram ? "Dirección confirmada según Telegram" : "Dirección confirmada según WhatsApp")

        const paymentNote = buildPaymentDeliveryNote(
          paymentMethod,
          total,
          subtotal,
          deliveryFee,
          parsedBill.detected && !parsedBill.isExact ? parsedBill.amount : undefined,
          parsedBill.detected && parsedBill.isExact
        )

        const totalFormatted = `$${total.toLocaleString("es-CO")}`
        const isExplicitRepeat = isExplicitNewOrderRequest(text)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
        const duplicateExisting = !isExplicitRepeat
          ? await db.order.findFirst({
              where: {
                OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
                ...branchFilter,
                status: { not: "cancelado" },
                createdAt: { gte: fifteenMinutesAgo },
              },
              include: { items: true },
              orderBy: { createdAt: "desc" },
            })
          : null

        const newSig = itemsToCreate.map((it) => `${it.product.id}:${it.qty}`).sort().join("|")
        const dupSig = duplicateExisting
          ? duplicateExisting.items.map((it) => `${it.productId}:${it.quantity}`).sort().join("|")
          : ""

        if (duplicateExisting && dupSig === newSig) {
          if (parsedBill.detected && duplicateExisting.paymentStatus !== "pagado" && duplicateExisting.status !== "entregado") {
            const updatedNotes = mergePaymentIntoDeliveryNotes(duplicateExisting.deliveryNotes, paymentNote)
            await db.order.update({
              where: { id: duplicateExisting.id },
              data: { deliveryNotes: updatedNotes },
            })
            notifyAssignedDriverPaymentUpdate(duplicateExisting, paymentNote).catch(() => {})
          }
          createdOrderId = duplicateExisting.id
          result = {
            reply: `✅ Tu pedido *#${duplicateExisting.orderNumber}* ya estaba registrado por *${totalFormatted}*. ¡En breve coordinamos el despacho! 😊`,
            actionTaken: "ai_answered",
            orderNumber: duplicateExisting.orderNumber,
            total: duplicateExisting.total,
          }
        } else {
        const createdOrder = await db.order.create({
          data: {
            orderNumber: genOrderNum,
            tenantId: branch?.tenantId || null,
            branchId: resolvedBranchId,
            clientId: client.id,
            customerName: client.name,
            customerPhone: cleanPhone,
            deliveryAddress: finalAddress,
            deliveryNotes: paymentNote,
            notes: `Generado automáticamente por WhatsApp (${branch?.name || "Sede"}). Confirmación directa de pago ${paymentMethod}.`,
            subtotal,
            tax: 0,
            deliveryFee,
            total,
            paymentMethod,
            paymentStatus: "pendiente",
            status: "pendiente",
            items: {
              create: itemsToCreate.map((it) => ({
                productId: it.product.id,
                productName: it.product.name,
                quantity: it.qty,
                unitPrice: it.product.price,
                subtotal: it.product.price * it.qty,
              })),
            },
          },
        })

        createdOrderId = createdOrder.id
        broadcastNewOrderToDrivers(createdOrder.id).catch(() => {})
        await closeConversationSession(cleanPhone, "order_created", createdOrder.orderNumber)

        const itemsSummary = itemsToCreate
          .map((it) => `• ${it.qty}x *${it.product.name}* ($${(it.qty * it.product.price).toLocaleString("es-CO")})`)
          .join("\n")
        const feeLine = deliveryFee > 0 ? `\n🛵 *Costo Domicilio:* $${deliveryFee.toLocaleString("es-CO")}` : ""
        const cambioCalc = parsedBill.detected && !parsedBill.isExact && parsedBill.amount > total ? parsedBill.amount - total : 0
        const paymentSummary = isTransfer
          ? "💳 *Método de Pago:* Transferencia previa (Un asesor humano de nuestro equipo se comunicará por este chat en breve para compartirte los datos oficiales de la cuenta y validar tu comprobante para confirmar el pedido)"
          : cambioCalc > 0
            ? `💵 *Método de Pago:* Efectivo contraentrega — Pagas con *$${parsedBill.amount.toLocaleString("es-CO")}* → **Cambio: $${cambioCalc.toLocaleString("es-CO")}**`
            : `💵 *Método de Pago:* Efectivo ($${total.toLocaleString("es-CO")} a cobrar contraentrega)`

        result = {
          reply: `📋 *¡Pedido Registrado con Éxito!*\n🏬 *Sede:* ${branch?.name || "Principal"}\n📦 *Orden:* #${createdOrder.orderNumber}\n👤 *Cliente:* ${client.name}\n📍 *Entrega:* ${finalAddress}\n\n🛒 *Productos:*\n${itemsSummary}${feeLine}\n💵 *Total a Pagar:* *$${total.toLocaleString("es-CO")}*\n${paymentSummary}\n\n⏱️ *Estado:* Pendiente (Un asesor humano validará el pago o confirmará la orden para su despacho).`,
          actionTaken: "order_created",
          orderNumber: createdOrder.orderNumber,
          total: createdOrder.total,
        }
        }
      }
    }

    // Regla 0.2: Cliente indica su dirección o barrio tras consultar producto
    if (!result) {
      const hasAddressWords =
        cleanLowerText.includes("barrio") ||
        cleanLowerText.includes("calle") ||
        cleanLowerText.includes("cra") ||
        cleanLowerText.includes("cll") ||
        cleanLowerText.includes("carrera") ||
        cleanLowerText.includes("manzana") ||
        cleanLowerText.includes("maza") ||
        cleanLowerText.includes("lote") ||
        cleanLowerText.includes("casa") ||
        cleanLowerText.includes("apto") ||
        cleanLowerText.includes("torre") ||
        cleanLowerText.includes("#")

      const isAwaitingAddress =
        lastBotText.includes("direccion") ||
        lastBotText.includes("barrio") ||
        lastBotText.includes("domicilio") ||
        lastBotText.includes("catalogo disponible")

      if (hasAddressWords && isAwaitingAddress) {
        // Actualizar dirección del cliente si no tenía
        if (!client.address || cleanLowerText.length > 8) {
          await db.client.update({
            where: { id: client.id },
            data: { address: text },
          }).catch(() => {})
          client.address = text
        }

        // Detectar si el cliente también indicó cantidad (ej. "Si , 2 barrio el dorado manzana 12")
        const qtyMatch = cleanLowerText.match(/\b([1-9]|10)\b/)
        const requestedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1

        // Buscar qué producto consultó en el mensaje anterior
        const allActiveProds = await db.product.findMany({
          where: { active: true, ...branchFilter },
          select: { id: true, name: true, price: true, stock: true },
        })

        let targetProduct = allActiveProds.find((p) => {
          const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          return lastBotText.includes(pNorm)
        })

        if (!targetProduct) {
          targetProduct = allActiveProds.find((p) => {
            const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4)
            return words.some((w) => lastBotText.includes(w))
          })
        }

        if (targetProduct) {
          const subtotal = targetProduct.price * requestedQty
          const feeRes = resolveDeliveryFee(`${text} ${cleanLowerText}`, deliveryConfig)
          const total = subtotal + feeRes.fee

          result = {
            reply: `¡Perfecto! Te confirmo el pedido para entrega en *${text}*:\n\n• ${requestedQty}x *${targetProduct.name}* = $${subtotal.toLocaleString("es-CO")}\n🛵 *Envío:* $${feeRes.fee.toLocaleString("es-CO")} (${feeRes.appliedRule})\n💵 *Total a pagar:* *$${total.toLocaleString("es-CO")}*\n\n¿Cómo prefieres cancelar: en *efectivo* contraentrega o por *transferencia* previa?`,
            actionTaken: "ai_answered",
          }
        }
      }
    }

    // Regla 0.3: Confirmación afirmativa simple ("Si", "Dale", "Ok", "A esa")
    if (!result) {
      const isAffirmative = /^(si|claro|dale|ok|listo|correcto|a esa|a esa misma|a mi direccion|por favor|confirmo|si por favor)$/i.test(cleanLowerText)
      if (isAffirmative) {
        if (client.address) {
          const feeRes = resolveDeliveryFee(`${client.address} ${cleanLowerText}`, deliveryConfig)
          result = {
            reply: `¡Perfecto! Te lo enviamos a tu dirección registrada (*${client.address}*).\n🛵 *Envío:* $${feeRes.fee.toLocaleString("es-CO")} (${feeRes.appliedRule})\n\n¿Prefieres cancelar en *efectivo* contraentrega o por *transferencia* previa?`,
            actionTaken: "ai_answered",
          }
        } else {
          result = {
            reply: `¡Entendido! Por favor confírmanos a qué dirección y en qué barrio te lo enviamos para calcular el valor del domicilio y despacharte de inmediato.`,
            actionTaken: "ai_answered",
          }
        }
      }
    }

    // Regla 0.4: Despedida y cierre natural de la conversación (Estrategia Chatbot)
    if (!result) {
      const isFarewell = /^(gracias|muchas gracias|muchas gracias por todo|listo gracias|gracias hasta luego|hasta luego|chao|adios|feliz dia|que tengas buen dia|listo muchas gracias)$/i.test(cleanLowerText)
      if (isFarewell) {
        await closeConversationSession(cleanPhone, "farewell")
        result = {
          reply: `¡Con muchísimo gusto! Que tengas un excelente día. Quedamos a tu servicio siempre en ${branch?.name || "nuestra tienda"}. 👋`,
          actionTaken: "ai_answered",
        }
      }
    }

    // Regla 0.5: Declinación o respuesta negativa natural ("No", "No gracias", "Nada más", "Por ahora no")
    if (!result) {
      const isNegative = /^(no|no gracias|nop|nada|nada mas|no por ahora|ninguno|ninguna|no senor|no senora|para nada|negativo|no no)$/i.test(cleanLowerText)
      if (isNegative) {
        result = {
          reply: `¡Con muchísimo gusto! Si en algún momento necesitas cualquier medicina o producto, aquí estamos con el mayor agrado para atenderte en ${branch?.name || "nuestra tienda"}. ¡Que tengas un excelente día! 😊`,
          actionTaken: "ai_answered",
        }
      }
    }

    // Regla 0.6: Saludo natural ("Hola", "Buenas", "Buen día")
    if (!result) {
      const isGreeting = /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal|como estas|alo|hey|hola buenas|hola buen dia|buenas como esta|saludos)$/i.test(cleanLowerText)
      if (isGreeting) {
        result = {
          reply: `¡Hola! 👋 Qué gusto saludarte. Bienvenido a ${branch?.name || "nuestra tienda"}. Con mucho gusto te atiendo, ¿qué medicamento o producto estás buscando hoy?`,
          actionTaken: "ai_answered",
        }
      }
    }

    // Regla 1: Consulta de saldo / fiado
    if (
      !result && (
        lowerText.includes("debo") ||
        lowerText.includes("saldo") ||
        lowerText.includes("cuenta") ||
        lowerText.includes("fiado") ||
        lowerText.includes("deuda")
      )
    ) {
      const acc = client.creditAccount
      const balance = acc?.balance || 0
      if (balance > 0) {
        result = {
          reply: `🧾 *Estado de tu Cuenta (${branch?.name || "Sede"})*\n👤 Hola, *${client.name}*\n💳 Tu saldo fiado pendiente es: *$${balance.toLocaleString("es-CO")}*\n🗓️ Plazo estipulado: 30 días.\n\nPuedes realizar tu abono en el mostrador o por transferencia. ¡Muchas gracias!`,
          actionTaken: "credit_checked",
        }
      } else {
        result = {
          reply: `🧾 *Estado de tu Cuenta (${branch?.name || "Sede"})*\n👤 Hola, *${client.name}*\n✅ ¡Estás al día! No tienes deuda pendiente.\nTu cupo de crédito disponible es: *$${(acc?.creditLimit || 0).toLocaleString("es-CO")}*.`,
          actionTaken: "credit_checked",
        }
      }
    }

    // Regla 2: Seguimiento de pedido activo en tiempo real
    else if (
      lowerText.includes("como va") ||
      lowerText.includes("mi pedido") ||
      lowerText.includes("mi orden") ||
      lowerText.includes("donde esta") ||
      lowerText.includes("donde viene") ||
      lowerText.includes("ya salio") ||
      lowerText.includes("estado de mi")
    ) {
      const lastOrder = await db.order.findFirst({
        where: {
          OR: [{ customerPhone: cleanPhone }, ...(client.id ? [{ clientId: client.id }] : [])],
          ...(branchFilter || {}),
        },
        orderBy: { createdAt: "desc" },
      })

      if (lastOrder) {
        const statusMap: Record<string, string> = {
          pendiente: "🟡 Pendiente (En cola de atención en tienda)",
          confirmado: "🟢 Confirmado (Confirmado en tienda)",
          en_preparacion: "🔵 En Preparación (Empacando tus productos)",
          en_camino: "🟣 En Camino (Despachado y en ruta hacia tu dirección)",
          entregado: "✅ Entregado (Completado con éxito)",
          cancelado: "🔴 Cancelado",
        }
        const stText = statusMap[lastOrder.status] || lastOrder.status.toUpperCase()
        const driver = lastOrder.deliveryDriverName ? `\n🛵 *Repartidor:* ${lastOrder.deliveryDriverName}` : ""
        result = {
          reply: `📦 *Estado de tu Pedido #${lastOrder.orderNumber}*\n\n⏱️ *Estado actual:* ${stText}${driver}\n📍 *Dirección:* ${lastOrder.deliveryAddress || "N/A"}\n💵 *Total:* $${lastOrder.total.toLocaleString("es-CO")} (${lastOrder.paymentMethod})\n\n¡Gracias por tu paciencia! Ante cualquier duda estamos a tu servicio.`,
          actionTaken: "order_status_checked",
          orderNumber: lastOrder.orderNumber,
        }
      } else {
        result = {
          reply: `👋 Hola, *${client.name}*. No encontramos ningún pedido activo a tu nombre en este momento.\n\n¿Deseas pedir algún producto a domicilio?`,
          actionTaken: "order_status_checked",
        }
      }
    }

    // Regla 3: Pedido a domicilio por reglas
    else if (
      (lowerText.includes("manda") ||
        lowerText.includes("envia") ||
        lowerText.includes("enviar") ||
        lowerText.includes("quiero pedir") ||
        lowerText.includes("domicilio") ||
        lowerText.includes("orden") ||
        lowerText.includes("pedido")) &&
      (lowerText.includes("calle") ||
        lowerText.includes("carrera") ||
        lowerText.includes("cra") ||
        lowerText.includes("cll") ||
        lowerText.includes("av") ||
        lowerText.includes("apto") ||
        lowerText.includes("casa") ||
        lowerText.includes("#"))
    ) {
      const allProducts = await db.product.findMany({
        where: { active: true, stock: { gt: 0 }, ...branchFilter },
      })

      const detectedItems: {
        product: typeof allProducts[0]
        quantity: number
        unitPrice: number
        subtotal: number
      }[] = []

      for (const p of allProducts) {
        const pName = p.name.toLowerCase()
        if (lowerText.includes(pName)) {
          let qty = 1
          const words = lowerText.split(/\s+/)
          const idx = words.findIndex((w) => pName.includes(w))
          if (idx > 0 && !isNaN(Number(words[idx - 1]))) {
            qty = Math.max(1, parseInt(words[idx - 1], 10))
          }
          detectedItems.push({
            product: p,
            quantity: qty,
            unitPrice: p.price,
            subtotal: qty * p.price,
          })
        }
      }

      if (detectedItems.length > 0) {
        const isExplicitRepeat = isExplicitNewOrderRequest(message)
        const newSig = detectedItems.map((it) => `${it.product.id}:${it.quantity}`).sort().join("|")
        const recentRule3Orders = !isExplicitRepeat
          ? await db.order.findMany({
              where: {
                OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
                ...branchFilter,
                status: { not: "cancelado" },
                createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
              },
              include: { items: true },
              orderBy: { createdAt: "desc" },
              take: 5,
            })
          : []

        const duplicateRule3 = recentRule3Orders.find((ord) => {
          const dupSig = ord.items.map((it) => `${it.productId}:${it.quantity}`).sort().join("|")
          return dupSig === newSig
        })

        if (duplicateRule3) {
          createdOrderId = duplicateRule3.id
          result = {
            reply: `✅ Tu pedido *#${duplicateRule3.orderNumber}* ya estaba registrado por *$${duplicateRule3.total.toLocaleString("es-CO")}*. ¡En breve coordinamos la entrega! 😊`,
            actionTaken: "ai_answered",
            orderNumber: duplicateRule3.orderNumber,
            total: duplicateRule3.total,
          }
        } else {
        let address = client.address || "Dirección según chat"
        const addrMatch = message.match(/(calle|carrera|cra|cll|av|diagonal|transversal)[^,\n.]+/i)
        if (addrMatch) address = addrMatch[0].trim()

        const subtotal = detectedItems.reduce((acc, it) => acc + it.subtotal, 0)
        const feeResolution = resolveDeliveryFee(`${address} ${message}`, deliveryConfig)
        const deliveryFee = feeResolution.fee
        const total = subtotal + deliveryFee
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
        const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
        const orderNumber = `PED-${dateStr}-${randomSuffix}`

        const order = await db.order.create({
          data: {
            orderNumber,
            branchId: resolvedBranchId,
            clientId: client.id,
            customerName: client.name,
            customerPhone: cleanPhone,
            deliveryAddress: address,
            deliveryNotes: `Generado por WhatsApp (${branch?.name || "Sede"}). ${feeResolution.appliedRule}.`,
            subtotal,
            tax: 0,
            deliveryFee,
            total,
            paymentMethod: "efectivo",
            paymentStatus: "pendiente",
            status: "pendiente",
            items: {
              create: detectedItems.map((it) => ({
                productId: it.product.id,
                productName: it.product.name,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                subtotal: it.subtotal,
              })),
            },
          },
        })

        createdOrderId = order.id
        broadcastNewOrderToDrivers(order.id).catch(() => {})
        await closeConversationSession(cleanPhone, "order_created", order.orderNumber)

        const itemsSummary = detectedItems
          .map((it) => `• ${it.quantity} × *${it.product.name}* ($${it.subtotal.toLocaleString("es-CO")})`)
          .join("\n")

        const feeLine = deliveryFee > 0 ? `\n🛵 *Costo Domicilio:* $${deliveryFee.toLocaleString("es-CO")} (${feeResolution.matchedNeighborhood ? `Barrio ${feeResolution.matchedNeighborhood}` : "Tarifa estándar"})` : ""

        result = {
          reply: `🎉 *¡Pedido Recibido con Éxito!*\n🏬 *Sede:* ${branch?.name || "Principal"}\n📦 *Orden:* #${order.orderNumber}\n👤 *Cliente:* ${client.name}\n📍 *Entrega:* ${address}\n\n🛒 *Productos:*\n${itemsSummary}${feeLine}\n\n💵 *Total a Pagar:* *$${total.toLocaleString("es-CO")}* (Pago contraentrega)\n⏱️ *Estado:* En preparación en tienda.`,
          actionTaken: "order_created",
          orderNumber: order.orderNumber,
          total: order.total,
          items: detectedItems.map((i) => ({
            name: i.product.name,
            quantity: i.quantity,
            subtotal: i.subtotal,
          })),
        }
        }
      }
    }

    // Regla 4: Consulta de catálogo en esta sede (búsqueda robusta insensible a tildes)
    if (!result) {
      const allProds = await db.product.findMany({
        where: { active: true, ...branchFilter },
        select: { name: true, price: true, stock: true, unit: true },
      })

      const clientKeywords = cleanLowerText
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !GENERAL_QUERY_WORDS.has(w))

      const matchedProds = clientKeywords.length === 0 ? [] : allProds.filter((p) => {
        const normName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        // Coincidencia con palabras clave reales del cliente
        if (clientKeywords.some((k) => normName.includes(k))) return true
        const pWords = normName.split(/\s+/).filter((w) => w.length >= 3 && !GENERAL_QUERY_WORDS.has(w))
        return pWords.some((w) => cleanLowerText.includes(w))
      })

      if (matchedProds.length > 0) {
        const listText = matchedProds
          .slice(0, 5)
          .map(
            (p) =>
              `• *${p.name}*: $${p.price.toLocaleString("es-CO")} (${p.stock > 0 ? `Stock: ${p.stock} ${p.unit}s` : "Agotado"})`
          )
          .join("\n")

        result = {
          reply: `¡Hola! Con mucho gusto te confirmo la disponibilidad:\n\n${listText}\n\n¿Deseas que te enviemos algún producto a domicilio? Indícanos cuántas unidades necesitas, tu dirección y en qué barrio te encuentras para coordinarte el envío.`,
          actionTaken: "stock_checked",
        }
      } else {
        result = {
          reply:
            config?.welcomeMessage?.trim() ||
            `¡Hola! 👋 Qué gusto saludarte. Bienvenido a ${branch?.name || "nuestra tienda"}. Con mucho gusto te atiendo, ¿qué medicamento o producto estás buscando hoy?`,
          actionTaken: "menu_shown",
        }
      }
    }
  }

  // Garantizar que la respuesta nunca sea nula o vacía
  if (!result || !result.reply || !result.reply.trim()) {
    result = {
      reply: `¡Hola! 👋 Bienvenido a ${branch?.name || "nuestra tienda"}. ¿Qué producto o medicamento necesitas hoy a domicilio? Con gusto te confirmo precio y disponibilidad.`,
      actionTaken: "menu_shown",
    }
  }

  // 5. Guardar respuesta final en la base de datos de WhatsApp CRM
  try {
    await db.whatsAppMessage.create({
      data: {
        phone: cleanPhone,
        sender: "bot",
        text: result.reply,
        status: "delivered",
        branchId: resolvedBranchId,
        clientId: client.id,
        orderId: createdOrderId,
        channel: effectiveChannel,
      },
    })
  } catch (saveErr: any) {
    console.error("[WhatsApp CRM Save Bot Reply Error]:", saveErr)
    // Si MySQL rechaza por límite de columna (VARCHAR 191 en vez de TEXT), auto-reparar la tabla y reintentar
    const errMsg = String(saveErr?.message || "")
    if (errMsg.includes("Data too long") || errMsg.includes("too long for the column")) {
      try {
        console.log("🐬 Auto-reparando tabla WhatsAppMessage para admitir respuestas largas...")
        await db.$executeRawUnsafe(`ALTER TABLE WhatsAppMessage MODIFY COLUMN text TEXT;`)
        await db.whatsAppMessage.create({
          data: {
            phone: cleanPhone,
            sender: "bot",
            text: result.reply,
            status: "delivered",
            branchId: resolvedBranchId,
            clientId: client.id,
            orderId: createdOrderId,
            channel: effectiveChannel,
          },
        })
        console.log("✅ Respuesta del bot guardada con éxito tras auto-reparación MySQL.")
      } catch (retryErr) {
        // Fallback de emergencia si la BD sigue restringida: guardar versión resumida
        await db.whatsAppMessage.create({
          data: {
            phone: cleanPhone,
            sender: "bot",
            text: result.reply.slice(0, 190),
            status: "delivered",
            branchId: resolvedBranchId,
            clientId: client.id,
            orderId: createdOrderId,
            channel: effectiveChannel,
          },
        }).catch(() => {})
      }
    }
  }

  // Si la sesión sigue en estado pendiente y no fue concluida/cerrada por orden o despedida, marcar como abierta
  try {
    const currentSession = await getConversationSession(cleanPhone)
    if (currentSession.status === "pendiente") {
      await setConversationSessionStatus(cleanPhone, "abierta")
    }
  } catch {
    /* noop */
  }

  return result
}

/**
 * Definiciones oficiales de Herramientas MCP / Function Calling para OpenRouter & DeepSeek
 */
export const WHATSAPP_MCP_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "consultar_catalogo",
      description: "Consulta productos, medicamentos, existencias y precios en el catálogo oficial de la tienda/farmacia para la sede activa.",
      parameters: {
        type: "object",
        properties: {
          busqueda: {
            type: "string",
            description: "Nombre, término o principio activo a buscar (ej: 'jabón', 'acetaminofén', 'ibuprofeno', 'alcohol'). Si está vacío, lista productos destacados.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cotizar_domicilio",
      description: "Calcula la tarifa oficial de entrega a domicilio para la dirección y barrio indicados por el cliente.",
      parameters: {
        type: "object",
        properties: {
          direccion: {
            type: "string",
            description: "Dirección de entrega (calle, carrera, manzana, lote, etc.)",
          },
          barrio: {
            type: "string",
            description: "Barrio de entrega (ej: 'El Dorado', 'Centro', etc.)",
          },
        },
        required: ["direccion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crear_pedido",
      description:
        "Registra oficialmente UN pedido nuevo a domicilio en OmniPOS una vez confirmados productos, dirección, método de pago y (si es efectivo) con cuánto paga o si paga exacto. NO usar si ya existe un pedido creado hace poco para este cliente (para agregar billete, cambio o actualizar pago usa actualizar_pago_pedido).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string", description: "Nombre del producto según el catálogo" },
                cantidad: { type: "number", description: "Cantidad de unidades" },
              },
              required: ["nombre", "cantidad"],
            },
            description: "Lista de productos pedidos",
          },
          direccion: {
            type: "string",
            description: "Dirección completa de entrega",
          },
          barrio: {
            type: "string",
            description: "Barrio de entrega",
          },
          metodo_pago: {
            type: "string",
            enum: ["efectivo", "transferencia"],
            description: "Método de pago ('efectivo' contraentrega o 'transferencia'). NOTA: Si es transferencia, el bot NO debe entregar cuentas bancarias ni inventar números; un asesor humano del comercio lo contactará en breve para entregar los datos oficiales y validar el comprobante.",
          },
          paga_con_efectivo: {
            type: "number",
            description: "Monto completo en pesos con el que paga el cliente para calcular y enviar el cambio exacto (ej: 20000 para un billete de 20 mil, 50000 para 50 mil). Opcional.",
          },
        },
        required: ["items", "direccion", "metodo_pago"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "actualizar_pago_pedido",
      description:
        "Actualiza el método de pago, el billete con el que paga el cliente (para calcular el cambio exacto), pago exacto o notas en un pedido que YA fue registrado recientemente, SIN crear un pedido duplicado.",
      parameters: {
        type: "object",
        properties: {
          orden: {
            type: "string",
            description: "Número de orden existente (ej: PED-20261110-2468). Si se omite, actualiza el pedido activo más reciente del cliente.",
          },
          metodo_pago: {
            type: "string",
            enum: ["efectivo", "transferencia"],
            description: "Método de pago actualizado (opcional).",
          },
          paga_con_efectivo: {
            type: "number",
            description: "Monto completo en pesos con el que paga el cliente en efectivo (ej: 20000 o 50000). Opcional.",
          },
          monto_exacto: {
            type: "boolean",
            description: "true si el cliente confirmó que pagará con el monto exacto y no requiere cambio.",
          },
          nota: {
            type: "string",
            description: "Nota o aclaración adicional para el repartidor (opcional).",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_estado_pedido",
      description: "Consulta el estado en tiempo real del último pedido del cliente o de un número de orden.",
      parameters: {
        type: "object",
        properties: {
          orden: {
            type: "string",
            description: "Número de orden opcional (ej: PED-20261109-1234)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_saldo_fiado",
      description: "Consulta el saldo fiado o deuda pendiente del cliente.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
]

/**
 * Ejecutor de Herramientas MCP contra la base de datos de OmniPOS
 */
async function executeMcpTool(
  toolName: string,
  args: any,
  context: {
    client: any
    branch: any
    cleanPhone: string
    branchFilter: any
    deliveryConfig: any
    channelLabel: string
    customerMessage?: string
    alreadyCreatedOrderInTurn?: any
  }
): Promise<{ result: any; createdOrder?: any; updatedOrder?: any }> {
  const { client, branch, cleanPhone, branchFilter, deliveryConfig, channelLabel, customerMessage = "", alreadyCreatedOrderInTurn } = context
  const orderBranchFilter = branch?.id ? { branchId: branch.id } : {}

  if (toolName === "consultar_catalogo") {
    const q = (args.busqueda || "").toLowerCase().trim()
    const allProds = await db.product.findMany({
      where: { active: true, stock: { gt: 0 }, ...branchFilter },
      select: { id: true, name: true, price: true, stock: true, unit: true, category: true },
      take: 80,
    })

    if (!q) {
      return {
        result: {
          productos_destacados: allProds.slice(0, 10).map((p) => ({
            nombre: p.name,
            precio: p.price,
            precio_formateado: `$${p.price.toLocaleString("es-CO")}`,
            stock: p.stock,
            unidad: p.unit,
          })),
        },
      }
    }

    const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    const words = qNorm.split(/\s+/).filter((w: string) => w.length >= 2)

    const matched = allProds.filter((p) => {
      const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      if (pNorm.includes(qNorm) || qNorm.includes(pNorm)) return true
      return words.some((w: string) => pNorm.includes(w))
    })

    if (matched.length === 0) {
      return {
        result: {
          encontrado: false,
          mensaje: `No se encontraron productos disponibles con '${q}' en esta sede.`,
          otros_productos_disponibles: allProds.slice(0, 6).map((p) => p.name),
        },
      }
    }

    return {
      result: {
        encontrado: true,
        cantidad_resultados: matched.length,
        productos: matched.slice(0, 6).map((p) => ({
          nombre: p.name,
          precio: p.price,
          precio_formateado: `$${p.price.toLocaleString("es-CO")}`,
          stock: p.stock,
          unidad: p.unit,
        })),
      },
    }
  }

  if (toolName === "cotizar_domicilio") {
    const fullLoc = `${args.barrio || ""} ${args.direccion || ""}`
    const feeRes = resolveDeliveryFee(fullLoc, deliveryConfig)
    return {
      result: {
        costo_domicilio: feeRes.fee,
        costo_formateado: `$${feeRes.fee.toLocaleString("es-CO")}`,
        barrio_detectado: feeRes.matchedNeighborhood || args.barrio || "Tarifa estándar",
        regla_aplicada: feeRes.appliedRule,
      },
    }
  }

  if (toolName === "crear_pedido") {
    // Capa A: Bloqueo en el mismo turno (evita 2 crear_pedido seguidos o en paralelo dentro de la misma respuesta)
    if (alreadyCreatedOrderInTurn) {
      return {
        result: {
          ...alreadyCreatedOrderInTurn,
          duplicado_evitado: true,
          instruccion_importante: `El pedido #${alreadyCreatedOrderInTurn.orderNumber} YA fue creado en este turno. NO vuelvas a llamar crear_pedido; confirma al cliente únicamente este número de orden.`,
        },
      }
    }

    const allProds = await db.product.findMany({
      where: { active: true, ...branchFilter },
      select: { id: true, name: true, price: true, stock: true, unit: true },
    })

    const itemsToCreate: { product: any; qty: number; subtotal: number }[] = []
    const requestedItems = Array.isArray(args.items) ? args.items : []

    for (const it of requestedItems) {
      const rawName = (it.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
      let match = allProds.find((p) => {
        const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        return pNorm.includes(rawName) || rawName.includes(pNorm)
      })
      if (!match) {
        const words = rawName.split(/\s+/).filter((w: string) => w.length >= 3)
        match = allProds.find((p) => {
          const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          return words.some((w: string) => pNorm.includes(w))
        })
      }
      if (match) {
        const qty = Math.max(1, Number(it.cantidad) || 1)
        itemsToCreate.push({
          product: match,
          qty,
          subtotal: match.price * qty,
        })
      }
    }

    if (itemsToCreate.length === 0) {
      return {
        result: {
          error: "No se pudieron identificar los productos solicitados en el catálogo de esta sede.",
        },
      }
    }

    const subtotal = itemsToCreate.reduce((acc, it) => acc + it.subtotal, 0)
    const rawAddr = String(args.direccion || client.address || "Dirección según chat").trim()
    const fullAddress = args.barrio && !rawAddr.toLowerCase().includes(String(args.barrio).toLowerCase())
      ? `${rawAddr}, Barrio ${args.barrio}`
      : rawAddr

    const feeRes = resolveDeliveryFee(fullAddress, deliveryConfig)
    const deliveryFee = feeRes.fee
    const total = subtotal + deliveryFee
    const isTransfer = args.metodo_pago === "transferencia"

    // Normalizar billete recibido por argumento o por texto natural del mensaje del cliente
    const billFromMsg = parseCashBillFromText(customerMessage, total)
    const rawCashArg = Number(args.paga_con_efectivo) || 0
    const cashPaid = rawCashArg > 0
      ? normalizeCashBillAmount(rawCashArg, total)
      : (billFromMsg.detected && !billFromMsg.isExact ? billFromMsg.amount : 0)
    const isExactCash = Boolean(billFromMsg.detected && billFromMsg.isExact)

    // Capa B: Bloqueo Anti-Duplicados entre turnos contra la base de datos (15 min mismos productos / 3 min en seguimiento)
    const isExplicitNew = isExplicitNewOrderRequest(customerMessage)
    const isFollowUpMsg = isFollowUpPaymentOrConfirmMessage(customerMessage)
    const newSig = itemsToCreate.map((it) => `${it.product.id}:${it.qty}`).sort().join("|")

    if (!isExplicitNew) {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      const recentOrders = await db.order.findMany({
        where: {
          OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
          ...orderBranchFilter,
          status: { not: "cancelado" },
          createdAt: { gte: fifteenMinutesAgo },
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      })

      const sameItemsOrder = recentOrders.find((ord) => {
        const dupSig = ord.items.map((it) => `${it.productId}:${it.quantity}`).sort().join("|")
        return dupSig === newSig
      })

      const threeMinutesAgo = Date.now() - 3 * 60 * 1000
      const veryRecentFollowUpOrder = isFollowUpMsg
        ? recentOrders.find((ord) => new Date(ord.createdAt).getTime() >= threeMinutesAgo)
        : undefined

      const dupOrder = sameItemsOrder || veryRecentFollowUpOrder
      if (dupOrder) {
        let updatedMethod = dupOrder.paymentMethod || "efectivo"
        let updatedCambio = 0
        let finalCashForDup = 0

        const canUpdatePayment =
          dupOrder.paymentStatus !== "pagado" &&
          ["pendiente", "confirmado", "en_preparacion", "en_camino"].includes(dupOrder.status)

        if (canUpdatePayment) {
          updatedMethod = args.metodo_pago || dupOrder.paymentMethod || "efectivo"
          const dupCashArg = rawCashArg > 0 ? normalizeCashBillAmount(rawCashArg, dupOrder.total) : 0
          const dupMsgBill = parseCashBillFromText(customerMessage, dupOrder.total)
          finalCashForDup = dupCashArg > 0 ? dupCashArg : (dupMsgBill.detected && !dupMsgBill.isExact ? dupMsgBill.amount : 0)
          const dupIsExact = Boolean(dupMsgBill.detected && dupMsgBill.isExact)

          if (finalCashForDup > dupOrder.total || dupIsExact || updatedMethod !== dupOrder.paymentMethod) {
            const newPayNote = buildPaymentDeliveryNote(
              updatedMethod,
              dupOrder.total,
              dupOrder.subtotal,
              dupOrder.deliveryFee,
              finalCashForDup > 0 ? finalCashForDup : undefined,
              dupIsExact
            )
            const mergedNotes = mergePaymentIntoDeliveryNotes(dupOrder.deliveryNotes, newPayNote)
            await db.order.update({
              where: { id: dupOrder.id },
              data: {
                paymentMethod: updatedMethod,
                deliveryNotes: mergedNotes,
              },
            })
            notifyAssignedDriverPaymentUpdate(
              { ...dupOrder, paymentMethod: updatedMethod },
              newPayNote
            ).catch(() => {})
            if (finalCashForDup > dupOrder.total) {
              updatedCambio = finalCashForDup - dupOrder.total
            }
          }
        }

        const existingSummary = {
          exito: true,
          duplicado_evitado: true,
          ya_existia: true,
          orden_id: dupOrder.id,
          orderNumber: dupOrder.orderNumber,
          estado_orden: dupOrder.status,
          subtotal: dupOrder.subtotal,
          deliveryFee: dupOrder.deliveryFee,
          total: dupOrder.total,
          total_formateado: `$${dupOrder.total.toLocaleString("es-CO")}`,
          paga_con: finalCashForDup > 0 ? finalCashForDup : undefined,
          cambio: updatedCambio,
          direccion_entrega: dupOrder.deliveryAddress || fullAddress,
          metodo_pago: updatedMethod,
          instruccion_importante: `¡IMPORTANTE! El pedido #${dupOrder.orderNumber} YA había sido registrado anteriormente y se actualizó su información de pago/cambio (NO se creó duplicado). Confirma al cliente únicamente su orden #${dupOrder.orderNumber}.`,
        }

        return {
          result: existingSummary,
          updatedOrder: existingSummary,
        }
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
    const genOrderNum = `PED-${dateStr}-${randomSuffix}`

    const cambio = !isTransfer && cashPaid > total ? cashPaid - total : 0
    const paymentNote = buildPaymentDeliveryNote(
      args.metodo_pago,
      total,
      subtotal,
      deliveryFee,
      cashPaid > 0 ? cashPaid : undefined,
      isExactCash
    )

    if (fullAddress && !client.address) {
      await db.client.update({
        where: { id: client.id },
        data: { address: fullAddress },
      }).catch(() => {})
    }

    const createdOrder = await db.order.create({
      data: {
        orderNumber: genOrderNum,
        tenantId: branch?.tenantId || null,
        branchId: branch?.id || null,
        clientId: client.id,
        customerName: client.name,
        customerPhone: cleanPhone,
        deliveryAddress: fullAddress,
        deliveryNotes: paymentNote,
        notes: `Generado automáticamente por Agente IA ${channelLabel} (${branch?.name || "Sede"}).`,
        subtotal,
        tax: 0,
        deliveryFee,
        total,
        paymentMethod: args.metodo_pago,
        paymentStatus: "pendiente",
        status: "pendiente",
        items: {
          create: itemsToCreate.map((it) => ({
            productId: it.product.id,
            productName: it.product.name,
            quantity: it.qty,
            unitPrice: it.product.price,
            subtotal: it.subtotal,
          })),
        },
      },
    })

    broadcastNewOrderToDrivers(createdOrder.id).catch(() => {})

    const orderSummary = {
      exito: true,
      orden_id: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      estado_orden: "pendiente",
      subtotal,
      deliveryFee,
      total,
      total_formateado: `$${total.toLocaleString("es-CO")}`,
      paga_con: cashPaid > total ? cashPaid : undefined,
      cambio: cambio > 0 ? cambio : 0,
      direccion_entrega: fullAddress,
      metodo_pago: args.metodo_pago,
      instruccion_importante: isTransfer
        ? "El pedido fue registrado en estado PENDIENTE. NUNCA inventes números de cuenta bancaria ni números de Nequi/Daviplata/Bancolombia. Informa al cliente que un asesor humano del comercio se comunicará por este chat en breve para entregarle los datos oficiales de transferencia, verificar su comprobante y pasar la orden a CONFIRMADO."
        : "El pedido fue registrado en estado PENDIENTE para alistamiento con cobro en efectivo contraentrega.",
      items: itemsToCreate.map((it) => ({
        producto: it.product.name,
        cantidad: it.qty,
        subtotal: it.subtotal,
      })),
    }

    return {
      result: orderSummary,
      createdOrder: orderSummary,
    }
  }

  if (toolName === "actualizar_pago_pedido") {
    const cleanOrdenArg = String(args.orden || "").replace(/^#/, "").trim()
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000)

    const targetOrder = await db.order.findFirst({
      where: {
        OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
        ...(cleanOrdenArg ? { orderNumber: { contains: cleanOrdenArg } } : {}),
        ...orderBranchFilter,
        status: { in: ["pendiente", "confirmado", "en_preparacion", "en_camino"] },
        paymentStatus: { not: "pagado" },
        createdAt: { gte: twelveHoursAgo },
      },
      orderBy: { createdAt: "desc" },
    })

    if (!targetOrder) {
      return {
        result: {
          existe: false,
          mensaje: "No hay un pedido activo pendiente de cobro reciente para actualizar en este momento.",
        },
      }
    }

    const updatedMethod = args.metodo_pago || targetOrder.paymentMethod || "efectivo"
    const msgBill = parseCashBillFromText(customerMessage, targetOrder.total)
    const rawCashArg = Number(args.paga_con_efectivo) || 0
    const normalizedCash = rawCashArg > 0
      ? normalizeCashBillAmount(rawCashArg, targetOrder.total)
      : (msgBill.detected && !msgBill.isExact ? msgBill.amount : 0)
    const isExact = Boolean(args.monto_exacto) || Boolean(msgBill.detected && msgBill.isExact)

    const newPaymentNote = buildPaymentDeliveryNote(
      updatedMethod,
      targetOrder.total,
      targetOrder.subtotal,
      targetOrder.deliveryFee,
      normalizedCash > 0 ? normalizedCash : undefined,
      isExact
    )
    const mergedNotes = mergePaymentIntoDeliveryNotes(targetOrder.deliveryNotes, newPaymentNote, args.nota)

    await db.order.update({
      where: { id: targetOrder.id },
      data: {
        paymentMethod: updatedMethod,
        deliveryNotes: mergedNotes,
      },
    })

    notifyAssignedDriverPaymentUpdate(
      { ...targetOrder, paymentMethod: updatedMethod },
      newPaymentNote
    ).catch(() => {})

    const cambio = updatedMethod !== "transferencia" && normalizedCash > targetOrder.total
      ? normalizedCash - targetOrder.total
      : 0

    const updatedSummary = {
      exito: true,
      actualizado: true,
      orden_id: targetOrder.id,
      orderNumber: targetOrder.orderNumber,
      estado_orden: targetOrder.status,
      total: targetOrder.total,
      total_formateado: `$${targetOrder.total.toLocaleString("es-CO")}`,
      metodo_pago: updatedMethod,
      paga_con: normalizedCash > targetOrder.total ? normalizedCash : undefined,
      monto_exacto: isExact,
      cambio,
      instruccion_importante: `El pedido existente #${targetOrder.orderNumber} fue ACTUALIZADO (NO se creó un segundo pedido). Informa al cliente de manera breve y amable que su orden #${targetOrder.orderNumber} ya quedó actualizada${cambio > 0 ? ` (paga con $${normalizedCash.toLocaleString("es-CO")}, cambio a llevar: $${cambio.toLocaleString("es-CO")})` : isExact ? " (pago con monto exacto)" : ""}.`,
    }

    return {
      result: updatedSummary,
      updatedOrder: updatedSummary,
    }
  }

  if (toolName === "consultar_estado_pedido") {
    const lastOrder = await db.order.findFirst({
      where: {
        OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
        ...(args.orden ? { orderNumber: { contains: args.orden } } : {}),
        ...branchFilter,
      },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    })

    if (!lastOrder) {
      return {
        result: { existe: false, mensaje: "No hay pedidos registrados para este cliente en el sistema." },
      }
    }

    const statusMap: Record<string, string> = {
      pendiente: "🟡 Pendiente (Recibido en tienda, en fila de alistamiento)",
      confirmado: "🟢 Confirmado (Confirmado por el comercio)",
      en_preparacion: "🔵 En Preparación (Empacando en el local)",
      en_camino: "🟣 En Camino (Despachado y en ruta)",
      entregado: "✅ Entregado con éxito",
      cancelado: "🔴 Cancelado",
    }

    return {
      result: {
        existe: true,
        orderNumber: lastOrder.orderNumber,
        estado: statusMap[lastOrder.status] || lastOrder.status,
        direccion: lastOrder.deliveryAddress,
        total_formateado: `$${lastOrder.total.toLocaleString("es-CO")}`,
        repartidor: lastOrder.deliveryDriverName || null,
        productos: lastOrder.items.map((i) => `${i.quantity}x ${i.productName}`),
      },
    }
  }

  if (toolName === "consultar_saldo_fiado") {
    const acc = client.creditAccount
    const balance = acc?.balance || 0
    return {
      result: {
        cliente: client.name,
        saldo_pendiente: balance,
        saldo_formateado: `$${balance.toLocaleString("es-CO")}`,
        cupo_disponible: `$${(acc?.creditLimit || 0).toLocaleString("es-CO")}`,
        tiene_deuda: balance > 0,
      },
    }
  }

  return { result: { error: `Herramienta ${toolName} no reconocida` } }
}

/**
 * Módulo de Inteligencia Artificial con soporte MCP Tools (Function Calling):
 * OpenRouter & DeepSeek con libertad total de pensamiento, memoria conversacional continua
 * y llamadas directas a herramientas para consultar catálogo, cotizar domicilios y crear órdenes.
 */
async function processWithLLMAI(params: {
  message: string
  cleanPhone: string
  client: any
  branch: any
  config: any
  channel?: "whatsapp" | "telegram"
}): Promise<BotProcessResult> {
  const { message, cleanPhone, client, branch, config, channel = "whatsapp" } = params
  const isTelegram = channel === "telegram" || cleanPhone.startsWith("tg_")
  const channelLabel = isTelegram ? "Telegram" : "WhatsApp"
  const branchId = branch?.id
  const branchName = branch?.name || "Sede Principal"
  const branchFilter = branchId ? { OR: [{ branchId }, { branchId: null }] } : {}

  // Determinar proveedor activo (OpenRouter o DeepSeek) y credenciales
  const openerKey = config.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || ""
  const dsKey = config.deepseekApiKey?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || ""

  let isOpener = config.aiProvider === "openrouter" ? !!openerKey : !dsKey && !!openerKey
  let providerName = isOpener ? "OpenRouter" : "DeepSeek"
  let apiKey = isOpener ? openerKey : dsKey
  let model = isOpener
    ? (config.openrouterModel || "openrouter/free").trim()
    : (config.deepseekModel || "deepseek-chat").trim()
  if (isOpener && model.endsWith(":free") && model !== "openrouter/free") {
    model = "openrouter/free"
  }
  let endpoint = isOpener
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.deepseek.com/chat/completions"

  // 1. Historial de conversación real y continuo (últimos 20 mensajes sin truncar ni reiniciar arbitrariamente)
  const rawRecentMsgs = await db.whatsAppMessage.findMany({
    where: {
      phone: cleanPhone,
    },
    orderBy: { createdAt: "desc" },
    skip: 1, // Excluir el mensaje entrante recién guardado
    take: 20,
    select: { sender: true, text: true },
  })

  const conversationHistory = rawRecentMsgs.reverse().map((m) => ({
    role: m.sender === "customer" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }))

  // 2. Configuración oficial de tarifas de domicilio para esta sede
  const deliveryConfig = await getDeliveryConfig(branchId)

  // 2.1 Consultar pedidos recientes del cliente (últimas 2 horas) para evitar duplicaciones por respuestas de seguimiento
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const recentClientOrders = await db.order.findMany({
    where: {
      OR: [{ customerPhone: cleanPhone }, { clientId: client.id }],
      ...(branchId ? { branchId } : {}),
      status: { not: "cancelado" },
      createdAt: { gte: twoHoursAgo },
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 3,
  })

  const recentOrdersBlock = recentClientOrders.length > 0
    ? `\n📌 PEDIDOS RECIENTES DE ESTE CLIENTE (ÚLTIMAS 2 HORAS — YA REGISTRADOS EN SISTEMA):\n` +
      recentClientOrders
        .map((ord) => {
          const minsAgo = Math.max(0, Math.round((Date.now() - new Date(ord.createdAt).getTime()) / 60000))
          const prods = ord.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")
          return `- Orden #${ord.orderNumber} (hace ${minsAgo} min) | Estado: ${ord.status} | Total: $${ord.total.toLocaleString("es-CO")} | Pago: ${ord.paymentMethod} | Productos: ${prods}`
        })
        .join("\n") +
      `\n⚠️ REGLA ANTI-DUPLICADOS OBLIGATORIA: Si el cliente responde indicando el billete con el que pagará ("un billete de 20", "con 50 mil", "monto exacto"), confirmando ("sí", "ok", "listo") o aclarando pago/notas sobre cualquiera de estos pedidos, USA "actualizar_pago_pedido" — PROHIBIDO volver a llamar "crear_pedido". Solo llama a "crear_pedido" si el cliente pide explícitamente productos nuevos distintos o un pedido adicional.`
    : ""

  // 3. Prompt de sistema humano con MCP Tools y Blindaje Estricto de Rol Comercial
  const systemPrompt = `Eres el asesor comercial y de atención al cliente de "${branchName}" atendiendo por ${channelLabel}.
Tu función y propósito es EXCLUSIVAMENTE comercial: venta de productos de la tienda, consulta de existencias y precios del catálogo, cotización de domicilios y toma de pedidos.

🚨 BLINDAJE ESTRICTO DE ATENCIÓN Y AHORRO DE TOKENS (REGLAS INQUEBRANTABLES):
1. ROL EXCLUSIVO: Eres única y exclusivamente el asesor comercial de la tienda "${branchName}".
2. Tienes TERMINANTEMENTE PROHIBIDO:
   - Resolver operaciones matemáticas o cálculos ajenos a la compra (ej: NUNCA resuelvas operaciones como "3222 + 6262").
   - Responder preguntas de cultura general, noticias, política, historia, ciencia, tecnología, cocina/recetas, tareas escolares, chistes, poemas o temas personales.
   - Actuar como asistente de inteligencia artificial de propósito general, redactar código o escribir textos creativos.
3. Si el cliente solicita cualquier cálculo, tarea o tema ajeno a la tienda, DEBES RECHAZAR LA SOLICITUD DE FORMA AMABLE, MUY BREVE Y DIRECTA (en 1 sola frase corta), redirigiéndolo de inmediato a nuestros productos:
   "Disculpa, como asesor comercial solo puedo ayudarte con información de nuestros productos, precios y pedidos de la tienda. 😊 ¿En qué producto te puedo colaborar?"
4. AHORRO DE TOKENS: Sé directo, conciso y profesional. No generes respuestas largas ni explicaciones innecesarias.

🚨 REGLAS CRÍTICAS DE PAGO Y TRANSFERENCIA (PROHIBIDO INVENTAR CUENTAS BANCARIAS):
1. PROHIBICIÓN ABSOLUTA DE INVENTAR CUENTAS:
   - NUNCA inventes números de cuenta bancaria, números de celular de Nequi, Daviplata ni cuentas de Bancolombia ni ninguna otra entidad (PROHIBIDO escribir números ficticios o de ejemplo como '300 123 4567', '123-456789-00', etc.).
   - Tú NO dispones de números de cuenta bancaria en tus herramientas y NO debes entregarlos tú.
2. LA VALIDACIÓN DE TRANSFERENCIAS ES 100% HUMANA:
   - Los asesores humanos del comercio son quienes validan los comprobantes de pago y pasan los pedidos a "confirmado".
   - Tu función como bot es ÚNICAMENTE registrar el pedido en el sistema en estado "PENDIENTE".
3. CUANDO EL CLIENTE ELIJA "TRANSFERENCIA" (O NEQUI / DAVIPLATA / BANCOLOMBIA):
   - Llama UNA SOLA VEZ a la herramienta "crear_pedido" con metodo_pago: "transferencia". El pedido se registrará con estado "pendiente".
   - Al responder al cliente, indícale CLARAMENTE:
     a) Que su pedido quedó REGISTRADO con éxito en estado PENDIENTE con su número de orden (#PED-...).
     b) Resumen claro de los productos, dirección y total a pagar.
     c) INFÓRMALE QUE UN ASESOR HUMANO DEL EQUIPO DE LA TIENDA SE COMUNICARÁ POR ESTE CHAT EN BREVE PARA COMPARTIRLE LOS NÚMEROS DE CUENTA OFICIALES PARA LA TRANSFERENCIA.
     d) Explícale que una vez el asesor humano valide su comprobante de pago, el pedido pasará a CONFIRMADO para coordinar el despacho.
   - NUNCA digas que el pedido ya fue confirmado ni despachado, y NUNCA entregues cuentas bancarias inventadas.
4. CUANDO EL CLIENTE ELIJA "EFECTIVO" (REGLA ANTI-DUPLICADOS):
   - Si el cliente AÚN NO ha dicho con qué billete pagará ni si paga exacto: PRIMERO pregúntale "¿Pagarás con el monto exacto o necesitas cambio de algún billete?" y ESPERA su respuesta ANTES de llamar a "crear_pedido" (NO crees el pedido todavía para no crear luego un duplicado).
   - Cuando responda ("un billete de 20", "monto exacto", etc.) o si ya lo indicó desde antes: llama UNA SOLA VEZ a "crear_pedido" pasando metodo_pago: "efectivo" y paga_con_efectivo con el valor completo en pesos (ej. 20000 si dijo "billete de 20").
   - Si el pedido YA fue creado previamente y el cliente responde después el billete o cambio, usa "actualizar_pago_pedido" — JAMÁS vuelvas a llamar a "crear_pedido".
   - Infórmale que su pedido quedó REGISTRADO en estado PENDIENTE para cobro contraentrega.

TIENES HERRAMIENTAS (MCP Tools) CONECTADAS AL SISTEMA DE LA TIENDA:
1. "consultar_catalogo": Úsala para consultar existencias, precios y presentaciones de productos o medicamentos. NUNCA inventes productos ni precios.
2. "cotizar_domicilio": Úsala para calcular el valor del domicilio según la dirección y barrio del cliente.
3. "crear_pedido": Úsala UNA SOLA VEZ por compra para registrar oficialmente un pedido NUEVO una vez confirmados productos, dirección, método de pago y (si es efectivo) monto/exacto.
4. "actualizar_pago_pedido": Úsala para actualizar el billete, cambio, método de pago o notas de un pedido YA creado recientemente (NUNCA crees un segundo pedido para esto).
5. "consultar_estado_pedido": Úsala si el cliente pregunta por el estado de su orden o entrega.
6. "consultar_saldo_fiado": Úsala si el cliente pregunta por su deuda, fiado o saldo.

INSTRUCCIONES CLAVE DE ATENCIÓN:
- Si el cliente solo te saluda ("hola", "buenas"), salúdalo con calidez y pregúntale amablemente en qué producto le puedes colaborar. (No llames herramientas para un simple saludo).
- Recuerda SIEMPRE el contexto de toda la conversación anterior: los productos solicitados, las direcciones y las notas que el cliente ya dio. NUNCA le vuelvas a preguntar lo que ya te dijo.
- Si el cliente te pide un producto, consulta el catálogo ("consultar_catalogo"), dale el precio real y pregúntale amablemente cuántas unidades desea y a qué dirección y barrio se lo envías.
- Cuando el cliente te dé su dirección y barrio, cotiza el domicilio ("cotizar_domicilio"), infórmale el total (productos + envío) y pregúntale si prefiere pagar en efectivo contraentrega o por transferencia previa.
- Habla siempre como un ser humano atento, respetuoso y servicial.${recentOrdersBlock}
${config.aiSystemPrompt ? `\nInstrucciones especiales de la sede: ${config.aiSystemPrompt}` : ""}`

  const maxTokens = Math.min(Math.max(config.maxTokensPerReply || 450, 150), 750)

  async function callAiWithTools(
    messagesList: any[],
    toolsList: any[]
  ) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45000) // 45 segundos
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    }
    if (isOpener) {
      headers["HTTP-Referer"] = "https://omnipos.pro"
      headers["X-Title"] = "OmniPOS WhatsApp AI Agent"
    }

    const payload: any = {
      model,
      messages: messagesList,
      max_tokens: maxTokens,
      temperature: 0.3,
    }

    if (toolsList && toolsList.length > 0) {
      payload.tools = toolsList
      payload.tool_choice = "auto"
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const errBody = await res.text()
        // Si el modelo no soporta el parámetro tools (error 400 de API), reintentar sin tools
        if (res.status === 400 && /tool/i.test(errBody) && payload.tools) {
          console.warn(`[AI Tools Warning]: Model ${model} doesn't support tools, retrying without tools parameter...`)
          return await callAiWithTools(messagesList, [])
        }
        throw new Error(`${providerName} API (${res.status}): ${errBody.slice(0, 180)}`)
      }
      return await res.json()
    } catch (e: any) {
      clearTimeout(timer)
      const isAbort = e?.name === "AbortError"
      throw new Error(isAbort ? `${providerName} timeout (45s)` : (e as Error).message)
    }
  }

  // 4. Bucle de Ejecución MCP (Model -> Tools -> Model)
  let conversationMessages: any[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: message },
  ]

  let loopCount = 0
  const MAX_LOOPS = 4
  let finalRawReply = ""
  let capturedOrder: any = null
  let updatedExistingOrder: any = null
  let totalTokensUsed = 0
  let actualModel = model

  try {
    while (loopCount < MAX_LOOPS) {
      loopCount++
      const aiData = await callAiWithTools(conversationMessages, WHATSAPP_MCP_TOOLS)
      totalTokensUsed += aiData?.usage?.total_tokens || 0
      actualModel = aiData?.model || model
      const choice = aiData?.choices?.[0]
      const assistantMsg = choice?.message

      if (!assistantMsg) break

      // Si el modelo llamó a una o más herramientas MCP
      if (assistantMsg.tool_calls && Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0) {
        conversationMessages.push(assistantMsg)

        for (const tc of assistantMsg.tool_calls) {
          const fnName = tc.function?.name
          let fnArgs: any = {}
          try {
            fnArgs = JSON.parse(tc.function?.arguments || "{}")
          } catch {
            fnArgs = {}
          }

          const toolExec = await executeMcpTool(fnName, fnArgs, {
            client,
            branch,
            cleanPhone,
            branchFilter,
            deliveryConfig,
            channelLabel,
            customerMessage: message,
            alreadyCreatedOrderInTurn: capturedOrder,
          })

          if (toolExec.createdOrder) {
            capturedOrder = toolExec.createdOrder
          } else if (toolExec.updatedOrder) {
            updatedExistingOrder = toolExec.updatedOrder
          }

          conversationMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolExec.result),
          })
        }
        // Siguiente iteración: el modelo procesa la respuesta de las herramientas y genera su mensaje final
        continue
      }

      // Respuesta final directa sin herramientas (conversación natural, saludos, etc.)
      finalRawReply = assistantMsg.content || ""
      break
    }
  } catch (primaryErr) {
    console.warn(`[AI Primary ${providerName} Error]:`, (primaryErr as Error).message)

    // Intentar failover inteligente si la otra API está disponible
    const canFailoverToOpenRouter = !isOpener && !!openerKey
    const canFailoverToDeepSeek = isOpener && !!dsKey

    if (canFailoverToOpenRouter) {
      isOpener = true
      providerName = "OpenRouter"
      apiKey = openerKey
      model = (config.openrouterModel || "openrouter/free").trim()
      endpoint = "https://openrouter.ai/api/v1/chat/completions"
      const aiData = await callAiWithTools(conversationMessages, WHATSAPP_MCP_TOOLS)
      finalRawReply = aiData?.choices?.[0]?.message?.content || ""
    } else if (canFailoverToDeepSeek) {
      isOpener = false
      providerName = "DeepSeek"
      apiKey = dsKey
      model = (config.deepseekModel || "deepseek-chat").trim()
      endpoint = "https://api.deepseek.com/chat/completions"
      const aiData = await callAiWithTools(conversationMessages, WHATSAPP_MCP_TOOLS)
      finalRawReply = aiData?.choices?.[0]?.message?.content || ""
    } else {
      throw primaryErr
    }
  }

  finalRawReply = sanitizeBotReply(finalRawReply, client?.name, capturedOrder || updatedExistingOrder)

  // Registrar consumo de tokens para el cliente
  try {
    const { recordClientAiUsage } = await import("@/lib/ai-token-tracker")
    await recordClientAiUsage({
      phone: cleanPhone,
      clientId: client.id,
      clientName: client.name,
      model: `${providerName}: ${actualModel}`,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: totalTokensUsed,
      isFree: isOpener && (actualModel === "openrouter/free" || actualModel.includes("free")),
    })
  } catch {
    /* noop */
  }

  let orderNumber: string | undefined = capturedOrder?.orderNumber || updatedExistingOrder?.orderNumber
  let orderTotal: number | undefined = capturedOrder?.total ?? updatedExistingOrder?.total
  let actionTaken: BotProcessResult["actionTaken"] = capturedOrder ? "order_created" : "ai_answered"

  // Si la respuesta del modelo no incluyó el resumen del pedido creado, agregar el ticket
  if (capturedOrder && !finalRawReply.includes(capturedOrder.orderNumber)) {
    finalRawReply += `\n\n📦 *Pedido Registrado (Pendiente):* #${capturedOrder.orderNumber}\n💵 *Total a pagar:* ${capturedOrder.total_formateado}\n📍 *Entrega:* ${capturedOrder.direccion_entrega}\n⏱️ *Estado:* Pendiente (Un asesor humano confirmará tu pedido)`
  }

  if (!finalRawReply || !finalRawReply.trim()) {
    if (capturedOrder?.orderNumber) {
      finalRawReply = `🎉 *¡Pedido Recibido con Éxito!*\nTu orden #${capturedOrder.orderNumber} ha sido registrada.`
    } else if (updatedExistingOrder?.orderNumber) {
      finalRawReply = `✅ ¡Listo! Actualicé tu pedido *#${updatedExistingOrder.orderNumber}* por *${updatedExistingOrder.total_formateado}* con los datos de pago.`
    } else {
      throw new Error("AI returned empty content after processing")
    }
  }

  return {
    reply: finalRawReply,
    actionTaken,
    orderNumber,
    total: orderTotal,
    tokensUsed: totalTokensUsed,
    modelUsed: `${providerName}: ${actualModel}`,
  }
}
