import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/superadmin/stats - Métricas globales de la plataforma SaaS
export async function GET(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  try {
    const [
      totalTenants,
      activeTenants,
      pendingTenants,
      disabledTenants,
      allTenants,
      totalBranches,
      totalUsers,
      salesStats,
    ] = await Promise.all([
      db.tenant.count(),
      db.tenant.count({ where: { status: "aprobado" } }),
      db.tenant.count({ where: { status: "pendiente" } }),
      db.tenant.count({ where: { status: "inactivo" } }),
      db.tenant.findMany({ select: { rubro: true } }),
      db.branch.count({ where: { active: true } }),
      db.user.count({ where: { role: { not: "superadmin" } } }),
      db.sale.aggregate({
        where: { status: "completada" },
        _sum: { total: true },
        _count: { id: true },
      }),
    ])

    // Distribución por rubro
    const rubroMap: Record<string, number> = {}
    for (const t of allTenants) {
      const r = t.rubro || "otro"
      rubroMap[r] = (rubroMap[r] || 0) + 1
    }

    return NextResponse.json({
      ok: true,
      stats: {
        totalTenants,
        activeTenants,
        pendingTenants,
        disabledTenants,
        totalBranches,
        totalUsers,
        totalSalesVolume: salesStats._sum.total || 0,
        totalSalesCount: salesStats._count.id || 0,
        rubroDistribution: rubroMap,
      },
    })
  } catch (e) {
    console.error("[superadmin/stats] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
