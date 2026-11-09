import { db, ensureMySqlTextColumns } from "@/lib/db"
import { getDeliveryConfig, resolveDeliveryFee, formatDeliveryPromptContext } from "@/lib/delivery-config"
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
 * Sanitiza la respuesta del LLM para evitar fugas de razonamiento interno (Chain of Thought),
 * etiquetas <think>, o listas de pasos tipo "1. **Analyze the user's input:**"
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
          cleaned = `Tu pedido #${activeOrder.orderNumber} se encuentra en proceso (${activeOrder.status || "registrado"}). Pronto lo coordinamos a tu dirección. ¡Quedamos atentos!`
        } else {
          cleaned = `¡Hola${clientName ? ` ${clientName}` : ""}! Con gusto te colaboramos con tu pedido o consulta. ¿Qué producto necesitas a domicilio?`
        }
      }
    }
  }

  // 3. Limpiar cualquier resto de "Omnipos:", "Bot:" al principio del mensaje
  cleaned = cleaned.replace(/^(?:Omnipos|Bot|Asistente|Respuesta):\s*/i, "").trim()

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

  let result: BotProcessResult | null = null
  let createdOrderId: string | null = null

  // 3. INTENTO 1: Si la IA (OpenRouter o DeepSeek) está habilitada y tiene API Key (en BD o en variables de entorno)
  const openrouterKey = config?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || ""
  const deepseekKey = config?.deepseekApiKey?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || ""
  const isOpenerConfigured = config?.aiProvider === "openrouter" ? !!openrouterKey : !deepseekKey && !!openrouterKey
  const isDeepSeekConfigured = config?.aiProvider === "deepseek" ? !!deepseekKey : !openrouterKey && !!deepseekKey
  const hasAnyAiKey = !!openrouterKey || !!deepseekKey
  const aiEnabled = config?.aiEnabled ?? true

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
        // Encontrar el ID de la orden creada para vincularla al mensaje
        const ord = await db.order.findUnique({
          where: { orderNumber: result.orderNumber },
          select: { id: true },
        })
        if (ord) createdOrderId = ord.id
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
    // (Solo de la sesión actual, NUNCA de pedidos pasados ya concluidos)
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

    // Regla 0.1: Cliente elige método de pago ("Efectivo", "Transferencia", "Nequi") tras cotización
    const isPaymentResponse =
      /^(efectivo|transferencia|nequi|daviplata|contraentrega|pago en efectivo|por transferencia|en efectivo|transfer)$/i.test(cleanLowerText) ||
      (cleanLowerText.length < 30 && (cleanLowerText.includes("efectivo") || cleanLowerText.includes("transfer") || cleanLowerText.includes("nequi") || cleanLowerText.includes("davi")))

    const isAwaitingPayment =
      lastBotText.includes("prefieres") ||
      lastBotText.includes("total a pagar") ||
      lastBotText.includes("cancelar:") ||
      lastBotText.includes("contraentrega o por transferencia")

    if (isPaymentResponse && isAwaitingPayment) {
      const isTransfer = cleanLowerText.includes("transf") || cleanLowerText.includes("nequi") || cleanLowerText.includes("davi")
      const paymentMethod = isTransfer ? "transferencia" : "efectivo"

      // Extraer total y costo de envío de la cotización previa del bot
      const totalMatch = lastBotText.match(/total[^\$\d]*\$\s*([\d\.,]+)/i)
      const deliveryMatch = lastBotText.match(/env[ií]o[^\$\d]*\$\s*([\d\.,]+)/i) || lastBotText.match(/domicilio[^\$\d]*\$\s*([\d\.,]+)/i)

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
        if (lastBotText.includes(pNorm)) {
          let qty = 1
          const qMatch = lastBotText.match(new RegExp(`(\\d+)\\s*x\\s*${pNorm.slice(0, 6)}`, "i"))
          if (qMatch) qty = parseInt(qMatch[1], 10) || 1
          itemsToCreate.push({ product: p, qty })
        }
      }

      // Si no coincidió por nombre completo, buscar por palabra clave principal
      if (itemsToCreate.length === 0) {
        for (const p of allActiveProds) {
          const pWords = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((w) => w.length >= 4)
          if (pWords.some((w) => lastBotText.includes(w))) {
            itemsToCreate.push({ product: p, qty: 1 })
            break
          }
        }
      }

      if (itemsToCreate.length > 0) {
        const subtotal = itemsToCreate.reduce((acc, it) => acc + it.product.price * it.qty, 0)
        if (total <= 0) total = subtotal + deliveryFee

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
        const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
        const genOrderNum = `PED-${dateStr}-${randomSuffix}`
        const finalAddress = client.address || (isTelegram ? "Dirección confirmada según Telegram" : "Dirección confirmada según WhatsApp")

        let paymentNote = ""
        if (!isTransfer) {
          paymentNote = `💵 Pago en Efectivo: Cobrar $${total.toLocaleString("es-CO")} contraentrega ($${subtotal.toLocaleString("es-CO")} productos + $${deliveryFee.toLocaleString("es-CO")} envío).`
        } else {
          paymentNote = `💳 Pago por Transferencia: Pendiente verificar comprobante por $${total.toLocaleString("es-CO")}. Una vez verificado por caja, el repartidor no cobra ($0).`
        }

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
        await closeConversationSession(cleanPhone, "order_created", createdOrder.orderNumber)

        const itemsSummary = itemsToCreate
          .map((it) => `• ${it.qty}x *${it.product.name}* ($${(it.qty * it.product.price).toLocaleString("es-CO")})`)
          .join("\n")
        const feeLine = deliveryFee > 0 ? `\n🛵 *Costo Domicilio:* $${deliveryFee.toLocaleString("es-CO")}` : ""
        const paymentSummary = isTransfer
          ? "💳 *Método de Pago:* Transferencia previa (Por favor envía el comprobante por este chat para verificar y despachar tu pedido)"
          : `💵 *Método de Pago:* Efectivo ($${total.toLocaleString("es-CO")} a cobrar contraentrega)`

        result = {
          reply: `🎉 *¡Pedido Confirmado con Éxito!*\n🏬 *Sede:* ${branch?.name || "Principal"}\n📦 *Orden:* #${createdOrder.orderNumber}\n👤 *Cliente:* ${client.name}\n📍 *Entrega:* ${finalAddress}\n\n🛒 *Productos:*\n${itemsSummary}${feeLine}\n💵 *Total a Pagar:* *$${total.toLocaleString("es-CO")}*\n${paymentSummary}\n\n⏱️ *Estado:* Recibido en tienda y en fila de alistamiento.`,
          actionTaken: "order_created",
          orderNumber: createdOrder.orderNumber,
          total: createdOrder.total,
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
 * Módulo de Inteligencia Artificial con soporte Dual: OpenRouter & DeepSeek
 * Permite seleccionar cualquier modelo (Claude 3.5, GPT-4o, Llama 3.3, Gemini 2.0, DeepSeek V3/R1)
 * Optimizado para mínimo consumo de tokens con RAG ultraliviano
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

  // Preferencia según configuración, pero con fallback inteligente si falta una clave
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

  // 1. Historial de conversación previo limitado a la sesión activa actual
  // Esto GARANTIZA que nunca se tomen productos ni palabras de pedidos pasados ya concluidos
  const session = await getConversationSession(cleanPhone)
  const sessionStart = session.status !== "cerrada" && session.openedAt
    ? new Date(session.openedAt)
    : new Date(Date.now() - 3 * 60 * 60 * 1000)

  const recentMsgs = await db.whatsAppMessage.findMany({
    where: {
      phone: cleanPhone,
      createdAt: { gte: sessionStart },
    },
    orderBy: { createdAt: "desc" },
    skip: 1, // Salta el mensaje actual recién guardado
    take: 24, // Historial completo y fluido de la sesión activa
    select: { sender: true, text: true },
  })

  const conversationHistory = recentMsgs.reverse().map((m) => ({
    role: m.sender === "customer" ? "user" : "assistant",
    content: m.text, // Retener texto completo sin truncar para no perder direcciones ni detalles
  }))

  // 1.1 Contexto Real del Catálogo de la Sede
  // Extraer palabras clave combinando el mensaje entrante con los últimos mensajes de la conversación
  const fullConversationSearchText = [
    message,
    ...recentMsgs.map((m) => m.text),
  ].join(" ")

  // Catálogo completo de la sede activa (hasta 150 productos en stock para no omitir ningún producto)
  const products = await db.product.findMany({
    where: {
      active: true,
      ...branchFilter,
      stock: { gt: 0 },
    },
    select: { id: true, name: true, price: true, stock: true, unit: true },
    orderBy: [{ stock: "desc" }, { name: "asc" }],
    take: 150,
  })

  const catalogContext = products.length > 0
    ? products
        .map((p) => `- ${p.name} | Precio: $${p.price.toLocaleString("es-CO")} | Stock: ${p.stock} ${p.unit}s`)
        .join("\n")
    : "Catálogo vacío para esta sede. Informa que pronto se cargarán existencias."

  // Verificar si el cliente consultó explícitamente por un artículo que realmente no existe en el catálogo
  const isExplicitProductInquiry = /(?:tienen|tienes|venden|vende|busco|necesito|consiguen|hay|precio de|a c[oó]mo|a cu[aá]nto)\b/i.test(message)
  const messageWords = fullConversationSearchText
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GENERAL_QUERY_WORDS.has(w))

  let specificNotFoundNote = ""
  if (isExplicitProductInquiry && messageWords.length > 0 && products.length > 0) {
    const hasAnyMatch = messageWords.some((w) => {
      const norm = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      return products.some((p) => {
        const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        return pNorm.includes(norm) || norm.includes(pNorm)
      })
    })

    if (!hasAnyMatch && messageWords.length <= 3) {
      specificNotFoundNote = `\n⚠️ ATENCIÓN: El cliente consultó por "${messageWords.join(", ")}", pero NO está en el catálogo de esta sede. Infórmale con amabilidad que no disponemos de ese artículo y ofrécele con naturalidad los productos que sí tenemos en la lista de abajo.`
    }
  }

  const clientBalance = client.creditAccount?.balance || 0

  // 1.1 Consultar el pedido más reciente del cliente para trazabilidad y estado en tiempo real
  const activeOrder = await db.order.findFirst({
    where: {
      OR: [
        { customerPhone: cleanPhone },
        ...(client.id ? [{ clientId: client.id }] : []),
      ],
      ...(branchFilter || {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
    },
  })

  let orderTrackingContext = "El cliente no tiene pedidos registrados en el sistema."
  if (activeOrder) {
    const statusMap: Record<string, string> = {
      pendiente: "🟡 Pendiente (Recibido en tienda, en fila de alistamiento)",
      confirmado: "🟢 Confirmado (Confirmado por el comercio)",
      en_preparacion: "🔵 En Preparación (Empacando y alistando en el local)",
      en_camino: "🟣 En Camino (Despachado y en ruta hacia tu dirección)",
      entregado: "✅ Entregado (Completado y entregado con éxito)",
      cancelado: "🔴 Cancelado",
    }
    const currentStatusDesc = statusMap[activeOrder.status] || activeOrder.status.toUpperCase()
    const driverText = activeOrder.deliveryDriverName ? ` | Repartidor asignado: ${activeOrder.deliveryDriverName}` : ""
    const itemsText = activeOrder.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")

    orderTrackingContext = `Orden #${activeOrder.orderNumber}:
- Estado actual en tiempo real: ${currentStatusDesc}
- Productos: ${itemsText}
- Total: $${activeOrder.total.toLocaleString("es-CO")} (${activeOrder.paymentMethod})
- Dirección de entrega: ${activeOrder.deliveryAddress || "N/A"}${driverText}`
  }

  // 2. Cargar configuración oficial de tarifas de domicilio para esta sede
  const deliveryConfig = await getDeliveryConfig(branchId)
  const deliveryPromptContext = formatDeliveryPromptContext(deliveryConfig)

  // 3. Prompt de sistema cálido, humano y comercialmente efectivo
  const systemPrompt = `Eres un asesor de atención al cliente y ventas humano de "${branchName}" por ${channelLabel}.
Hablas exactamente como un vendedor o farmaceuta amable, empático, educado y profesional en el mostrador.

TONO Y PERSONALIDAD HUMANA:
- Habla con calidez, cercanía y respeto (tono colombiano / latinoamericano natural).
- NUNCA uses listas numeradas rígidas ni menús automáticos (PROHIBIDO hablar como un bot o conmutador tipo: "1️⃣ Hacer pedido, 2️⃣ Precios, 3️⃣ Saldo").
- NUNCA expongas análisis internos, razonamiento paso a paso, ni etiquetas <think>. Escribe ÚNICAMENTE el mensaje conversacional final para el cliente.

MANEJO DE SALUDOS Y CONVERSACIÓN NATURAL:
- Si el cliente te saluda ("Hola", "Buenas", "Buen día", "Hola buenas tardes"):
  Saluda con calidez y alegría, dale la bienvenida a "${branchName}" y pregúntale amablemente en qué le puedes colaborar hoy.
  ⚠️ REGLA CRÍTICA: NUNCA listes productos ni pongas el catálogo completo ante un simple saludo. Espera a que el cliente te diga qué medicina o producto busca.
- Si el cliente te responde negativamente ("No", "No gracias", "Nada más", "Por ahora no"):
  Agradécele con mucha amabilidad, dile que con el mayor gusto y que quedas a su entera disposición cuando lo necesite. ¡NUNCA le ofrezcas productos si te dijo que no!
- Si el cliente agradece ("Gracias", "Muchas gracias"):
  Responde con cortesía y calidez ("¡Con muchísimo gusto!", "¡Siempre a tu orden!").

CONSULTA DE PRODUCTOS Y PRECIOS:
- Revisa el "CATÁLOGO DE ESTA SEDE" provisto abajo.
- Si el cliente pregunta por un medicamento o artículo:
  Confírmale con agrado que sí lo tienes disponible, indícale el precio exacto y su presentación, y pregúntale amablemente cuántas unidades le gustaría pedir.
- Si el producto NO está en el catálogo:
  Explícaselo con amabilidad y educación ("En este momento no disponemos de ese artículo en esta sede..."), y si tienes una opción similar en el catálogo de abajo, sugiéresela amablemente.

FLUJO COMPLETO DE TOMA DE PEDIDOS Y ENTREGA A DOMICILIO:
1. DETECCIÓN DE PRODUCTOS:
   - Cuando el cliente indique qué productos quiere y la cantidad:
     * Si no ha indicado su dirección completa y barrio, pregúntale cordialmente: "¿A qué dirección te lo enviamos y en qué barrio te encuentras para coordinarte el domicilio?".
     * Si el cliente ya tiene dirección registrada (${client.address ? `"${client.address}"` : "ninguna"}), pregúntale: "¿Te lo despachamos a tu dirección registrada (${client.address || "..."}) o a otra? Por favor confírmanos también en qué barrio te encuentras".

2. VALIDACIÓN DE DIRECCIÓN Y CÁLCULO DE ENVÍO:
   - Cuando el cliente indique o confirme su dirección y barrio:
     * Valida la tarifa de envío según la tabla abajo (si el barrio está registrado en tarifas especiales, usa esa tarifa; si no, la tarifa global de $${deliveryConfig.globalFee.toLocaleString("es-CO")}).
     * Suma de inmediato: Subtotal de productos + Domicilio = Total a pagar.
     * Preséntale el valor claramente:
       "¡Listo! Serían [Productos] ($[Subtotal]) + domicilio a [Barrio] ($[Tarifa]), para un total de $[Total]. ¿Cómo prefieres cancelar: en efectivo contraentrega o por transferencia (Nequi / Daviplata / Bancolombia)?".

3. CONFIRMACIÓN Y CREACIÓN DE LA ORDEN:
   - Cuando el cliente confirme o indique cómo va a pagar (efectivo / transferencia):
     * Confirma la orden con entusiasmo: indícale que su pedido ya fue recibido y que lo estamos preparando de inmediato en tienda.
     * Si paga en efectivo y menciona con cuánto dinero paga (ej. "pago con 50 mil"), tómalo en cashPaid para que el domiciliario lleve el cambio.
     * Si paga por transferencia previa (Nequi / Daviplata / Bancolombia), pídele amablemente que te envíe el comprobante por este chat para verificarlo en caja y despachar de inmediato.
     * AGREGA AL FINAL DE TU MENSAJE el tag técnico obligatorio para que el sistema cree la orden en OmniPOS:
       [ORDEN_AUTO: {"items": [{"name": "nombre exacto según catálogo", "qty": 1}], "address": "dirección y barrio", "deliveryFee": 5000, "paymentMethod": "efectivo" | "transferencia", "cashPaid": 50000}]
     * ⚠️ NUNCA agregues [ORDEN_AUTO] si todavía estás preguntando qué productos desea, la dirección o el método de pago. Solo agrégalo cuando los productos, la dirección y la forma de pago estén completamente definidos por el cliente.

DATOS DEL CLIENTE:
- Nombre: "${client.name}"
- Saldo fiado pendiente: $${clientBalance.toLocaleString("es-CO")}
- Dirección registrada: ${client.address ? `"${client.address}"` : "Ninguna"}

ESTADO DE PEDIDOS (TRAZABILIDAD EN TIEMPO REAL):
Si el cliente pregunta por su pedido ("cómo va mi pedido?", "ya salió?"):
${orderTrackingContext}

TARIFAS DE DOMICILIO DE ESTA SEDE:
${deliveryPromptContext}

CATÁLOGO DE ESTA SEDE (${branchName}):
${catalogContext}
${config.aiSystemPrompt ? `\nInstrucciones especiales de la sede: ${config.aiSystemPrompt}` : ""}${specificNotFoundNote}`

  // 4. Invocación a la API oficial (OpenRouter o DeepSeek) con timeout de 30s
  const maxTokens = Math.max(config.maxTokensPerReply || 2048, 2048)

  async function sendAiRequest(
    currEndpoint: string,
    currKey: string,
    currModel: string,
    currIsOpener: boolean,
    currProvider: string
  ) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000) // 30 segundos
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currKey}`,
    }
    if (currIsOpener) {
      headers["HTTP-Referer"] = "https://omnipos.pro"
      headers["X-Title"] = "OmniPOS WhatsApp AI Agent"
    }

    try {
      const res = await fetch(currEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: currModel,
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
            { role: "user", content: message },
          ],
          max_tokens: maxTokens,
          temperature: 0.65,
          include_reasoning: false,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) {
        const errBody = await res.text()
        if (currIsOpener && (res.status === 429 || /rate limit|quota|credits|exceeded|free/i.test(errBody))) {
          try {
            await db.setting.upsert({
              where: { key: "openrouter_free_exhausted" },
              update: {
                value: JSON.stringify({
                  exhausted: true,
                  at: new Date().toISOString(),
                  status: res.status,
                  message: `Cuota de peticiones gratuitas agotada en OpenRouter (Error ${res.status}): ${errBody.slice(0, 160)}`,
                }),
              },
              create: {
                key: "openrouter_free_exhausted",
                value: JSON.stringify({
                  exhausted: true,
                  at: new Date().toISOString(),
                  status: res.status,
                  message: `Cuota de peticiones gratuitas agotada en OpenRouter (Error ${res.status}): ${errBody.slice(0, 160)}`,
                }),
              },
            })
          } catch {
            /* noop */
          }
        }
        throw new Error(`${currProvider} API (${res.status}): ${errBody.slice(0, 180)}`)
      } else {
        if (currIsOpener) {
          await db.setting.delete({ where: { key: "openrouter_free_exhausted" } }).catch(() => {})
        }
      }
      return await res.json()
    } catch (e: any) {
      clearTimeout(timer)
      const isAbort = e?.name === "AbortError"
      throw new Error(isAbort ? `${currProvider} timeout (+8.5s)` : (e as Error).message)
    }
  }

  let aiData: any = null
  let actualProvider = providerName
  let actualModel = model

  try {
    aiData = await sendAiRequest(endpoint, apiKey, model, isOpener, providerName)
  } catch (primaryErr) {
    console.warn(`[AI Primary ${providerName} Failed]`, (primaryErr as Error).message)

    // Intentar failover al proveedor alternativo si está disponible
    const canFailoverToOpenRouter = !isOpener && !!openerKey
    const canFailoverToDeepSeek = isOpener && !!dsKey

    if (canFailoverToOpenRouter) {
      console.log("[AI Failover] Intentando con OpenRouter...")
      try {
        actualProvider = "OpenRouter"
        actualModel = (config.openrouterModel || "openrouter/free").trim()
        aiData = await sendAiRequest(
          "https://openrouter.ai/api/v1/chat/completions",
          openerKey,
          actualModel,
          true,
          "OpenRouter"
        )
      } catch (secErr) {
        console.warn("[AI Failover OpenRouter Failed]", (secErr as Error).message)
        throw primaryErr
      }
    } else if (canFailoverToDeepSeek) {
      console.log("[AI Failover] Intentando con DeepSeek Directo...")
      try {
        actualProvider = "DeepSeek"
        actualModel = (config.deepseekModel || "deepseek-chat").trim()
        aiData = await sendAiRequest(
          "https://api.deepseek.com/chat/completions",
          dsKey,
          actualModel,
          false,
          "DeepSeek"
        )
      } catch (secErr) {
        console.warn("[AI Failover DeepSeek Failed]", (secErr as Error).message)
        throw primaryErr
      }
    } else {
      throw primaryErr
    }
  }

  let rawReply = aiData?.choices?.[0]?.message?.content || ""
  rawReply = sanitizeBotReply(rawReply, client?.name, activeOrder)

  const isModelFree = isOpener && (actualModel === "openrouter/free" || actualModel.includes("free"))
  const tokensUsed = aiData?.usage?.total_tokens || 0
  const promptTokens = aiData?.usage?.prompt_tokens || 0
  const completionTokens = aiData?.usage?.completion_tokens || 0
  const resolvedModelName = `${actualProvider}: ${aiData?.model || actualModel}`

  // Registrar y acumular consumo de tokens y costo para este cliente
  try {
    const { recordClientAiUsage } = await import("@/lib/ai-token-tracker")
    await recordClientAiUsage({
      phone: cleanPhone,
      clientId: client.id,
      clientName: client.name,
      model: resolvedModelName,
      promptTokens,
      completionTokens,
      totalTokens: tokensUsed,
      isFree: isModelFree,
    })
  } catch (trackErr: any) {
    console.warn("[AI Token Tracker Warning]:", trackErr.message)
  }

  let orderNumber: string | undefined
  let orderTotal: number | undefined
  let actionTaken: BotProcessResult["actionTaken"] = "ai_answered"

  // 5. Detectar si la IA generó una orden automática
  const orderTagMatch = rawReply.match(/\[ORDEN_AUTO:\s*(\{[\s\S]*?\})\s*\]/i)

  // Limpiar SIEMPRE el tag técnico de la respuesta que ve el cliente en WhatsApp
  rawReply = rawReply.replace(/\[ORDEN_AUTO:\s*\{[\s\S]*?\}\s*\]/gi, "").trim()

  // Evitar creación prematura si el bot todavía le está preguntando al cliente si confirma su dirección o método de pago
  const isAskingConfirmation =
    rawReply.includes("?") &&
    /\b(confirmas|confirma|a qu[eé] direcci[oó]n|cu[aá]l es tu direcci[oó]n|a d[oó]nde te lo enviamos|deseas pagar|con cu[aá]nto cancelas|a esa direcci[oó]n|a tu direcci[oó]n)\b/i.test(rawReply)

  if (orderTagMatch && config.autoCreateOrders && !isAskingConfirmation) {
    if (!rawReply) {
      rawReply = "🎉 ¡Perfecto! Hemos registrado tu pedido a domicilio."
    }
    try {
      let orderJsonStr = orderTagMatch[1].trim()
      if (orderJsonStr.startsWith("```")) {
        orderJsonStr = orderJsonStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
      }
      const orderPayload = JSON.parse(orderJsonStr)
      const itemsToCreate: { product: any; qty: number }[] = []

      if (Array.isArray(orderPayload.items)) {
        for (const it of orderPayload.items) {
          const rawName = String(it.name || "").toLowerCase().trim()
          if (!rawName) continue

          // 1. Buscar en los productos cargados
          let match: (typeof products)[0] | null | undefined = products.find((p) => {
            const pNorm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            const rNorm = rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            return pNorm.includes(rNorm) || rNorm.includes(pNorm)
          })

          // 2. Si no estaba en el subconjunto, buscar en toda la BD de esta sede por nombre
          if (!match) {
            match = await db.product.findFirst({
              where: {
                active: true,
                ...branchFilter,
                name: { contains: rawName },
              },
              select: { id: true, name: true, price: true, stock: true, unit: true },
            })
          }

          // 3. Si sigue sin encontrar, buscar por palabras clave
          if (!match) {
            const rWords = rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((w) => w.length >= 3 && !GENERAL_QUERY_WORDS.has(w))
            if (rWords.length > 0) {
              match = await db.product.findFirst({
                where: {
                  active: true,
                  ...branchFilter,
                  OR: rWords.map((w) => ({ name: { contains: w } })),
                },
                select: { id: true, name: true, price: true, stock: true, unit: true },
              })
            }
          }

          if (match) {
            itemsToCreate.push({ product: match, qty: Math.max(1, Number(it.qty) || 1) })
          }
        }
      }

      if (itemsToCreate.length > 0) {
        const subtotal = itemsToCreate.reduce((acc, it) => acc + it.product.price * it.qty, 0)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
        const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
        const genOrderNum = `PED-${dateStr}-${randomSuffix}`
        const finalAddress = orderPayload.address || client.address || (isTelegram ? "Dirección según Telegram" : "Dirección según WhatsApp")

        // Actualizar dirección del cliente si no tenía
        if (orderPayload.address && !client.address) {
          await db.client.update({
            where: { id: client.id },
            data: { address: orderPayload.address },
          }).catch(() => {})
        }

        // Determinar método de pago y calcular si el domiciliario debe cobrar
        const methodRaw = (orderPayload.paymentMethod || "").toLowerCase()
        const isTransfer =
          methodRaw.includes("transf") ||
          methodRaw.includes("nequi") ||
          methodRaw.includes("davi") ||
          methodRaw.includes("tarjeta") ||
          methodRaw.includes("banc")

        const paymentMethod = isTransfer ? "transferencia" : "efectivo"
        // Ambos inician como 'pendiente' hasta que el admin verifique el comprobante o el domiciliario cobre
        const paymentStatus = "pendiente"

        let deliveryFee = Number(orderPayload.deliveryFee)
        const resolvedDelivery = resolveDeliveryFee(`${finalAddress} ${message} ${rawReply}`, deliveryConfig)
        if (isNaN(deliveryFee) || deliveryFee <= 0) {
          deliveryFee = resolvedDelivery.fee
        }
        const total = subtotal + deliveryFee

        const cashPaid = Number(orderPayload.cashPaid) || 0
        let paymentNote = ""
        if (!isTransfer) {
          if (cashPaid > total) {
            const change = cashPaid - total
            paymentNote = `💵 Pago en Efectivo: Paga con $${cashPaid.toLocaleString("es-CO")} (Llevar cambio de $${change.toLocaleString("es-CO")}). El domiciliario DEBE cobrar $${total.toLocaleString("es-CO")} contraentrega ($${subtotal.toLocaleString("es-CO")} productos + $${deliveryFee.toLocaleString("es-CO")} envío).`
          } else {
            paymentNote = `💵 Pago en Efectivo: Cobrar $${total.toLocaleString("es-CO")} contraentrega ($${subtotal.toLocaleString("es-CO")} productos + $${deliveryFee.toLocaleString("es-CO")} envío).`
          }
        } else {
          paymentNote = `💳 Pago por Transferencia (Nequi/Daviplata): Pendiente por verificar comprobante por $${total.toLocaleString("es-CO")}. Una vez verificado por caja, el domiciliario NO debe cobrar dinero al cliente ($0).`
        }

        const createdOrder = await db.order.create({
          data: {
            orderNumber: genOrderNum,
            tenantId: branch?.tenantId || null,
            branchId,
            clientId: client.id,
            customerName: client.name,
            customerPhone: cleanPhone,
            deliveryAddress: finalAddress,
            deliveryNotes: paymentNote,
            notes: `Generado automáticamente por ${isTelegram ? `Telegram (@${config?.telegramBotUsername || "Bot"})` : "WhatsApp"} & ${providerName} IA (${branchName}). ${resolvedDelivery.appliedRule}.`,
            subtotal,
            tax: 0,
            deliveryFee,
            total,
            paymentMethod,
            paymentStatus,
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

        orderNumber = createdOrder.orderNumber
        orderTotal = createdOrder.total
        actionTaken = "order_created"

        // Si el pedido ya quedó pagado (transferencia), pasar de inmediato a Ventas
        if (createdOrder.paymentStatus === "pagado") {
          try {
            const { syncOrderToSale } = await import("@/lib/order-sale-sync")
            await syncOrderToSale(createdOrder.id)
          } catch (syncErr) {
            console.warn("[Order -> Sale sync error]", syncErr)
          }
        }

        // Agregar pie de confirmación con el # de orden y recordatorio de pago
        const feeLine = deliveryFee > 0 ? `\n🛵 *Costo Domicilio:* $${deliveryFee.toLocaleString("es-CO")}` : ""
        const paymentSummary = isTransfer
          ? "💳 *Método de Pago:* Transferencia previa (Por favor envía el comprobante por este chat para verificar y despachar tu pedido)"
          : `💵 *Método de Pago:* Efectivo ($${total.toLocaleString("es-CO")} a cobrar contraentrega)`

        rawReply += `\n\n📦 *Pedido Generado:* #${createdOrder.orderNumber}\n🧾 *Subtotal Productos:* $${subtotal.toLocaleString("es-CO")}${feeLine}\n💵 *Total:* $${total.toLocaleString("es-CO")}\n${paymentSummary}\n📍 *Entrega:* ${finalAddress}`

        // Cerrar la sesión de conversación para que futuras consultas arranquen desde cero sin arrastrar este pedido
        await closeConversationSession(cleanPhone, "order_created", createdOrder.orderNumber)
      }
    } catch (parseErr) {
      console.warn(`[${providerName} Order Parse Error]`, parseErr)
    }
  }

  // Si la respuesta sigue vacía y no se generó orden, activar el motor local determinista
  if (!rawReply || !rawReply.trim()) {
    if (orderNumber) {
      rawReply = `🎉 *¡Pedido Recibido con Éxito!*\nTu orden #${orderNumber} ha sido registrada.`
    } else {
      throw new Error("AI returned empty content after processing")
    }
  }

  return {
    reply: rawReply,
    actionTaken,
    orderNumber,
    total: orderTotal,
    tokensUsed,
    modelUsed: `${actualProvider}: ${aiData?.model || actualModel}`,
  }
}
