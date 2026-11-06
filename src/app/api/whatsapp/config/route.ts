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
          deepseekModel: "deepseek-chat",
          aiEnabled: true,
          autoCreateOrders: true,
          maxTokensPerReply: 250,
          welcomeMessage: "¡Hola! Bienvenido a nuestro servicio de atención automática por WhatsApp. ¿En qué te podemos colaborar hoy?",
          aiSystemPrompt: "Atiende con amabilidad y concisión. Consulta disponibilidad en catálogo y toma pedidos a domicilio.",
        },
      })
    }

    // Ocultar parcialmente tokens sensibles para seguridad en frontend
    const maskedConfig = {
      ...config,
      hasDeepSeekKey: !!config.deepseekApiKey,
      hasMetaToken: !!config.metaAccessToken,
      deepseekApiKeyMasked: config.deepseekApiKey
        ? `${config.deepseekApiKey.slice(0, 5)}••••••••${config.deepseekApiKey.slice(-4)}`
        : "",
      metaAccessTokenMasked: config.metaAccessToken
        ? `${config.metaAccessToken.slice(0, 6)}••••••••${config.metaAccessToken.slice(-4)}`
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
      deepseekApiKey,
      deepseekModel,
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
      deepseekModel: deepseekModel || "deepseek-chat",
      aiEnabled: Boolean(aiEnabled),
      aiSystemPrompt: aiSystemPrompt ?? null,
      welcomeMessage: welcomeMessage ?? null,
      autoCreateOrders: Boolean(autoCreateOrders),
      maxTokensPerReply: Number(maxTokensPerReply) || 250,
    }

    // Solo actualizar tokens si se enviaron valores reales no enmascarados
    if (deepseekApiKey && !deepseekApiKey.includes("••••")) {
      dataToUpdate.deepseekApiKey = deepseekApiKey.trim()
    }
    if (metaAccessToken && !metaAccessToken.includes("••••")) {
      dataToUpdate.metaAccessToken = metaAccessToken.trim()
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
        hasMetaToken: !!updated.metaAccessToken,
      },
      message: "Configuración de WhatsApp e IA guardada exitosamente para la sede.",
    })
  } catch (error) {
    console.error("[WhatsApp Config POST Error]:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
