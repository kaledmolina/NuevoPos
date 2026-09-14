import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, hashPin, verifyPin, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEMO_PROTECTED_NAMES = ["admin", "vendedor", "superadmin", "superadmin kaled"]
const DEMO_PROTECTED_EMAILS = ["admin@demo.com", "vendedor@demo.com", "kaledmoly@gmail.com"]

// POST /api/auth/change-pin
// Body: { oldPin?: string, newPin: string, targetUserId?: string }
export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const session = auth.session

  try {
    const body = await req.json()
    const newPin = String(body.newPin ?? "").trim()
    const oldPin = String(body.oldPin ?? "").trim()
    const targetUserId = body.targetUserId ? String(body.targetUserId).trim() : null

    if (!newPin || !/^\d{4,8}$/.test(newPin)) {
      return NextResponse.json(
        { error: "El nuevo PIN debe ser numérico y tener entre 4 y 8 dígitos" },
        { status: 400 }
      )
    }

    // 1. Protección contra cambio de PIN desde sesión Demo (admin o vendedor)
    const isSessionDemo = DEMO_PROTECTED_NAMES.includes(session.name.toLowerCase())

    if (isSessionDemo && (session.role as string) !== "superadmin") {
      return NextResponse.json(
        {
          error:
            "🔒 Cuenta de Demostración Protegida: No está permitido cambiar el PIN en las cuentas de prueba (admin / vendedor) para que otros usuarios puedan seguir evaluando el sistema.",
        },
        { status: 403 }
      )
    }

    // 2. Si un admin está cambiando el PIN de otro usuario
    let userToUpdate = await db.user.findUnique({ where: { name: session.name } })

    if (targetUserId && session.role === "admin") {
      const target =
        (await db.user.findUnique({ where: { id: targetUserId } })) ||
        (await db.user.findUnique({ where: { name: targetUserId } }))

      if (!target) {
        return NextResponse.json({ error: "Usuario destino no encontrado" }, { status: 404 })
      }

      // No permitir cambiar el PIN de cuentas demo ni del superadmin
      const isTargetDemo =
        DEMO_PROTECTED_NAMES.includes(target.name.toLowerCase()) ||
        (target.email && DEMO_PROTECTED_EMAILS.includes(target.email.toLowerCase())) ||
        target.role === "superadmin"

      if (isTargetDemo) {
        return NextResponse.json(
          {
            error:
              "🔒 Usuario protegido: El PIN de las cuentas oficiales de demostración o del Superadministrador no puede ser modificado.",
          },
          { status: 403 }
        )
      }

      userToUpdate = target
    } else {
      // Si el usuario cambia su propio PIN, debe verificar el PIN actual
      if (!userToUpdate) {
        return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
      }
      if (!verifyPin(oldPin, userToUpdate.pinHash)) {
        return NextResponse.json({ error: "El PIN actual es incorrecto" }, { status: 400 })
      }
    }

    if (!userToUpdate) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // Verificar si el usuario a actualizar es una cuenta protegida
    const isUserToUpdateDemo =
      DEMO_PROTECTED_NAMES.includes(userToUpdate.name.toLowerCase()) ||
      (userToUpdate.email && DEMO_PROTECTED_EMAILS.includes(userToUpdate.email.toLowerCase()))

    if (isUserToUpdateDemo && session.role !== "superadmin") {
      return NextResponse.json(
        {
          error:
            "🔒 Cuenta de Demostración Protegida: No se puede cambiar el PIN de esta cuenta.",
        },
        { status: 403 }
      )
    }

    const newHash = hashPin(newPin)
    await db.user.update({
      where: { id: userToUpdate.id },
      data: { pinHash: newHash },
    })

    try {
      await logAudit({
        action: "change_pin",
        entityType: "user",
        entityId: userToUpdate.id,
        userName: session.name,
        role: session.role,
        detail: `PIN actualizado para el usuario ${userToUpdate.name}`,
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: `PIN de ${userToUpdate.name} actualizado correctamente`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
