import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// GET /api/transactions
// Filtros: ?type=ingreso|egreso, ?from=ISO, ?to=ISO, ?q=concepto/categoría
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type")?.trim()
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const q = searchParams.get("q")?.trim()

    const where: Record<string, unknown> = {}

    if (type === "ingreso" || type === "egreso") {
      where.type = type
    }

    // Rango de fechas sobre el campo `date`
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.gte = new Date(from)
      if (to) {
        // Incluir todo el día final
        const endDate = new Date(to)
        endDate.setHours(23, 59, 59, 999)
        range.lte = endDate
      }
      where.date = range
    }

    if (q) {
      where.OR = [
        { concept: { contains: q } },
        { category: { contains: q } },
        { description: { contains: q } },
      ]
    }

    const transactions = await db.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take: 300,
    })

    return NextResponse.json(transactions)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/transactions
// Body: { type, category, amount, concept, description?, method?, date? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const type = String(body.type ?? "").trim()
    if (type !== "ingreso" && type !== "egreso") {
      return NextResponse.json(
        { error: "El tipo debe ser 'ingreso' o 'egreso'" },
        { status: 400 }
      )
    }

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "El monto debe ser mayor a 0" },
        { status: 400 }
      )
    }

    const concept = String(body.concept ?? "").trim()
    if (!concept) {
      return NextResponse.json(
        { error: "El concepto es obligatorio" },
        { status: 400 }
      )
    }

    const category = String(body.category ?? "").trim() || "Otros"
    const method = String(body.method ?? "efectivo").trim() || "efectivo"
    const description = body.description ? String(body.description).trim() : null

    let date: Date
    if (body.date) {
      date = new Date(body.date)
      if (isNaN(date.getTime())) date = new Date()
    } else {
      date = new Date()
    }

    // Si hay caja abierta, asociar el movimiento a la sesión actual
    let cashSessionId: string | null = null
    const openSession = await db.cashSession.findFirst({
      where: { status: "abierta" },
    })
    if (openSession) cashSessionId = openSession.id

    const transaction = await db.transaction.create({
      data: {
        type,
        category,
        amount,
        concept,
        description,
        method,
        date,
        cashSessionId,
      },
    })

    // Registrar también en la caja abierta para arqueo
    if (openSession) {
      await db.cashTransaction.create({
        data: {
          cashSessionId: openSession.id,
          type,
          amount,
          concept: `${category} · ${concept}`,
          method,
          reference: transaction.id,
        },
      })
    }

    return NextResponse.json(transaction, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
