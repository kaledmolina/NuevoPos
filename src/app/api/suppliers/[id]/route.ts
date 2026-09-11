import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    const fields = ["name", "document", "contactName", "phone", "email", "address", "notes"]
    for (const f of fields) {
      if (body[f] !== undefined) {
        const v = typeof body[f] === "string" ? body[f].trim() : body[f]
        data[f] = v === "" ? null : v
      }
    }

    const supplier = await db.supplier.update({
      where: { id },
      data,
      include: {
        _count: { select: { purchases: true } },
      },
    })
    return NextResponse.json(supplier)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { requireAdmin, logAudit, getSession } = await import("@/lib/auth")
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const { id } = await params
    // Verificar si el proveedor tiene compras asociadas antes de borrar
    const purchasesCount = await db.purchase.count({ where: { supplierId: id } })
    if (purchasesCount > 0) {
      return NextResponse.json(
        {
          error: `Operación bloqueada: El proveedor tiene ${purchasesCount} compra(s) asociada(s). Para preservar la trazabilidad fiscal y contable, el registro no puede ser eliminado.`,
        },
        { status: 409 }
      )
    }
    const session = getSession(req)
    try {
      await logAudit({
        action: "supplier_delete",
        entityType: "supplier",
        entityId: id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Eliminación de proveedor id: ${id}`,
      })
    } catch { /* noop */ }
    await db.supplier.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
