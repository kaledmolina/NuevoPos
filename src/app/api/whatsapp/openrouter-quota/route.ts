import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/whatsapp/openrouter-quota — Verifica el estado de la cuota y peticiones gratis en OpenRouter
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get("branchId")
    const explicitKey = searchParams.get("apiKey")
    const shouldProbe = searchParams.get("probe") === "true"

    let config: any = null
    if (branchId) {
      config = await db.whatsAppConfig.findUnique({
        where: { branchId },
      })
    } else {
      config = await db.whatsAppConfig.findFirst({
        where: { openrouterApiKey: { not: null } },
      })
    }

    let resolvedKey = explicitKey
    if (!resolvedKey || resolvedKey.includes("••••")) {
      resolvedKey = config?.openrouterApiKey || process.env.OPENROUTER_API_KEY || ""
    }

    const currentModel = (config?.openrouterModel || "openrouter/free").trim()
    const isFreeModel = currentModel === "openrouter/free" || currentModel.endsWith(":free")

    if (!resolvedKey || resolvedKey.trim() === "" || resolvedKey.includes("••••")) {
      return NextResponse.json({
        ok: true,
        configured: false,
        isFreeModel,
        model: currentModel,
        isExhausted: false,
        message: "No hay una API Key de OpenRouter configurada todavía.",
      })
    }

    // 1. Revisar si hay un registro de cuota agotada guardado en base de datos
    const exhaustedSetting = await db.setting.findUnique({
      where: { key: "openrouter_free_exhausted" },
    })

    let isExhausted = false
    let exhaustedReason = ""
    let lastExhaustedAt: string | null = null

    if (exhaustedSetting?.value) {
      try {
        const parsed = JSON.parse(exhaustedSetting.value)
        if (parsed?.exhausted) {
          const diffMinutes = (Date.now() - new Date(parsed.at).getTime()) / (1000 * 60)
          // Considerar activo el aviso de agotado si ocurrió hace menos de 15 minutos
          if (diffMinutes < 15) {
            isExhausted = true
            exhaustedReason = parsed.message || "Límite de peticiones gratuitas alcanzado recientemente en OpenRouter (Error 429)."
            lastExhaustedAt = parsed.at
          } else {
            // Ya pasaron más de 15 minutos, auto-limpiar para reintentar
            await db.setting.delete({ where: { key: "openrouter_free_exhausted" } }).catch(() => {})
          }
        }
      } catch {
        /* noop */
      }
    }

    // 2. Consultar el endpoint de autenticación y límites de la llave en OpenRouter
    let keyData: any = null
    try {
      const authRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: {
          Authorization: `Bearer ${resolvedKey.trim()}`,
        },
        cache: "no-store",
      })

      if (!authRes.ok) {
        const errText = await authRes.text()
        if (authRes.status === 401) {
          return NextResponse.json({
            ok: false,
            configured: true,
            isFreeModel,
            model: currentModel,
            isExhausted: true,
            exhaustedReason: "La API Key de OpenRouter no es válida o fue revocada (Error 401).",
            message: "API Key de OpenRouter inválida.",
          })
        } else if (authRes.status === 429) {
          isExhausted = true
          exhaustedReason = "Límite de tasa (429 Rate Limit) alcanzado en OpenRouter."
        }
      } else {
        const json = await authRes.json()
        keyData = json.data
      }
    } catch (authErr: any) {
      console.warn("[OpenRouter Key Check Warning]:", authErr.message)
    }

    // 3. Probar disponibilidad en vivo si se solicitó probe=true (ej: click en 'Comprobar Cuota')
    let probeSuccess: boolean | null = null
    let probeLatency: number | null = null

    if (shouldProbe) {
      const startTime = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 7000)

      try {
        const probeRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolvedKey.trim()}`,
            "HTTP-Referer": "https://omnipos.pro",
            "X-Title": "OmniPOS Quota Check",
          },
          body: JSON.stringify({
            model: currentModel,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer))

        probeLatency = Date.now() - startTime

        if (!probeRes.ok) {
          const errBody = await probeRes.text()
          probeSuccess = false

          if (probeRes.status === 429 || /rate limit|quota|credits|exceeded|free/i.test(errBody)) {
            isExhausted = true
            exhaustedReason = `Límite gratuito alcanzado (Error 429): ${errBody.slice(0, 150)}`
            lastExhaustedAt = new Date().toISOString()

            await db.setting.upsert({
              where: { key: "openrouter_free_exhausted" },
              update: {
                value: JSON.stringify({
                  exhausted: true,
                  at: lastExhaustedAt,
                  status: probeRes.status,
                  message: exhaustedReason,
                }),
              },
              create: {
                key: "openrouter_free_exhausted",
                value: JSON.stringify({
                  exhausted: true,
                  at: lastExhaustedAt,
                  status: probeRes.status,
                  message: exhaustedReason,
                }),
              },
            }).catch(() => {})
          } else {
            exhaustedReason = `Error de API (${probeRes.status}): ${errBody.slice(0, 150)}`
          }
        } else {
          probeSuccess = true
          isExhausted = false
          exhaustedReason = ""
          await db.setting.delete({ where: { key: "openrouter_free_exhausted" } }).catch(() => {})
        }
      } catch (probeErr: any) {
        probeSuccess = false
        exhaustedReason = probeErr.message || "Tiempo de espera agotado al verificar modelo."
      }
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      isFreeModel,
      model: currentModel,
      isExhausted,
      exhaustedReason: isExhausted ? (exhaustedReason || "Se agotaron las peticiones gratuitas disponibles en OpenRouter.") : null,
      lastExhaustedAt,
      probeSuccess,
      probeLatency,
      keyInfo: keyData
        ? {
            label: keyData.label || "API Key",
            usageUsd: keyData.usage ?? 0,
            limitUsd: keyData.limit ?? null,
            isFreeTier: keyData.is_free_tier ?? true,
            rateLimit: keyData.rate_limit || null,
          }
        : null,
      message: isExhausted
        ? "⚠️ La API de OpenRouter ha consumido el cupo o límite de peticiones gratuitas disponibles."
        : "✅ Peticiones gratuitas disponibles y operativas.",
    })
  } catch (error) {
    console.error("[openrouter-quota Error]:", error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}
