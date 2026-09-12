import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  hashPin, verifyPin, setSessionCookie, checkRateLimit, resetRateLimit, logAudit,
} from "@/lib/auth"
import { getUserAllowedBranches } from "@/lib/branch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/auth/login
// Body: { name: string, pin: string }
// Valida contra la BD, setea cookie httpOnly firmada.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name ?? "").trim()
    const pin = String(body.pin ?? "").trim()

    if (!name || !pin) {
      return NextResponse.json(
        { error: "Nombre y PIN son obligatorios" },
        { status: 400 }
      )
    }

    // Rate limiting por nombre de usuario
    const rl = checkRateLimit(name)
    if (!rl.allowed) {
      const secs = Math.ceil(rl.retryAfterMs / 1000)
      return NextResponse.json(
        { error: `Demasiados intentos. Intenta de nuevo en ${secs} segundos.` },
        { status: 429 }
      )
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          { name: { equals: name } },
          { email: { equals: name.toLowerCase() } },
        ],
      },
      include: { tenant: true },
    })
    if (!user) {
      return NextResponse.json(
        { error: "Usuario o PIN incorrecto" },
        { status: 401 }
      )
    }

    if (!verifyPin(pin, user.pinHash)) {
      return NextResponse.json(
        { error: "Usuario o PIN incorrecto" },
        { status: 401 }
      )
    }

    // Validación de estado para usuarios de un Tenant (excepto Superadmin)
    if (user.role !== "superadmin") {
      if (user.tenant) {
        if (user.tenant.status === "pendiente") {
          return NextResponse.json(
            {
              error: "Tu negocio está pendiente de aprobación por el Superadministrador. Te notificaremos o podrás ingresar en cuanto sea aprobado.",
              code: "TENANT_PENDING",
            },
            { status: 403 }
          )
        }
        if (user.tenant.status === "inactivo") {
          return NextResponse.json(
            {
              error: "El acceso a tu negocio ha sido inhabilitado por el Superadministrador. Comunícate con soporte.",
              code: "TENANT_DISABLED",
            },
            { status: 403 }
          )
        }
      }
      // Validación de estado del Administrador Principal si es un colaborador
      if (!user.isPrimary && user.tenantId) {
        const primaryAdmin = await db.user.findFirst({
          where: { tenantId: user.tenantId, isPrimary: true },
          select: { active: true, name: true },
        })
        if (primaryAdmin && !primaryAdmin.active) {
          return NextResponse.json(
            {
              error: `El Administrador Principal de tu sede se encuentra inactivo. El acceso de los colaboradores ha sido inhabilitado.`,
              code: "TENANT_ADMIN_INACTIVE",
            },
            { status: 403 }
          )
        }
      }

      if (!user.active) {
        return NextResponse.json(
          { error: "Tu usuario ha sido desactivado. Consulta con tu Administrador.", code: "USER_INACTIVE" },
          { status: 403 }
        )
      }
    }

    // Login OK: resetear contador y setear cookie firmada
    resetRateLimit(name)
    await logAudit({
      action: "login",
      entityType: "user",
      entityId: user.id,
      userName: user.name,
      role: user.role,
      detail: `Inicio de sesión (${user.role})`,
    })
    const allowedBranchIds = await getUserAllowedBranches(user.id)
    let ownerName = user.tenant?.ownerName || (user.isPrimary ? user.name : null)
    let ownerEmail = user.tenant?.ownerEmail || (user.isPrimary ? user.email : null)
    if (!ownerEmail) {
      const primaryAdmin = await db.user.findFirst({
        where: { isPrimary: true },
        select: { name: true, email: true },
      })
      if (primaryAdmin) {
        ownerName = primaryAdmin.name
        ownerEmail = primaryAdmin.email
      }
    }

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isPrimary: user.isPrimary,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name ?? null,
        tenantOwnerName: ownerName,
        tenantOwnerEmail: ownerEmail,
        allowedBranchIds,
      },
    })
    return setSessionCookie(res, {
      role: user.role as "superadmin" | "admin" | "vendedor",
      name: user.name,
      uid: user.id,
      tenantId: user.tenantId,
      iat: Date.now(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
