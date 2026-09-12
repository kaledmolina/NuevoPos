import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

// PATCH /api/transactions/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const body = await req.json()

    const existing = await db.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      )
    }

    if (session && existing.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, existing.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para modificar movimientos de esta sede." },
          { status: 403 }
        )
      }
    }

    const data: Record<string, unknown> = {}

    if (body.type !== undefined) {
      const t = String(body.type).trim()
      if (t !== "ingreso" && t !== "egreso") {
        return NextResponse.json(
          { error: "El tipo debe ser 'ingreso' o 'egreso'" },
          { status: 400 }
        )
      }
      data.type = t
    }

    if (body.category !== undefined) {
      const c = String(body.category).trim()
      data.category = c || "Otros"
    }

    if (body.concept !== undefined) {
      const concept = String(body.concept).trim()
      if (!concept) {
        return NextResponse.json(
          { error: "El concepto es obligatorio" },
          { status: 400 }
        )
      }
      data.concept = concept
    }

    if (body.amount !== undefined) {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "El monto debe ser mayor a 0" },
          { status: 400 }
        )
      }
      data.amount = amount
    }

    if (body.description !== undefined) {
      data.description = body.description ? String(body.description).trim() : null
    }

    if (body.method !== undefined) {
      data.method = String(body.method).trim() || "efectivo"
    }

    if (body.date !== undefined) {
      if (body.date) {
        const d = new Date(body.date)
        data.date = isNaN(d.getTime()) ? new Date() : d
      } else {
        data.date = new Date()
      }
    }

    const updated = await db.transaction.update({
      where: { id },
      data,
    })

    try {
      await logAudit({
        action: "transaction_update",
        entityType: "transaction",
        entityId: id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Movimiento actualizado: ${updated.type} ${updated.category} - ${updated.concept} (${updated.amount})`,
      })
    } catch {
      // noop: logging failure must not break the operation
    }

    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/transactions/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const { id } = await params
    const existing = await db.transaction.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      )
    }

    const session = getSession(req)
    if (session && existing.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, existing.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para eliminar movimientos de esta sede." },
          { status: 403 }
        )
      }
    }

    // Proteger transacciones de cajas ya cerradas
    if (existing.cashSessionId) {
      const sess = await db.cashSession.findUnique({ where: { id: existing.cashSessionId } })
      if (sess && sess.status === "cerrada") {
        return NextResponse.json(
          {
            error: "Operación bloqueada: Este movimiento pertenece a un arqueo de caja ya cerrado y auditado. Los registros contables cerrados no pueden ser eliminados.",
          },
          { status: 409 }
        )
      }
    }

    await db.transaction.delete({ where: { id } })

    // Eliminar el movimiento equivalente en caja si existe (por reference)
    if (existing.cashSessionId) {
      await db.cashTransaction.deleteMany({
        where: { reference: id },
      })
    }

    try {
      await logAudit({
        action: "transaction_delete",
        entityType: "transaction",
        entityId: id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Movimiento eliminado: ${existing.type} ${existing.category} - ${existing.concept} (${existing.amount})`,
      })
    } catch {
      // noop: logging failure must not break the operation
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
