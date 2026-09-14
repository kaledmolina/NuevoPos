import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
}

interface Props {
  params: Promise<{ path: string[] }>
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { path: segments } = await params

    if (!segments || segments.length === 0) {
      return new NextResponse("Not Found", { status: 404 })
    }

    // Prevenir directory traversal
    for (const seg of segments) {
      if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) {
        return new NextResponse("Forbidden", { status: 403 })
      }
    }

    const relativePath = path.join(...segments)
    const filePath = path.join(process.cwd(), "public", "uploads", relativePath)

    if (!fs.existsSync(filePath)) {
      return new NextResponse("Image Not Found", { status: 404 })
    }

    const stat = fs.statSync(filePath)
    if (!stat.isFile()) {
      return new NextResponse("Not Found", { status: 404 })
    }

    const fileBuffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || "application/octet-stream"

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("Error serving uploaded file:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
