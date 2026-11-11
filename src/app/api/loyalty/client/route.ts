import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession } from "@/lib/auth"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/loyalty/client?clientId=xxx&branchId=xxx
 * Retorna el saldo de puntos de un cliente en la sede activa,
 * junto con sus últimos movimientos.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId")
  const branchId = searchParams.get("branchId")

  if (!clientId || !branchId) {
    return NextResponse.json({ ok: false, error: "Se requieren clientId y branchId." }, { status: 400 })
  }

  try {
    const account = await db.loyaltyAccount.findUnique({
      where: { clientId_branchId: { clientId, branchId } },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    })

    const program = await db.loyaltyProgram.findUnique({ where: { branchId } })

    return NextResponse.json({
      ok: true,
      account: account
        ? {
            points: account.points,
            totalEarned: account.totalEarned,
            totalRedeemed: account.totalRedeemed,
            movements: account.movements,
          }
        : { points: 0, totalEarned: 0, totalRedeemed: 0, movements: [] },
      program: program ? { enabled: program.enabled, pointValue: program.pointValue } : null,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * POST /api/loyalty/client
 * Ajuste manual de puntos (bonus, corrección, canje manual).
 * body: { clientId, branchId, type, points, concept }
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess

  try {
    const body = await req.json()
    const { clientId, branchId, type, points: rawPoints, concept } = body

    if (!clientId || !branchId || !type || rawPoints === undefined) {
      return NextResponse.json({ error: "clientId, branchId, type y points son obligatorios." }, { status: 400 })
    }

    const pts = Number(rawPoints)
    if (isNaN(pts) || pts === 0) {
      return NextResponse.json({ error: "El valor de puntos debe ser un número distinto de cero." }, { status: 400 })
    }

    const allowedTypes = ["earn", "redeem", "adjust", "expire", "welcome", "birthday"]
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: `Tipo inválido. Use: ${allowedTypes.join(", ")}` }, { status: 400 })
    }

    // Buscar o crear cuenta de puntos para esta sede
    let account = await db.loyaltyAccount.findUnique({
      where: { clientId_branchId: { clientId, branchId } },
    })

    if (!account) {
      account = await db.loyaltyAccount.create({
        data: { clientId, branchId, points: 0, totalEarned: 0, totalRedeemed: 0 },
      })
    }

    // Validar que no quede en negativo
    const newBalance = account.points + pts
    if (newBalance < 0) {
      return NextResponse.json(
        { error: `Sin puntos suficientes. Saldo actual: ${account.points} pts. Se necesitan ${Math.abs(pts)} pts.` },
        { status: 400 }
      )
    }

    // Actualizar cuenta y registrar movimiento
    const updated = await db.loyaltyAccount.update({
      where: { clientId_branchId: { clientId, branchId } },
      data: {
        points: newBalance,
        totalEarned: pts > 0 ? { increment: pts } : undefined,
        totalRedeemed: pts < 0 ? { increment: Math.abs(pts) } : undefined,
        movements: {
          create: {
            type,
            points: pts,
            concept: concept || (pts > 0 ? "Ajuste manual +" : "Ajuste manual -"),
            registeredBy: session?.name ?? "sistema",
          },
        },
      },
    })

    return NextResponse.json({
      ok: true,
      points: updated.points,
      message: `${pts > 0 ? "+" : ""}${pts} puntos — saldo: ${updated.points} pts`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
