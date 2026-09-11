import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/settings — obtiene todas las configuraciones de la tienda
export async function GET() {
  try {
    const settings = await db.setting.findMany()
    const obj: Record<string, string> = {
      store_name: "Droguería La Salud",
      store_rubro: "drogueria",
      store_nit: "",
      store_phone: "",
      store_address: "",
      store_email: "",
      currency: "COP",
      currency_symbol: "$",
      tax_rate: "0",
      tax_name: "IVA",
      enable_expiration: "true",
      receipt_message: "¡Gracias por su compra! Conserve este comprobante.",
    }
    for (const s of settings) {
      obj[s.key] = s.value
    }
    return NextResponse.json(obj)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/settings — guarda o actualiza configuraciones (solo admin)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  try {
    const body = await req.json()
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Datos de configuración inválidos" }, { status: 400 })
    }

    const allowedKeys = [
      "store_name",
      "store_rubro",
      "store_nit",
      "store_phone",
      "store_address",
      "store_email",
      "currency",
      "currency_symbol",
      "tax_rate",
      "tax_name",
      "enable_expiration",
      "receipt_message",
    ]

    const updates: { key: string; value: string }[] = []
    for (const [key, val] of Object.entries(body)) {
      if (allowedKeys.includes(key)) {
        updates.push({ key, value: String(val ?? "").trim() })
      }
    }

    for (const item of updates) {
      await db.setting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: { key: item.key, value: item.value },
      })
    }

    try {
      await logAudit({
        action: "settings_update",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Configuración de la tienda actualizada (${updates.length} campos)`,
        meta: body,
      })
    } catch {
      /* noop */
    }

    // Devolver objeto actualizado
    const all = await db.setting.findMany()
    const result: Record<string, string> = {}
    for (const s of all) result[s.key] = s.value

    return NextResponse.json({
      ok: true,
      message: "Configuración guardada correctamente",
      settings: result,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

