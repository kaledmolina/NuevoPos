import { NextRequest, NextResponse } from "next/server"
import { processSaleReturn, getSaleReturns } from "@/lib/returns"
import { requireBranchAccess } from "@/lib/branch"
import { logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/returns — Obtiene historial de devoluciones
export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess

    const { searchParams } = new URL(req.url)
    const saleId = searchParams.get("saleId") || undefined
    const branchId = searchParams.get("branchId") || branchAccess.branchId || undefined

    const returns = await getSaleReturns(saleId, branchId)
    return NextResponse.json({ ok: true, returns })
  } catch (error) {
    console.error("[GET /api/returns Error]:", error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}

// POST /api/returns — Procesa una nueva devolución sobre una venta
export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    const { branchId, session } = branchAccess

    const body = await req.json()
    const {
      saleId,
      items,
      reason = "otro",
      reasonDetail,
      refundMethod = "efectivo",
      restockAll = true,
    } = body

    if (!saleId) {
      return NextResponse.json({ ok: false, error: "El ID de la venta es requerido" }, { status: 400 })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Debes incluir los productos a devolver" }, { status: 400 })
    }

    const returnRecord = await processSaleReturn({
      saleId,
      items,
      reason,
      reasonDetail,
      refundMethod,
      restockAll: Boolean(restockAll),
      processedBy: session?.name || "Cajero",
      branchId,
    })

    await logAudit({
      action: "sale_return_created",
      entityType: "sale_return",
      entityId: returnRecord.id,
      userName: session?.name || "Cajero",
      role: session?.role || "cajero",
      detail: `Devolución ${returnRecord.returnNumber} por valor de $${returnRecord.totalRefunded} sobre factura #${returnRecord.saleInvoiceNumber} (${reason}).`,
    })

    return NextResponse.json({
      ok: true,
      message: `Devolución #${returnRecord.returnNumber} procesada correctamente por ${returnRecord.totalRefunded.toLocaleString("es-CO")}`,
      returnRecord,
    })
  } catch (error) {
    console.error("[POST /api/returns Error]:", error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 })
  }
}
