import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

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
          maxTokensPerReply: 250,
          welcomeMessage: "¡Hola! Bienvenido a nuestro servicio de atención automática por WhatsApp. ¿En qué te podemos colaborar hoy?",
          aiSystemPrompt: "Atiende con amabilidad y concisión. Consulta disponibilidad en catálogo y toma pedidos a domicilio.",
        },
      })
    }

    // Ocultar parcialmente tokens sensibles para seguridad en frontend
    const effectiveDeepSeekKey = config.deepseekApiKey || process.env.DEEPSEEK_API_KEY || ""
    const effectiveOpenRouterKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY || ""
    const effectiveMetaToken = config.metaAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || ""

    const maskedConfig = {
      ...config,
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
      maxTokensPerReply: Number(maxTokensPerReply) || 250,
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

    return NextResponse.json({
      ok: true,
      config: {
        ...updated,
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
