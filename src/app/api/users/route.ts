import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, hashPin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/users - Listar colaboradores (Admin only)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    // Si no hay ningún usuario con isPrimary: true, asegurar que el usuario admin inicial lo tenga
    const primaryCount = await db.user.count({ where: { isPrimary: true } })
    if (primaryCount === 0) {
      const adminUser = await db.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } })
      if (adminUser) {
        await db.user.update({
          where: { id: adminUser.id },
          data: {
            isPrimary: true,
            email: adminUser.email || "admin@pos.com",
          },
        })
      }
    }

    const { searchParams } = new URL(req.url)
    const tenantIdParam = searchParams.get("tenantId")

    const userFilter: Record<string, unknown> = {}
    if (session && session.role !== "superadmin") {
      if (session.tenantId) {
        userFilter.tenantId = session.tenantId
      }
      userFilter.role = { not: "superadmin" }
    } else if (session?.role === "superadmin" && tenantIdParam) {
      if (tenantIdParam === "superadmin" || tenantIdParam === "null") {
        userFilter.tenantId = null
      } else if (tenantIdParam !== "all") {
        userFilter.tenantId = tenantIdParam
      }
    }

    const allBranches = await db.branch.findMany({
      select: { id: true, name: true, code: true, tenantId: true },
    })

    const rawUsers = await db.user.findMany({
      where: userFilter,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerName: true,
            ownerEmail: true,
          },
        },
      },
      orderBy: [
        { tenantId: "asc" },
        { isPrimary: "desc" },
        { role: "asc" },
        { name: "asc" },
      ],
    })

    const users = rawUsers.map((u) => {
      // Sedes que pertenecen exclusivamente a este usuario / tenant
      const tenantBranches = allBranches.filter((b) => b.tenantId === u.tenantId)
      const tenantBranchIds = tenantBranches.map((b) => b.id)

      let allowed: string[] = []
      if (u.isPrimary) {
        // El administrador principal tiene acceso a todas las sedes de SU PROPIO NEGOCIO (no del sistema global)
        allowed = tenantBranchIds
      } else {
        try {
          const parsed = JSON.parse(u.allowedBranchIds || "[]")
          allowed = Array.isArray(parsed) ? parsed.filter((id) => tenantBranchIds.includes(id)) : []
        } catch {
          allowed = []
        }
      }

      // Detalle de nombres y códigos de las sedes asignadas
      const assignedBranches = tenantBranches
        .filter((b) => allowed.includes(b.id))
        .map((b) => ({ id: b.id, name: b.name, code: b.code }))

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isPrimary: u.isPrimary,
        allowedBranchIds: allowed,
        assignedBranches,
        tenantId: u.tenantId,
        tenantName: u.tenant?.name || (u.tenantId === null ? "Administración SaaS" : null),
        tenantOwnerName: u.tenant?.ownerName || (u.isPrimary ? u.name : null),
        tenantOwnerEmail: u.tenant?.ownerEmail || (u.isPrimary ? u.email : null),
        tenantBranchCount: tenantBranches.length,
        active: u.active,
        createdAt: u.createdAt,
      }
    })

    return NextResponse.json({ ok: true, users })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/users - Crear nuevo colaborador (vendedor o admin adicional)
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    // Si no es Superadmin, verificar que el negocio y su Administrador Principal estén activos
    if (session?.tenantId && session.role !== "superadmin") {
      const tenant = await db.tenant.findUnique({
        where: { id: session.tenantId },
        select: { status: true },
      })
      if (tenant?.status === "inactivo") {
        return NextResponse.json(
          { error: "No es posible crear colaboradores: El negocio se encuentra inhabilitado." },
          { status: 403 }
        )
      }

      const primaryAdmin = await db.user.findFirst({
        where: { tenantId: session.tenantId, isPrimary: true },
        select: { active: true },
      })
      if (primaryAdmin && !primaryAdmin.active) {
        return NextResponse.json(
          { error: "No es posible crear colaboradores: El Administrador Principal está inactivo." },
          { status: 403 }
        )
      }
    }

    const body = await req.json()
    const name = String(body.name ?? "").trim()
    const email = body.email ? String(body.email).trim().toLowerCase() : null
    const role = String(body.role ?? "vendedor").toLowerCase()
    const pin = String(body.pin ?? "").trim()

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "El nombre de usuario debe tener al menos 2 caracteres." },
        { status: 400 }
      )
    }

    if (role !== "admin" && role !== "vendedor") {
      return NextResponse.json(
        { error: "El rol asignado debe ser 'admin' o 'vendedor'." },
        { status: 400 }
      )
    }

    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json(
        { error: "El PIN debe ser estrictamente numérico y tener entre 4 y 8 dígitos." },
        { status: 400 }
      )
    }

    // Validar formato de email si fue ingresado
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "El formato de correo electrónico no es válido." },
          { status: 400 }
        )
      }
    }

    // Verificar si el nombre de usuario ya existe
    const existingName = await db.user.findUnique({ where: { name } })
    if (existingName) {
      return NextResponse.json(
        { error: `El usuario "${name}" ya existe en el sistema.` },
        { status: 400 }
      )
    }

    // Verificar si el correo ya existe
    if (email) {
      const existingEmail = await db.user.findUnique({ where: { email } })
      if (existingEmail) {
        return NextResponse.json(
          { error: `El correo "${email}" ya está asignado a otro usuario.` },
          { status: 400 }
        )
      }
    }

    let allowedBranchIds: string[] = []
    const validTenantBranches = await db.branch.findMany({
      where: session?.tenantId && session.role !== "superadmin" ? { tenantId: session.tenantId } : {},
      select: { id: true },
    })
    const validBranchIds = validTenantBranches.map((b) => b.id)

    if (Array.isArray(body.allowedBranchIds) && body.allowedBranchIds.length > 0) {
      allowedBranchIds = body.allowedBranchIds.filter((id: string) => validBranchIds.includes(id))
    }
    if (allowedBranchIds.length === 0) {
      const main = await db.branch.findFirst({
        where: { isMain: true, ...(session?.tenantId ? { tenantId: session.tenantId } : {}) },
        select: { id: true },
      })
      allowedBranchIds = main ? [main.id] : validBranchIds.slice(0, 1)
    }


    const newUser = await db.user.create({
      data: {
        name,
        email,
        role,
        pinHash: hashPin(pin),
        isPrimary: false,
        allowedBranchIds: JSON.stringify(allowedBranchIds),
        tenantId: session?.tenantId || null,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isPrimary: true,
        active: true,
        createdAt: true,
      },
    })

    await logAudit({
      action: "user_create",
      entityType: "user",
      entityId: newUser.id,
      userName: session?.name ?? "admin",
      role: session?.role ?? "admin",
      detail: `Nuevo colaborador creado: "${newUser.name}" con rol "${newUser.role}".`,
      meta: { newUserName: newUser.name, newRole: newUser.role, email: newUser.email },
    })

    return NextResponse.json({
      ok: true,
      message: `Colaborador "${newUser.name}" creado con éxito.`,
      user: newUser,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// PUT /api/users - Editar colaborador existente
export async function PUT(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    const body = await req.json()
    const id = String(body.id ?? "").trim()
    if (!id) {
      return NextResponse.json({ error: "ID de usuario requerido." }, { status: 400 })
    }

    const targetUser = await db.user.findUnique({ where: { id } })
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 })
    }

    // Seguridad SaaS: Un admin regular no puede modificar un superadmin ni usuarios de otro tenant
    if (targetUser.role === "superadmin" && session?.role !== "superadmin") {
      return NextResponse.json(
        { error: "Acceso denegado: No tienes permisos para modificar al Superadministrador." },
        { status: 403 }
      )
    }

    if (session?.role !== "superadmin" && session?.tenantId && targetUser.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "Acceso denegado: Este colaborador pertenece a otro negocio." },
        { status: 403 }
      )
    }

    const updateData: {
      name?: string
      email?: string | null
      role?: string
      pinHash?: string
      allowedBranchIds?: string
      active?: boolean
    } = {}

    // Sedes asignadas
    if (body.allowedBranchIds !== undefined && !targetUser.isPrimary) {
      if (Array.isArray(body.allowedBranchIds) && body.allowedBranchIds.length > 0) {
        updateData.allowedBranchIds = JSON.stringify(body.allowedBranchIds)
      } else {
        return NextResponse.json({ error: "Debe asignar al menos una sede al colaborador." }, { status: 400 })
      }
    }

    // Nombre
    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name || name.length < 2) {
        return NextResponse.json({ error: "El nombre debe tener al menos 2 caracteres." }, { status: 400 })
      }
      if (name !== targetUser.name) {
        const existing = await db.user.findUnique({ where: { name } })
        if (existing) {
          return NextResponse.json({ error: `El nombre "${name}" ya está en uso.` }, { status: 400 })
        }
        updateData.name = name
      }
    }

    // Email
    if (body.email !== undefined) {
      const email = body.email ? String(body.email).trim().toLowerCase() : null
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
          return NextResponse.json({ error: "El formato de correo no es válido." }, { status: 400 })
        }
        if (email !== targetUser.email) {
          const existing = await db.user.findUnique({ where: { email } })
          if (existing) {
            return NextResponse.json({ error: `El correo "${email}" ya está en uso.` }, { status: 400 })
          }
        }
      } else if (targetUser.isPrimary) {
        return NextResponse.json({ error: "El Administrador Principal debe tener un correo electrónico configurado." }, { status: 400 })
      }
      updateData.email = email
    }

    // Rol
    if (body.role !== undefined) {
      const role = String(body.role).toLowerCase()
      if (role !== "admin" && role !== "vendedor") {
        return NextResponse.json({ error: "Rol inválido (debe ser admin o vendedor)." }, { status: 400 })
      }
      if (targetUser.isPrimary && role !== "admin") {
        return NextResponse.json({ error: "El Administrador Principal no puede ser degradado a vendedor." }, { status: 400 })
      }
      updateData.role = role
    }

    // PIN
    if (body.pin) {
      const pin = String(body.pin).trim()
      if (!/^\d{4,8}$/.test(pin)) {
        return NextResponse.json({ error: "El PIN debe tener entre 4 y 8 dígitos numéricos." }, { status: 400 })
      }
      updateData.pinHash = hashPin(pin)
    }

    // Estado activo
    let cascadeMessage: string | null = null
    if (body.active !== undefined) {
      const active = Boolean(body.active)

      // Protección crítica permanente: El Superadministrador del sistema NUNCA puede ser desactivado
      if ((targetUser.role === "superadmin" || targetUser.email === "kaledmoly@gmail.com") && !active) {
        return NextResponse.json(
          { error: "El Superadministrador del sistema está protegido permanentemente y no se puede deshabilitar nunca." },
          { status: 400 }
        )
      }

      // Si es un Administrador Principal de una sede / negocio
      if (targetUser.isPrimary) {
        // Solo el Superadministrador tiene autorización para activar o desactivar al Administrador Principal
        if (session?.role !== "superadmin") {
          return NextResponse.json(
            { error: "Solo el Superadministrador puede modificar el estado del Administrador Principal." },
            { status: 403 }
          )
        }

        // Cascada automática: Al desactivar al Administrador Principal, desactivar automáticamente a todos sus colaboradores
        if (!active && targetUser.tenantId) {
          await db.user.updateMany({
            where: {
              tenantId: targetUser.tenantId,
              role: { not: "superadmin" },
              OR: [{ email: null }, { email: { not: "kaledmoly@gmail.com" } }],
            },
            data: { active: false },
          })
          await db.tenant.update({
            where: { id: targetUser.tenantId },
            data: { status: "inactivo" },
          }).catch(() => {})

          cascadeMessage = `Administrador Principal "${targetUser.name}" desactivado. Se desactivaron automáticamente todos sus colaboradores asociados.`

          await logAudit({
            action: "admin_tenant_cascade_deactivate",
            entityType: "tenant",
            entityId: targetUser.tenantId,
            userName: session?.name || "Superadmin",
            role: "superadmin",
            detail: `Admin Principal "${targetUser.name}" inactivado. Se inactivaron automáticamente todos los colaboradores del negocio.`,
            meta: { tenantId: targetUser.tenantId, adminId: targetUser.id },
          }).catch(() => {})
        } else if (active && targetUser.tenantId) {
          // Si el superadmin reactiva al Administrador Principal, se restaura también el negocio
          await db.tenant.update({
            where: { id: targetUser.tenantId },
            data: { status: "aprobado" },
          }).catch(() => {})
        }
      }

      updateData.active = active
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isPrimary: true,
        active: true,
        createdAt: true,
      },
    })

    await logAudit({
      action: "user_update",
      entityType: "user",
      entityId: updatedUser.id,
      userName: session?.name ?? "admin",
      role: session?.role ?? "admin",
      detail: `Colaborador actualizado: "${updatedUser.name}".`,
      meta: { changes: Object.keys(updateData) },
    })

    return NextResponse.json({
      ok: true,
      message: cascadeMessage || `Colaborador "${updatedUser.name}" actualizado correctamente.`,
      user: updatedUser,
      cascaded: Boolean(cascadeMessage),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/users - Desactivar colaborador
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "ID de usuario requerido." }, { status: 400 })
  }

  try {
    const targetUser = await db.user.findUnique({ where: { id } })
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 })
    }

    if (targetUser.role === "superadmin" || targetUser.email === "kaledmoly@gmail.com") {
      return NextResponse.json(
        { error: "El Superadministrador del sistema está protegido permanentemente y no puede ser desactivado ni eliminado." },
        { status: 403 }
      )
    }

    if (session?.role !== "superadmin" && session?.tenantId && targetUser.tenantId !== session.tenantId) {
      return NextResponse.json(
        { error: "Acceso denegado: Este colaborador pertenece a otro negocio." },
        { status: 403 }
      )
    }

    if (targetUser.isPrimary) {
      if (session?.role !== "superadmin") {
        return NextResponse.json(
          { error: "El Administrador Principal no puede ser eliminado por un colaborador." },
          { status: 403 }
        )
      }

      // Cascada para Superadmin: inactivar todos los usuarios del negocio
      if (targetUser.tenantId) {
        await db.user.updateMany({
          where: {
            tenantId: targetUser.tenantId,
            role: { not: "superadmin" },
            OR: [{ email: null }, { email: { not: "kaledmoly@gmail.com" } }],
          },
          data: { active: false },
        })
        await db.tenant.update({
          where: { id: targetUser.tenantId },
          data: { status: "inactivo" },
        }).catch(() => {})
      }
    }

    // Soft delete: cambiar estado a inactivo
    await db.user.update({
      where: { id },
      data: { active: false },
    })

    await logAudit({
      action: "user_deactivate",
      entityType: "user",
      entityId: targetUser.id,
      userName: session?.name ?? "admin",
      role: session?.role ?? "admin",
      detail: `Colaborador desactivado: "${targetUser.name}".`,
    })

    return NextResponse.json({
      ok: true,
      message: `Colaborador "${targetUser.name}" ha sido desactivado del sistema.`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
