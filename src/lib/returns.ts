import { db } from "@/lib/db"

export type ReturnReason =
  | "producto_defectuoso"
  | "cambio_producto"
  | "error_pedido"
  | "cliente_insatisfecho"
  | "vencimiento"
  | "otro"

export type RefundMethod =
  | "efectivo"
  | "transferencia"
  | "credito"
  | "saldo_favor"

export interface ReturnItemInput {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  restock: boolean
}

export interface SaleReturn {
  id: string
  returnNumber: string
  saleId: string
  saleInvoiceNumber: string
  clientId?: string | null
  clientName?: string | null
  branchId?: string | null
  reason: ReturnReason
  reasonDetail?: string | null
  refundMethod: RefundMethod
  totalRefunded: number
  restockAll: boolean
  items: ReturnItemInput[]
  processedBy: string
  createdAt: string
}

export const RETURN_REASONS_LABELS: Record<ReturnReason, string> = {
  producto_defectuoso: "Producto Defectuoso / Avería",
  cambio_producto: "Cambio de Producto o Talla",
  error_pedido: "Error en el Despacho / Pedido",
  cliente_insatisfecho: "Cliente Insatisfecho",
  vencimiento: "Fecha de Vencimiento Cercana o Vencido",
  otro: "Otro Motivo",
}

export const REFUND_METHODS_LABELS: Record<RefundMethod, string> = {
  efectivo: "Reembolso en Efectivo (Caja)",
  transferencia: "Reembolso por Transferencia (Nequi / Bancaria)",
  credito: "Abonar a Deuda de Fiado / Crédito",
  saldo_favor: "Saldo a Favor del Cliente",
}

/**
 * Genera el siguiente número consecutivo único para devoluciones: DEV-YYMM-0001
 */
