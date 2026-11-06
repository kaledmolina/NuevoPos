import { NextResponse } from "next/server"

export function apiSuccess<T>(data: T, extra?: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    {
      ok: true,
      data,
      ...extra,
    },
    { status }
  )
}

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  )
}
