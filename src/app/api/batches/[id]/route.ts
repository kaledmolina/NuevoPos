import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// DELETE /api/batches/[id] — eliminar un lote (descuenta stock del producto)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    await db.$transaction(async (tx) => {
      const batch = await tx.productBatch.findUnique({ where: { id } })
      if (!batch) throw new Error("Lote no encontrado")
      // Descontar stock del producto
      await tx.product.update({
        where: { id: batch.productId },
        data: { stock: { decrement: batch.stock } },
      })
      await tx.productBatch.delete({ where: { id } })
    })

    try {
      await logAudit({
        action: "batch_delete",
        entityType: "product",
        entityId: id,
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Lote eliminado`,
      })
    } catch { /* noop */ }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
