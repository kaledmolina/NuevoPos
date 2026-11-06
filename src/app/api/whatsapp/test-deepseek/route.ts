import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * POST: Probar conexión con la API de DeepSeek u OpenRouter
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      provider = "deepseek",
      apiKey,
      model,
      branchId,
    } = body

    const isOpener = provider === "openrouter"
    const defaultModel = isOpener ? "deepseek/deepseek-chat" : "deepseek-chat"
    const chosenModel = model || defaultModel

    let resolvedKey = apiKey

    // Si no se pasó explícito en la prueba, buscar la de la sede o de variables de entorno
    if ((!resolvedKey || resolvedKey.includes("••••")) && branchId) {
      const cfg = await db.whatsAppConfig.findUnique({
        where: { branchId },
        select: { deepseekApiKey: true, openrouterApiKey: true },
      })
      resolvedKey = isOpener ? cfg?.openrouterApiKey : cfg?.deepseekApiKey
    }

    if (!resolvedKey || resolvedKey.includes("••••")) {
      resolvedKey = isOpener ? process.env.OPENROUTER_API_KEY : process.env.DEEPSEEK_API_KEY
    }

    if (!resolvedKey || resolvedKey.includes("••••")) {
      return NextResponse.json(
        {
          ok: false,
          error: `No se proporcionó una clave de API válida de ${isOpener ? "OpenRouter" : "DeepSeek"}. Por favor configúrala en el formulario o en variables de entorno.`,
        },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    const url = isOpener
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.deepseek.com/chat/completions"

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolvedKey.trim()}`,
    }

    if (isOpener) {
      headers["HTTP-Referer"] = "https://omnipos.pro"
      headers["X-Title"] = "OmniPOS AI Agent"
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8500)

    // Llamada ultra liviana de prueba (5 tokens)
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: "system", content: "Responde únicamente 'OK'." },
          { role: "user", content: "Ping" },
        ],
        max_tokens: 5,
        temperature: 0.1,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      const errText = await response.text()
      let parsedMsg = errText
      try {
        const parsed = JSON.parse(errText)
        parsedMsg = parsed.error?.message || errText
      } catch {
        // noop
      }
      return NextResponse.json(
        {
          ok: false,
          error: `Error de ${isOpener ? "OpenRouter" : "DeepSeek"} (${response.status}): ${parsedMsg}`,
          latencyMs,
        },
        { status: 400 }
      )
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || "Conexión exitosa"

    return NextResponse.json({
      ok: true,
      message: `¡Conexión con ${isOpener ? "OpenRouter" : "DeepSeek"} exitosa!`,
      provider: isOpener ? "openrouter" : "deepseek",
      model: data.model || chosenModel,
      reply: reply.trim(),
      latencyMs,
      tokensUsed: data.usage?.total_tokens || 0,
    })
  } catch (error) {
    console.error("[AI Test Error]:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message || "Error al conectar con la API de IA" },
      { status: 500 }
    )
  }
}
