import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Anular una venta (reversa stock y elimina transacción de caja asociada)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const sale = await db.sale.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!sale) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 })

    if (body.status === "anulada" && sale.status !== "anulada") {
      // Reversar stock
      for (const it of sale.items) {
        await db.product.update({
          where: { id: it.productId },
          data: { stock: { increment: it.quantity } },
        })
      }
      await db.cashTransaction.deleteMany({
        where: { cashSessionId: sale.cashSessionId ?? "___", concept: `Venta ${sale.invoiceNumber}` },
      })
      await db.sale.update({ where: { id }, data: { status: "anulada" } })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json(sale)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
