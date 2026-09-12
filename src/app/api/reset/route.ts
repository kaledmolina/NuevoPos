import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin, hashPin, getSession, logAudit } from "@/lib/auth"
import { getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/reset — Puesta a punto total: Exclusivo de Superadmin.
// Purga todos los datos de demostración, compras, ventas, productos, clientes, proveedores,
// sedes y usuarios de terceros. Solo conserva la cuenta Superadmin con una sede vacía.
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
      const dbPath = getDatabasePath()
      if (fs.existsSync(dbPath)) {
        const backupDir = path.join(path.dirname(dbPath), "backups")
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
        const ts = new Date().toISOString().replace(/[:.]/g, "-")
        const backupPath = path.join(backupDir, `backup-pre-limpieza-demo-${ts}.db`)
        fs.copyFileSync(dbPath, backupPath)
      }
    } catch (errBackup) {
      console.warn("Advertencia: No se pudo generar copia automática previa al reset:", errBackup)
    }

    // 2. Localizar o asegurar cuenta del Superadmin
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

    // 3. Limpiar registros transaccionales y operativos en orden respetando claves foráneas
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

    // 4. Eliminar usuarios que NO sean el Superadmin
    await db.user.deleteMany({
      where: {
        id: { not: superadmin.id },
      },
    })

    // 5. Eliminar sedes existentes y tenants
    await db.branch.deleteMany()
    await db.tenant.deleteMany()

    // 6. Crear una única sede limpia y vacía para el Superadministrador
    const emptyBranch = await db.branch.create({
      data: {
        name: "Sede Principal Superadmin",
        code: "SEDE-01",
        address: "Sede Central",
        phone: "",
        isMain: true,
        active: true,
        tenantId: null,
      },
    })

    // 7. Asociar la sede vacía al Superadmin y asegurar tenantId en null
    await db.user.update({
      where: { id: superadmin.id },
      data: {
        allowedBranchIds: JSON.stringify([emptyBranch.id]),
        tenantId: null,
        active: true,
      },
    })

    // 8. Recrear el Cliente Genérico vinculado a la sede para facturación inicial
    await db.client.create({
      data: {
        name: "Cliente Genérico",
        isGeneric: true,
        branchId: emptyBranch.id,
      },
    })

    // 9. Registrar auditoría inmutable
    try {
      await logAudit({
        action: "demo_data_reset",
        entityType: "system",
        userName: session?.name ?? superadmin.name,
        role: "superadmin",
        detail: "Purga completa de datos de demostración, otros usuarios y tenants. Únicamente se conservó la cuenta Superadmin con una sede vacía.",
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: "Datos demo purgados exitosamente. Únicamente se conservó tu cuenta de Superadministrador con una sede limpia y vacía.",
      branch: emptyBranch,
    })
  } catch (e) {
    console.error("Error en reset de datos demo:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
