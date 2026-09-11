import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, hashPin, verifyPin, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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

    // Si un admin está cambiando el PIN de otro usuario o el propio
    let userToUpdate = await db.user.findUnique({ where: { name: session.name } })

    if (targetUserId && session.role === "admin") {
      const target = await db.user.findUnique({ where: { id: targetUserId } })
      if (!target) {
        return NextResponse.json({ error: "Usuario destino no encontrado" }, { status: 404 })
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
