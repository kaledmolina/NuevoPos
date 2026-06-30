import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/auth/me — devuelve el usuario autenticado desde la cookie firmada
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) {
    return NextResponse.json({ user: null })
  }
  return NextResponse.json({
    user: { name: session.name, role: session.role, uid: session.uid },
  })
}
