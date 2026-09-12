import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resolveBranchId, requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const branchId = await resolveBranchId(req)

  const where: Record<string, unknown> = {}
  if (branchId) {
    where.OR = [
      { branchId },
      { isGeneric: true },
    ]
  }

  if (q) {
    where.AND = [
      {
        OR: [
          { name: { contains: q } },
          { document: { contains: q } },
          { phone: { contains: q } },
        ],
      },
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
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    const { branchId } = branchAccess
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
        branchId: branchId || null,
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
