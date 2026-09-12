import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/superadmin/ranking - Ranking de administradores principales por volumen de ventas
export async function GET(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  try {
    const tenants = await db.tenant.findMany({
      include: {
        branches: { select: { id: true, name: true, active: true } },
        users: {
          where: { isPrimary: true },
          select: { id: true, name: true, email: true, active: true },
        },
      },
    })

    const allBranchIds = tenants.flatMap((t) => t.branches.map((b) => b.id))

    // Agrupar ventas completadas por sucursal
    const salesGrouped = allBranchIds.length > 0
      ? await db.sale.groupBy({
          by: ["branchId"],
          where: {
            branchId: { in: allBranchIds },
            status: "completada",
          },
          _sum: { total: true },
          _count: { id: true },
        })
      : []

    const salesMap = new Map<string, { total: number; count: number }>()
    for (const g of salesGrouped) {
      if (g.branchId) {
        salesMap.set(g.branchId, {
          total: g._sum.total || 0,
          count: g._count.id || 0,
        })
      }
    }

    // Calcular totales por negocio
    const rankingList = tenants.map((t) => {
      let totalSales = 0
      let salesCount = 0

      for (const b of t.branches) {
        const s = salesMap.get(b.id)
        if (s) {
          totalSales += s.total
          salesCount += s.count
        }
      }

      const avgTicket = salesCount > 0 ? totalSales / salesCount : 0
      const owner = t.users[0] || null

      return {
        tenantId: t.id,
        businessName: t.name,
        rubro: t.rubro,
        ownerName: t.ownerName || owner?.name || "Sin nombre",
        ownerEmail: t.ownerEmail || owner?.email || "Sin correo",
        ownerPhone: t.ownerPhone || "Sin teléfono",
        status: t.status,
        totalSales,
        salesCount,
        avgTicket,
        branchesCount: t.branches.length,
        createdAt: t.createdAt,
      }
    })

    // Ordenar de mayor a menor por totalSales, y luego por salesCount
    rankingList.sort((a, b) => {
      if (b.totalSales !== a.totalSales) {
        return b.totalSales - a.totalSales
      }
      return b.salesCount - a.salesCount
    })

    // Asignar posición de ranking (1, 2, 3...)
    const rankedWithPosition = rankingList.map((item, index) => ({
      rank: index + 1,
      ...item,
    }))

    return NextResponse.json({
      ok: true,
      ranking: rankedWithPosition,
      totalTenants: rankedWithPosition.length,
    })
  } catch (e) {
    console.error("[superadmin/ranking] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
