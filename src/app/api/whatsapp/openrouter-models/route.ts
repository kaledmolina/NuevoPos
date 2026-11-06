import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface CuratedModel {
  id: string
  name: string
  provider: string
  badge: string
  description: string
  contextLength: string
}

const CURATED_OPENROUTER_MODELS: CuratedModel[] = [
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3 (Chat)",
    provider: "DeepSeek",
    badge: "🔥 Recomendado / Muy Económico",
    description: "Excelente para atención al cliente en español y toma de pedidos con costo mínimo.",
    contextLength: "64k",
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    badge: "🧠 Razonamiento",
    description: "Modelo de razonamiento profundo para análisis complejos y toma de decisiones.",
    contextLength: "64k",
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Google Gemini 2.0 Flash",
    provider: "Google",
    badge: "✨ Gratis / Ultra Rápido",
    description: "Versión de alta velocidad y libre de costo provista por OpenRouter.",
    contextLength: "1M",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Meta Llama 3.3 70B Instruct",
    provider: "Meta",
    badge: "⚡ Inteligente & Veloz",
    description: "Gran capacidad lingüística para catálogos extensos y soporte dinámico.",
    contextLength: "128k",
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Anthropic Claude 3.5 Haiku",
    provider: "Anthropic",
    badge: "🚀 Máxima Velocidad",
    description: "Respuestas instantáneas, excelente tono conversacional y concisión.",
    contextLength: "200k",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Anthropic Claude 3.5 Sonnet",
    provider: "Anthropic",
    badge: "👑 Calidad Superior",
    description: "La máxima calidad y precisión para negocios exigentes.",
    contextLength: "200k",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI GPT-4o Mini",
    provider: "OpenAI",
    badge: "💡 Económico & Fiable",
    description: "Rápido y consistente en la estructuración de JSON y órdenes.",
    contextLength: "128k",
  },
  {
    id: "openai/gpt-4o",
    name: "OpenAI GPT-4o",
    provider: "OpenAI",
    badge: "🌟 Alta Gama",
    description: "Modelo multimodal insignia de OpenAI con razonamiento avanzado.",
    contextLength: "128k",
  },
  {
    id: "mistralai/mistral-large-2411",
    name: "Mistral Large",
    provider: "Mistral",
    badge: "🇪🇺 Excelente en Español",
    description: "Gran fluidez en español e instrucciones complejas.",
    contextLength: "128k",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B Instruct",
    provider: "Alibaba",
    badge: "📊 Alta Precisión",
    description: "Especialista en estructuración de datos y catálogos técnicos.",
    contextLength: "128k",
  },
]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const fetchLive = searchParams.get("live") === "true"
    const apiKey = searchParams.get("apiKey")

    if (fetchLive && apiKey) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          next: { revalidate: 3600 },
        })
        if (response.ok) {
          const data = await response.json()
          const liveModels = (data.data || []).map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            description: m.description || "",
            contextLength: m.context_length ? `${Math.round(m.context_length / 1000)}k` : "128k",
          }))
          return NextResponse.json({
            curated: CURATED_OPENROUTER_MODELS,
            live: liveModels,
          })
        }
      } catch {
        // Fallback to curated if live query fails
      }
    }

    return NextResponse.json({
      curated: CURATED_OPENROUTER_MODELS,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
