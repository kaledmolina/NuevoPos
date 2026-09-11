import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/backup/upload — sube un archivo .db válido a la carpeta de backups (solo admin)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 })
    }

    if (!file.name.endsWith(".db")) {
      return NextResponse.json({ error: "El archivo debe tener extensión .db" }, { status: 400 })
    }

    // Tamaño máximo: 50MB
    const MAX_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "El archivo supera el tamaño máximo de 50MB" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Validar cabecera SQLite (primeros 16 bytes: "SQLite format 3\0")
    const SQLITE_HEADER = "SQLite format 3\0"
    const headerString = buffer.subarray(0, 16).toString("utf-8")
    if (!headerString.startsWith("SQLite format 3")) {
      return NextResponse.json(
        { error: "El archivo subido no es una base de datos SQLite válida" },
        { status: 400 }
      )
    }

    const dbPath = getDatabasePath()
    const backupDir = path.join(path.dirname(dbPath), "backups")
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    const sanitizedBase = path.basename(file.name, ".db").replace(/[^a-zA-Z0-9_-]/g, "_")
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const backupFileName = `upload-${sanitizedBase}-${ts}.db`
    const targetPath = path.join(backupDir, backupFileName)

    fs.writeFileSync(targetPath, buffer)

    try {
      await logAudit({
        action: "backup_upload",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Backup subido exitosamente: ${backupFileName} (${(file.size / 1024).toFixed(1)} KB)`,
        meta: { originalName: file.name, size: file.size },
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: `Backup "${backupFileName}" subido y verificado correctamente`,
      name: backupFileName,
      size: file.size,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
