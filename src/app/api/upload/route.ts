import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, getSession } from "@/lib/auth"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// POST /api/upload — Sube imagen de producto a /public/uploads/products
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No se envió ningún archivo de imagen" }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato no permitido. Solo se admiten JPG, PNG, WEBP, GIF o SVG." },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "La imagen es demasiado pesada. El tamaño máximo permitido es 5MB." },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const uploadDir = path.join(process.cwd(), "public", "uploads", "products")
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const ext = path.extname(file.name) || ".jpg"
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase()
    const uniqueName = `prod-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${safeExt}`
    const filePath = path.join(uploadDir, uniqueName)

    fs.writeFileSync(filePath, buffer)

    const publicUrl = `/uploads/products/${uniqueName}`

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      fileName: uniqueName,
    })
  } catch (e) {
    console.error("[upload/route] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
