import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSession, logAudit } from "@/lib/auth"
import { getUserAllowedBranches } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"
import { broadcastNewOrderToDrivers } from "@/lib/telegram-driver"

export const dynamic = "force-dynamic"

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString()
  return `PED-${dateStr}-${randomSuffix}`
}

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req)
    const { searchParams } = new URL(req.url)
    const businessId = searchParams.get("businessId") || searchParams.get("tenantId")
    const headerBranchId = req.headers.get("x-branch-id")
    const queryBranchId = searchParams.get("branchId")
    const rawBranchId = (queryBranchId && queryBranchId !== "all" && queryBranchId !== "null" && queryBranchId !== "undefined")
      ? queryBranchId
      : (headerBranchId && headerBranchId !== "all" && headerBranchId !== "null" && headerBranchId !== "undefined")
        ? headerBranchId
        : null

    const status = searchParams.get("status")
    const q = searchParams.get("q")?.trim()
    const page = Math.max(1, Number(searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)))

    const andConditions: any[] = []

    // Filtros de visibilidad por Rol
    if (session) {
      if (session.role === "cliente") {
        // Un cliente ve sus propios pedidos
        andConditions.push({
          OR: [
            { createdById: session.uid },
            { customerName: session.name },
          ]
        })
      } else if (session.role === "domiciliario") {
        // Aislamiento multi-negocio y multi-sede estricto para repartidores
        if (session.tenantId) {
          andConditions.push({
            OR: [
              { tenantId: session.tenantId },
              { branch: { tenantId: session.tenantId } },
            ],
          })
        }
        const allowedBranches = await getUserAllowedBranches(session.uid)
        if (rawBranchId) {
          if (!allowedBranches.includes(rawBranchId)) {
            return apiError("No tienes autorización para consultar pedidos de esta sede", 403)
          }
        } else if (allowedBranches.length > 0) {
          andConditions.push({
            OR: [
              { branchId: { in: allowedBranches } },
              { branchId: null },
            ],
          })
        }

        // Un domiciliario SOLO ve pedidos asignados a su cuenta o pedidos disponibles sin conductor listos para tomar
        andConditions.push({
          OR: [
            { deliveryDriverId: session.uid },
            {
              deliveryDriverId: null,
              status: { in: ["pendiente", "confirmado", "en_preparacion"] },
            },
          ],
        })
      } else if (session.role === "admin" || session.role === "vendedor") {
        // Administradores y vendedores ven los pedidos de su propio negocio
        if (session.tenantId) {
          andConditions.push({
            OR: [
              { tenantId: session.tenantId },
              { branch: { tenantId: session.tenantId } },
            ]
          })
        }
      }
    }

    // Parámetros explícitos adicionales y aislamiento por Sede
    if (businessId) andConditions.push({ tenantId: businessId })
    if (rawBranchId) {
      andConditions.push({ branchId: rawBranchId })
    }
    if (status) andConditions.push({ status })

    if (q) {
      andConditions.push({
        OR: [
          { orderNumber: { contains: q } },
          { customerName: { contains: q } },
          { customerPhone: { contains: q } },
          { deliveryAddress: { contains: q } },
        ]
      })
    }

    const where: Record<string, unknown> = andConditions.length > 0 ? { AND: andConditions } : {}

    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true, rubro: true, ownerPhone: true } },
          branch: { select: { id: true, name: true, address: true, phone: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return apiSuccess({
      orders,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error("Error en GET /api/v1/orders:", error)
    return apiError("Error al consultar pedidos", 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getSession(req)
    const body = await req.json().catch(() => ({}))

    const businessId = (body.businessId || body.tenantId || "").toString().trim()
    let branchId = (body.branchId || req.headers.get("x-branch-id") || "").toString().trim()
    const customerName = (body.customerName || (session?.role === "cliente" ? session.name : "")).toString().trim()
    const customerPhone = (body.customerPhone || "").toString().trim()
    const customerEmail = body.customerEmail ? body.customerEmail.toString().trim() : null
    const deliveryAddress = body.deliveryAddress ? body.deliveryAddress.toString().trim() : null
    const deliveryNotes = body.deliveryNotes ? body.deliveryNotes.toString().trim() : null
    const paymentMethod = (body.paymentMethod || "contraentrega").toString().trim()
    const notes = body.notes ? body.notes.toString().trim() : null
    const deliveryFee = Number(body.deliveryFee ?? 0)
    const items = Array.isArray(body.items) ? body.items : []

    if (!businessId) {
      return apiError("El campo 'businessId' (ID del negocio al que haces el pedido) es obligatorio", 400)
    }

    if (!customerName) {
      return apiError("El nombre del cliente ('customerName') es obligatorio", 400)
    }

    if (!customerPhone) {
      return apiError("El número de teléfono/WhatsApp del cliente ('customerPhone') es obligatorio para coordinar la entrega", 400)
    }

    if (!items || items.length === 0) {
      return apiError("El pedido debe contener al menos un producto en 'items'", 400)
    }

    // 1. Validar que el negocio exista y esté aprobado
    const tenant = await db.tenant.findFirst({
      where: {
        OR: [{ id: businessId }, { slug: businessId }],
      },
      include: {
        branches: { where: { active: true } },
      },
    })

    if (!tenant) {
      return apiError("El negocio seleccionado no existe", 404)
    }

    if (tenant.status !== "aprobado") {
      return apiError("Este negocio no está disponible actualmente para recibir pedidos", 403)
    }

    // Si no especificaron sede, asignar la sede principal del negocio
    if (!branchId) {
      const mainBranch = tenant.branches.find((b) => b.isMain) || tenant.branches[0]
      if (!mainBranch) {
        return apiError("El negocio no tiene sedes activas disponibles", 400)
      }
      branchId = mainBranch.id
    } else {
      const branchExists = tenant.branches.some((b) => b.id === branchId)
      if (!branchExists) {
        return apiError("La sede especificada no pertenece a este negocio o está inactiva", 400)
      }
    }

    // 2. Validar productos y calcular totales
    const productIds = items.map((i: { productId: string }) => i.productId).filter(Boolean)
    if (productIds.length !== items.length) {
      return apiError("Todos los items deben incluir un 'productId' válido", 400)
    }

    const dbProducts = await db.product.findMany({
      where: {
        id: { in: productIds },
        active: true,
      },
    })

    if (dbProducts.length !== productIds.length) {
      return apiError("Uno o más productos del pedido no existen o no están disponibles", 400)
    }

    let subtotal = 0
    const orderItemsData: Array<{
      productId: string
      productName: string
      quantity: number
      unitPrice: number
      subtotal: number
      notes?: string
    }> = []

    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.quantity || 1)))
      const prod = dbProducts.find((p) => p.id === item.productId)!

      // Comprobar pertenencia de sede si el producto tiene sede asignada
      if (prod.branchId && prod.branchId !== branchId) {
        return apiError(`El producto '${prod.name}' pertenece a otra sede del negocio`, 400)
      }

      // Validar stock disponible
      if (prod.stock < qty) {
        return apiError(`Stock insuficiente para '${prod.name}'. Disponible: ${prod.stock}, Solicitado: ${qty}`, 400)
      }

      const itemSubtotal = prod.price * qty
      subtotal += itemSubtotal

      orderItemsData.push({
        productId: prod.id,
        productName: prod.name,
        quantity: qty,
        unitPrice: prod.price,
        subtotal: itemSubtotal,
        notes: item.notes ? String(item.notes).trim() : undefined,
      })
    }

    const total = Math.max(0, subtotal + deliveryFee)
    const orderNumber = generateOrderNumber()

    // 3. Crear pedido y descontar stock dentro de una transacción atómica
    const createdOrder = await db.$transaction(async (tx) => {
      // Descontar stock de los productos
      for (const item of orderItemsData) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })
      }

      // Crear registro de orden
      const order = await tx.order.create({
        data: {
          orderNumber,
          tenantId: tenant.id,
          branchId,
          customerName,
          customerPhone,
          customerEmail,
          deliveryAddress,
          deliveryNotes,
          subtotal,
          deliveryFee,
          total,
          paymentMethod,
          paymentStatus: "pendiente",
          status: "pendiente",
          notes,
          createdByRole: session?.role || "cliente",
          createdById: session?.uid || null,
          items: {
            create: orderItemsData.map((it) => ({
              productId: it.productId,
              productName: it.productName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              subtotal: it.subtotal,
              notes: it.notes,
            })),
          },
        },
        include: {
          items: true,
          tenant: { select: { id: true, name: true, ownerPhone: true } },
          branch: { select: { id: true, name: true, address: true, phone: true } },
        },
      })

      return order
    })

    await logAudit({
      action: "api_order_create",
      entityType: "order",
      entityId: createdOrder.id,
      userName: customerName,
      role: session?.role || "cliente",
      detail: `Pedido ${orderNumber} creado por $${total.toLocaleString("es-CO")} en negocio ${tenant.name}`,
    })

    // Difundir automáticamente a los domiciliarios de la sede si no tiene conductor asignado
    if (!createdOrder.deliveryDriverId) {
      broadcastNewOrderToDrivers(createdOrder.id).catch((err) => {
        console.warn("[Orders Broadcast Warning]:", err)
      })
    }

    return apiSuccess(
      {
        order: createdOrder,
        message: "¡Pedido creado exitosamente! El negocio ha recibido tu solicitud.",
      },
      undefined,
      201
    )
  } catch (error) {
    console.error("Error en POST /api/v1/orders:", error)
    return apiError("Error al procesar el pedido", 500)
  }
}
