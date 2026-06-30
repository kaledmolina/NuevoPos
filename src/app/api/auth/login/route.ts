import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  hashPin, verifyPin, setSessionCookie, checkRateLimit, resetRateLimit,
} from "@/lib/auth"

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

    const user = await db.user.findUnique({ where: { name } })
    if (!user || !user.active) {
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

    // Login OK: resetear contador y setear cookie firmada
    resetRateLimit(name)
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, role: user.role },
    })
    return setSessionCookie(res, {
      role: user.role as "admin" | "vendedor",
      name: user.name,
      uid: user.id,
      iat: Date.now(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
