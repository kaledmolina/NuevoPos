import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/loyalty?branchId=xxx
 * Retorna la configuración del programa de puntos de la sede,
 * junto con un resumen de cuentas activas y top clientes.
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId } = branchAccess

  try {
    // Programa de puntos de la sede (o defaults si aún no existe)
    const program = branchId
      ? await db.loyaltyProgram.findUnique({ where: { branchId } })
      : null

    // Estadísticas de uso
    const stats = branchId
      ? await db.loyaltyAccount.aggregate({
          where: { branchId },
          _count: { id: true },
          _sum: { points: true, totalEarned: true, totalRedeemed: true },
        })
      : null

    // Top 10 clientes por puntos
    const topClients = branchId
      ? await db.loyaltyAccount.findMany({
          where: { branchId, points: { gt: 0 } },
          include: { client: { select: { id: true, name: true, phone: true, document: true } } },
          orderBy: { points: "desc" },
          take: 10,
        })
      : []

    return NextResponse.json({
      ok: true,
      program: program ?? {
        enabled: false,
        pointsPerPurchase: 1,
        purchaseUnit: 1000,
        pointValue: 100,
        minPointsToRedeem: 50,
        maxRedeemPercent: 50,
        expirationDays: null,
        programName: "Programa de Puntos",
        welcomePoints: 0,
        birthdayPoints: 0,
      },
      stats: {
        totalAccounts: stats?._count.id ?? 0,
        totalPointsActive: stats?._sum.points ?? 0,
        totalPointsEarned: stats?._sum.totalEarned ?? 0,
        totalPointsRedeemed: stats?._sum.totalRedeemed ?? 0,
      },
      topClients: topClients.map((a) => ({
        clientId: a.clientId,
        clientName: a.client.name,
        clientPhone: a.client.phone,
        clientDocument: a.client.document,
        points: a.points,
        totalEarned: a.totalEarned,
        totalRedeemed: a.totalRedeemed,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * POST /api/loyalty
 * Guarda o actualiza la configuración del programa de puntos de la sede.
 * body: { branchId, enabled, pointsPerPurchase, purchaseUnit, pointValue,
 *         minPointsToRedeem, maxRedeemPercent, expirationDays,
 *         programName, welcomePoints, birthdayPoints }
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const branchAccess = await requireBranchAccess(req)
  if (branchAccess instanceof NextResponse) return branchAccess
  const { branchId } = branchAccess

  if (!branchId) {
    return NextResponse.json({ error: "Se requiere branchId para configurar el programa de puntos." }, { status: 400 })
  }

  try {
    const body = await req.json()
    const {
      enabled,
      pointsPerPurchase,
      purchaseUnit,
      pointValue,
      minPointsToRedeem,
      maxRedeemPercent,
      expirationDays,
      programName,
      welcomePoints,
      birthdayPoints,
    } = body

    const data = {
      enabled: Boolean(enabled),
      pointsPerPurchase: Math.max(0, Number(pointsPerPurchase) || 1),
      purchaseUnit: Math.max(1, Number(purchaseUnit) || 1000),
      pointValue: Math.max(0, Number(pointValue) || 100),
      minPointsToRedeem: Math.max(0, Math.round(Number(minPointsToRedeem) || 50)),
      maxRedeemPercent: Math.min(100, Math.max(0, Number(maxRedeemPercent) || 50)),
      expirationDays: expirationDays ? Math.max(1, Math.round(Number(expirationDays))) : null,
      programName: String(programName || "Programa de Puntos").trim().slice(0, 80),
      welcomePoints: Math.max(0, Math.round(Number(welcomePoints) || 0)),
      birthdayPoints: Math.max(0, Math.round(Number(birthdayPoints) || 0)),
    }

    const program = await db.loyaltyProgram.upsert({
      where: { branchId },
      create: { branchId, ...data },
      update: data,
    })

    await logAudit({
      action: "loyalty_program_update",
      entityType: "loyalty",
      entityId: branchId,
      detail: `Programa "${data.programName}" ${data.enabled ? "activado" : "desactivado"} — ${data.pointsPerPurchase}pts c/ $${data.purchaseUnit}`,
      userName: session?.name ?? "sistema",
      role: session?.role ?? "admin",
    })

    return NextResponse.json({ ok: true, program, message: `Programa "${program.programName}" guardado correctamente.` })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
