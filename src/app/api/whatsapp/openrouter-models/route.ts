import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

interface CuratedModel {
  id: string
  name: string
  provider: string
  badge: string
  description: string
  contextLength: string
  isFree?: boolean
}

const CURATED_OPENROUTER_MODELS: CuratedModel[] = [
  // --- MODELOS 100% GRATUITOS (0 COSTO / AHORRO TOTAL DE TOKENS) ---
  {
    id: "openrouter/free",
    name: "OpenRouter Free Models Router",
    provider: "OpenRouter",
    badge: "🎁 100% Gratis (Auto Router)",
    description: "Enruta automáticamente a los modelos gratuitos disponibles en OpenRouter. 0 tokens cobrados, costo $0.",
    contextLength: "128k",
    isFree: true,
  },
  {
    id: "deepseek/deepseek-r1:free",
    name: "DeepSeek R1 (Gratis)",
    provider: "DeepSeek",
    badge: "🧠 Razonamiento / Gratis",
    description: "Modelo insignia de razonamiento profundo de DeepSeek libre de costo.",
    contextLength: "64k",
    isFree: true,
  },
  {
    id: "deepseek/deepseek-chat:free",
    name: "DeepSeek V3 (Gratis)",
    provider: "DeepSeek",
    badge: "⚡ Rápido / Gratis",
    description: "Versión gratuita de DeepSeek V3 excelente para atención al cliente y toma de pedidos.",
    contextLength: "64k",
    isFree: true,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Meta Llama 3.3 70B (Gratis)",
    provider: "Meta",
    badge: "✨ Potente 70B / Gratis",
    description: "Modelo potente de 70B parámetros con excelente comprensión en español y 0 costo.",
    contextLength: "128k",
    isFree: true,
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Google Gemini 2.0 Flash (Gratis)",
    provider: "Google",
    badge: "🚀 Ultra Veloz / Gratis",
    description: "Inferencia ultrarrápida y ventana de contexto amplia provista gratis por OpenRouter.",
    contextLength: "1M",
    isFree: true,
  },
  {
    id: "qwen/qwen-2.5-72b-instruct:free",
    name: "Qwen 2.5 72B (Gratis)",
    provider: "Alibaba",
    badge: "📊 Alta Precisión / Gratis",
    description: "Gran capacidad para estructuración de catálogos y órdenes sin costo de tokens.",
    contextLength: "128k",
    isFree: true,
  },
  {
    id: "meta-llama/llama-3.2-3b-instruct:free",
    name: "Meta Llama 3.2 3B (Gratis)",
    provider: "Meta",
    badge: "🍃 Ultraliviano / Gratis",
    description: "Modelo compacto de mínima latencia y costo $0 para respuestas ágiles.",
    contextLength: "128k",
    isFree: true,
  },

  // --- MODELOS DE PAGO / ALTA CAPACIDAD ---
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3 (Chat Pago)",
    provider: "DeepSeek",
    badge: "🔥 Muy Económico",
    description: "Excelente para atención al cliente con costo ultra bajo ($0.14 / 1M tokens).",
    contextLength: "64k",
    isFree: false,
  },
  {
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1 (Pago)",
    provider: "DeepSeek",
    badge: "🧠 Razonamiento Máximo",
    description: "Modelo de razonamiento con mayor cuota y prioridad garantizada.",
    contextLength: "64k",
    isFree: false,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Meta Llama 3.3 70B Instruct (Pago)",
    provider: "Meta",
    badge: "⚡ Inteligente & Veloz",
    description: "Gran capacidad lingüística para catálogos extensos y soporte dinámico.",
    contextLength: "128k",
    isFree: false,
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Anthropic Claude 3.5 Haiku",
    provider: "Anthropic",
    badge: "🚀 Máxima Velocidad",
    description: "Respuestas instantáneas, excelente tono conversacional y concisión.",
    contextLength: "200k",
    isFree: false,
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Anthropic Claude 3.5 Sonnet",
    provider: "Anthropic",
    badge: "👑 Calidad Superior",
    description: "La máxima calidad y precisión para negocios exigentes.",
    contextLength: "200k",
    isFree: false,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "OpenAI GPT-4o Mini",
    provider: "OpenAI",
    badge: "💡 Económico & Fiable",
    description: "Rápido y consistente en la estructuración de JSON y órdenes.",
    contextLength: "128k",
    isFree: false,
  },
  {
    id: "openai/gpt-4o",
    name: "OpenAI GPT-4o",
    provider: "OpenAI",
    badge: "🌟 Alta Gama",
    description: "Modelo multimodal insignia de OpenAI con razonamiento avanzado.",
    contextLength: "128k",
    isFree: false,
  },
  {
    id: "mistralai/mistral-large-2411",
    name: "Mistral Large",
    provider: "Mistral",
    badge: "🇪🇺 Excelente en Español",
    description: "Gran fluidez en español e instrucciones complejas.",
    contextLength: "128k",
    isFree: false,
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B Instruct",
    provider: "Alibaba",
    badge: "📊 Alta Precisión",
    description: "Especialista en estructuración de datos y catálogos técnicos.",
    contextLength: "128k",
    isFree: false,
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
            isFree:
              m.id.endsWith(":free") ||
              m.id === "openrouter/free" ||
              (m.pricing && m.pricing.prompt === "0" && m.pricing.completion === "0"),
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
