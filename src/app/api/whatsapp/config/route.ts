import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findWabaId } from "@/lib/meta-whatsapp-policy"

export const dynamic = "force-dynamic"

/**
 * GET: Obtener configuración de WhatsApp e IA DeepSeek para una sede específica
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get("branchId")

    // Listar todas las sedes disponibles
    const branches = await db.branch.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true, isMain: true, address: true, phone: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    })

    const targetBranchId = branchId || branches[0]?.id

    if (!targetBranchId) {
      return NextResponse.json({
        config: null,
        branches: [],
        message: "No hay sedes registradas",
      })
    }

    // Buscar o auto-crear configuración para esta sede
    let config = await db.whatsAppConfig.findUnique({
      where: { branchId: targetBranchId },
    })

    if (!config) {
      const targetBranch = branches.find((b) => b.id === targetBranchId)
      config = await db.whatsAppConfig.create({
        data: {
          branchId: targetBranchId,
          phoneNumber: targetBranch?.phone || "",
          metaVerifyToken: `omnipos_verify_${targetBranchId.slice(-6)}`,
          aiProvider: "deepseek",
          deepseekModel: "deepseek-chat",
          openrouterModel: "deepseek/deepseek-chat",
          aiEnabled: true,
          autoCreateOrders: true,
          maxTokensPerReply: 2048,
          welcomeMessage: "¡Hola! Bienvenido a nuestro servicio de atención por WhatsApp. ¿En qué te podemos colaborar hoy?",
          aiSystemPrompt: "Atiende con amabilidad y calidez humana. Consulta disponibilidad en catálogo y toma pedidos a domicilio.",
        },
      })
    }

    // Ocultar parcialmente tokens sensibles para seguridad en frontend
    const effectiveDeepSeekKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || ""
    const effectiveOpenRouterKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY || ""
    const effectiveMetaToken = config.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ""

    // Cargar WABA ID guardado en settings si existe
    let metaWabaId = process.env.WHATSAPP_WABA_ID || ""
    try {
      const savedWaba = await db.setting.findFirst({
        where: {
          OR: [{ key: `meta_waba_id_${targetBranchId}` }, { key: "meta_waba_id" }],
        },
      })
      if (savedWaba?.value) {
        metaWabaId = savedWaba.value.trim()
      }
    } catch {}

    const maskedConfig = {
      ...config,
      metaWabaId,
      hasDeepSeekKey: !!effectiveDeepSeekKey,
      hasOpenRouterKey: !!effectiveOpenRouterKey,
      hasMetaToken: !!effectiveMetaToken,
      hasTelegramToken: !!config.telegramBotToken,
      deepseekApiKeyMasked: effectiveDeepSeekKey
        ? `${effectiveDeepSeekKey.slice(0, 5)}••••••••${effectiveDeepSeekKey.slice(-4)}`
        : "",
      openrouterApiKeyMasked: effectiveOpenRouterKey
        ? `${effectiveOpenRouterKey.slice(0, 8)}••••••••${effectiveOpenRouterKey.slice(-4)}`
        : "",
      metaAccessTokenMasked: effectiveMetaToken
        ? `${effectiveMetaToken.slice(0, 6)}••••••••${effectiveMetaToken.slice(-4)}`
        : "",
      telegramBotTokenMasked: config.telegramBotToken
        ? `${config.telegramBotToken.slice(0, 6)}••••••••${config.telegramBotToken.slice(-4)}`
        : "",
    }

    return NextResponse.json({
      config: maskedConfig,
      branches,
      activeBranchId: targetBranchId,
    })
  } catch (error) {
    console.error("[WhatsApp Config GET Error]:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * POST: Guardar o actualizar configuración de WhatsApp e IA DeepSeek para la sede
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      branchId,
      phoneNumber,
      metaPhoneNumberId,
      metaAccessToken,
      metaVerifyToken,
      telegramBotToken,
      telegramBotUsername,
      telegramEnabled,
      aiProvider,
      deepseekApiKey,
      deepseekModel,
      openrouterApiKey,
      openrouterModel,
      aiEnabled,
      aiSystemPrompt,
      welcomeMessage,
      autoCreateOrders,
      maxTokensPerReply,
    } = body

    if (!branchId) {
      return NextResponse.json(
        { error: "El ID de sede (branchId) es obligatorio" },
        { status: 400 }
      )
    }

    // Preparar objeto de actualización
    const dataToUpdate: Record<string, unknown> = {
      phoneNumber: phoneNumber ?? null,
      metaPhoneNumberId: metaPhoneNumberId ?? null,
      metaVerifyToken: metaVerifyToken || "omnipos_verify_token_2026",
      telegramBotUsername: telegramBotUsername ?? null,
      telegramEnabled: Boolean(telegramEnabled),
      aiProvider: aiProvider || "deepseek",
      deepseekModel: deepseekModel || "deepseek-chat",
      openrouterModel: (openrouterModel && String(openrouterModel).endsWith(":free") && openrouterModel !== "openrouter/free")
        ? "openrouter/free"
        : (openrouterModel || "openrouter/free"),
      aiEnabled: Boolean(aiEnabled),
      aiSystemPrompt: aiSystemPrompt ?? null,
      welcomeMessage: welcomeMessage ?? null,
      autoCreateOrders: Boolean(autoCreateOrders),
      maxTokensPerReply: Number(maxTokensPerReply) || 2048,
    }

    // Solo actualizar tokens si se enviaron valores reales no enmascarados
    if (deepseekApiKey !== undefined) {
      if (deepseekApiKey === "") {
        dataToUpdate.deepseekApiKey = null
      } else if (!deepseekApiKey.includes("••••")) {
        dataToUpdate.deepseekApiKey = deepseekApiKey.trim()
      }
    }
    if (openrouterApiKey !== undefined) {
      if (openrouterApiKey === "") {
        dataToUpdate.openrouterApiKey = null
      } else if (!openrouterApiKey.includes("••••")) {
        dataToUpdate.openrouterApiKey = openrouterApiKey.trim()
      }
    }
    if (metaAccessToken !== undefined) {
      if (metaAccessToken === "") {
        dataToUpdate.metaAccessToken = null
      } else if (!metaAccessToken.includes("••••")) {
        dataToUpdate.metaAccessToken = metaAccessToken.trim()
      }
    }
    if (telegramBotToken !== undefined) {
      if (telegramBotToken === "") {
        dataToUpdate.telegramBotToken = null
      } else if (!telegramBotToken.includes("••••")) {
        dataToUpdate.telegramBotToken = telegramBotToken.trim()
      }
    }

    const updated = await db.whatsAppConfig.upsert({
      where: { branchId },
      create: {
        branchId,
        ...dataToUpdate,
      },
      update: dataToUpdate,
    })

    // Guardar WABA ID en settings si se proporcionó
    let savedWabaId = body.metaWabaId ? String(body.metaWabaId).trim() : ""
    if (savedWabaId) {
      try {
        await db.setting.upsert({
          where: { key: `meta_waba_id_${branchId}` },
          create: { key: `meta_waba_id_${branchId}`, value: savedWabaId },
          update: { value: savedWabaId },
        })
        await db.setting.upsert({
          where: { key: "meta_waba_id" },
          create: { key: "meta_waba_id", value: savedWabaId },
          update: { value: savedWabaId },
        })
      } catch (e) {
        console.warn("[WhatsApp Config POST] Error guardando metaWabaId en settings:", e)
      }
    } else {
      try {
        const found = await db.setting.findFirst({
          where: {
            OR: [{ key: `meta_waba_id_${branchId}` }, { key: "meta_waba_id" }],
          },
        })
        if (found?.value) savedWabaId = found.value.trim()
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      config: {
        ...updated,
        metaWabaId: savedWabaId,
        hasDeepSeekKey: !!updated.deepseekApiKey,
        hasOpenRouterKey: !!updated.openrouterApiKey,
        hasMetaToken: !!updated.metaAccessToken,
        hasTelegramToken: !!updated.telegramBotToken,
      },
      message: "Configuración omnicanal (WhatsApp, Telegram e IA) guardada exitosamente.",
    })
  } catch (error) {
    console.error("[WhatsApp Config POST Error]:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * PATCH: Acciones especiales — validar conexión con Meta Cloud API
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, phoneNumberId, accessToken, branchId } = body

    if (action !== "test_meta") {
      return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 })
    }

    if (!phoneNumberId) {
      return NextResponse.json(
        { error: "Se requiere el Phone Number ID para validar la conexión con Meta" },
        { status: 400 }
      )
    }

    // Resolver token real: si el cliente envía token enmascarado o vacío, buscar en DB o env
    let realToken = (accessToken || "").trim()
    if (!realToken || realToken.includes("•") || realToken.includes("••••")) {
      const config = branchId
        ? await db.whatsAppConfig.findUnique({ where: { branchId } })
        : await db.whatsAppConfig.findFirst()
      realToken = config?.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ""
    }

    // Sanitizar token eliminando caracteres no-ASCII / ByteString
    realToken = realToken.replace(/[\u2022\u2023\u25E6\u2043\u2219•]/g, "").trim()

    if (!realToken) {
      return NextResponse.json(
        { ok: false, error: "No se encontró un Access Token válido de Meta. Ingresa o guarda el token en Configuración." },
        { status: 200 }
      )
    }

    const startMs = Date.now()

    // Llamar a la API de Meta Graph para verificar el Phone Number ID
    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(String(phoneNumberId).trim())}?fields=display_phone_number,verified_name,quality_rating,status`,
      {
        headers: {
          Authorization: `Bearer ${realToken}`,
          "Content-Type": "application/json",
        },
        // Timeout manual: 8 segundos
        signal: AbortSignal.timeout(8000),
      }
    )

    const latencyMs = Date.now() - startMs
    const metaData = await metaRes.json().catch(() => ({}))

    if (!metaRes.ok) {
      const errorMsg =
        metaData?.error?.message ||
        metaData?.error?.error_user_msg ||
        `Error HTTP ${metaRes.status} desde Meta Graph API`
      return NextResponse.json(
        { ok: false, error: errorMsg, latencyMs },
        { status: 200 }
      )
    }

    // Auto-detectar WABA ID desde el token/cuentas asociadas de forma inteligente
    const detectedWabaId = await findWabaId(realToken, phoneNumberId, null, branchId)

    // Respuesta exitosa de Meta Graph API
    return NextResponse.json({
      ok: true,
      phoneNumber: metaData.display_phone_number || metaData.phone_number || null,
      displayName: metaData.verified_name || metaData.display_phone_number || null,
      qualityRating: metaData.quality_rating || null,
      verifiedName: metaData.verified_name || null,
      status: metaData.status || "CONNECTED",
      wabaId: detectedWabaId,
      latencyMs,
    })
  } catch (error) {
    const isTimeout = (error as Error).name === "AbortError" || (error as Error).name === "TimeoutError"
    return NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "Tiempo de espera agotado (>8s). Verifica tu conexión o que el Access Token sea válido."
          : "Error al conectar con Meta Graph API: " + (error as Error).message,
      },
      { status: 200 }
    )
  }
}
