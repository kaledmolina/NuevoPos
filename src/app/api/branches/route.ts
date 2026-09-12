import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_BRANCHES = 3

// GET /api/branches - Obtener listado de sedes
export async function GET(req: NextRequest) {
  try {
    const session = getSession(req)
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const branchWhere: Record<string, unknown> = {}
    if (session.role !== "superadmin") {
      if (session.tenantId) {
        branchWhere.tenantId = session.tenantId
      }
    }

    let branches = await db.branch.findMany({
      where: branchWhere,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            ownerName: true,
            ownerEmail: true,
            ownerPhone: true,
          },
        },
      },
      orderBy: [
        { isMain: "desc" },
        { createdAt: "asc" },
      ],
    })

    // Si alguna sede no tiene tenantId asociado, proveer los datos del Admin Principal como fallback
    const primaryAdmin = await db.user.findFirst({
      where: { isPrimary: true },
      select: { name: true, email: true },
    })

    // Si no existe ninguna sede aún para este tenant/sistema, inicializar la Sede Principal
    if (branches.length === 0) {
      const defaultBranch = await db.branch.create({
        data: {
          name: "Sede Principal",
          code: "SEDE-01",
          address: "Sede Central",
          phone: "",
          isMain: true,
          active: true,
          tenantId: session?.tenantId || null,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              ownerName: true,
              ownerEmail: true,
              ownerPhone: true,
            },
          },
        },
      })
      branches = [defaultBranch]
    }

    // Normalizar tenant con datos del admin si no existía relación
    const enrichedBranches = branches.map((b) => {
      const tenant = b.tenant || {
        id: "",
        name: "Sede Local",
        ownerName: primaryAdmin?.name || "Administrador Principal",
        ownerEmail: primaryAdmin?.email || "admin@pos.com",
        ownerPhone: null,
      }
      return {
        ...b,
        tenant,
      }
    })

    let filteredBranches = enrichedBranches

    // Seguridad: Si el usuario está autenticado y no es admin ni superadmin, retornar únicamente sus sedes autorizadas
    if (session && session.role !== "admin" && session.role !== "superadmin") {
      const { getUserAllowedBranches } = await import("@/lib/branch")
      const allowed = await getUserAllowedBranches(session.uid)
      filteredBranches = enrichedBranches.filter((b) => allowed.includes(b.id))
    }

    return NextResponse.json({
      ok: true,
      branches: filteredBranches,
      count: filteredBranches.length,
      maxLimit: MAX_BRANCHES,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/branches - Crear nueva sede (Máximo 3 sedes por negocio)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const tenantFilter = session?.tenantId ? { tenantId: session.tenantId } : {}

  try {
    const count = await db.branch.count({ where: tenantFilter })
    if (count >= MAX_BRANCHES) {
      return NextResponse.json(
        {
          error: `Se ha alcanzado el límite máximo permitido de ${MAX_BRANCHES} sedes para tu negocio.`,
          code: "MAX_LIMIT_REACHED",
        },
        { status: 400 }
      )
    }

    const body = await req.json()
    const name = String(body.name ?? "").trim()
    const code = body.code ? String(body.code).trim().toUpperCase() : `SEDE-0${count + 1}`
    const address = body.address ? String(body.address).trim() : null
    const phone = body.phone ? String(body.phone).trim() : null

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "El nombre de la sede es obligatorio (mínimo 2 caracteres)." },
        { status: 400 }
      )
    }

    const existingName = await db.branch.findFirst({
      where: { name, ...tenantFilter },
    })
    if (existingName) {
      return NextResponse.json(
        { error: `Ya existe una sede registrada con el nombre "${name}".` },
        { status: 400 }
      )
    }

    if (code) {
      const existingCode = await db.branch.findFirst({
        where: { code, ...tenantFilter },
      })
      if (existingCode) {
        return NextResponse.json(
          { error: `El código "${code}" ya está en uso por otra sede en tu negocio.` },
          { status: 400 }
        )
      }
    }

    const branch = await db.branch.create({
      data: {
        name,
        code,
        address,
        phone,
        isMain: count === 0, // si es la primera, es principal
        active: true,
        tenantId: session?.tenantId || null,
      },
    })

    await logAudit({
      action: "branch_create",
      entityType: "system",
      entityId: branch.id,
      userName: session?.name ?? "admin",
      role: session?.role ?? "admin",
      detail: `Nueva sede creada: "${branch.name}" (Total: ${count + 1}/${MAX_BRANCHES}).`,
      meta: { branchName: branch.name, code: branch.code },
    })

    return NextResponse.json({
      ok: true,
      message: `Sede "${branch.name}" creada exitosamente.`,
      branch,
      count: count + 1,
      maxLimit: MAX_BRANCHES,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// PUT /api/branches - Modificar sede existente
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    const body = await req.json()
    const id = String(body.id ?? "").trim()

    if (!id) {
      return NextResponse.json({ error: "ID de la sede requerido." }, { status: 400 })
    }

    const targetBranch = await db.branch.findUnique({ where: { id } })
    if (!targetBranch) {
      return NextResponse.json({ error: "Sede no encontrada." }, { status: 404 })
    }

    if (session?.role !== "superadmin" && session?.tenantId && targetBranch.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "Acceso denegado: Esta sede pertenece a otro negocio." },
        { status: 403 }
      )
    }

    const updateData: {
      name?: string
      code?: string | null
      address?: string | null
      phone?: string | null
      active?: boolean
    } = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name || name.length < 2) {
        return NextResponse.json({ error: "El nombre de la sede debe tener al menos 2 caracteres." }, { status: 400 })
      }
      if (name !== targetBranch.name) {
        const existing = await db.branch.findFirst({
          where: { name, tenantId: targetBranch.tenantId, id: { not: id } },
        })
        if (existing) {
          return NextResponse.json({ error: `El nombre "${name}" ya está en uso por otra sede.` }, { status: 400 })
        }
        updateData.name = name
      }
    }

    if (body.code !== undefined) {
      const code = body.code ? String(body.code).trim().toUpperCase() : null
      if (code && code !== targetBranch.code) {
        const existingCode = await db.branch.findFirst({
          where: { code, tenantId: targetBranch.tenantId, id: { not: id } },
        })
        if (existingCode) {
          return NextResponse.json({ error: `El código "${code}" ya está en uso.` }, { status: 400 })
        }
      }
      updateData.code = code
    }

    if (body.address !== undefined) {
      updateData.address = body.address ? String(body.address).trim() : null
    }

    if (body.phone !== undefined) {
      updateData.phone = body.phone ? String(body.phone).trim() : null
    }

    if (body.active !== undefined) {
      const active = Boolean(body.active)
      if (targetBranch.isMain && !active) {
        return NextResponse.json(
          { error: "La Sede Principal no puede ser desactivada." },
          { status: 400 }
        )
      }
      updateData.active = active
    }

    const updated = await db.branch.update({
      where: { id },
      data: updateData,
    })

    await logAudit({
      action: "branch_update",
      entityType: "system",
      entityId: updated.id,
      userName: session?.name ?? "admin",
      role: session?.role ?? "admin",
      detail: `Sede actualizada: "${updated.name}".`,
    })

    return NextResponse.json({
      ok: true,
      message: `Sede "${updated.name}" actualizada exitosamente.`,
      branch: updated,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/branches - Eliminar sede
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "ID de sede requerido." }, { status: 400 })
  }

  try {
    const targetBranch = await db.branch.findUnique({ where: { id } })
    if (!targetBranch) {
      return NextResponse.json({ error: "Sede no encontrada." }, { status: 404 })
    }

    if (session?.role !== "superadmin" && session?.tenantId && targetBranch.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "Acceso denegado: Esta sede pertenece a otro negocio." },
        { status: 403 }
      )
    }

    if (targetBranch.isMain) {
      return NextResponse.json(
        { error: "La Sede Principal no puede ser eliminada." },
        { status: 400 }
      )
    }

    await db.branch.delete({ where: { id } })

    await logAudit({
      action: "branch_delete",
      entityType: "system",
      entityId: targetBranch.id,
      userName: session?.name ?? "admin",
      role: session?.role ?? "admin",
      detail: `Sede eliminada: "${targetBranch.name}".`,
    })

    return NextResponse.json({
      ok: true,
      message: `Sede "${targetBranch.name}" eliminada exitosamente.`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
