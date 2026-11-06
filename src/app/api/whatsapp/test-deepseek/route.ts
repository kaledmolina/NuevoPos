import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * POST: Probar conexión con la API de DeepSeek
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { apiKey, model = "deepseek-chat", branchId } = body

    let resolvedKey = apiKey

    // Si no se pasó explícito en la prueba, buscar la de la sede
    if ((!resolvedKey || resolvedKey.includes("••••")) && branchId) {
      const cfg = await db.whatsAppConfig.findUnique({
        where: { branchId },
        select: { deepseekApiKey: true },
      })
      resolvedKey = cfg?.deepseekApiKey
    }

    if (!resolvedKey || resolvedKey.includes("••••")) {
      return NextResponse.json(
        { ok: false, error: "No se proporcionó una clave de API válida de DeepSeek." },
        { status: 400 }
      )
    }

    const startTime = Date.now()

    // Llamada ultra liviana de prueba (5 tokens)
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolvedKey.trim()}`,
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: [
          { role: "system", content: "Responde únicamente 'OK'." },
          { role: "user", content: "Ping" },
        ],
        max_tokens: 5,
        temperature: 0.1,
      }),
    })

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
          error: `Error de DeepSeek (${response.status}): ${parsedMsg}`,
          latencyMs,
        },
        { status: 400 }
      )
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || "Conexión exitosa"

    return NextResponse.json({
      ok: true,
      message: "¡Conexión con DeepSeek exitosa!",
      model: data.model || model,
      reply: reply.trim(),
      latencyMs,
      tokensUsed: data.usage?.total_tokens || 0,
    })
  } catch (error) {
    console.error("[DeepSeek Test Error]:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message || "Error al conectar con DeepSeek" },
      { status: 500 }
    )
  }
}
