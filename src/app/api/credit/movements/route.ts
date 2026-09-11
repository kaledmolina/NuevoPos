import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/credit/movements?accountId=... or ?clientId=...
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get("accountId")
  const clientId = searchParams.get("clientId")

  let targetAccountId = accountId

  if (!targetAccountId && clientId) {
    const acc = await db.creditAccount.findUnique({
      where: { clientId },
      select: { id: true },
    })
    if (!acc) return NextResponse.json({ error: "Cuenta de crédito no encontrada" }, { status: 404 })
    targetAccountId = acc.id
  }

  if (!targetAccountId && !accountId && !clientId) {
    // Consulta general de movimientos (para consolidación y reportes)
    const type = searchParams.get("type")
    const method = searchParams.get("method")
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (method) where.method = method
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.gte = new Date(from)
      if (to) {
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        range.lte = endDate
      }
      where.createdAt = range
    }

    const movements = await db.creditMovement.findMany({
      where,
      include: { account: { include: { client: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    })

    return NextResponse.json(movements.map((m) => ({
      id: m.id,
      voucherNumber: `AB-${m.id.slice(-6).toUpperCase()}`,
      type: m.type,
      amount: m.amount,
      concept: m.concept,
      method: m.method || "efectivo",
      reportedBy: m.reportedBy || "Administrador",
      previousBalance: m.previousBalance,
      remainingBalance: m.remainingBalance,
      saleId: m.saleId,
      clientName: m.account?.client?.name || "Cliente",
      createdAt: m.createdAt,
    })))
  }

  if (!targetAccountId) {
    return NextResponse.json({ error: "Cuenta no especificada" }, { status: 400 })
  }

  const account = await db.creditAccount.findUnique({
    where: { id: targetAccountId },
    include: {
      client: true,
      movements: {
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!account) {
    return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })
  }

  return NextResponse.json({
    account: {
      id: account.id,
      clientId: account.clientId,
      clientName: account.client.name,
      clientDocument: account.client.document,
      clientPhone: account.client.phone,
      creditLimit: account.creditLimit,
      balance: account.balance,
      available: account.creditLimit - account.balance,
      active: account.active,
    },
    movements: account.movements.map((m) => ({
      id: m.id,
      voucherNumber: `AB-${m.id.slice(-6).toUpperCase()}`,
      type: m.type,
      amount: m.amount,
      concept: m.concept,
      method: m.method || "efectivo",
      reportedBy: m.reportedBy || "Administrador",
      previousBalance: m.previousBalance,
      remainingBalance: m.remainingBalance,
      saleId: m.saleId,
      createdAt: m.createdAt,
    })),
  })
}
