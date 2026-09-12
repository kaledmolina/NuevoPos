import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { formatCurrency } from "@/lib/format"
import { requireBranchAccess, verifyEntityBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/credit — lista todas las cuentas de crédito con saldo (solo admin)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId } = branchAccess

  const accounts = await db.creditAccount.findMany({
    where: branchId ? { client: { branchId } } : {},
    include: {
      client: true,
      _count: { select: { movements: true } },
    },
    orderBy: { client: { name: "asc" } },
  })
  const result = accounts.map((a) => ({
    id: a.id,
    clientId: a.clientId,
    clientName: a.client.name,
    clientDocument: a.client.document,
    clientPhone: a.client.phone,
    creditLimit: a.creditLimit,
    balance: a.balance,
    available: a.creditLimit - a.balance,
    active: a.active,
    movementsCount: a._count.movements,
  }))
  return NextResponse.json(result)
}

// POST /api/credit — crear/actualizar cuenta de crédito (solo admin)
// body: { clientId, creditLimit, active? }
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    const body = await req.json()
    const { clientId, creditLimit, active } = body
    if (!clientId) return NextResponse.json({ error: "clientId es obligatorio" }, { status: 400 })

    // Verificar que el cliente no sea genérico
    const client = await db.client.findUnique({ where: { id: clientId } })
    if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
    if (client.isGeneric) return NextResponse.json({ error: "No se puede otorgar crédito al cliente genérico" }, { status: 400 })

    // Validar acceso a la sede del cliente
    const hasAccess = await verifyEntityBranchAccess(session.uid, client.branchId)
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Acceso denegado: No puedes gestionar crédito de clientes de otra sede." },
        { status: 403 }
      )
    }

    const limit = Number(creditLimit) || 0
    // Upsert: si ya existe, actualiza el límite; si no, crea
    const account = await db.creditAccount.upsert({
      where: { clientId },
      create: { clientId, creditLimit: limit, active: active ?? true },
      update: { creditLimit: limit, active: active ?? true },
    })

    try {
      await logAudit({
        action: "credit_update",
        entityType: "credit",
        entityId: account.id,
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Crédito de ${client.name}: límite ${formatCurrency(limit)}`,
      })
    } catch { /* noop */ }

    return NextResponse.json(account)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
