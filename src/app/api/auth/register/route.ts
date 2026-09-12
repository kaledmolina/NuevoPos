import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { hashPin, logAudit, checkRegisterRateLimit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/auth/register - Auto-registro de nuevo negocio (Tenant)
export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting anti-flooding / anti-spam por IP
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1"

    const rateCheck = checkRegisterRateLimit(clientIp)
    if (!rateCheck.allowed) {
      const waitMinutes = Math.ceil(rateCheck.retryAfterMs / (60 * 1000))
      return NextResponse.json(
        {
          error: `Demasiados intentos de registro desde esta conexión. Por favor espera ${waitMinutes} minutos antes de volver a intentarlo.`,
          code: "RATE_LIMIT_EXCEEDED",
        },
        { status: 429 }
      )
    }

    const body = await req.json()
    const businessName = String(body.businessName ?? "").trim()
    const ownerName = String(body.ownerName ?? "").trim()
    const email = String(body.email ?? "").trim().toLowerCase()
    const phone = String(body.phone ?? "").trim()
    const pin = String(body.pin ?? "").trim()
    const rubro = String(body.rubro ?? "drogueria").trim().toLowerCase()
    const branchName = String(body.branchName ?? "Sede Principal").trim()

    // 2. Validaciones de longitud y formato
    if (!businessName || businessName.length < 2 || businessName.length > 100) {
      return NextResponse.json(
        { error: "El nombre del negocio es obligatorio (entre 2 y 100 caracteres)." },
        { status: 400 }
      )
    }

    if (!ownerName || ownerName.length < 2 || ownerName.length > 100) {
      return NextResponse.json(
        { error: "El nombre del administrador principal es obligatorio (entre 2 y 100 caracteres)." },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email || email.length > 120 || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Ingresa un correo electrónico válido (máximo 120 caracteres)." },
        { status: 400 }
      )
    }

    if (!pin || !/^\d{4,8}$/.test(pin)) {
      return NextResponse.json(
        { error: "El PIN debe ser estrictamente numérico y contener entre 4 y 8 dígitos." },
        { status: 400 }
      )
    }

    if (branchName.length > 100) {
      return NextResponse.json(
        { error: "El nombre de la sede no puede exceder 100 caracteres." },
        { status: 400 }
      )
    }

    // Verificar si el correo o nombre ya existen
    const existingUser = await db.user.findFirst({
      where: {
        OR: [{ email: { equals: email } }, { name: { equals: ownerName } }],
      },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: "Ya existe un usuario con este correo electrónico o nombre de usuario." },
        { status: 409 }
      )
    }


    const existingTenant = await db.tenant.findUnique({
      where: { ownerEmail: email },
    })
    if (existingTenant) {
      return NextResponse.json(
        { error: "Ya existe una empresa registrada con este correo electrónico." },
        { status: 409 }
      )
    }

    // Creación atómica: Tenant + Primera Sede + Usuario Admin Principal
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: businessName,
          slug: businessName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Date.now().toString().slice(-4),
          rubro: rubro || "drogueria",
          ownerName,
          ownerEmail: email,
          ownerPhone: phone || null,
          status: "pendiente", // Espera aprobación del Superadmin
          maxBranches: 3,
        },
      })

      const branch = await tx.branch.create({
        data: {
          name: branchName || "Sede Principal",
          code: "SEDE-01",
          isMain: true,
          active: true,
          tenantId: tenant.id,
        },
      })

      const user = await tx.user.create({
        data: {
          name: ownerName,
          email,
          role: "admin",
          pinHash: hashPin(pin),
          isPrimary: true,
          allowedBranchIds: JSON.stringify([branch.id]),
          tenantId: tenant.id,
          active: false, // Se activa cuando el Superadmin aprueba el tenant
        },
      })

      return { tenant, branch, user }
    })

    try {
      await logAudit({
        action: "tenant_register",
        entityType: "tenant",
        entityId: result.tenant.id,
        userName: ownerName,
        role: "admin",
        detail: `Nuevo negocio registrado: "${businessName}" (${email}) - Estado: Pendiente de aprobación`,
        meta: {
          businessName,
          ownerEmail: email,
          rubro,
          branchName,
        },
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: "¡Registro completado exitosamente! Tu negocio ha sido registrado y está en espera de aprobación por el Superadministrador.",
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        ownerEmail: result.tenant.ownerEmail,
        status: result.tenant.status,
      },
    })
  } catch (e) {
    console.error("[register error]", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
