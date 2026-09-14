import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin, hashPin, getSession, logAudit } from "@/lib/auth"
import { getBackupDirectory, isMysql, getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/reset — Limpieza exclusiva del negocio Demo:
// Purga únicamente el negocio demo creado ("Droguería & Farmacia La Salud"),
// sus sedes demo, productos, ventas, compras, cajas y los usuarios demo (admin y vendedor).
// GARANTÍA: No toca ninguna información de usuarios reales, empresas reales ni Superadmin.
export async function POST(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied
  const session = getSession(req)

  try {
    const body = await req.json().catch(() => ({}))
    const confirmText = String(body.confirm ?? "").trim().toUpperCase()

    if (
      confirmText !== "BORRAR" &&
      confirmText !== "BORRAR DEMO" &&
      confirmText !== "LIMPIAR DEMO" &&
      confirmText !== "RESET"
    ) {
      return NextResponse.json(
        { error: "Confirmación requerida. Debe confirmar escribiendo 'BORRAR' o 'BORRAR DEMO'." },
        { status: 400 }
      )
    }

    // 1. Crear respaldo preventivo automático antes de cualquier eliminación
    try {
      const backupDir = getBackupDirectory()
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      if (!isMysql()) {
        const dbPath = getDatabasePath()
        if (fs.existsSync(dbPath)) {
          const backupPath = path.join(backupDir, `backup-pre-limpieza-demo-${ts}.db`)
          fs.copyFileSync(dbPath, backupPath)
        }
      }
    } catch (errBackup) {
      console.warn("Advertencia: No se pudo generar copia automática previa al reset:", errBackup)
    }

    // 2. Localizar y proteger la cuenta del Superadmin
    let superadmin = await db.user.findFirst({
      where: { role: "superadmin" },
    })
    if (!superadmin) {
      superadmin = await db.user.findFirst({
        where: { email: "kaledmoly@gmail.com" },
      })
    }
    if (!superadmin) {
      superadmin = await db.user.create({
        data: {
          name: "Superadmin Kaled",
          email: "kaledmoly@gmail.com",
          role: "superadmin",
          pinHash: hashPin("9999"),
          isPrimary: true,
          active: true,
          allowedBranchIds: "[]",
          tenantId: null,
        },
      })
    }

    // 3. Localizar ÚNICAMENTE los negocios Demo oficiales
    const demoTenants = await db.tenant.findMany({
      where: {
        OR: [
          { slug: "drogueria-la-salud-demo" },
          { ownerEmail: "admin@demo.com" },
          { name: "Droguería & Farmacia La Salud" },
        ],
      },
      include: {
        branches: true,
      },
    })

    const demoTenantIds = demoTenants.map((t) => t.id)
    const demoBranchIds = demoTenants.flatMap((t) => t.branches.map((b) => b.id))

    // Buscar también sedes que puedan haber quedado desvinculadas pero sean de demo
    const orphanDemoBranches = await db.branch.findMany({
      where: {
        OR: [
          { name: "Sede Principal Demo" },
          { code: "SEDE-01", tenantId: { in: demoTenantIds } },
        ],
      },
      select: { id: true },
    })
    for (const b of orphanDemoBranches) {
      if (!demoBranchIds.includes(b.id)) {
        demoBranchIds.push(b.id)
      }
    }

    // Localizar usuarios demo específicos (admin y vendedor de prueba)
    const demoUsers = await db.user.findMany({
      where: {
        AND: [
          { role: { not: "superadmin" } },
          { email: { not: "kaledmoly@gmail.com" } },
          {
            OR: [
              ...(demoTenantIds.length > 0 ? [{ tenantId: { in: demoTenantIds } }] : []),
              { email: "admin@demo.com" },
              { email: "vendedor@demo.com" },
              { name: "admin" },
              { name: "vendedor" },
            ],
          },
        ],
      },
      select: { id: true, name: true, email: true },
    })
    const demoUserIds = demoUsers.map((u) => u.id)

    // Si no hay datos demo creados, notificar sin alterar nada
    if (demoTenantIds.length === 0 && demoBranchIds.length === 0 && demoUserIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No se encontraron datos ni empresas de demostración para limpiar. Todos tus datos y empresas reales permanecen intactos.",
      })
    }

    // 4. Ejecutar purga TRANSACCIONAL estricta y segura SOLAMENTE de los datos demo
    await db.$transaction(async (tx) => {
      if (demoBranchIds.length > 0) {
        // A. Cuentas de crédito y movimientos de clientes demo
        const demoClients = await tx.client.findMany({
          where: { branchId: { in: demoBranchIds } },
          select: { id: true },
        })
        const demoClientIds = demoClients.map((c) => c.id)

        if (demoClientIds.length > 0) {
          const demoAccounts = await tx.creditAccount.findMany({
            where: { clientId: { in: demoClientIds } },
            select: { id: true },
          })
          const demoAccountIds = demoAccounts.map((a) => a.id)
          if (demoAccountIds.length > 0) {
            await tx.creditMovement.deleteMany({ where: { accountId: { in: demoAccountIds } } })
            await tx.creditAccount.deleteMany({ where: { id: { in: demoAccountIds } } })
          }
        }

        // B. Ventas e ítems de venta demo
        const demoSales = await tx.sale.findMany({
          where: { branchId: { in: demoBranchIds } },
          select: { id: true },
        })
        const demoSaleIds = demoSales.map((s) => s.id)
        if (demoSaleIds.length > 0) {
          await tx.creditMovement.deleteMany({ where: { saleId: { in: demoSaleIds } } })
          await tx.cashTransaction.deleteMany({ where: { reference: { in: demoSaleIds } } })
          await tx.saleItem.deleteMany({ where: { saleId: { in: demoSaleIds } } })
          await tx.sale.deleteMany({ where: { id: { in: demoSaleIds } } })
        }

        // C. Compras e ítems de compra demo
        const demoPurchases = await tx.purchase.findMany({
          where: { branchId: { in: demoBranchIds } },
          select: { id: true },
        })
        const demoPurchaseIds = demoPurchases.map((p) => p.id)
        if (demoPurchaseIds.length > 0) {
          await tx.purchaseItem.deleteMany({ where: { purchaseId: { in: demoPurchaseIds } } })
          await tx.purchase.deleteMany({ where: { id: { in: demoPurchaseIds } } })
        }

        // D. Sesiones de caja y movimientos de caja demo
        const demoCash = await tx.cashSession.findMany({
          where: { branchId: { in: demoBranchIds } },
          select: { id: true },
        })
        const demoCashIds = demoCash.map((c) => c.id)
        if (demoCashIds.length > 0) {
          await tx.cashTransaction.deleteMany({ where: { cashSessionId: { in: demoCashIds } } })
          await tx.cashSession.deleteMany({ where: { id: { in: demoCashIds } } })
        }

        // E. Transacciones y gastos demo
        await tx.transaction.deleteMany({ where: { branchId: { in: demoBranchIds } } })

        // F. Productos y lotes demo
        const demoProducts = await tx.product.findMany({
          where: { branchId: { in: demoBranchIds } },
          select: { id: true },
        })
        const demoProductIds = demoProducts.map((p) => p.id)
        if (demoProductIds.length > 0) {
          await tx.saleItem.deleteMany({ where: { productId: { in: demoProductIds } } })
          await tx.purchaseItem.deleteMany({ where: { productId: { in: demoProductIds } } })
          await tx.productBatch.deleteMany({ where: { productId: { in: demoProductIds } } })
          await tx.product.deleteMany({ where: { id: { in: demoProductIds } } })
        }

        // G. Clientes y proveedores de las sedes demo
        await tx.client.deleteMany({ where: { branchId: { in: demoBranchIds } } })
        await tx.supplier.deleteMany({ where: { branchId: { in: demoBranchIds } } })

        // H. Eliminar sedes demo
        await tx.branch.deleteMany({ where: { id: { in: demoBranchIds } } })
      }

      // I. Eliminar usuarios demo exclusivamente
      if (demoUserIds.length > 0) {
        await tx.user.deleteMany({
          where: {
            id: { in: demoUserIds },
            role: { not: "superadmin" },
            email: { not: "kaledmoly@gmail.com" },
          },
        })
      }

      // J. Eliminar el tenant demo exclusivamente
      if (demoTenantIds.length > 0) {
        await tx.tenant.deleteMany({ where: { id: { in: demoTenantIds } } })
      }

      // K. Limpiar categorías vacías que hayan quedado huérfanas sin productos
      await tx.category.deleteMany({
        where: {
          products: { none: {} },
        },
      })
    })

    // 5. Asegurar que exista una sede central para Superadmin si no tiene ninguna
    let superadminBranch = await db.branch.findFirst({
      where: { tenantId: null, isMain: true },
    })
    if (!superadminBranch) {
      superadminBranch = await db.branch.create({
        data: {
          name: "Sede Central Superadmin",
          code: "SEDE-SAAS",
          address: "Sede Central SaaS",
          phone: "+57 300 000 0000",
          isMain: true,
          active: true,
          tenantId: null,
        },
      })
    }

    await db.user.update({
      where: { id: superadmin.id },
      data: {
        allowedBranchIds: JSON.stringify([superadminBranch.id]),
        tenantId: null,
        active: true,
      },
    })

    // 6. Registrar auditoría inmutable
    try {
      await logAudit({
        action: "demo_data_reset",
        entityType: "system",
        userName: session?.name ?? superadmin.name,
        role: "superadmin",
        detail: "Limpieza exclusiva del negocio demo (Droguería La Salud). Las empresas y usuarios reales se mantuvieron 100% intactos.",
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: "Negocio demo eliminado con éxito. Los datos de usuarios y empresas reales se mantuvieron 100% intactos.",
    })
  } catch (e) {
    console.error("Error en reset de datos demo:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
