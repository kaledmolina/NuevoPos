import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSession, type SessionPayload } from "@/lib/auth"

/**
 * Obtiene la lista de IDs de sedes a las que un usuario tiene acceso.
 * Si es Admin Principal, siempre tiene acceso a todas las sedes del sistema.
 */
export async function getUserAllowedBranches(userId: string): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isPrimary: true,
      allowedBranchIds: true,
      tenantId: true,
      role: true,
      active: true,
      tenant: { select: { status: true } },
    },
  })
  if (!user) return []

  // Seguridad SaaS: Si el usuario está inactivo o su negocio no está aprobado, revocar acceso de inmediato
  if (user.role !== "superadmin") {
    if (!user.active) return []
    if (user.tenant && user.tenant.status !== "aprobado") return []
  }

  const branchWhere = user.role === "superadmin"
    ? { active: true }
    : user.tenantId
      ? { active: true, tenantId: user.tenantId }
      : { active: true }

  const allBranches = await db.branch.findMany({
    where: branchWhere,
    select: { id: true },
  })
  const allIds = allBranches.map((b) => b.id)

  if (user.role === "superadmin" || user.isPrimary) {
    return allIds
  }

  try {
    const allowed = JSON.parse(user.allowedBranchIds || "[]") as string[]
    if (Array.isArray(allowed) && allowed.length > 0) {
      // Filtrar solo las que realmente existan y estén activas
      return allowed.filter((id) => allIds.includes(id))
    }
  } catch {
    /* noop */
  }

  // Fallback: Si no tiene ninguna configurada, asignar la sede principal del tenant
  const mainBranch = await db.branch.findFirst({
    where: { isMain: true, ...(user.tenantId ? { tenantId: user.tenantId } : {}) },
    select: { id: true },
  })
  return mainBranch ? [mainBranch.id] : allIds.slice(0, 1)
}

/**
 * Valida si el usuario tiene permiso para operar en la sede especificada.
 */
export async function canUserAccessBranch(userId: string, branchId: string): Promise<boolean> {
  const allowed = await getUserAllowedBranches(userId)
  return allowed.includes(branchId)
}

/**
 * Resuelve el ID de la sede para una petición entrante de manera segura.
 * Si el usuario está autenticado, asegura que NUNCA pueda acceder a una sede ajena.
 */
export async function resolveBranchId(req: NextRequest): Promise<string> {
  const session = getSession(req)
  const headerId = req.headers.get("x-branch-id")
  const queryId = req.nextUrl.searchParams.get("branchId")
  const requestedId = (headerId && headerId !== "null" && headerId !== "undefined")
    ? headerId
    : (queryId && queryId !== "null" && queryId !== "undefined")
      ? queryId
      : null

  if (session) {
    const allowed = await getUserAllowedBranches(session.uid)
    if (requestedId && allowed.includes(requestedId)) {
      return requestedId
    }
    // Si solicitó una sede no permitida o no especificó ninguna, restringir a su primera sede autorizada
    return allowed[0] || ""
  }

  // Si no hay sesión (rutas públicas o de inicio)
  if (requestedId) return requestedId

  const mainBranch = await db.branch.findFirst({
    where: { isMain: true },
    select: { id: true },
  })
  if (mainBranch) return mainBranch.id

  const anyBranch = await db.branch.findFirst({ select: { id: true } })
  return anyBranch ? anyBranch.id : ""
}

export interface BranchAccessSuccess {
  branchId: string
  session: SessionPayload
  allowedBranchIds: string[]
}

/**
 * Guardia estricto de seguridad multi-sede:
 * - 401 si no está autenticado.
 * - 403 si intenta acceder explícitamente a una sede ajena sin permisos.
 * - Retorna la sede segura autorizada y la sesión del usuario.
 */
export async function requireBranchAccess(
  req: NextRequest
): Promise<BranchAccessSuccess | NextResponse> {
  const session = getSession(req)
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }

  const allowed = await getUserAllowedBranches(session.uid)
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: "Tu cuenta no tiene sedes asignadas. Contacta al Administrador Principal." },
      { status: 403 }
    )
  }

  const headerId = req.headers.get("x-branch-id")
  const queryId = req.nextUrl.searchParams.get("branchId")
  const requestedId = (headerId && headerId !== "null" && headerId !== "undefined")
    ? headerId
    : (queryId && queryId !== "null" && queryId !== "undefined")
      ? queryId
      : null

  // Si el cliente solicita explícitamente una sede
  if (requestedId) {
    if (!allowed.includes(requestedId)) {
      return NextResponse.json(
        {
          error: "Acceso denegado: No tienes autorización para consultar ni operar en esta sede.",
          code: "BRANCH_ACCESS_DENIED",
        },
        { status: 403 }
      )
    }
    return { branchId: requestedId, session, allowedBranchIds: allowed }
  }

  // Si no especificó, usar su sede por defecto autorizada
  return { branchId: allowed[0], session, allowedBranchIds: allowed }
}

/**
 * Valida que una entidad (producto, venta, compra, caja, cliente) pertenezca a una sede autorizada para el usuario.
 */
export async function verifyEntityBranchAccess(
  userId: string,
  entityBranchId: string | null | undefined
): Promise<boolean> {
  if (!entityBranchId) return true // Registro global / anterior
  return canUserAccessBranch(userId, entityBranchId)
}
