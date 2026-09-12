import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

// Registrar ingreso/egreso de efectivo en la caja abierta de la sede activa
// body: { type: "ingreso" | "egreso", amount, concept, method }
export async function POST(req: NextRequest) {
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId, session: authSession } = branchAccess

  try {
    const body = await req.json()
    const session = await db.cashSession.findFirst({
      where: {
        status: "abierta",
        ...(branchId ? { branchId } : {}),
      },
    })
    if (!session) {
      return NextResponse.json({ error: "No hay caja abierta en esta sede" }, { status: 400 })
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
    const authSession = getSession(req)
    try {
      await logAudit({
        action: "cash_tx",
        entityType: "cash",
        entityId: session.id,
        userName: authSession?.name ?? "Sistema",
        role: authSession?.role ?? "admin",
        detail: `${tx.type} de ${tx.amount}: ${tx.concept}`,
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json(tx)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
