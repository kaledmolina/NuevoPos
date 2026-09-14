import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { getBackupDirectory, isMysql } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const RETENTION_DAYS = 5

// GET /api/backup — lista los backups disponibles según el rol y negocio del usuario
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    const now = Date.now()

    if (session.role === "superadmin") {
      // Superadmin: backups globales (.json de MySQL o .db legacy)
      const backupDir = getBackupDirectory()
      if (!fs.existsSync(backupDir)) return NextResponse.json([])

      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.endsWith(".json") || f.endsWith(".db"))
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
            type: f.endsWith(".json") ? "global_json" : "global_db",
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

      return NextResponse.json(files)
    }

    // Admin Regular: backups aislados exclusivos de su Tenant / Negocio
    const tenantId = session.tenantId
    if (!tenantId) {
      return NextResponse.json([])
    }

    const tenantBackupDir = path.join(getBackupDirectory(), "tenants", tenantId)
    if (!fs.existsSync(tenantBackupDir)) {
      return NextResponse.json([])
    }

    const files = fs
      .readdirSync(tenantBackupDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const fp = path.join(tenantBackupDir, f)
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
          type: "tenant_json",
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json(files)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/backup — genera una copia de seguridad:
// - Para Admin: exporta ÚNICAMENTE los datos de sus tiendas/sedes (JSON estructurado)
// - Para Superadmin: genera el respaldo global SQLite (.db)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-")

    // CASO 1: Administrador regular de negocio (Aislamiento de Tienda)
    if (session.role !== "superadmin") {
      const tenantId = session.tenantId
      if (!tenantId) {
        return NextResponse.json(
          { error: "No tienes un negocio asignado para generar copias de seguridad." },
          { status: 400 }
        )
      }

      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
      })

      const branches = await db.branch.findMany({
        where: { tenantId },
      })
      const branchIds = branches.map((b) => b.id)

      // Extraer datos exclusivos de este tenant y sus sedes
      const [
        users,
        categories,
        products,
        clients,
        suppliers,
        sales,
        purchases,
        cashSessions,
        transactions,
      ] = await Promise.all([
        db.user.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            pinHash: true,
            isPrimary: true,
            allowedBranchIds: true,
            active: true,
          },
        }),
        db.category.findMany(),
        db.product.findMany({
          where: { branchId: { in: branchIds } },
          include: { batches: true },
        }),
        db.client.findMany({
          where: { branchId: { in: branchIds } },
          include: { creditAccount: { include: { movements: true } } },
        }),
        db.supplier.findMany({
          where: { branchId: { in: branchIds } },
        }),
        db.sale.findMany({
          where: { branchId: { in: branchIds } },
          include: { items: true },
        }),
        db.purchase.findMany({
          where: { branchId: { in: branchIds } },
          include: { items: true },
        }),
        db.cashSession.findMany({
          where: { branchId: { in: branchIds } },
          include: { transactions: true },
        }),
        db.transaction.findMany({
          where: { branchId: { in: branchIds } },
        }),
      ])

      const backupPayload = {
        version: "1.0",
        type: "tenant_backup",
        tenantId,
        tenantName: tenant?.name || "Negocio",
        tenantSlug: tenant?.slug || "tienda",
        exportedAt: new Date().toISOString(),
        branches,
        users,
        categories,
        products,
        clients,
        suppliers,
        sales,
        purchases,
        cashSessions,
        transactions,
      }

      const tenantDir = path.join(getBackupDirectory(), "tenants", tenantId)
      if (!fs.existsSync(tenantDir)) {
        fs.mkdirSync(tenantDir, { recursive: true })
      }

      const fileName = `backup-${tenant?.slug || "tienda"}-${ts}.json`
      const targetPath = path.join(tenantDir, fileName)
      fs.writeFileSync(targetPath, JSON.stringify(backupPayload, null, 2), "utf-8")

      const size = fs.statSync(targetPath).size

      try {
        await logAudit({
          action: "backup_create",
          entityType: "tenant",
          entityId: tenantId,
          userName: session.name,
          role: session.role,
          detail: `Copia de seguridad aislada creada para ${tenant?.name || "tienda"}: ${fileName}`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        backup: fileName,
        size,
        createdAt: ts,
        type: "tenant_json",
        message: `Copia de seguridad de ${tenant?.name || "tu negocio"} generada exitosamente.`,
      })
    }

    // CASO 2: Superadministrador (Backup global de toda la base de datos MySQL/SaaS)
    const [
      tenants,
      branches,
      users,
      categories,
      products,
      clients,
      suppliers,
      sales,
      purchases,
      cashSessions,
      transactions,
      settings,
    ] = await Promise.all([
      db.tenant.findMany(),
      db.branch.findMany(),
      db.user.findMany(),
      db.category.findMany(),
      db.product.findMany({ include: { batches: true } }),
      db.client.findMany({ include: { creditAccount: { include: { movements: true } } } }),
      db.supplier.findMany(),
      db.sale.findMany({ include: { items: true } }),
      db.purchase.findMany({ include: { items: true } }),
      db.cashSession.findMany({ include: { transactions: true } }),
      db.transaction.findMany(),
      db.setting.findMany(),
    ])

    const backupPayload = {
      version: "2.0",
      type: "global_saas_backup",
      engine: isMysql() ? "mysql" : "sqlite",
      exportedAt: new Date().toISOString(),
      tenants,
      branches,
      users,
      categories,
      products,
      clients,
      suppliers,
      sales,
      purchases,
      cashSessions,
      transactions,
      settings,
    }

    const backupDir = getBackupDirectory()
    const fileName = `backup-global-${ts}.json`
    const backupPath = path.join(backupDir, fileName)
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), "utf-8")

    const size = fs.statSync(backupPath).size
    try {
      await logAudit({
        action: "backup_create",
        entityType: "system",
        userName: session.name,
        role: session.role,
        detail: `Backup global MySQL creado: ${fileName} (${tenants.length} empresas, ${products.length} productos, ${sales.length} ventas)`,
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      backup: fileName,
      size,
      createdAt: ts,
      type: "global_json",
      message: "Copia de seguridad global del sistema generada exitosamente.",
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
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const purgeOld = searchParams.get("purgeOld") === "1" || searchParams.get("olderThan") === "5"
    const now = Date.now()

    let backupDir: string

    if (session.role === "superadmin") {
      backupDir = getBackupDirectory()
    } else {
      const tenantId = session.tenantId
      if (!tenantId) return NextResponse.json({ error: "Negocio no identificado" }, { status: 400 })
      backupDir = path.join(getBackupDirectory(), "tenants", tenantId)
    }

    if (!fs.existsSync(backupDir)) {
      return NextResponse.json({ error: "No hay directorio de backups" }, { status: 404 })
    }

    // Caso 1: Purgar todas las copias con más de 5 días de antigüedad
    if (purgeOld) {
      const files = fs.readdirSync(backupDir).filter((f) =>
        session.role === "superadmin" ? (f.endsWith(".json") || f.endsWith(".db")) : f.endsWith(".json")
      )
      let deletedCount = 0
      for (const f of files) {
        const fp = path.join(backupDir, f)
        const stat = fs.statSync(fp)
        const ageDaysExact = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)
        if (ageDaysExact >= RETENTION_DAYS) {
          try {
            fs.unlinkSync(fp)
            deletedCount++
          } catch {
            /* noop */
          }
        }
      }

      if (deletedCount > 0) {
        try {
          await logAudit({
            action: "backup_purge_old",
            entityType: session.role === "superadmin" ? "system" : "tenant",
            userName: session.name,
            role: session.role,
            detail: `Depuración masiva: se eliminaron ${deletedCount} copia(s) con más de ${RETENTION_DAYS} días de antigüedad`,
          })
        } catch {
          /* noop */
        }
      }

      return NextResponse.json({
        ok: true,
        message:
          deletedCount > 0
            ? `Se eliminaron ${deletedCount} copia(s) de seguridad con más de ${RETENTION_DAYS} días.`
            : `No se encontraron copias con más de ${RETENTION_DAYS} días de antigüedad. Las copias recientes están protegidas.`,
        deletedCount,
      })
    }

    // Caso 2: Eliminar una copia individual específica
    const backupName = String(searchParams.get("name") ?? "").trim()
    const isValidExt =
      session.role === "superadmin"
        ? (backupName.endsWith(".json") || backupName.endsWith(".db"))
        : backupName.endsWith(".json")

    if (
      !backupName ||
      backupName.includes("..") ||
      backupName.includes("/") ||
      backupName.includes("\\") ||
      !isValidExt
    ) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }

    const backupPath = path.join(backupDir, backupName)
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "El backup no existe" }, { status: 404 })
    }

    const stat = fs.statSync(backupPath)
    const ageDaysExact = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24)
    const force = searchParams.get("force") === "1"

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
        entityType: session.role === "superadmin" ? "system" : "tenant",
        userName: session.name,
        role: session.role,
        detail: `Backup eliminado (antigüedad: ${Math.floor(ageDaysExact)} días): ${backupName}`,
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({ ok: true, message: `Copia de seguridad ${backupName} eliminada exitosamente` })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

