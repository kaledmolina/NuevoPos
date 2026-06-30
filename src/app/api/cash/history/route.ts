import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Listar todas las sesiones (historial)
export async function GET() {
  const sessions = await db.cashSession.findMany({
    orderBy: { openedAt: "desc" },
    include: { _count: { select: { transactions: true } } },
    take: 100,
  })
  return NextResponse.json(sessions)
}
