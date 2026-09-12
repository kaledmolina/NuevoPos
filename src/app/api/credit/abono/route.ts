import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { formatCurrency } from "@/lib/format"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/credit/abono — registrar un abono del cliente a su cuenta (solo admin)
// body: { clientId, amount, concept?, method?, reportedBy? }
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const body = await req.json()
    const { clientId, amount, concept, method, reportedBy, saleId } = body
    const amt = Number(amount)
    if (!clientId) return NextResponse.json({ error: "clientId es obligatorio" }, { status: 400 })
    if (!amt || amt <= 0) return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })

    const account = await db.creditAccount.findUnique({
      where: { clientId },
      include: { client: true },
    })
    if (!account) return NextResponse.json({ error: "El cliente no tiene cuenta de crédito" }, { status: 404 })

    if (session && account.client.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, account.client.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para gestionar créditos de esta sede." },
          { status: 403 }
        )
      }
    }

    const reporter = (typeof reportedBy === "string" && reportedBy.trim() !== "")
      ? reportedBy.trim()
      : (session?.name || "Administrador")
    const paymentMethod = method || "efectivo"
    const previousBalance = account.balance
    const remainingBalance = Math.max(0, previousBalance - amt)

    const result = await db.$transaction(async (tx) => {
      // Reducir el saldo
      const updated = await tx.creditAccount.update({
        where: { id: account.id },
        data: { balance: { decrement: amt } },
      })
      // Registrar el movimiento con el responsable y saldos
      const movement = await tx.creditMovement.create({
        data: {
          accountId: account.id,
          type: "abono",
          amount: amt,
          concept: concept || `Abono de ${account.client.name}`,
          method: paymentMethod,
          reportedBy: reporter,
          previousBalance,
          remainingBalance,
          saleId: saleId || null,
        },
      })

      // Si la caja de esta sede está abierta y el pago es en efectivo, registrar ingreso en arqueo de caja
      const openSession = await tx.cashSession.findFirst({
        where: {
          status: "abierta",
          ...(account.client.branchId ? { branchId: account.client.branchId } : {}),
        },
      })
      if (openSession && paymentMethod === "efectivo") {
        await tx.cashTransaction.create({
          data: {
            cashSessionId: openSession.id,
            type: "ingreso",
            amount: amt,
            concept: `Abono crédito: ${account.client.name}`,
            method: "efectivo",
            reference: movement.id,
          },
        })
      }

      return { account: updated, movement }
    })

    try {
      await logAudit({
        action: "credit_payment",
        entityType: "credit",
        entityId: account.id,
        userName: reporter,
        role: session?.role ?? "admin",
        detail: `Abono de ${account.client.name}: ${formatCurrency(amt)} reportado por ${reporter}. Saldo anterior: ${formatCurrency(previousBalance)} -> Saldo pendiente: ${formatCurrency(result.account.balance)}`,
      })
    } catch { /* noop */ }

    return NextResponse.json({
      ok: true,
      newBalance: result.account.balance,
      movement: result.movement,
      receipt: {
        id: result.movement.id,
        voucherNumber: `AB-${result.movement.id.slice(-6).toUpperCase()}`,
        clientName: account.client.name,
        clientDocument: account.client.document,
        clientPhone: account.client.phone,
        amount: amt,
        previousBalance,
        remainingBalance: Math.max(0, result.account.balance),
        concept: result.movement.concept,
        method: paymentMethod,
        reportedBy: reporter,
        createdAt: result.movement.createdAt,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
