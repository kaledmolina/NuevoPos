import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { verifyEntityBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    if (session && !(await verifyEntityBranchAccess(session.uid, existing.branchId))) {
      return NextResponse.json(
        { error: "Acceso denegado: No tienes autorización para modificar productos de esta sede." },
        { status: 403 }
      )
    }

    const body = await req.json()
    const data: Record<string, unknown> = {}
    const fields = [
      "name", "barcode", "sku", "categoryId", "description", "unit",
      "batch", "location", "active", "image",
    ]
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f] === "" ? null : body[f]
    }
    if (body.cost !== undefined) data.cost = Number(body.cost) || 0
    if (body.price !== undefined) data.price = Number(body.price) || 0
    if (body.stock !== undefined) data.stock = Number(body.stock) || 0
    if (body.minStock !== undefined) data.minStock = Number(body.minStock) || 0
    if (body.expirationDate !== undefined) {
      data.expirationDate = body.expirationDate ? new Date(body.expirationDate) : null
    }

    const product = await db.product.update({
      where: { id },
      data,
      include: { category: true },
    })
    try {
      await logAudit({
        action: "product_update",
        entityType: "product",
        entityId: id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Producto actualizado: ${product.name}`,
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json(product)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 })
    }

    if (session && !(await verifyEntityBranchAccess(session.uid, existing.branchId))) {
      return NextResponse.json(
        { error: "Acceso denegado: No tienes autorización para desactivar productos de esta sede." },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const isHard = searchParams.get("hard") === "true" || searchParams.get("force") === "true" || session?.role === "superadmin"

    // Si es Superadmin o solicita borrado definitivo de producto de prueba/demo:
    if (session?.role === "superadmin" || isHard) {
      await db.$transaction(async (tx) => {
        await tx.saleItem.deleteMany({ where: { productId: id } })
        await tx.purchaseItem.deleteMany({ where: { productId: id } })
        await tx.productBatch.deleteMany({ where: { productId: id } })
        await tx.product.delete({ where: { id } })
      })

      try {
        await logAudit({
          action: "product_delete_permanent",
          entityType: "product",
          entityId: id,
          userName: session?.name ?? "Superadmin",
          role: session?.role ?? "superadmin",
          detail: `Producto eliminado permanentemente: "${existing.name}" (código: ${existing.barcode || existing.sku || "N/A"})`,
        })
      } catch {
        // noop
      }

      return NextResponse.json({
        ok: true,
        message: `Producto "${existing.name}" eliminado permanentemente del sistema.`,
      })
    }

    const salesCount = await db.saleItem.count({ where: { productId: id } })
    const purchasesCount = await db.purchaseItem.count({ where: { productId: id } })

    // Soft delete para administradores estándar: Desactivar producto para proteger integridad
    await db.product.update({ where: { id }, data: { active: false } })
    try {
      await logAudit({
        action: "product_deactivate",
        entityType: "product",
        entityId: id,
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: `Producto desactivado/archivado (protegido contra borrado físico, ${salesCount} ventas y ${purchasesCount} compras)`,
      })
    } catch {
      // noop: logging failure must not break the operation
    }
    return NextResponse.json({
      ok: true,
      message: "Producto desactivado y archivado. Los registros contables e historial permanecen protegidos.",
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
