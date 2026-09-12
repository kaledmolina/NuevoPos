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
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 })
    }

    if (session.role !== "superadmin") {
      const tenantId = session.tenantId
      if (!tenantId) {
        return NextResponse.json({ error: "No perteneces a ningún negocio" }, { status: 403 })
      }

      if (!file.name.endsWith(".json")) {
        return NextResponse.json({ error: "Como administrador de tienda, debes subir un archivo de respaldo .json" }, { status: 400 })
      }

      // Tamaño máximo para JSON: 20MB
      const MAX_JSON_SIZE = 20 * 1024 * 1024
      if (file.size > MAX_JSON_SIZE) {
        return NextResponse.json({ error: "El archivo supera el tamaño máximo de 20MB" }, { status: 400 })
      }

      const text = await file.text()
      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: "El archivo subido no es un JSON válido" }, { status: 400 })
      }

      if (parsed.type !== "tenant_backup") {
        return NextResponse.json({ error: "El archivo no contiene un formato válido de copia de seguridad de tienda" }, { status: 400 })
      }

      const dbPath = getDatabasePath()
      const tenantDir = path.join(path.dirname(dbPath), "backups", "tenants", tenantId)
      if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true })
      }

      const sanitizedBase = path.basename(file.name, ".json").replace(/[^a-zA-Z0-9_-]/g, "_")
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      const backupFileName = `upload-${sanitizedBase}-${ts}.json`
      const targetPath = path.join(tenantDir, backupFileName)

      fs.writeFileSync(targetPath, text, "utf-8")

      try {
        await logAudit({
          action: "backup_upload",
          entityType: "tenant",
          entityId: tenantId,
          userName: session.name,
          role: session.role,
          detail: `Copia de seguridad de tienda subida: ${backupFileName}`,
          meta: { originalName: file.name, size: file.size },
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        backup: backupFileName,
        size: file.size,
        message: "Copia de seguridad de tienda subida exitosamente.",
      })
    }

    // SUPERADMIN: Subir .db SQLite
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
        userName: session?.name ?? "superadmin",
        role: session?.role ?? "superadmin",
        detail: `Backup SQLite subido exitosamente: ${backupFileName} (${(file.size / 1024).toFixed(1)} KB)`,
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
