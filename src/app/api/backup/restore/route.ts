import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/backup/restore — restaura un backup específico (solo admin)
// body: { backup: "backup-2026-07-08T...db" }
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const body = await req.json()
    const backupName = String(body.backup ?? "").trim()
    if (!backupName) {
      return NextResponse.json({ error: "Debes especificar el nombre del backup" }, { status: 400 })
    }
    // Validar que el nombre sea seguro (solo backup-*.db)
    if (!/^backup-[\w.-]+\.db$/.test(backupName)) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }

    const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/home/z/my-project/db/custom.db"
    const backupDir = path.join(path.dirname(dbPath), "backups")
    const backupPath = path.join(backupDir, backupName)

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "El backup no existe" }, { status: 404 })
    }

    // Hacer un backup del estado actual antes de restaurar (por seguridad)
    const preRestoreBackup = path.join(backupDir, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`)
    try {
      fs.copyFileSync(dbPath, preRestoreBackup)
    } catch { /* noop */ }

    // Restaurar: copiar el backup sobre la BD actual
    fs.copyFileSync(backupPath, dbPath)

    try {
      await logAudit({
        action: "backup_restore",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Backup restaurado: ${backupName}`,
      })
    } catch { /* noop */ }

    return NextResponse.json({
      ok: true,
      message: `Backup ${backupName} restaurado correctamente. Se recomienda recargar la página.`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
