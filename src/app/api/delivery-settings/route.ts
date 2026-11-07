import { NextRequest, NextResponse } from "next/server"
import { getDeliveryConfig, saveDeliveryConfig } from "@/lib/delivery-config"
import { getSession, requireAdmin, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/delivery-settings — Obtiene la tarifa global y tarifas por barrio
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get("branchId")

    const config = await getDeliveryConfig(branchId)

    return NextResponse.json({
      ok: true,
      config,
    })
  } catch (error) {
    console.error("[GET /api/delivery-settings Error]:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    )
  }
}

// POST /api/delivery-settings — Guarda la tarifa global y la lista de barrios
export async function POST(req: NextRequest) {
  try {
    const denied = requireAdmin(req)
    if (denied) return denied

    const session = getSession(req)
    const body = await req.json()

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { ok: false, error: "Datos de configuración inválidos" },
        { status: 400 }
      )
    }

    const { globalFee, neighborhoodRates, branchId } = body

    if (globalFee === undefined || globalFee === null || isNaN(Number(globalFee)) || Number(globalFee) < 0) {
      return NextResponse.json(
        { ok: false, error: "La tarifa global de domicilio es obligatoria y debe ser un número mayor o igual a 0." },
        { status: 400 }
      )
    }

    if (neighborhoodRates !== undefined && !Array.isArray(neighborhoodRates)) {
      return NextResponse.json(
        { ok: false, error: "La lista de tarifas por barrio debe ser un arreglo." },
        { status: 400 }
      )
    }

    const updatedConfig = await saveDeliveryConfig({
      globalFee: Number(globalFee),
      neighborhoodRates: neighborhoodRates || [],
      branchId: branchId || null,
    })

    try {
      await logAudit({
        action: "delivery_settings_update",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Tarifas de domicilio actualizadas: Global $${updatedConfig.globalFee.toLocaleString("es-CO")}, ${updatedConfig.neighborhoodRates.length} barrios configurados.`,
        meta: {
          globalFee: updatedConfig.globalFee,
          neighborhoodCount: updatedConfig.neighborhoodRates.length,
          branchId: branchId || null,
        },
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: "Tarifas de domicilio guardadas exitosamente",
      config: updatedConfig,
    })
  } catch (error) {
    console.error("[POST /api/delivery-settings Error]:", error)
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    )
  }
}
