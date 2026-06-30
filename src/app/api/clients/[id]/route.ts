import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const data: Record<string, unknown> = {}
    const fields = ["name", "document", "phone", "email", "address", "notes"]
    for (const f of fields) {
      if (body[f] !== undefined) {
        const v = typeof body[f] === "string" ? body[f].trim() : body[f]
        data[f] = v === "" ? null : v
      }
    }

    const client = await db.client.update({
      where: { id },
      data,
      include: {
        _count: { select: { sales: true } },
      },
    })
    return NextResponse.json(client)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Verificar si el cliente tiene ventas asociadas antes de borrar
    const salesCount = await db.sale.count({ where: { clientId: id } })
    if (salesCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede eliminar: el cliente tiene ${salesCount} venta(s) asociada(s). Desvincule o anule las ventas primero.`,
        },
        { status: 409 }
      )
    }
    await db.client.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
