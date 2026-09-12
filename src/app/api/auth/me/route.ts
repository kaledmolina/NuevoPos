import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserAllowedBranches } from "@/lib/branch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/auth/me — devuelve el usuario autenticado desde la cookie firmada
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) {
    return NextResponse.json({ user: null })
  }

  try {
    const user = await db.user.findUnique({
      where: { id: session.uid },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isPrimary: true,
        active: true,
        allowedBranchIds: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            status: true,
            ownerName: true,
            ownerEmail: true,
            ownerPhone: true,
          },
        },
      },
    })

    if (!user || (!user.active && user.role !== "superadmin")) {
      return NextResponse.json({ user: null })
    }

    const allowedBranchIds = await getUserAllowedBranches(user.id)

    // Si el usuario no tiene tenant directo pero es primary, él mismo es el admin
    let ownerName = user.tenant?.ownerName || (user.isPrimary ? user.name : null)
    let ownerEmail = user.tenant?.ownerEmail || (user.isPrimary ? user.email : null)

    // Si es un colaborador secundario sin tenant directo, buscar el admin principal del sistema
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

    return NextResponse.json({
      user: {
        name: user.name,
        role: user.role,
        uid: user.id,
        email: user.email,
        isPrimary: user.isPrimary,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name ?? null,
        tenantOwnerName: ownerName,
        tenantOwnerEmail: ownerEmail,
        allowedBranchIds,
      },
    })
  } catch {
    return NextResponse.json({
      user: { name: session.name, role: session.role, uid: session.uid, isPrimary: false, allowedBranchIds: [] },
    })
  }
}
