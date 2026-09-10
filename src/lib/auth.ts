import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

export type Role = "admin" | "vendedor"

const FALLBACK_SECRET = "drogueria-pos-dev-fallback-secret"
const SECRET = process.env.AUTH_SECRET || FALLBACK_SECRET
// En producción, exigir un AUTH_SECRET real (no el fallback)
if (process.env.NODE_ENV === "production" && SECRET === FALLBACK_SECRET) {
  console.error("⚠️  AUTH_SECRET no configurado. Define la variable de entorno AUTH_SECRET con un valor aleatorio (openssl rand -hex 32).")
}
const COOKIE_NAME = "pos_session"
const MAX_AGE_SECONDS = 60 * 60 * 12 // 12 horas

// --- Hashear PIN (HMAC-SHA256) ---
export function hashPin(pin: string): string {
  return crypto.createHmac("sha256", SECRET).update(`pin:${pin}`).digest("hex")
}

export function verifyPin(pin: string, hash: string): boolean {
  const computed = hashPin(pin)
  // comparación de tiempo constante para evitar timing attacks
  if (computed.length !== hash.length) return false
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash))
}

// --- Firma de sesión (token tipo JWT简化: payload.base64.firma) ---
interface SessionPayload {
  role: Role
  name: string
  uid: string
  iat: number
}

function sign(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url")
  return `${data}.${sig}`
}

function verify(token: string): SessionPayload | null {
  try {
    const [data, sig] = token.split(".")
    if (!data || !sig) return null
    const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url")
    if (sig.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(data, "base64url").toString())
    // expiración
    if (Date.now() - (payload.iat || 0) > MAX_AGE_SECONDS * 1000) return null
    if (payload.role !== "admin" && payload.role !== "vendedor") return null
    return payload as SessionPayload
  } catch {
    return null
  }
}

// --- Leer sesión desde una request ---
export function getSession(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verify(token)
}

export function getRole(req: NextRequest): Role | null {
  return getSession(req)?.role ?? null
}

export function getUserName(req: NextRequest): string {
  return getSession(req)?.name ?? "Sistema"
}

// --- Crear/borrar cookie de sesión ---
function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  }
}

export function setSessionCookie(res: NextResponse, payload: SessionPayload): NextResponse {
  res.cookies.set(COOKIE_NAME, sign(payload), sessionCookieOptions())
  return res
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_NAME, "", { ...sessionCookieOptions(), maxAge: 0 })
  return res
}

// --- Guardia de admin ---
export function requireAdmin(req: NextRequest): NextResponse | null {
  const session = getSession(req)
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Acción reservada para el administrador" },
      { status: 403 }
    )
  }
  return null
}

// --- Guardia de autenticación (cualquier rol) ---
export function requireAuth(req: NextRequest): { session: SessionPayload } | NextResponse {
  const session = getSession(req)
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  }
  return { session }
}

// --- Log de auditoría ---
import { db } from "@/lib/db"

export async function logAudit(entry: {
  action: string
  entityType: string
  entityId?: string | null
  userName: string
  role: string
  detail?: string | null
  meta?: Record<string, unknown> | null
}) {
  try {
    await db.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        userName: entry.userName,
        role: entry.role,
        detail: entry.detail ?? null,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      },
    })
  } catch (e) {
    // No dejar que un error de logging rompa la operación principal
    console.error("Error escribiendo audit log:", (e as Error).message)
  }
}

// --- Rate limiting simple en memoria para login ---
// clave: nombre de usuario; valor: { count, firstAttempt }
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 5 * 60 * 1000 // 5 minutos

export function checkRateLimit(name: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const key = name.toLowerCase()
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 }
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfterMs: WINDOW_MS - (now - entry.firstAttempt) }
  }
  entry.count += 1
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, retryAfterMs: 0 }
}

export function resetRateLimit(name: string) {
  loginAttempts.delete(name.toLowerCase())
}
