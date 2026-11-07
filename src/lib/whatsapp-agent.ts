import { db, ensureMySqlTextColumns } from "@/lib/db"
import { getDeliveryConfig, resolveDeliveryFee, formatDeliveryPromptContext } from "@/lib/delivery-config"

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
 * Motor de Inteligencia de WhatsApp & DeepSeek para OmniPOS
 * Multi-Sede: Opera con el catálogo, inventario, precios y pedidos exclusivos de la sede vinculada.
 * Ahorro extremo de tokens: Inyecta únicamente los productos relevantes y mantiene el historial condensado.
 */
export async function processWhatsAppMessage(params: {
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

  // 4. INTENTO 2: Motor Local (Fallback y Reglas Deterministas)
  if (!result) {
    const lowerText = text.toLowerCase()

    // Regla 1: Consulta de saldo / fiado
    if (
      lowerText.includes("debo") ||
      lowerText.includes("saldo") ||
      lowerText.includes("cuenta") ||
      lowerText.includes("fiado") ||
      lowerText.includes("deuda")
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

    // Regla 3: Consulta de catálogo en esta sede
    if (!result) {
      const allProds = await db.product.findMany({
        where: { active: true, ...branchFilter },
        select: { name: true, price: true, stock: true, unit: true },
      })

      const matchedProds = allProds.filter((p) => {
        const pWords = p.name.toLowerCase().split(" ").filter((w) => w.length > 2)
        return pWords.some((w) => lowerText.includes(w))
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
          reply: `🔍 *Catálogo Disponible (${branch?.name || "Esta Sede"})*\n\n${listText}\n\n¿Deseas que te enviemos algún producto a domicilio? Indícanos la cantidad, tu dirección y en qué barrio te encuentras.`,
          actionTaken: "stock_checked",
        }
      } else {
        const topProds = allProds.slice(0, 5)
        const topList = topProds.length > 0
          ? `\n\n🛒 *Algunos productos disponibles hoy:*\n` +
            topProds.map((p) => `• *${p.name}*: $${p.price.toLocaleString("es-CO")}`).join("\n") +
            `\n\n¿Deseas pedir alguno a domicilio?`
          : ""
        result = {
          reply:
            (config?.welcomeMessage?.trim() ||
              `👋 *¡Hola! Bienvenido a la atención por ${effectiveChannel === "telegram" ? "Telegram" : "WhatsApp"} de ${branch?.name || "OmniPOS"}.*\n\n¿En qué te podemos ayudar hoy?\n1️⃣ *Hacer un Pedido:* Envíanos tu lista, tu dirección y tu barrio.\n2️⃣ *Consultar Precios:* Escríbenos el nombre del producto que buscas.\n3️⃣ *Consultar Fiados / Deuda:* Pregúntanos _"¿Cuánto debo?"_.`) + topList,
          actionTaken: "menu_shown",
        }
      }
    }
  }

  // Garantizar que la respuesta nunca sea nula o vacía
  if (!result || !result.reply || !result.reply.trim()) {
    result = {
      reply: `👋 *¡Hola! Bienvenido a ${branch?.name || "nuestra tienda"}.*\n\n¿En qué te podemos ayudar hoy?\n• Escríbenos los productos que necesitas, tu dirección y tu barrio, y te los despachamos a domicilio.\n• Pregúntanos precios o disponibilidad de cualquier artículo.\n\n¡Estamos a tu servicio!`,
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
  const branchFilter = branchId ? { branchId } : {}

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
  let endpoint = isOpener
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.deepseek.com/chat/completions"

  // 1. Ahorro de Tokens & Contexto Real del Catálogo de la Sede
  // Palabras generales de consulta que NO son nombres de productos
  const GENERAL_QUERY_WORDS = new Set([
    "hola", "buenas", "buenos", "dias", "tardes", "noches", "por", "favor", "gracias",
    "para", "quiero", "tienen", "tiene", "venden", "vende", "hay", "que", "cual", "cuales",
    "productos", "producto", "catalogo", "disponible", "disponibles", "lista", "precios",
    "precio", "costo", "cuanto", "vale", "muestrame", "menu", "servicios", "articulos",
    "stock", "medicamentos", "medicamento", "remedios", "remedio", "droga", "drogas", "farmacia"
  ])

  const messageWords = message
    .toLowerCase()
    .replace(/[^a-záéíóúñ0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)

  const specificKeywords = messageWords.filter((w) => !GENERAL_QUERY_WORDS.has(w) && w.length > 2)

  // Siempre obtener los productos destacados / disponibles de esta sede (máximo 8 para ahorrar tokens)
  const defaultBranchProducts = await db.product.findMany({
    where: {
      active: true,
      ...branchFilter,
      stock: { gt: 0 },
    },
    select: { id: true, name: true, price: true, stock: true, unit: true },
    orderBy: { stock: "desc" },
    take: 8,
  })

  // Si el usuario mencionó palabras específicas (ej. alcohol, ibuprofeno, acetaminofen), buscarlas
  let matchedProducts: typeof defaultBranchProducts = []
  if (specificKeywords.length > 0) {
    matchedProducts = await db.product.findMany({
      where: {
        active: true,
        ...branchFilter,
        OR: specificKeywords.map((k) => ({
          name: { contains: k },
        })),
      },
      select: { id: true, name: true, price: true, stock: true, unit: true },
      take: 6,
    })
  }

  // Combinar los productos que coinciden con los destacados sin duplicados
  const combinedProductsMap = new Map<string, (typeof defaultBranchProducts)[0]>()
  for (const p of matchedProducts) combinedProductsMap.set(p.id, p)
  for (const p of defaultBranchProducts) {
    if (combinedProductsMap.size < 8) combinedProductsMap.set(p.id, p)
  }
  const products = Array.from(combinedProductsMap.values())

  const catalogContext = products.length > 0
    ? products
        .map((p) => `- ${p.name} | Precio: $${p.price.toLocaleString("es-CO")} | Stock: ${p.stock} ${p.unit}s`)
        .join("\n")
    : "Catálogo vacío para esta sede. Informa que pronto se cargarán existencias."

  // Nota para el LLM si buscó algo específico que NO existe en la sede
  const specificNotFoundNote = specificKeywords.length > 0 && matchedProducts.length === 0
    ? `\n⚠️ ATENCIÓN: El cliente consultó por "${specificKeywords.join(", ")}", pero NO está en el catálogo de esta sede. Infórmale con amabilidad que no disponemos de ese artículo y ofrécele los que sí tenemos en la lista de abajo.`
    : ""

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

  // 2. Historial condensado: Últimos 4 mensajes (ahorro de tokens)
  const recentMsgs = await db.whatsAppMessage.findMany({
    where: { phone: cleanPhone },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { sender: true, text: true },
  })

  const conversationHistory = recentMsgs.reverse().map((m) => ({
    role: m.sender === "customer" ? "user" : "assistant",
    content: m.text.slice(0, 200), // Máximo 200 caracteres por mensaje para ahorrar tokens
  }))

  // 2.1 Cargar configuración oficial de tarifas de domicilio para esta sede
  const deliveryConfig = await getDeliveryConfig(branchId)
  const deliveryPromptContext = formatDeliveryPromptContext(deliveryConfig)

  // 3. Prompt de sistema ultra-conciso y optimizado
  const systemPrompt = `Eres el asistente virtual comercial de "${branchName}" por ${channelLabel}.
Tu misión: Atender con calidez, consultar precios, sugerir productos, dar estado de pedidos en tiempo real y tomar órdenes a domicilio.

REGLAS DE ORO (Ahorro de tokens y precisión):
1. Responde SIEMPRE en español de forma concisa (MÁXIMO 3 líneas o viñetas limpias).
2. CATÁLOGO REAL: SOLO cotiza y vende los productos listados en el "CATÁLOGO DE ESTA SEDE". NUNCA inventes productos ni precios.
3. Si el cliente saluda, envía "/start" o pregunta qué productos hay o qué venden, dale la bienvenida a "${branchName}" y lista los productos disponibles indicando su precio exacto y disponibilidad.
4. Si el cliente pide o menciona un producto que NO está en el catálogo, indícale amablemente que no lo manejas en esta sede y recomiéndale los que sí tienes disponibles.
5. Datos del cliente: Nombre "${client.name}". Fiado / saldo pendiente: $${clientBalance.toLocaleString("es-CO")}. Dirección registrada: ${client.address ? `"${client.address}"` : "Ninguna"}.
6. PROTOCOLO OBLIGATORIO DE TOMA DE PEDIDOS Y COSTO DE DOMICILIO:
${deliveryPromptContext}

- EL AGENTE ES QUIEN DEBE PREGUNTAR LA DIRECCIÓN INCLUYENDO EL BARRIO:
  * Cuando el cliente quiera pedir productos a domicilio pero no haya indicado su dirección completa o su barrio:
    TÚ debes preguntarle directamente: "¿A qué dirección te lo enviamos y en qué barrio te encuentras?".
  * Si el cliente ya tiene dirección registrada (${client.address ? `"${client.address}"` : "ninguna"}):
    Pregúntale: "¿Te lo enviamos a tu dirección registrada ${client.address || "..."} o a otra dirección? Por favor confírmanos también en qué barrio te encuentras".

- EL AGENTE ES QUIEN DEFINE Y VALIDA LA TARIFA (NUNCA EL CLIENTE):
  * TÚ analizas lo que respondió el cliente y verificas si el barrio coincide con la tabla de tarifas guardadas:
    1. Si el barrio coincide con la lista guardada (ejemplo: Barrio El Dorado): TÚ tomas y aplicas la tarifa guardada para ese barrio.
    2. Si el barrio NO coincide con la lista guardada, si es un barrio diferente, o si el cliente solo dio una dirección general: TÚ aplicas automáticamente la TARIFA GLOBAL OBLIGATORIA ($${deliveryConfig.globalFee.toLocaleString("es-CO")}).
  * En cualquiera de los dos casos, suma INMEDIATAMENTE: Subtotal productos + Costo de envío definido por ti = Total a pagar.
    Infórmale de una vez al cliente el total exacto con envío:
    "Tus productos suman $[Subtotal] + envío ($[Tarifa]) = Total a pagar: $[Total]. ¿Cómo prefieres pagar: en efectivo contraentrega o por transferencia?".

- ⚠️ PROHIBICIÓN ESTRICTA DE ORDEN PREMATURA:
  * Si en tu mensaje estás PREGUNTANDO la dirección/barrio o el método de pago: NUNCA agregues el bloque [ORDEN_AUTO].
  * ÚNICAMENTE debes agregar el bloque [ORDEN_AUTO] cuando en el chat el cliente ya haya elegido o indicado su forma de pago.
[ORDEN_AUTO: {"items": [{"name": "nombre del producto del catalogo", "qty": 1}], "address": "dirección y barrio confirmados", "deliveryFee": 5000, "paymentMethod": "efectivo" | "transferencia", "cashPaid": 50000}]
7. CONSULTAS Y ESTADO DE PEDIDOS (TRAZABILIDAD EN TIEMPO REAL):
Si el cliente pregunta cómo va su pedido, dónde está, si ya salió o por el estado de su orden:
- Consulta OBLIGATORIAMENTE la sección "ÚLTIMO PEDIDO DEL CLIENTE" abajo.
- Si el estado es "En Camino": Infórmale con alegría que su pedido #${activeOrder?.orderNumber || ""} YA ESTÁ EN CAMINO a su dirección (${activeOrder?.deliveryAddress || ""})${activeOrder?.deliveryDriverName ? ` con el repartidor ${activeOrder.deliveryDriverName}` : ""} 🛵.
- Si el estado es "En Preparación": Indícale que lo estamos alistando y empacando en la tienda y pronto saldrá a reparto.
- Si el estado es "Pendiente" o "Confirmado": Indícale que fue recibido y está en fila de alistamiento.
- Si el estado es "Entregado": Confírmale que figura entregado con éxito.
- NUNCA inventes que está en proceso si ya está "En Camino".

${config.aiSystemPrompt ? `Instrucciones especiales de la sede: ${config.aiSystemPrompt}` : ""}${specificNotFoundNote}

ÚLTIMO PEDIDO DEL CLIENTE:
${orderTrackingContext}

CATÁLOGO DE ESTA SEDE (${branchName}):
${catalogContext}`

  // 4. Invocación a la API oficial (OpenRouter o DeepSeek) con timeout estricto de 8.5s y failover automático
  const maxTokens = config.maxTokensPerReply || 250

  async function sendAiRequest(
    currEndpoint: string,
    currKey: string,
    currModel: string,
    currIsOpener: boolean,
    currProvider: string
  ) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8500) // 8.5 segundos máximo
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
          temperature: 0.3,
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
    })
  } catch (trackErr: any) {
    console.warn("[AI Token Tracker Warning]:", trackErr.message)
  }

  let orderNumber: string | undefined
  let orderTotal: number | undefined
  let actionTaken: BotProcessResult["actionTaken"] = "ai_answered"

  // 5. Detectar si la IA generó una orden automática
  const orderTagMatch = rawReply.match(/\[ORDEN_AUTO:\s*(\{[\s\S]*\})\s*\]/)

  // Limpiar SIEMPRE el tag técnico de la respuesta que ve el cliente en WhatsApp
  rawReply = rawReply.replace(/\[ORDEN_AUTO:\s*\{[\s\S]*\}\s*\]/g, "").trim()

  // Evitar creación prematura si el bot todavía le está preguntando al cliente si confirma su dirección o método de pago
  const isAskingConfirmation =
    rawReply.includes("?") &&
    /\b(confirmas|confirma|a qu[eé] direcci[oó]n|cu[aá]l es tu direcci[oó]n|a d[oó]nde te lo enviamos|deseas pagar|con cu[aá]nto cancelas|a esa direcci[oó]n|a tu direcci[oó]n)\b/i.test(rawReply)

  if (orderTagMatch && config.autoCreateOrders && !isAskingConfirmation) {
    try {
      const orderPayload = JSON.parse(orderTagMatch[1])
      const itemsToCreate: { product: any; qty: number }[] = []

      if (Array.isArray(orderPayload.items)) {
        for (const it of orderPayload.items) {
          const rawName = String(it.name || "").toLowerCase().trim()
          if (!rawName) continue

          // 1. Buscar en los productos cargados
          let match: (typeof products)[0] | null | undefined = products.find((p) =>
            p.name.toLowerCase().includes(rawName) || rawName.includes(p.name.toLowerCase())
          )

          // 2. Si no estaba en el subconjunto, buscar en toda la BD de esta sede
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
      }
    } catch (parseErr) {
      console.warn(`[${providerName} Order Parse Error]`, parseErr)
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
