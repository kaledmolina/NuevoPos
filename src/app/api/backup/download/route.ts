import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/backup/download?name=backup-...db — descarga un backup (solo admin)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const { searchParams } = new URL(req.url)
    const backupName = String(searchParams.get("name") ?? "").trim()
    if (!backupName || !/^backup-[\w.-]+\.db$/.test(backupName)) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }
    const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "/home/z/my-project/db/custom.db"
    const backupDir = path.join(path.dirname(dbPath), "backups")
    const backupPath = path.join(backupDir, backupName)
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "Backup no encontrado" }, { status: 404 })
    }
    const fileBuffer = fs.readFileSync(backupPath)
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${backupName}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
