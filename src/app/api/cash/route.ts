import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

// Sesión de caja abierta actualmente en la sede
export async function GET(req: NextRequest) {
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId } = branchAccess

  const session = await db.cashSession.findFirst({
    where: {
      status: "abierta",
      ...(branchId ? { branchId } : {}),
    },
    include: { transactions: { orderBy: { createdAt: "desc" } } },
    orderBy: { openedAt: "desc" },
  })
  return NextResponse.json(session)
}

// Abrir caja
export async function POST(req: NextRequest) {
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId, session: authSession } = branchAccess

  try {
    const body = await req.json()
    const existing = await db.cashSession.findFirst({
      where: {
        status: "abierta",
        ...(branchId ? { branchId } : {}),
      },
    })
    if (existing) {
      return NextResponse.json(
        { error: "Ya hay una caja abierta en esta sede. Ciérrala primero." },
        { status: 400 }
      )
    }
    const session = await db.cashSession.create({
      data: {
        branchId: branchId || null,
        openingAmount: Number(body.openingAmount) || 0,
        status: "abierta",
        openedBy: body.openedBy || authSession.name || "Cajero",
      },
      include: { transactions: true },
    })
    try {
      await logAudit({
        action: "cash_open",
        entityType: "cash",
        entityId: session.id,
        userName: authSession?.name ?? "Sistema",
        role: authSession?.role ?? "admin",
        detail: `Caja abierta con ${session.openingAmount}`,
        meta: {
          openingAmount: Number(session.openingAmount),
          openedBy: session.openedBy ?? "",
        },
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json(session)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
