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

      // Seguridad: Validar que el usuario tenga acceso a la sede de la venta
      if (sess && sale.branchId) {
        const { canUserAccessBranch } = await import("@/lib/branch")
        const hasAccess = await canUserAccessBranch(sess.uid, sale.branchId)
        if (!hasAccess) {
          throw new Error("Acceso denegado: No tienes autorización para anular ventas de esta sede.")
        }
      }

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
      // en la caja abierta DE ESTA MISMA SEDE
      if (sale.paymentMethod === "efectivo") {
        const targetSession = sale.cashSessionId
          ? await tx.cashSession.findUnique({ where: { id: sale.cashSessionId } })
          : null

        const activeSession = (targetSession && targetSession.status === "abierta")
          ? targetSession
          : await tx.cashSession.findFirst({
              where: {
                status: "abierta",
                ...(sale.branchId ? { branchId: sale.branchId } : {}),
              },
            })

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

// DELETE /api/sales/[id] - Elimina físicamente una venta (especialmente ventas de prueba / demo)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const { getSession, logAudit } = await import("@/lib/auth")
  const sess = getSession(req)

  try {
    const { id } = await params
    const sale = await db.sale.findUnique({
      where: { id },
      include: { items: true },
    })

    if (!sale) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 })
    }

    // Si no es Superadmin, verificar que tenga acceso a la sede de la venta
    if (sess && sess.role !== "superadmin" && sale.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(sess.uid, sale.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para eliminar ventas de esta sede." },
          { status: 403 }
        )
      }
    }

    const invoiceNumber = sale.invoiceNumber
    const saleTotal = sale.total

    await db.$transaction(async (tx) => {
      // 1. Si la venta estaba activa (no anulada), devolver el stock a los productos
      if (sale.status !== "anulada") {
        for (const it of sale.items) {
          await tx.product.updateMany({
            where: { id: it.productId },
            data: { stock: { increment: it.quantity } },
          })
        }
      }

      // 2. Si la venta fue a crédito y no anulada, reversar saldo de la cuenta del cliente
      if (sale.paymentMethod === "credito" && sale.clientId && sale.status !== "anulada") {
        const creditAccount = await tx.creditAccount.findUnique({ where: { clientId: sale.clientId } })
        if (creditAccount) {
          await tx.creditAccount.update({
            where: { id: creditAccount.id },
            data: { balance: Math.max(0, creditAccount.balance - sale.total) },
          })
        }
      }

      // 3. Eliminar movimientos de crédito asociados a esta venta
      await tx.creditMovement.deleteMany({
        where: { saleId: id },
      })

      // 4. Eliminar transacciones de arqueo / caja vinculadas a esta venta
      await tx.cashTransaction.deleteMany({
        where: { reference: id },
      })

      // 5. Eliminar ítems de la venta
      await tx.saleItem.deleteMany({
        where: { saleId: id },
      })

      // 6. Eliminar la venta físicamente
      await tx.sale.delete({
        where: { id },
      })
    })

    try {
      await logAudit({
        action: "sale_delete_permanent",
        entityType: "sale",
        entityId: id,
        userName: sess?.name ?? "Superadmin",
        role: sess?.role ?? "superadmin",
        detail: `Venta eliminada permanentemente #${invoiceNumber} por valor de ${saleTotal}`,
        meta: { invoiceNumber, total: saleTotal },
      })
    } catch {
      // noop
    }

    return NextResponse.json({
      ok: true,
      message: `Venta #${invoiceNumber} eliminada permanentemente.`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

