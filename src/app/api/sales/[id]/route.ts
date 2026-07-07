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

      // 2. Reversar caja: eliminar la transacción de venta original.
      const deleted = await tx.cashTransaction.deleteMany({
        where: { reference: sale.id },
      })
      if (deleted.count === 0 && sale.cashSessionId) {
        await tx.cashTransaction.deleteMany({
          where: { cashSessionId: sale.cashSessionId, concept: `Venta ${sale.invoiceNumber}` },
        })
      }

      // 3. Si la venta fue en efectivo y la caja sigue abierta, registrar egreso (reintegro)
      if (sale.paymentMethod === "efectivo" && sale.cashSessionId) {
        const sessionStillOpen = await tx.cashSession.findUnique({
          where: { id: sale.cashSessionId },
        })
        if (sessionStillOpen && sessionStillOpen.status === "abierta") {
          await tx.cashTransaction.create({
            data: {
              cashSessionId: sale.cashSessionId,
              type: "egreso",
              amount: sale.total,
              concept: `Anulación venta ${sale.invoiceNumber}`,
              method: "efectivo",
              reference: sale.id,
            },
          })
        }
      }

      // 4. Marcar la venta como anulada
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
