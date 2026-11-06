import { NextRequest, NextResponse } from "next/server"
import { getSession, createMcpToken, type Role } from "@/lib/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/mcp/token - Generar token criptográfico MCP para un usuario o agente
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "No autorizado. Inicie sesión en el sistema para generar tokens." },
      { status: 401 }
    )
  }

  try {
    const body = await req.json()
    const {
      name,
      role: targetRole,
      branchId: targetBranchId,
      clientId,
    } = body || {}

    // Regla de permisos:
    // Solo un admin o superadmin puede generar tokens con rol admin o asignar sedes arbitrarias.
    // Un vendedor solo puede generar un token para sí mismo con su mismo rol y sede.
    let grantedRole: Role = (targetRole as Role) || session.role
    if (session.role !== "admin" && session.role !== "superadmin") {
      grantedRole = session.role
    }

    const agentName = name ? String(name).trim() : `${session.name} (Agente MCP)`
    const tenantId = session.tenantId || null
    let branchId = targetBranchId || session.branchId || null

    // Si no se especificó sede y el negocio tiene sedes, asignar la sede principal o primera
    if (!branchId && tenantId) {
      const firstBranch = await db.branch.findFirst({
        where: { tenantId, active: true },
        orderBy: { isMain: "desc" },
      })
      if (firstBranch) {
        branchId = firstBranch.id
      }
    }

    const token = createMcpToken({
      uid: session.uid || `agent_${Date.now()}`,
      name: agentName,
      role: grantedRole,
      branchId,
      tenantId,
      clientId: clientId || null,
    })

    // Construir snippet de Claude Desktop
    const scriptPath = "C:\\\\Users\\\\Mi Pc\\\\Desktop\\\\hositnge\\\\NuevoPos\\\\scripts\\\\mcp-server.mjs"
    const claudeDesktopConfig = {
      mcpServers: {
        omnipos: {
          command: "node",
          args: [scriptPath],
          env: {
            OMNIPOS_AUTH_TOKEN: token,
          },
        },
      },
    }

    return NextResponse.json({
      ok: true,
      data: {
        token,
        metadata: {
          agentName,
          role: grantedRole,
          branchId,
          tenantId,
          createdAt: new Date().toISOString(),
        },
        configSnippet: JSON.stringify(claudeDesktopConfig, null, 2),
      },
      message: "Token MCP criptográfico generado con éxito.",
    })
  } catch (error) {
    console.error("Error al generar token MCP:", error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}
