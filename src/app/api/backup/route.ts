import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/backup — lista los backups disponibles (solo admin)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/home/z/my-project/db/custom.db"
    const backupDir = path.join(path.dirname(dbPath), "backups")
    if (!fs.existsSync(backupDir)) {
      return NextResponse.json([])
    }
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => {
        const fp = path.join(backupDir, f)
        const stat = fs.statSync(fp)
        return {
          name: f,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return NextResponse.json(files)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/backup — genera una copia de la BD SQLite (solo admin)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/home/z/my-project/db/custom.db"
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Base de datos no encontrada" }, { status: 500 })
    }
    const backupDir = path.join(path.dirname(dbPath), "backups")
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = path.join(backupDir, `backup-${ts}.db`)
    fs.copyFileSync(dbPath, backupPath)

    // Limpiar backups antiguos (mantener últimos 10)
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".db"))
      .map((f) => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    for (const f of files.slice(10)) {
      try { fs.unlinkSync(f.path) } catch { /* noop */ }
    }

    const size = fs.statSync(backupPath).size
    try {
      await logAudit({
        action: "backup_create",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Backup creado: ${path.basename(backupPath)}`,
      })
    } catch { /* noop */ }
    return NextResponse.json({
      ok: true,
      backup: path.basename(backupPath),
      size,
      createdAt: ts,
      keptBackups: Math.min(files.length, 10),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/backup?name=backup-...db — elimina un backup (solo admin)
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { searchParams } = new URL(req.url)
    const backupName = String(searchParams.get("name") ?? "").trim()
    if (!backupName || !/^(backup|upload|pre-restore)-[\w.-]+\.db$/.test(backupName)) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }
    const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/home/z/my-project/db/custom.db"
    const backupDir = path.join(path.dirname(dbPath), "backups")
    const backupPath = path.join(backupDir, backupName)
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "El backup no existe" }, { status: 404 })
    }
    fs.unlinkSync(backupPath)
    try {
      await logAudit({
        action: "backup_delete",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Backup eliminado: ${backupName}`,
      })
    } catch { /* noop */ }
    return NextResponse.json({ ok: true, message: `Backup ${backupName} eliminado` })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
