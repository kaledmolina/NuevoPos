import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import {
  hashPin,
  createApiToken,
  setSessionCookie,
  checkRegisterRateLimit,
  logAudit,
} from "@/lib/auth"
import { apiSuccess, apiError } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"
    const rate = checkRegisterRateLimit(ip)
    if (!rate.allowed) {
      return apiError("Demasiados registros desde esta dirección IP. Intenta más tarde.", 429)
    }

    const body = await req.json().catch(() => ({}))
    const name = (body.name || "").toString().trim()
    const email = (body.email || "").toString().trim().toLowerCase()
    const pin = (body.pin || body.password || "").toString().trim()
    const phone = body.phone ? body.phone.toString().trim() : null
    const address = body.address ? body.address.toString().trim() : null
    const document = body.document ? body.document.toString().trim() : null

    if (!name || name.length < 2) {
      return apiError("El nombre es obligatorio y debe tener al menos 2 caracteres", 400)
    }

    if (!email || !email.includes("@")) {
      return apiError("Debes proporcionar un correo electrónico válido", 400)
    }

    if (!pin || pin.length < 4) {
      return apiError("La contraseña o PIN debe tener al menos 4 caracteres", 400)
    }

    // Comprobar existencia previa
    const existing = await db.user.findFirst({
      where: {
        OR: [
          { email },
          { name },
        ],
      },
    })

    if (existing) {
      if (existing.email === email) {
        return apiError("Ya existe una cuenta registrada con este correo electrónico", 409)
      }
      return apiError("Este nombre de usuario ya está en uso. Elige otro.", 409)
    }

    // Hashear PIN
    const pinHash = hashPin(pin)

    // Crear usuario con rol "cliente" y opcionalmente crear registro en Client
    const user = await db.user.create({
      data: {
        name,
        email,
        role: "cliente",
        pinHash,
        isPrimary: false,
        active: true,
        allowedBranchIds: "[]",
        tenantId: null, // Los clientes son globales al ecosistema
      },
    })

    // Crear también el registro en Client para sincronización con ventas y pedidos
    let clientRecord: { id: string } | null = null
    try {
      clientRecord = await db.client.create({
        data: {
          name,
          email,
          phone,
          address,
          document,
          isGeneric: false,
        },
      })
    } catch (e) {
      console.warn("No se pudo crear registro Client secundario (no crítico):", (e as Error).message)
    }

    const payload = {
      uid: user.id,
      name: user.name,
      role: "cliente" as const,
      tenantId: null,
    }

    const token = createApiToken(payload)

    await logAudit({
      action: "api_client_register",
      entityType: "user",
      entityId: user.id,
      userName: user.name,
      role: "cliente",
      detail: `Cliente auto-registrado vía API pública (${user.email})`,
    })

    const response = apiSuccess(
      {
        token,
        tokenType: "Bearer",
        expiresIn: "7 días",
        user: {
          id: user.id,
          clientId: clientRecord?.id || null,
          name: user.name,
          email: user.email,
          role: user.role,
          phone,
          address,
        },
      },
      { message: "Registro exitoso. Tu cuenta de cliente ha sido creada." },
      201
    )

    setSessionCookie(response, {
      ...payload,
      iat: Date.now(),
    })

    return response
  } catch (error) {
    console.error("Error en POST /api/v1/auth/register-client:", error)
    return apiError("Error interno al registrar cliente", 500)
  }
}
