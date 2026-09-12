import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { getSession } = await import("@/lib/auth")
  const session = getSession(req)
  try {
    const { id } = await params
    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })

    if (session && existing.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, existing.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para modificar proveedores de esta sede." },
          { status: 403 }
        )
      }
    }

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
  const session = getSession(req)
  try {
    const { id } = await params
    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })

    if (session && existing.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, existing.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para eliminar proveedores de esta sede." },
          { status: 403 }
        )
      }
    }

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
