import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export interface ReorderSuggestion {
  productId: string
  productName: string
  barcode: string | null
  unit: string
  currentStock: number
  minStock: number
  cost: number
  salesLast30Days: number
  dailyBurnRate: number
  daysOfCoverage: number | null
  urgency: "critico" | "urgente" | "atencion" | "optimo"
  suggestedQuantity: number
  estimatedOrderCost: number
  supplier: {
    id: string
    name: string
    phone: string | null
    contactName: string | null
  } | null
}

export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    if (branchAccess instanceof NextResponse) return branchAccess
    const { branchId } = branchAccess

    const { searchParams } = new URL(req.url)
    const targetDays = Math.max(7, Number(searchParams.get("targetDays") || 30)) // Días deseados de inventario (default 30)
    const filter = searchParams.get("urgency") // "critico", "urgente", "all"

    const branchFilter = branchId ? { branchId } : {}
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // 1. Obtener productos activos de la sede con sus compras recientes para ubicar proveedor
    const products = await db.product.findMany({
      where: { active: true, ...branchFilter },
      include: {
        category: { select: { name: true } },
        purchaseItems: {
          orderBy: { purchase: { createdAt: "desc" } },
          take: 1,
          include: {
            purchase: {
              include: { supplier: true },
            },
          },
        },
      },
    })

    // 2. Obtener ventas de los últimos 30 días para todos estos productos
    const productIds = products.map((p) => p.id)
    const recentSaleItems = await db.saleItem.findMany({
      where: {
        productId: { in: productIds },
        sale: {
          status: "completada",
          createdAt: { gte: thirtyDaysAgo },
          ...(branchId ? { branchId } : {}),
        },
      },
      select: {
        productId: true,
        quantity: true,
      },
    })

    // Mapear ventas por producto
    const salesMap = new Map<string, number>()
    for (const item of recentSaleItems) {
      salesMap.set(item.productId, (salesMap.get(item.productId) || 0) + item.quantity)
    }

    const suggestions: ReorderSuggestion[] = []

    for (const p of products) {
      const soldLast30 = salesMap.get(p.id) || 0
      // Tasa diaria de consumo
      const dailyBurnRate = Math.round((soldLast30 / 30) * 100) / 100

      // Días de cobertura
      let daysOfCoverage: number | null = null
      if (dailyBurnRate > 0) {
        daysOfCoverage = Math.round((p.stock / dailyBurnRate) * 10) / 10
      } else if (p.stock <= 0) {
        daysOfCoverage = 0
      }

      // Clasificación de urgencia
      let urgency: "critico" | "urgente" | "atencion" | "optimo" = "optimo"
      if (p.stock <= 0 || (daysOfCoverage !== null && daysOfCoverage <= 3)) {
        urgency = "critico"
      } else if (p.stock <= p.minStock || (daysOfCoverage !== null && daysOfCoverage <= 7)) {
        urgency = "urgente"
      } else if (daysOfCoverage !== null && daysOfCoverage <= 15) {
        urgency = "atencion"
      }

      // Cantidad sugerida para alcanzar los días objetivo
      let neededForTarget = 0
      if (dailyBurnRate > 0) {
        neededForTarget = Math.ceil(dailyBurnRate * targetDays) - p.stock
      } else if (p.stock <= p.minStock) {
        neededForTarget = Math.max(p.minStock * 2 - p.stock, 5)
      }

      const suggestedQuantity = Math.max(0, neededForTarget)

      // Identificar proveedor habitual
      const lastPurchase = p.purchaseItems[0]?.purchase
      const supplier = lastPurchase?.supplier
        ? {
            id: lastPurchase.supplier.id,
            name: lastPurchase.supplier.name,
            phone: lastPurchase.supplier.phone,
            contactName: lastPurchase.supplier.contactName,
          }
        : null

      // Solo incluir si tiene urgencia o necesita reorden
      if (urgency !== "optimo" || suggestedQuantity > 0) {
        suggestions.push({
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          unit: p.unit || "unidad",
          currentStock: p.stock,
          minStock: p.minStock,
          cost: p.cost,
          salesLast30Days: soldLast30,
          dailyBurnRate,
          daysOfCoverage,
          urgency,
          suggestedQuantity,
          estimatedOrderCost: suggestedQuantity * p.cost,
          supplier,
        })
      }
    }

    // Ordenar por criticidad: críticos primero, luego urgentes, luego atención
    const urgencyOrder = { critico: 0, urgente: 1, atencion: 2, optimo: 3 }
    suggestions.sort((a, b) => {
      const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
      if (uDiff !== 0) return uDiff
      return (a.daysOfCoverage ?? 999) - (b.daysOfCoverage ?? 999)
    })

    const filtered = filter && filter !== "all"
      ? suggestions.filter((s) => s.urgency === filter)
      : suggestions

    const summary = {
      totalItemsNeedingReorder: suggestions.length,
      criticalCount: suggestions.filter((s) => s.urgency === "critico").length,
      urgentCount: suggestions.filter((s) => s.urgency === "urgente").length,
      attentionCount: suggestions.filter((s) => s.urgency === "atencion").length,
      totalEstimatedInvestment: suggestions.reduce((acc, s) => acc + s.estimatedOrderCost, 0),
    }

    return NextResponse.json({
      ok: true,
      summary,
      targetDays,
      suggestions: filtered,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Error al calcular reorden predictivo: " + (error as Error).message },
      { status: 500 }
    )
  }
}
