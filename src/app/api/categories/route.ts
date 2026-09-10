import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  })
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const category = await db.category.create({ data: { name: body.name } })
    const session = getSession(req)
    try {
      await logAudit({
        action: "category_create",
        entityType: "category",
        entityId: category.id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Categoría creada: ${category.name}`,
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json(category)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
