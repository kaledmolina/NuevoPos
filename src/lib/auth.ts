import { NextRequest, NextResponse } from "next/server"

export type Role = "admin" | "vendedor"

// Lee el rol desde la cabecera enviada por el cliente (apiFetch)
export function getRole(req: NextRequest): Role | null {
  const role = req.headers.get("x-user-role")
  return role === "admin" || role === "vendedor" ? (role as Role) : null
}

export function getUserName(req: NextRequest): string {
  const name = req.headers.get("x-user-name")
  try {
    return name ? decodeURIComponent(name) : "Sistema"
  } catch {
    return "Sistema"
  }
}

// Devuelve una respuesta 403 si el usuario no es administrador.
// Usar en operaciones sensibles: editar inventario, compras, finanzas, anular ventas, etc.
export function requireAdmin(req: NextRequest): NextResponse | null {
  if (getRole(req) !== "admin") {
    return NextResponse.json(
      { error: "Acción reservada para el administrador" },
      { status: 403 }
    )
  }
  return null
}
