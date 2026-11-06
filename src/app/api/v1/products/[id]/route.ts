import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireRole, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        batches: {
          where: { stock: { gt: 0 } },
          orderBy: { expirationDate: "asc" },
        },
      },
    })

    if (!product) {
      return apiError("Producto no encontrado", 404)
    }

    return apiSuccess({ product })
  } catch (error) {
    console.error("Error en GET /api/v1/products/[id]:", error)
    return apiError("Error al consultar producto", 500)
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(req, ["admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return apiError("Producto no encontrado", 404)
    }

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = String(body.name).trim()
    if (body.price !== undefined) data.price = Number(body.price)
    if (body.cost !== undefined) data.cost = Number(body.cost)
    if (body.stock !== undefined) data.stock = Number(body.stock)
    if (body.minStock !== undefined) data.minStock = Number(body.minStock)
    if (body.unit !== undefined) data.unit = String(body.unit).trim()
    if (body.categoryId !== undefined) data.categoryId = body.categoryId || null
    if (body.barcode !== undefined) data.barcode = body.barcode ? String(body.barcode).trim() : null
    if (body.sku !== undefined) data.sku = body.sku ? String(body.sku).trim() : null
    if (body.image !== undefined) data.image = body.image ? String(body.image).trim() : null
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null
    if (body.location !== undefined) data.location = body.location ? String(body.location).trim() : null
    if (body.active !== undefined) data.active = Boolean(body.active)

    const updated = await db.product.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true } },
      },
    })

    await logAudit({
      action: "api_product_update",
      entityType: "product",
      entityId: id,
      userName: session.name,
      role: session.role,
      detail: `Producto actualizado vía API: ${updated.name}`,
    })

    return apiSuccess({ product: updated }, { message: "Producto actualizado con éxito" })
  } catch (error) {
    console.error("Error en PUT /api/v1/products/[id]:", error)
    return apiError("Error al actualizar producto", 500)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = requireRole(req, ["admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { id } = await params

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return apiError("Producto no encontrado", 404)
    }

    // Desactivar (soft delete) para proteger integridad histórica de ventas
    const disabled = await db.product.update({
      where: { id },
      data: { active: false },
    })

    await logAudit({
      action: "api_product_delete",
      entityType: "product",
      entityId: id,
      userName: session.name,
      role: session.role,
      detail: `Producto desactivado vía API: ${disabled.name}`,
    })

    return apiSuccess({ id, active: false }, { message: "Producto desactivado correctamente" })
  } catch (error) {
    console.error("Error en DELETE /api/v1/products/[id]:", error)
    return apiError("Error al desactivar producto", 500)
  }
}
