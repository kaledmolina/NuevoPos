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
