import { NextRequest, NextResponse } from "next/server"
import {
  getConversationSession,
  setConversationSessionStatus,
  closeConversationSession,
  type ConversationSessionStatus,
} from "@/lib/conversation-session"

export const dynamic = "force-dynamic"

/**
 * GET: Obtener estado de la sesión de conversación para un número de teléfono
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const phone = searchParams.get("phone")

    if (!phone) {
      return NextResponse.json({ error: "El teléfono es requerido" }, { status: 400 })
    }

    const session = await getConversationSession(phone)
    return NextResponse.json({ ok: true, session })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * POST: Cambiar estado de la sesión de conversación ("abierta" | "pendiente" | "cerrada")
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone, status, action } = body

    if (!phone) {
      return NextResponse.json({ error: "El teléfono es requerido" }, { status: 400 })
    }

    let session
    if (action === "close" || status === "cerrada") {
      session = await closeConversationSession(phone, "manual")
    } else {
      const targetStatus: ConversationSessionStatus = status || "abierta"
      session = await setConversationSessionStatus(phone, targetStatus, "manual")
    }

    return NextResponse.json({ ok: true, session })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
