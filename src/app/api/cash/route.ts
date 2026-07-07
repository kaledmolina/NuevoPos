import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Sesión de caja abierta actualmente
export async function GET() {
  const session = await db.cashSession.findFirst({
    where: { status: "abierta" },
    include: { transactions: { orderBy: { createdAt: "desc" } } },
    orderBy: { openedAt: "desc" },
  })
  return NextResponse.json(session)
}

// Abrir caja
export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth
  try {
    const body = await req.json()
    const existing = await db.cashSession.findFirst({ where: { status: "abierta" } })
    if (existing) {
      return NextResponse.json(
        { error: "Ya hay una caja abierta. Ciérrala primero." },
        { status: 400 }
      )
    }
    const session = await db.cashSession.create({
      data: {
        openingAmount: Number(body.openingAmount) || 0,
        status: "abierta",
        openedBy: body.openedBy || "Cajero",
      },
      include: { transactions: true },
    })
    const authSession = getSession(req)
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
