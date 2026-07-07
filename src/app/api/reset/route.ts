import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/reset — borra TODOS los datos de prueba y deja el sistema limpio.
// Solo mantiene los usuarios (admin y vendedor) para poder seguir accediendo.
// Solo admin puede ejecutarlo. Requiere confirmación con el nombre de la tienda.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const body = await req.json().catch(() => ({}))
    // Doble confirmación: el cliente debe enviar { confirm: "BORRAR" }
    if (body.confirm !== "BORRAR") {
      return NextResponse.json(
        { error: "Confirmación requerida. Envía { confirm: 'BORRAR' } para confirmar." },
        { status: 400 }
      )
    }

    // Borrar en orden respetando las relaciones
    await db.creditMovement.deleteMany()
    await db.creditAccount.deleteMany()
    await db.cashTransaction.deleteMany()
    await db.cashSession.deleteMany()
    await db.saleItem.deleteMany()
    await db.sale.deleteMany()
    await db.purchaseItem.deleteMany()
    await db.purchase.deleteMany()
    await db.transaction.deleteMany()
    await db.productBatch.deleteMany()
    await db.product.deleteMany()
    await db.category.deleteMany()
    await db.client.deleteMany()
    await db.supplier.deleteMany()
    await db.auditLog.deleteMany()
    await db.setting.deleteMany()

    // Restaurar settings por defecto
    await db.setting.createMany({
      data: [
        { key: "store_name", value: "Droguería La Salud" },
        { key: "store_nit", value: "" },
        { key: "store_phone", value: "" },
        { key: "store_address", value: "" },
        { key: "tax_rate", value: "0" },
        { key: "currency", value: "COP" },
      ],
    })

    // Recrear el cliente genérico
    await db.client.create({
      data: { name: "Cliente Genérico", isGeneric: true },
    })

    try {
      await logAudit({
        action: "system_reset",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: "Sistema reseteado: todos los datos de prueba eliminados",
      })
    } catch { /* noop */ }

    return NextResponse.json({
      ok: true,
      message: "Sistema reseteado. Se eliminaron todos los datos de prueba. Los usuarios se conservaron.",
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
