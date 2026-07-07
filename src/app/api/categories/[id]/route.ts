import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Renombrar una categoría
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const body = await req.json()
    const name = String(body.name ?? "").trim()
    if (!name) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 })
    }
    const dup = await db.category.findFirst({
      where: { name: { equals: name }, NOT: { id } },
    })
    if (dup) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 400 })
    }
    const updated = await db.category.update({ where: { id }, data: { name } })
    try {
      await logAudit({
        action: "category_update",
        entityType: "category",
        entityId: id,
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Categoría renombrada a: ${name}`,
      })
    } catch { /* noop */ }
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// Eliminar una categoría (solo si no tiene productos asociados)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const cat = await db.category.findUnique({ where: { id } })
    const productsCount = await db.product.count({ where: { categoryId: id } })
    if (productsCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: hay ${productsCount} producto(s) usando esta categoría. Reasigna o elimina esos productos primero.` },
        { status: 400 }
      )
    }
    await db.category.delete({ where: { id } })
    try {
      await logAudit({
        action: "category_delete",
        entityType: "category",
        entityId: id,
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Categoría eliminada: ${cat?.name ?? id}`,
      })
    } catch { /* noop */ }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
