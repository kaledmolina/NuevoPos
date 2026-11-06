import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const branchFilter = branchId ? { branchId } : {}

    const body = await req.json()
    const {
      phone,
      name,
      document,
      email,
      address,
      notes,
      creditLimit = 0,
    } = body

    if (!phone || !name || !name.trim()) {
      return NextResponse.json({ error: "Teléfono y Nombre son requeridos" }, { status: 400 })
    }

    const cleanPhone = String(phone).replace(/[^0-9+]/g, "")

    // Buscar si ya existe el cliente por teléfono
    let client = await db.client.findFirst({
      where: {
        OR: [{ phone: cleanPhone }, { phone: cleanPhone.replace("+", "") }],
        ...branchFilter,
      },
      include: { creditAccount: true },
    })

    if (client) {
      client = await db.client.update({
        where: { id: client.id },
        data: {
          name: name.trim(),
          document: document ? String(document).trim() : client.document,
          email: email ? String(email).trim() : client.email,
          address: address ? String(address).trim() : client.address,
          notes: notes ? String(notes).trim() : client.notes,
        },
        include: { creditAccount: true },
      })

      // Actualizar cupo si se indicó
      if (client.creditAccount && Number(creditLimit) >= 0) {
        await db.creditAccount.update({
          where: { id: client.creditAccount.id },
          data: {
            creditLimit: Number(creditLimit),
            active: Number(creditLimit) > 0,
          },
        })
      }
    } else {
      client = await db.client.create({
        data: {
          name: name.trim(),
          phone: cleanPhone,
          document: document ? String(document).trim() : null,
          email: email ? String(email).trim() : null,
          address: address ? String(address).trim() : null,
          notes: notes ? String(notes).trim() : null,
          branchId,
          creditAccount: {
            create: {
              creditLimit: Number(creditLimit) || 0,
              active: Number(creditLimit) > 0,
              balance: 0,
            },
          },
        },
        include: { creditAccount: true },
      })
    }

    return NextResponse.json({
      ok: true,
      client,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
