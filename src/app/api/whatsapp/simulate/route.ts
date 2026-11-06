import { NextRequest, NextResponse } from "next/server"
import { processWhatsAppMessage } from "@/lib/whatsapp-agent"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId

    const body = await req.json()
    const {
      message,
      phone = "+573001234567",
      customerName = "Cliente de Prueba",
      branchId: bodyBranchId,
      channel = "whatsapp",
    } = body
    const targetBranchId = bodyBranchId || (branchAccess instanceof NextResponse ? null : branchAccess.branchId)

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "El mensaje es requerido" }, { status: 400 })
    }

    const result = await processWhatsAppMessage({
      phone,
      customerName,
      message,
      branchId: targetBranchId,
      channel,
    })

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      customer: { name: customerName, phone },
      inboundMessage: message,
      botReply: result.reply,
      actionTaken: result.actionTaken,
      orderNumber: result.orderNumber,
      total: result.total,
      items: result.items,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
