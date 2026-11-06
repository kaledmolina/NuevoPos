import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import {
  verifyPin,
  createApiToken,
  setSessionCookie,
  checkRateLimit,
  resetRateLimit,
  type Role,
  logAudit,
} from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const identifier = (body.identifier || body.email || body.name || "").toString().trim()
    const pin = (body.pin || body.password || "").toString().trim()

    if (!identifier || !pin) {
      return apiError("Debes ingresar el usuario/correo y tu PIN o contraseña", 400)
    }

    // Rate limiting para prevenir fuerza bruta
    const rate = checkRateLimit(identifier)
    if (!rate.allowed) {
      const waitSeconds = Math.ceil(rate.retryAfterMs / 1000)
      return apiError(`Demasiados intentos fallidos. Intenta de nuevo en ${waitSeconds} segundos.`, 429)
    }

    // Buscar usuario por correo electrónico o por nombre
    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { name: identifier },
        ],
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            rubro: true,
          },
        },
      },
    })

    if (!user) {
      return apiError("Credenciales incorrectas", 401)
    }

    if (!user.active) {
      return apiError("Esta cuenta ha sido desactivada. Comunícate con el administrador.", 403)
    }

    // Si el usuario pertenece a un negocio SaaS, verificar que el negocio esté aprobado
    if (user.role !== "superadmin" && user.tenant && user.tenant.status !== "aprobado") {
      return apiError(`El negocio asociado se encuentra en estado: ${user.tenant.status}`, 403)
    }

    // Validar PIN / Contraseña
    const isValid = verifyPin(pin, user.pinHash)
    if (!isValid) {
      return apiError("Credenciales incorrectas", 401)
    }

    // Login exitoso: restablecer rate limit
    resetRateLimit(identifier)

    // Parsear sedes permitidas
    let allowedBranchIds: string[] = []
    try {
      allowedBranchIds = JSON.parse(user.allowedBranchIds || "[]")
    } catch {
      allowedBranchIds = []
    }

    const payload = {
      uid: user.id,
      name: user.name,
      role: user.role as Role,
      tenantId: user.tenantId,
    }

    const token = createApiToken(payload)

    await logAudit({
      action: "api_login",
      entityType: "user",
      entityId: user.id,
      userName: user.name,
      role: user.role,
      detail: `Inicio de sesión exitoso vía API (Rol: ${user.role})`,
    })

    const response = apiSuccess({
      token,
      tokenType: "Bearer",
      expiresIn: "7 días",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
        allowedBranchIds,
      },
    })

    // Sincronizar también cookie para clientes navegadores
    setSessionCookie(response, {
      ...payload,
      iat: Date.now(),
    })

    return response
  } catch (error) {
    console.error("Error en POST /api/v1/auth/login:", error)
    return apiError("Error interno al procesar el inicio de sesión", 500)
  }
}
