import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// PATCH /api/superadmin/tenants/[id] - Aprobar, habilitar o inhabilitar un negocio
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const { id } = await context.params

  try {
    const body = await req.json()
    let action = body.action as "approve" | "disable" | "enable" | "update_limit" | undefined
    if (!action && body.status) {
      if (body.status === "inactivo") action = "disable"
      else if (body.status === "aprobado") action = "enable"
      else if (body.status === "pendiente") action = "disable"
    }

    const tenant = await db.tenant.findUnique({
      where: { id },
      include: { users: true },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
    }

    if (action === "approve") {
      // 1. Aprobar negocio y activar al administrador principal
      const updatedTenant = await db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: {
            status: "aprobado",
            approvedAt: new Date(),
            approvedBy: session?.name || "Superadmin",
          },
        })

        // Activar el usuario principal del negocio
        await tx.user.updateMany({
          where: { tenantId: id, isPrimary: true },
          data: { active: true },
        })

        return t
      })

      try {
        await logAudit({
          action: "tenant_approve",
          entityType: "tenant",
          entityId: id,
          userName: session?.name || "Superadmin",
          role: "superadmin",
          detail: `Negocio aprobado: "${tenant.name}" (${tenant.ownerEmail})`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `El negocio "${tenant.name}" ha sido aprobado exitosamente. Su administrador ya puede iniciar sesión.`,
        tenant: updatedTenant,
      })
    }

    if (action === "disable") {
      // 2. Inhabilitar acceso al negocio
      const updatedTenant = await db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: { status: "inactivo" },
        })

        // Inhabilitar temporalmente a los usuarios del negocio (excepto Superadmin)
        await tx.user.updateMany({
          where: {
            tenantId: id,
            role: { not: "superadmin" },
            OR: [{ email: null }, { email: { not: "kaledmoly@gmail.com" } }],
          },
          data: { active: false },
        })

        return t
      })

      try {
        await logAudit({
          action: "tenant_disable",
          entityType: "tenant",
          entityId: id,
          userName: session?.name || "Superadmin",
          role: "superadmin",
          detail: `Acceso inhabilitado para el negocio: "${tenant.name}"`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `El acceso para el negocio "${tenant.name}" y todo su personal ha sido inhabilitado.`,
        tenant: updatedTenant,
      })
    }

    if (action === "enable") {
      // 3. Rehabilitar acceso al negocio
      const updatedTenant = await db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: { status: "aprobado" },
        })

        // Reactivar al administrador principal
        await tx.user.updateMany({
          where: { tenantId: id, isPrimary: true },
          data: { active: true },
        })

        return t
      })

      try {
        await logAudit({
          action: "tenant_enable",
          entityType: "tenant",
          entityId: id,
          userName: session?.name || "Superadmin",
          role: "superadmin",
          detail: `Acceso reactivado para el negocio: "${tenant.name}"`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `El acceso para el negocio "${tenant.name}" ha sido restaurado exitosamente.`,
        tenant: updatedTenant,
      })
    }

    if (action === "update_limit") {
      const maxBranches = Math.max(1, Math.min(10, Number(body.maxBranches ?? 3)))
      const updatedTenant = await db.tenant.update({
        where: { id },
        data: { maxBranches },
      })
      return NextResponse.json({ ok: true, tenant: updatedTenant })
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 })
  } catch (e) {
    console.error("[superadmin/tenants/patch] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export const PUT = PATCH

