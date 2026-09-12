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
    where.branchId = branchId
  }

  if (q) {
    where.AND = [
      {
        OR: [
          { name: { contains: q } },
          { document: { contains: q } },
          { phone: { contains: q } },
          { contactName: { contains: q } },
        ],
      },
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
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    const { branchId } = branchAccess
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
        branchId: branchId || null,
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
