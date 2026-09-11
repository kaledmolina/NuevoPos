import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const RETENTION_DAYS = 5

// GET /api/backup — lista los backups disponibles y calcula la vigencia (solo admin)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    const dbPath = getDatabasePath()
    const backupDir = path.join(path.dirname(dbPath), "backups")
    if (!fs.existsSync(backupDir)) {
      return NextResponse.json([])
    }
    const now = Date.now()
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => {
        const fp = path.join(backupDir, f)
        const stat = fs.statSync(fp)
        const ageMs = now - stat.mtime.getTime()
        const ageDaysExact = ageMs / (1000 * 60 * 60 * 24)
        const ageDays = Math.floor(ageDaysExact)
        const canDelete = ageDaysExact >= RETENTION_DAYS
        const daysRemaining = Math.max(0, Math.ceil(RETENTION_DAYS - ageDaysExact))

        return {
          name: f,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          canDelete,
          ageDays,
          daysRemaining,
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
    const dbPath = getDatabasePath()
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Base de datos no encontrada" }, { status: 500 })
    }
    const backupDir = path.join(path.dirname(dbPath), "backups")
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = path.join(backupDir, `backup-${ts}.db`)
    fs.copyFileSync(dbPath, backupPath)

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
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/backup — elimina un backup (o purga backups con más de 5 días de antigüedad)
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)

  try {
    const { searchParams } = new URL(req.url)
    const purgeOld = searchParams.get("purgeOld") === "1" || searchParams.get("olderThan") === "5"
    const dbPath = getDatabasePath()
    const backupDir = path.join(path.dirname(dbPath), "backups")

    if (!fs.existsSync(backupDir)) {
      return NextResponse.json({ error: "No hay directorio de backups" }, { status: 404 })
    }

    const now = Date.now()

    // Caso 1: Purgar todas las copias con más de 5 días de antigüedad
    if (purgeOld) {
      const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db"))
      let deletedCount = 0
      for (const f of files) {
        const fp = path.join(backupDir, f)
        const stat = fs.statSync(fp)
        const ageDaysExact = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)
        if (ageDaysExact >= RETENTION_DAYS) {
          try {
            fs.unlinkSync(fp)
            deletedCount++
          } catch { /* noop */ }
        }
      }

      if (deletedCount > 0) {
        try {
          await logAudit({
            action: "backup_purge_old",
            entityType: "system",
            userName: session?.name ?? "admin",
            role: session?.role ?? "admin",
            detail: `Depuración masiva: se eliminaron ${deletedCount} copia(s) con más de ${RETENTION_DAYS} días de antigüedad`,
          })
        } catch { /* noop */ }
      }

      return NextResponse.json({
        ok: true,
        message: deletedCount > 0
          ? `Se eliminaron ${deletedCount} copia(s) de seguridad con más de ${RETENTION_DAYS} días.`
          : `No se encontraron copias con más de ${RETENTION_DAYS} días de antigüedad. Las copias recientes están vigentes y protegidas.`,
        deletedCount,
      })
    }

    // Caso 2: Eliminar una copia individual específica
    const backupName = String(searchParams.get("name") ?? "").trim()
    if (!backupName || backupName.includes("..") || backupName.includes("/") || backupName.includes("\\") || !backupName.endsWith(".db")) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }

    const backupPath = path.join(backupDir, backupName)
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "El backup no existe" }, { status: 404 })
    }

    const stat = fs.statSync(backupPath)
    const ageDaysExact = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)
    const force = searchParams.get("force") === "1"

    // Regla de retención de 5 días
    if (ageDaysExact < RETENTION_DAYS && !force) {
      const remainingDays = Math.ceil(RETENTION_DAYS - ageDaysExact)
      return NextResponse.json(
        {
          error: `Esta copia de seguridad sigue vigente (creada hace ${Math.floor(ageDaysExact)} día${Math.floor(ageDaysExact) === 1 ? "" : "s"}). Solo se permite eliminar copias después de ${RETENTION_DAYS} días de vigencia (faltan ${remainingDays} día${remainingDays === 1 ? "" : "s"}).`,
        },
        { status: 400 }
      )
    }

    fs.unlinkSync(backupPath)

    try {
      await logAudit({
        action: "backup_delete",
        entityType: "system",
        userName: session?.name ?? "admin",
        role: session?.role ?? "admin",
        detail: `Backup eliminado (antigüedad: ${Math.floor(ageDaysExact)} días): ${backupName}`,
      })
    } catch { /* noop */ }

    return NextResponse.json({ ok: true, message: `Copia de seguridad ${backupName} eliminada exitosamente` })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
