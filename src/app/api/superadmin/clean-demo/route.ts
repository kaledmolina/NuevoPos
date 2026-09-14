import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/superadmin/clean-demo — Herramienta de limpieza selectiva de datos demo
export async function POST(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    const body = await req.json().catch(() => ({}))
    const { action, tenantId } = body as {
      action: "purge_sales" | "purge_products" | "purge_inactive" | "purge_tenant_data"
      tenantId?: string
    }

    if (!action) {
      return NextResponse.json(
        { error: "Debe especificar la acción de limpieza (purge_sales, purge_products, purge_tenant_data)" },
        { status: 400 }
      )
    }

    let resultMessage = ""

    // 1. Purgar todas las ventas de prueba (o de un tenant específico)
    if (action === "purge_sales") {
      let branchIds: string[] = []
      if (tenantId) {
        const branches = await db.branch.findMany({ where: { tenantId }, select: { id: true } })
        branchIds = branches.map((b) => b.id)
      }

      const saleWhere = branchIds.length > 0 ? { branchId: { in: branchIds } } : {}

      const sales = await db.sale.findMany({
        where: saleWhere,
        select: { id: true },
      })
      const saleIds = sales.map((s) => s.id)

      if (saleIds.length > 0) {
        await db.$transaction(async (tx) => {
          await tx.creditMovement.deleteMany({ where: { saleId: { in: saleIds } } })
          await tx.cashTransaction.deleteMany({ where: { reference: { in: saleIds } } })
          await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } })
          await tx.sale.deleteMany({ where: { id: { in: saleIds } } })
        })
      }

      resultMessage = `Se eliminaron ${saleIds.length} ventas de prueba del sistema.`
    }

    // 2. Purgar productos de prueba (o de un tenant específico)
    else if (action === "purge_products") {
      let branchIds: string[] = []
      if (tenantId) {
        const branches = await db.branch.findMany({ where: { tenantId }, select: { id: true } })
        branchIds = branches.map((b) => b.id)
      }

      const productWhere = branchIds.length > 0 ? { branchId: { in: branchIds } } : {}

      const products = await db.product.findMany({
        where: productWhere,
        select: { id: true },
      })
      const productIds = products.map((p) => p.id)

      if (productIds.length > 0) {
        await db.$transaction(async (tx) => {
          await tx.saleItem.deleteMany({ where: { productId: { in: productIds } } })
          await tx.purchaseItem.deleteMany({ where: { productId: { in: productIds } } })
          await tx.productBatch.deleteMany({ where: { productId: { in: productIds } } })
          await tx.product.deleteMany({ where: { id: { in: productIds } } })
        })
      }

      resultMessage = `Se eliminaron ${productIds.length} productos de prueba del sistema.`
    }

    // 3. Purgar productos inactivos/archivados
    else if (action === "purge_inactive") {
      const products = await db.product.findMany({
        where: { active: false },
        select: { id: true },
      })
      const productIds = products.map((p) => p.id)

      if (productIds.length > 0) {
        await db.$transaction(async (tx) => {
          await tx.saleItem.deleteMany({ where: { productId: { in: productIds } } })
          await tx.purchaseItem.deleteMany({ where: { productId: { in: productIds } } })
          await tx.productBatch.deleteMany({ where: { productId: { in: productIds } } })
          await tx.product.deleteMany({ where: { id: { in: productIds } } })
        })
      }

      resultMessage = `Se purgaron permanentemente ${productIds.length} productos archivados/inactivos.`
    }

    // 4. Limpieza completa de datos de prueba de un tenant
    else if (action === "purge_tenant_data" && tenantId) {
      const branches = await db.branch.findMany({ where: { tenantId }, select: { id: true } })
      const branchIds = branches.map((b) => b.id)

      if (branchIds.length > 0) {
        await db.$transaction(async (tx) => {
          const sales = await tx.sale.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
          const saleIds = sales.map((s) => s.id)
          if (saleIds.length > 0) {
            await tx.creditMovement.deleteMany({ where: { saleId: { in: saleIds } } })
            await tx.cashTransaction.deleteMany({ where: { reference: { in: saleIds } } })
            await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } })
            await tx.sale.deleteMany({ where: { id: { in: saleIds } } })
          }

          const purchases = await tx.purchase.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
          const purchaseIds = purchases.map((p) => p.id)
          if (purchaseIds.length > 0) {
            await tx.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } })
            await tx.purchase.deleteMany({ where: { id: { in: purchaseIds } } })
          }

          const cash = await tx.cashSession.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
          const cashIds = cash.map((c) => c.id)
          if (cashIds.length > 0) {
            await tx.cashTransaction.deleteMany({ where: { cashSessionId: { in: cashIds } } })
            await tx.cashSession.deleteMany({ where: { id: { in: cashIds } } })
          }

          const products = await tx.product.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
          const productIds = products.map((p) => p.id)
          if (productIds.length > 0) {
            await tx.saleItem.deleteMany({ where: { productId: { in: productIds } } })
            await tx.purchaseItem.deleteMany({ where: { productId: { in: productIds } } })
            await tx.productBatch.deleteMany({ where: { productId: { in: productIds } } })
            await tx.product.deleteMany({ where: { id: { in: productIds } } })
          }
        })
      }

      resultMessage = `Datos de prueba (ventas, compras, cajas y productos) purgados para el negocio seleccionado.`
    } else {
      return NextResponse.json({ error: "Acción no válida o falta tenantId" }, { status: 400 })
    }

    try {
      await logAudit({
        action: `demo_clean_${action}`,
        entityType: "system",
        userName: session?.name || "Superadmin",
        role: "superadmin",
        detail: resultMessage,
      })
    } catch {
      // noop
    }

    return NextResponse.json({
      ok: true,
      message: resultMessage,
    })
  } catch (e) {
    console.error("[superadmin/clean-demo] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
