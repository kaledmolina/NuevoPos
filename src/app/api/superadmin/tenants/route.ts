import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/superadmin/tenants - Listado completo de negocios para administración SaaS
export async function GET(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim().toLowerCase()
    const status = searchParams.get("status")

    const where: Record<string, unknown> = {}
    if (status && status !== "todos") {
      where.status = status
    }

    if (q) {
      where.OR = [
        { name: { contains: q } },
        { ownerName: { contains: q } },
        { ownerEmail: { contains: q } },
        { ownerPhone: { contains: q } },
      ]
    }

    const tenants = await db.tenant.findMany({
      where,
      include: {
        branches: {
          select: { id: true, name: true, isMain: true, active: true },
        },
        users: {
          select: { id: true, name: true, email: true, role: true, isPrimary: true, active: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Calcular ventas por cada tenant
    const branchIdsByTenant = new Map<string, string[]>()
    for (const t of tenants) {
      branchIdsByTenant.set(t.id, t.branches.map((b) => b.id))
    }

    const allBranchIds = tenants.flatMap((t) => t.branches.map((b) => b.id))
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

    const salesByBranchId = new Map<string, { total: number; count: number }>()
    for (const g of salesGrouped) {
      if (g.branchId) {
        salesByBranchId.set(g.branchId, {
          total: g._sum.total || 0,
          count: g._count.id || 0,
        })
      }
    }

    const result = tenants.map((t) => {
      let tenantSalesTotal = 0
      let tenantSalesCount = 0
      for (const b of t.branches) {
        const stats = salesByBranchId.get(b.id)
        if (stats) {
          tenantSalesTotal += stats.total
          tenantSalesCount += stats.count
        }
      }

      const owner = t.users.find((u) => u.isPrimary) || t.users[0] || null

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        rubro: t.rubro,
        ownerName: t.ownerName,
        ownerEmail: t.ownerEmail,
        ownerPhone: t.ownerPhone,
        status: t.status,
        maxBranches: t.maxBranches,
        branchesCount: t.branches.length,
        usersCount: t.users.length,
        branches: t.branches,
        ownerUser: owner ? { id: owner.id, name: owner.name, active: owner.active } : null,
        totalSales: tenantSalesTotal,
        salesCount: tenantSalesCount,
        approvedAt: t.approvedAt,
        approvedBy: t.approvedBy,
        createdAt: t.createdAt,
      }
    })

    return NextResponse.json({
      ok: true,
      tenants: result,
      totalCount: result.length,
    })
  } catch (e) {
    console.error("[superadmin/tenants] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
