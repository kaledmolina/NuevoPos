import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"

/**
 * Sincroniza un Pedido a una Venta oficial (Sale) si ya está pagado o entregado.
 * Garantiza idempotencia: si ya existe una venta para este pedido, no la duplica.
 */
export async function syncOrderToSale(orderIdOrNumber: string, customDb?: any) {
  const client = customDb || db

  // 1. Cargar el pedido con sus items y productos
  const order = await client.order.findFirst({
    where: {
      OR: [
        { id: orderIdOrNumber },
        { orderNumber: orderIdOrNumber },
      ],
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      branch: true,
    },
  })

  if (!order) {
    return null
  }

  // Solo se pasa a ventas si fue pagado o entregado
  const isEligible = order.paymentStatus === "pagado" || order.status === "entregado"
  if (!isEligible) {
    return null
  }

  // 2. Verificar si ya existe una venta para esta orden
  const orderMarker = `[Pedido: ${order.orderNumber}]`
  const existingSale = await client.sale.findFirst({
    where: {
      notes: {
        contains: orderMarker,
      },
    },
    include: {
      items: true,
      client: true,
    },
  })

  if (existingSale) {
    // Si la venta previa tenía el costo de domicilio sumado al total, ajustarla para que sea solo el valor del producto
    const productOnlyTotal = Math.max(
      0,
      Number(order.subtotal || 0) - Number(order.discount || 0) + Number(order.tax || 0)
    )
    if (existingSale.total !== productOnlyTotal && (order.deliveryFee || 0) > 0) {
      await client.sale.update({
        where: { id: existingSale.id },
        data: {
          total: productOnlyTotal,
          amountReceived: existingSale.paymentMethod === "credito" ? existingSale.amountReceived : productOnlyTotal,
        },
      }).catch(() => {})
    }
    return existingSale
  }

  // 3. Vincular o crear el Cliente para registrarlo en el CRM y la venta
  let resolvedClientId = order.clientId
  if (!resolvedClientId && order.customerPhone) {
    const existingClient = await client.client.findFirst({
      where: {
        OR: [
          { phone: order.customerPhone },
          { name: order.customerName },
        ],
      },
    })

    if (existingClient) {
      resolvedClientId = existingClient.id
    } else {
      try {
        const newClient = await client.client.create({
          data: {
            name: order.customerName || `Cliente ${order.customerPhone}`,
            phone: order.customerPhone,
            email: order.customerEmail || null,
            address: order.deliveryAddress || null,
            tenantId: order.tenantId || null,
          },
        })
        resolvedClientId = newClient.id
      } catch {
        // En caso de conflicto de clave única
        const fallbackClient = await client.client.findFirst({
          where: { phone: order.customerPhone },
        })
        if (fallbackClient) resolvedClientId = fallbackClient.id
      }
    }
  }

  // 4. Buscar sesión de caja abierta en esa sede si aplica
  const openSession = order.branchId
    ? await client.cashSession.findFirst({
        where: { branchId: order.branchId, status: "abierta" },
        orderBy: { openedAt: "desc" },
      })
    : null

  // 5. Generar consecutivo de factura único y garantizado
  const today = new Date()
  const yy = String(today.getFullYear()).slice(-2)
  const mm = String(today.getMonth() + 1).padStart(2, "0")
  const prefix = `F${yy}${mm}-`

  const existingInvoices = await client.sale.findMany({
    where: {
      invoiceNumber: {
        startsWith: prefix,
      },
    },
    select: { invoiceNumber: true },
  })

  let maxNum = 0
  for (const inv of existingInvoices) {
    const raw = inv.invoiceNumber.slice(prefix.length)
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed
  }

  const invoiceNumber = `${prefix}${String(maxNum + 1).padStart(4, "0")}`

  // 6. Preparar items de la venta
  const saleItemsData: Array<{
    productId: string
    quantity: number
    unitPrice: number
    unitCost: number
    subtotal: number
  }> = []

  for (const it of order.items) {
    const unitCost = Number(it.product?.cost) > 0 ? Number(it.product.cost) : Number(it.unitPrice) * 0.7
    saleItemsData.push({
      productId: it.productId,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      unitCost,
      subtotal: it.subtotal || it.unitPrice * it.quantity,
    })
  }

  // Mapear método de pago admitido en Sale (efectivo, tarjeta, transferencia, credito)
  let paymentMethod = "efectivo"
  const rawMethod = (order.paymentMethod || "").toLowerCase()
  if (rawMethod.includes("transf") || rawMethod.includes("nequi") || rawMethod.includes("davi")) {
    paymentMethod = "transferencia"
  } else if (rawMethod.includes("tarjeta")) {
    paymentMethod = "tarjeta"
  } else if (rawMethod.includes("credito")) {
    paymentMethod = "credito"
  } else {
    paymentMethod = "efectivo"
  }

  const deliveryNote = order.deliveryFee > 0 ? ` (Costo Domicilio: $${order.deliveryFee.toLocaleString("es-CO")})` : ""
  const fullNotes = `Venta por Domicilio/Pedido ${orderMarker}.${deliveryNote} Cliente: ${order.customerName} - Tel: ${order.customerPhone}. Dirección: ${order.deliveryAddress || "N/A"}.`

  // 6.2 Total oficial de la venta: ÚNICAMENTE EL VALOR DEL PRODUCTO (el valor del domicilio no se incluye en la venta)
  const productOnlyTotal = Math.max(
    0,
    Number(order.subtotal || 0) - Number(order.discount || 0) + Number(order.tax || 0)
  )

  // 7. Crear la venta
  const createdSale = await client.sale.create({
    data: {
      invoiceNumber,
      clientId: resolvedClientId || null,
      branchId: order.branchId || null,
      subtotal: order.subtotal,
      tax: order.tax || 0,
      discount: order.discount || 0,
      total: productOnlyTotal,
      paymentMethod,
      amountReceived: productOnlyTotal,
      change: 0,
      status: "completada",
      cashSessionId: openSession?.id || null,
      notes: fullNotes,
      createdAt: order.deliveredAt || order.createdAt || new Date(),
      items: {
        create: saleItemsData,
      },
    },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      client: true,
    },
  })

  // Si el pedido no tenía clientId asignado, vincularlo ahora
  if (!order.clientId && resolvedClientId) {
    await client.order.update({
      where: { id: order.id },
      data: { clientId: resolvedClientId },
    }).catch(() => {})
  }

  return createdSale
}

/**
 * Sincroniza todos los pedidos elegibles (pagados o entregados) que aún no tengan venta registrada.
 */
export async function syncAllPaidOrders(branchId?: string | null) {
  const where: any = {
    OR: [
      { paymentStatus: "pagado" },
      { status: "entregado" },
    ],
  }
  if (branchId) {
    where.branchId = branchId
  }

  const orders = await db.order.findMany({
    where,
    select: { id: true, orderNumber: true },
  })

  const results: Array<{ orderNumber: string; saleId: any }> = []
  for (const o of orders) {
    const sale = await syncOrderToSale(o.id)
    if (sale) results.push({ orderNumber: o.orderNumber, saleId: sale.id })
  }
  return results
}
