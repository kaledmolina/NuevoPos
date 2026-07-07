import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/backup — genera una copia de la BD SQLite (solo admin)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
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