async function generateReturnNumber(): Promise<string> {
  const today = new Date()
  const yy = String(today.getFullYear()).slice(-2)
  const mm = String(today.getMonth() + 1).padStart(2, "0")
  const prefix = `DEV-${yy}${mm}-`

  const existingSettings = await db.setting.findMany({
    where: {
      key: { startsWith: `return:${prefix}` },
    },
    select: { key: true },
  })

  let maxNum = 0
  for (const item of existingSettings) {
    const raw = item.key.replace(`return:${prefix}`, "")
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num > maxNum) {
      maxNum = num
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`
}

/**
 * Procesa una devolución robusta sobre una venta oficial
 */
export async function processSaleReturn(params: {
  saleId: string
  items: ReturnItemInput[]
  reason: ReturnReason
  reasonDetail?: string
  refundMethod: RefundMethod
  restockAll: boolean
  processedBy?: string
  branchId?: string | null
}): Promise<SaleReturn> {
  const { saleId, items, reason, reasonDetail, refundMethod, restockAll, processedBy, branchId } = params

  if (!items || items.length === 0) {
    throw new Error("Debes seleccionar al menos un producto para la devolución")
  }

  // 1. Cargar la venta con sus items y cliente
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { include: { product: true } },
      client: { include: { creditAccount: true } },
    },
  })

  if (!sale) {
    throw new Error("La venta especificada no existe")
  }

  if (sale.status === "anulada") {
    throw new Error("No se pueden procesar devoluciones sobre una venta que ya fue anulada")
  }

  // 2. Cargar devoluciones previas de esta venta para validar cantidades
  const previousReturns = await getSaleReturns(saleId)
  const returnedQuantitiesByProduct = new Map<string, number>()
  for (const prev of previousReturns) {
    for (const prevItem of prev.items) {
      const cur = returnedQuantitiesByProduct.get(prevItem.productId) || 0
      returnedQuantitiesByProduct.set(prevItem.productId, cur + prevItem.quantity)
    }
  }

  // 3. Validar que la cantidad devuelta no supere la cantidad vendida original
  let totalRefunded = 0
  const validatedItems: ReturnItemInput[] = []

  for (const it of items) {
    const origSaleItem = sale.items.find((si) => si.productId === it.productId)
    if (!origSaleItem) {
      throw new Error(`El producto "${it.productName}" no pertenecía a la venta original #${sale.invoiceNumber}`)
    }

    const alreadyReturned = returnedQuantitiesByProduct.get(it.productId) || 0
    const availableToReturn = origSaleItem.quantity - alreadyReturned

    if (it.quantity <= 0) {
      continue
    }

    if (it.quantity > availableToReturn) {
      throw new Error(
        `La cantidad a devolver de "${it.productName}" (${it.quantity}) supera el máximo permitido disponible (${availableToReturn}).`
      )
    }

    const itemSubtotal = it.quantity * origSaleItem.unitPrice
    totalRefunded += itemSubtotal
    validatedItems.push({
      productId: it.productId,
      productName: it.productName || origSaleItem.product.name,
      quantity: it.quantity,
      unitPrice: origSaleItem.unitPrice,
      subtotal: itemSubtotal,
      restock: it.restock ?? restockAll,
    })
  }

  if (validatedItems.length === 0) {
    throw new Error("No hay cantidades válidas para procesar en la devolución")
  }

  totalRefunded = Math.round(totalRefunded * 100) / 100

  // 4. Generar consecutivo único de devolución
  const returnNumber = await generateReturnNumber()
  const returnId = `ret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

  const returnRecord: SaleReturn = {
    id: returnId,
    returnNumber,
    saleId: sale.id,
    saleInvoiceNumber: sale.invoiceNumber,
    clientId: sale.clientId,
    clientName: sale.client?.name || "Cliente General",
    branchId: branchId || sale.branchId,
    reason,
    reasonDetail: reasonDetail || null,
    refundMethod,
    totalRefunded,
    restockAll,
    items: validatedItems,
    processedBy: processedBy || "Cajero",
    createdAt: new Date().toISOString(),
  }

  // 5. Reingreso al Inventario (si restock es true)
  for (const it of validatedItems) {
    if (it.restock) {
      try {
        await db.product.update({
          where: { id: it.productId },
          data: { stock: { increment: it.quantity } },
        })
      } catch (err: any) {
        console.warn(`[Return Stock Update Warning for ${it.productName}]:`, err.message)
      }
    }
  }

  // 6. Impacto en Caja / Dinero (si es reembolso en efectivo)
  if (refundMethod === "efectivo") {
    try {
      // Buscar sesión de caja abierta en esa sede
      const activeCashSession = await db.cashSession.findFirst({
        where: {
          status: "abierta",
          ...(sale.branchId ? { branchId: sale.branchId } : {}),
        },
        orderBy: { openedAt: "desc" },
      })

      if (activeCashSession) {
        await db.cashTransaction.create({
          data: {
            cashSessionId: activeCashSession.id,
            type: "egreso",
            amount: totalRefunded,
            concept: `Devolución de venta #${sale.invoiceNumber} (${returnNumber}) - ${RETURN_REASONS_LABELS[reason]}`,
            method: "efectivo",
            reference: returnNumber,
          },
        })
      }
    } catch (cashErr: any) {
      console.warn("[Return Cash Egreso Warning]:", cashErr.message)
    }
  }

  // 7. Impacto en Crédito (si el cliente pagó a crédito o tiene cuenta fiado)
  if (refundMethod === "credito" && sale.clientId && sale.client?.creditAccount) {
    try {
      const creditAcc = sale.client.creditAccount
      await db.creditAccount.update({
        where: { id: creditAcc.id },
        data: { balance: { decrement: totalRefunded } },
      })
      await db.creditMovement.create({
        data: {
          accountId: creditAcc.id,
          type: "abono",
          amount: totalRefunded,
          method: "devolucion",
          concept: `Abono por devolución ${returnNumber} (Factura #${sale.invoiceNumber})`,
          reportedBy: processedBy || "Sistema",
          saleId: sale.id,
        },
      })
    } catch (credErr: any) {
      console.warn("[Return Credit Adjustment Warning]:", credErr.message)
    }
  }

  // 8. Determinar si la venta quedó con devolución total o parcial
  const totalItemsSold = sale.items.reduce((s, it) => s + it.quantity, 0)
  const totalItemsReturnedNow = validatedItems.reduce((s, it) => s + it.quantity, 0)
  const totalItemsReturnedPrior = Array.from(returnedQuantitiesByProduct.values()).reduce((s, q) => s + q, 0)
  const isFullReturn = totalItemsReturnedPrior + totalItemsReturnedNow >= totalItemsSold

  const returnTag = `[${isFullReturn ? "Devolución Total" : "Devolución Parcial"}: ${returnNumber} -$${totalRefunded.toLocaleString("es-CO")}]`
  const updatedNotes = sale.notes ? `${sale.notes} ${returnTag}` : returnTag

  await db.sale.update({
    where: { id: sale.id },
    data: {
      notes: updatedNotes,
      status: isFullReturn ? "devuelta" : sale.status,
    },
  }).catch(() => {})

  // 9. Guardar comprobante de devolución en la base de datos
  const settingKey = `return:${returnNumber}`
  await db.setting.upsert({
    where: { key: settingKey },
    update: { value: JSON.stringify(returnRecord) },
    create: { key: settingKey, value: JSON.stringify(returnRecord) },
  })

  // Asociar la devolución a la venta en el índice de ventas
  const saleIndexKey = `sale_returns:${sale.id}`
  try {
    const existingIndex = await db.setting.findUnique({ where: { key: saleIndexKey } })
    const list: string[] = existingIndex?.value ? JSON.parse(existingIndex.value) : []
    if (!list.includes(returnNumber)) {
      list.push(returnNumber)
      await db.setting.upsert({
        where: { key: saleIndexKey },
        update: { value: JSON.stringify(list) },
        create: { key: saleIndexKey, value: JSON.stringify(list) },
      })
    }
  } catch {
    /* noop */
  }

  return returnRecord
}

