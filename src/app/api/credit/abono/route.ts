import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { formatCurrency } from "@/lib/format"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/credit/abono — registrar un abono del cliente a su cuenta (solo admin)
// body: { clientId, amount, concept? }
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const body = await req.json()
    const { clientId, amount, concept } = body
    const amt = Number(amount)
    if (!clientId) return NextResponse.json({ error: "clientId es obligatorio" }, { status: 400 })
    if (!amt || amt <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })

    const account = await db.creditAccount.findUnique({
      where: { clientId },
      include: { client: true },
    })
    if (!account) return NextResponse.json({ error: "El cliente no tiene cuenta de crédito" }, { status: 404 })

    const result = await db.$transaction(async (tx) => {
      // Reducir el saldo
      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { balance: { decrement: amt } },
      })
      // Registrar el movimiento
      const movement = await tx.creditMovement.create({
        data: {
          accountId: account.id,
          type: "abono",
          amount: amt,
          concept: concept || `Abono de ${account.client.name}`,
        },
      })
      return { account: updated, movement }
    })

    try {
      await logAudit({
        action: "credit_payment",
        entityType: "credit",
        entityId: account.id,
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Abono de ${account.client.name}: ${formatCurrency(amt)}. Saldo: ${formatCurrency(result.account.balance)}`,
      })
    } catch { /* noop */ }

    return NextResponse.json({
      ok: true,
      newBalance: result.account.balance,
      movement: result.movement,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
