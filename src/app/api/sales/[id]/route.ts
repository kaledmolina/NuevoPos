import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Anular una venta: reversa stock, registra egreso en caja (reintegro) y marca anulada.
// Todo en una transacción atómica.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  // Obtener session para el log
  const { getSession } = await import("@/lib/auth")
  const sess = getSession(req)
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    let invoiceNumber = ""
    let saleTotal = 0
    await db.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!sale) throw new Error("Venta no encontrada")
      if (sale.status === "anulada") throw new Error("La venta ya está anulada")
      if (body.status !== "anulada") return sale

      invoiceNumber = sale.invoiceNumber
      saleTotal = sale.total

      // 1. Reversar stock (devolver unidades)
      for (const it of sale.items) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { increment: it.quantity } },
        })
      }

      // 2. Reversar caja:
      // Si la venta fue en efectivo, registrar egreso por devolución del dinero al cliente
      // de modo que en el arqueo de caja quede la trazabilidad exacta: (+Venta -Devolución = $0 neto).
      if (sale.paymentMethod === "efectivo") {
        const targetSession = sale.cashSessionId
          ? await tx.cashSession.findUnique({ where: { id: sale.cashSessionId } })
          : null

        const activeSession = (targetSession && targetSession.status === "abierta")
          ? targetSession
          : await tx.cashSession.findFirst({ where: { status: "abierta" } })

        if (activeSession) {
          await tx.cashTransaction.create({
            data: {
              cashSessionId: activeSession.id,
              type: "egreso",
              amount: sale.total,
              concept: `Anulación y reintegro venta #${sale.invoiceNumber}`,
              method: "efectivo",
              reference: sale.id,
            },
          })
        }
      } else if (sale.paymentMethod !== "credito") {
        // Si fue tarjeta o transferencia, eliminar la transacción del arqueo para no alterar totales electrónicos
        await tx.cashTransaction.deleteMany({
          where: { reference: sale.id },
        })
      }

      // 4. Si la venta fue a crédito, reversar el saldo en la cuenta del cliente
      if (sale.paymentMethod === "credito" && sale.clientId) {
        const creditAccount = await tx.creditAccount.findUnique({ where: { clientId: sale.clientId } })
        if (creditAccount) {
          const prevBal = creditAccount.balance
          const nextBal = Math.max(0, prevBal - sale.total)
          await tx.creditAccount.update({
            where: { id: creditAccount.id },
            data: { balance: { decrement: sale.total } },
          })
          await tx.creditMovement.create({
            data: {
              accountId: creditAccount.id,
              type: "abono",
              amount: sale.total,
              concept: `Anulación venta a crédito #${sale.invoiceNumber}`,
              method: "credito",
              reportedBy: sess?.name ?? "admin",
              previousBalance: prevBal,
              remainingBalance: nextBal,
              saleId: sale.id,
            },
          })
        }
      }

      // 5. Marcar la venta como anulada
      await tx.sale.update({ where: { id }, data: { status: "anulada" } })
      return sale
    })

    await logAudit({
      action: "sale_annul",
      entityType: "sale",
      entityId: id,
      userName: sess?.name ?? "admin",
      role: sess?.role ?? "admin",
      detail: `Anulada venta ${invoiceNumber}`,
      meta: { invoiceNumber, total: saleTotal },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes("no encontrada") || msg.includes("ya está anulada")) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
