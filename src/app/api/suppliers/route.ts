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
      { contactName: { contains: q } },
    ]
  }

  const suppliers = await db.supplier.findMany({
    where,
    include: {
      _count: { select: { purchases: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(suppliers)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json(
        { error: "El nombre del proveedor es obligatorio" },
        { status: 400 }
      )
    }

    const supplier = await db.supplier.create({
      data: {
        name: String(body.name).trim(),
        document: body.document?.trim() || null,
        contactName: body.contactName?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        address: body.address?.trim() || null,
        notes: body.notes?.trim() || null,
      },
      include: {
        _count: { select: { purchases: true } },
      },
    })
    return NextResponse.json(supplier)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
