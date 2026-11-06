import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"
import { requireRole, logAudit } from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authResult = requireRole(req, ["vendedor", "admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get("branchId")
    const page = Math.max(1, Number(searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 30)))

    const where: Record<string, unknown> = {}

    if (session.role !== "superadmin" && session.tenantId) {
      // Filtrar solo las sedes del tenant
      const branches = await db.branch.findMany({
        where: { tenantId: session.tenantId },
        select: { id: true },
      })
      const allowedIds = branches.map((b) => b.id)
      where.branchId = branchId && allowedIds.includes(branchId) ? branchId : { in: allowedIds }
    } else if (branchId) {
      where.branchId = branchId
    }

    const [total, sales] = await Promise.all([
      db.sale.count({ where }),
      db.sale.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, phone: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, barcode: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return apiSuccess({
      sales,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error("Error en GET /api/v1/sales:", error)
    return apiError("Error al listar ventas", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = requireRole(req, ["vendedor", "admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const body = await req.json().catch(() => ({}))

    const branchId = (body.branchId || "").toString().trim()
    const paymentMethod = (body.paymentMethod || "efectivo").toString().trim()
    const clientId = body.clientId ? String(body.clientId).trim() : null
    const discount = Number(body.discount || 0)
    const amountReceived = Number(body.amountReceived || 0)
    const notes = body.notes ? String(body.notes).trim() : null
    const items = Array.isArray(body.items) ? body.items : []

    if (!branchId) {
      return apiError("El ID de la sede ('branchId') es obligatorio", 400)
    }

    if (!items || items.length === 0) {
      return apiError("La venta debe contener al menos un producto", 400)
    }

    // Validar productos y calcular totales
    const productIds = items.map((i: { productId: string }) => i.productId).filter(Boolean)
    const products = await db.product.findMany({
      where: { id: { in: productIds } },
    })

    if (products.length !== productIds.length) {
      return apiError("Uno o más productos no existen", 400)
    }

    for (const it of items) {
      const p = products.find((pr) => pr.id === it.productId)!
      if (p.branchId && p.branchId !== branchId) {
        return apiError(`El producto '${p.name}' no pertenece a la sede seleccionada`, 400)
      }
      if (p.stock < it.quantity) {
        return apiError(`Stock insuficiente para '${p.name}'. Disponible: ${p.stock}`, 400)
      }
    }

    const subtotal = items.reduce((sum, it) => {
      const p = products.find((pr) => pr.id === it.productId)!
      const price = Number(it.unitPrice ?? p.price)
      return sum + price * Number(it.quantity)
    }, 0)

    const total = Math.max(0, subtotal - discount)
    const change = Math.max(0, amountReceived - total)

    const sale = await db.$transaction(async (tx) => {
      // 1. Descontar inventario
      for (const it of items) {
        await tx.product.update({
          where: { id: it.productId },
          data: { stock: { decrement: it.quantity } },
        })
      }

      // 2. Obtener correlativo de factura
      const lastSale = await tx.sale.findFirst({ orderBy: { invoiceNumber: "desc" } })
      const invoiceNumber = nextInvoiceNumber(lastSale?.invoiceNumber)

      // 3. Crear venta
      return tx.sale.create({
        data: {
          invoiceNumber,
          branchId,
          clientId,
          subtotal,
          tax: 0,
          discount,
          total,
          paymentMethod,
          amountReceived,
          change,
          status: "completada",
          notes,
          items: {
            create: items.map((it) => {
              const p = products.find((pr) => pr.id === it.productId)!
              const unitPrice = Number(it.unitPrice ?? p.price)
              const unitCost = Number(p.cost || 0)
              return {
                productId: it.productId,
                quantity: it.quantity,
                unitPrice,
                unitCost,
                subtotal: unitPrice * it.quantity,
              }
            }),
          },
        },
        include: {
          items: true,
          client: true,
        },
      })
    })

    await logAudit({
      action: "api_sale_create",
      entityType: "sale",
      entityId: sale.id,
      userName: session.name,
      role: session.role,
      detail: `Venta ${sale.invoiceNumber} registrada vía API por $${total.toLocaleString("es-CO")}`,
    })

    return apiSuccess({ sale }, { message: "Venta registrada con éxito" }, 201)
  } catch (error) {
    console.error("Error en POST /api/v1/sales:", error)
    return apiError("Error al registrar venta", 500)
  }
}
