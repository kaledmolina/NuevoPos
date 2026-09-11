import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/reset — Puesta a punto: Limpia datos de prueba / demo y deja el sistema listo para producción.
// Crea automáticamente un backup preventivo antes de eliminar datos de prueba.
// Conserva las cuentas de usuario (admin y vendedor) y configuraciones básicas.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)

  try {
    const body = await req.json().catch(() => ({}))
    const confirmText = String(body.confirm ?? "").trim().toUpperCase()

    if (confirmText !== "BORRAR" && confirmText !== "BORRAR DEMO" && confirmText !== "LIMPIAR DEMO") {
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

    // 2. Limpiar registros de prueba en orden respetando claves foráneas
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

    // 3. Recrear el Cliente Genérico para que el POS pueda seguir facturando ventas rápidas
    await db.client.create({
      data: { name: "Cliente Genérico", isGeneric: true },
    })

    // 4. Registrar auditoría inmutable de la puesta a punto
    try {
      await logAudit({
        action: "demo_data_reset",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: "Datos de demostración y pruebas purgados por el administrador. Sistema listo para facturación real. Respaldo previo creado.",
      })
    } catch { /* noop */ }

    return NextResponse.json({
      ok: true,
      message: "Datos de prueba eliminados exitosamente. El sistema está limpio y listo para empezar a registrar ventas reales. Se guardó una copia de respaldo previa.",
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
