import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Registrar ingreso/egreso de efectivo en la caja abierta
// body: { type: "ingreso" | "egreso", amount, concept, method }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const session = await db.cashSession.findFirst({ where: { status: "abierta" } })
    if (!session) {
      return NextResponse.json({ error: "No hay caja abierta" }, { status: 400 })
    }
    const tx = await db.cashTransaction.create({
      data: {
        cashSessionId: session.id,
        type: body.type,
        amount: Number(body.amount) || 0,
        concept: body.concept || (body.type === "ingreso" ? "Ingreso" : "Egreso"),
        method: body.method || "efectivo",
        reference: body.reference || null,
      },
    })
    return NextResponse.json(tx)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