/**
 * Obtiene todas las devoluciones registradas (o filtradas por venta o sede)
 */
export async function getSaleReturns(saleId?: string, branchId?: string): Promise<SaleReturn[]> {
  try {
    // Si se pasa saleId, consultar primero por el índice directo
    if (saleId) {
      const saleIndex = await db.setting.findUnique({
        where: { key: `sale_returns:${saleId}` },
      })
      if (saleIndex?.value) {
        try {
          const returnNumbers: string[] = JSON.parse(saleIndex.value)
          const records = await db.setting.findMany({
            where: {
              key: { in: returnNumbers.map((n) => `return:${n}`) },
            },
          })
          const results = records
            .map((r) => {
              try {
                return JSON.parse(r.value) as SaleReturn
              } catch {
                return null
              }
            })
            .filter((x): x is SaleReturn => x !== null)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          return results
        } catch {
          /* fallback */
        }
      }
    }

    const allReturnSettings = await db.setting.findMany({
      where: { key: { startsWith: "return:DEV-" } },
      take: 200,
    })

    const returns: SaleReturn[] = []
    for (const r of allReturnSettings) {
      try {
        const parsed = JSON.parse(r.value) as SaleReturn
        if (saleId && parsed.saleId !== saleId) continue
        if (branchId && parsed.branchId && parsed.branchId !== branchId) continue
        returns.push(parsed)
      } catch {
        /* skip */
      }
    }

    returns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return returns
  } catch (error) {
    console.error("[getSaleReturns Error]:", error)
    return []
  }
}

/**
 * Genera el documento HTML imprimible en formato de tirilla térmica para una devolución
 */
