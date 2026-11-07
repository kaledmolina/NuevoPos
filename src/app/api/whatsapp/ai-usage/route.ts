import { NextRequest, NextResponse } from "next/server"
import { getAllClientsAiUsage, resetClientAiUsage } from "@/lib/ai-token-tracker"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/whatsapp/ai-usage — Lista y resumen de consumo de tokens y gasto IA por cliente
export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess

    const data = await getAllClientsAiUsage()
    return NextResponse.json({
      ok: true,
      ...data,
    })
  } catch (error) {
    console.error("[ai-usage GET Error]:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    )
  }
}

// POST /api/whatsapp/ai-usage — Acciones de gestión (ej. restablecer contador)
export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess

    const body = await req.json()
    const { action, phone } = body

    if (action === "reset") {
      if (!phone) {
        return NextResponse.json({ ok: false, error: "El teléfono es requerido" }, { status: 400 })
      }
      await resetClientAiUsage(phone)
      return NextResponse.json({ ok: true, message: "Contador de tokens restablecido exitosamente" })
    }

    return NextResponse.json({ ok: false, error: "Acción no soportada" }, { status: 400 })
  } catch (error) {
    console.error("[ai-usage POST Error]:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    )
  }
}
