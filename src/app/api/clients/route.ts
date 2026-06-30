import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()

  const where: Record<string, unknown> = {}
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { document: { contains: q } },
      { phone: { contains: q } },
    ]
  }

  const clients = await db.client.findMany({
    where,
    include: {
      _count: { select: { sales: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json(
        { error: "El nombre del cliente es obligatorio" },
        { status: 400 }
      )
    }

    const client = await db.client.create({
      data: {
        name: String(body.name).trim(),
        document: body.document?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        address: body.address?.trim() || null,
        notes: body.notes?.trim() || null,
      },
      include: {
        _count: { select: { sales: true } },
      },
    })
    return NextResponse.json(client)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