export function buildReturnReceiptHTML(params: {
  storeInfo: { name: string; nit?: string; phone?: string; address?: string }
  returnData: SaleReturn
}): string {
  const { storeInfo, returnData } = params

  const formatCOP = (val: number) => `$ ${Math.round(val).toLocaleString("es-CO")}`

  const itemsRows = returnData.items
    .map(
      (it) => `
      <tr>
        <td style="padding:4px 0;border-bottom:1px dashed #eee">
          ${it.quantity}× ${it.productName}
          ${!it.restock ? '<br><span style="font-size:10px;color:#b91c1c">(Avería/No inventario)</span>' : ""}
        </td>
        <td style="padding:4px 0;text-align:right;border-bottom:1px dashed #eee">
          ${formatCOP(it.subtotal)}
        </td>
      </tr>`
    )
    .join("")

  const reasonLabel = RETURN_REASONS_LABELS[returnData.reason] || returnData.reason
  const refundLabel = REFUND_METHODS_LABELS[returnData.refundMethod] || returnData.refundMethod

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
  <title>Comprobante Devolución ${returnData.returnNumber}</title>
  <style>
    *{font-family:monospace;font-size:12px;box-sizing:border-box}
    body{max-width:300px;margin:0 auto;padding:16px;color:#000}
    h1{font-size:15px;text-align:center;margin:0 0 4px;font-weight:bold}
    .center{text-align:center}
    .muted{color:#555;font-size:11px}
    table{width:100%;border-collapse:collapse}
    .tot{font-weight:bold;font-size:13px}
    .line{border-top:1px solid #000;margin:8px 0}
    .dashed{border-top:1px dashed #666;margin:8px 0}
    .row{display:flex;justify-content:space-between;margin-bottom:2px}
    .badge{display:inline-block;padding:2px 6px;background:#eee;border-radius:4px;font-weight:bold;font-size:11px}
  </style></head><body>
    <h1>${storeInfo.name}</h1>
    <p class="center muted">
      ${storeInfo.nit ? `NIT/Doc: ${storeInfo.nit} · ` : ""}
      ${storeInfo.phone ? `Tel: ${storeInfo.phone}` : ""}<br>
      ${storeInfo.address || ""}
    </p>
    <div class="line"></div>
    <p class="center" style="font-weight:bold;font-size:13px;margin:4px 0">
      COMPROBANTE DE DEVOLUCIÓN
    </p>
    <p class="center" style="margin:2px 0 6px">
      <span class="badge">${returnData.returnNumber}</span>
    </p>
    <div class="row"><span>Factura Original:</span><span style="font-weight:bold">${returnData.saleInvoiceNumber}</span></div>
    <div class="row"><span>Fecha:</span><span>${new Date(returnData.createdAt).toLocaleString("es-CO")}</span></div>
    <div class="row"><span>Cliente:</span><span>${returnData.clientName || "Genérico"}</span></div>
    <div class="row"><span>Atendido por:</span><span>${returnData.processedBy || "Cajero"}</span></div>
    <div class="dashed"></div>
    <div class="row"><span>Motivo:</span><span style="text-align:right;max-width:170px;font-weight:bold">${reasonLabel}</span></div>
    ${returnData.reasonDetail ? `<p class="muted" style="margin:2px 0 4px;font-style:italic">"${returnData.reasonDetail}"</p>` : ""}
    <div class="row"><span>Reembolso:</span><span style="text-align:right;max-width:170px">${refundLabel}</span></div>
    <div class="row"><span>Reingreso Stock:</span><span>${returnData.restockAll ? "✅ Reingresado" : "❌ Baja/Avería"}</span></div>
    <div class="line"></div>
    <p style="font-weight:bold;margin:4px 0">PRODUCTOS DEVUELTOS:</p>
    <table>${itemsRows}</table>
    <div class="line"></div>
    <div class="row tot" style="color:#b91c1c;font-size:14px">
      <span>TOTAL REEMBOLSADO:</span>
      <span>${formatCOP(returnData.totalRefunded)}</span>
    </div>
    <div class="dashed"></div>
    <p class="center muted" style="margin-top:8px">
      Comprobante oficial de control y auditoría interna POS.<br>
      Conserve este documento como soporte de la transacción.
    </p>
  </body></html>`
}
