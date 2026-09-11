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
    const fields = ["name", "document", "phone", "email", "address", "notes"]
    for (const f of fields) {
      if (body[f] !== undefined) {
        const v = typeof body[f] === "string" ? body[f].trim() : body[f]
        data[f] = v === "" ? null : v
      }
    }

    const client = await db.client.update({
      where: { id },
      data,
      include: {
        _count: { select: { sales: true } },
      },
    })
    return NextResponse.json(client)
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
    const client = await db.client.findUnique({
      where: { id },
      include: { creditAccount: true, _count: { select: { sales: true } } },
    })
    if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    if (client.isGeneric) {
      return NextResponse.json({ error: "El cliente genérico no puede ser eliminado" }, { status: 403 })
    }
    if (client._count.sales > 0 || (client.creditAccount && client.creditAccount.balance > 0)) {
      return NextResponse.json(
        {
          error: "Operación bloqueada por seguridad: Este cliente posee historial de ventas o saldo de crédito pendiente. Para preservar la integridad contable, el registro no puede ser eliminado.",
        },
        { status: 409 }
      )
    }

    const session = getSession(req)
    try {
      await logAudit({
        action: "client_delete",
        entityType: "client",
        entityId: id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Intento de eliminación de cliente: ${client.name}`,
      })
    } catch { /* noop */ }

    await db.client.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
