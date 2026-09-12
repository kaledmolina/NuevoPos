import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSession } from "@/lib/auth"
import { getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/backup/download?name=... — descarga un backup (aislado por negocio para admin regular)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const backupName = String(searchParams.get("name") ?? "").trim()

    if (!backupName || backupName.includes("..") || backupName.includes("/") || backupName.includes("\\")) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }

    const dbPath = getDatabasePath()
    let backupPath: string
    let contentType = "application/octet-stream"

    if (session.role === "superadmin") {
      // Superadmin puede descargar .db de db/backups o .json de un tenant si especifica tenantId
      const tenantIdParam = searchParams.get("tenantId")
      if (tenantIdParam && backupName.endsWith(".json")) {
        backupPath = path.join(path.dirname(dbPath), "backups", "tenants", tenantIdParam, backupName)
        contentType = "application/json"
      } else {
        if (!/^(backup|upload|pre-restore)-[\w.-]+\.db$/.test(backupName)) {
          return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
        }
        backupPath = path.join(path.dirname(dbPath), "backups", backupName)
      }
    } else {
      // Admin Regular: ÚNICAMENTE puede descargar backups JSON de su propio negocio
      const tenantId = session.tenantId
      if (!tenantId) {
        return NextResponse.json({ error: "No perteneces a ningún negocio" }, { status: 403 })
      }

      if (!backupName.endsWith(".json") || !/^(backup|upload|pre-restore)-[\w.-]+\.json$/.test(backupName)) {
        return NextResponse.json({ error: "Solo puedes descargar copias en formato .json de tu negocio" }, { status: 400 })
      }

      backupPath = path.join(path.dirname(dbPath), "backups", "tenants", tenantId, backupName)
      contentType = "application/json"
    }

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "Copia de seguridad no encontrada" }, { status: 404 })
    }

    const fileBuffer = fs.readFileSync(backupPath)
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${backupName}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
