import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/health — verifica que el sistema esté operativo
export async function GET() {
  try {
    // Probe simple a la BD
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json(
      { status: "error", database: "disconnected", error: (e as Error).message },
      { status: 503 }
    )
  }
}
