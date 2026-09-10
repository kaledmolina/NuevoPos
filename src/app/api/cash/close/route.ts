import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Cerrar caja / arqueo
// body: { id, closingAmount (declarado), notes }
export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    const { id, closingAmount, notes } = body
    const session = await db.cashSession.findUnique({
      where: { id },
      include: { transactions: true },
    })
    if (!session) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
    if (session.status === "cerrada") {
      return NextResponse.json({ error: "La sesión ya está cerrada" }, { status: 400 })
    }

    // Calcular monto esperado: apertura + ingresos(efectivo) - egresos(efectivo) + ventas efectivo
    let expected = session.openingAmount
    for (const t of session.transactions) {
      if (t.method !== "efectivo") continue
      if (t.type === "venta" || t.type === "ingreso") expected += t.amount
      if (t.type === "egreso") expected -= t.amount
    }

    const declared = Number(closingAmount) || 0
    const difference = declared - expected

    const updated = await db.cashSession.update({
      where: { id },
      data: {
        status: "cerrada",
        closingAmount: declared,
        expectedAmount: expected,
        difference,
        closedAt: new Date(),
        closedBy: body.closedBy || "Cajero",
        notes: notes || null,
      },
      include: { transactions: { orderBy: { createdAt: "desc" } } },
    })
    const authSession = getSession(req)
    try {
      await logAudit({
        action: "cash_close",
        entityType: "cash",
        entityId: id,
        userName: authSession?.name ?? "Sistema",
        role: authSession?.role ?? "admin",
        detail: `Caja cerrada. Esperado: ${expected}, Contado: ${declared}, Diferencia: ${difference}`,
        meta: {
          expected: Number(expected),
          declared: Number(declared),
          difference: Number(difference),
        },
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
