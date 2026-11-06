import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

const DEFAULT_TEMPLATES = [
  {
    name: "⚡ Oferta Relámpago del Día",
    category: "promocion",
    content: "¡Hola {{nombre}}! 🌟 Hoy tenemos una oferta especial para ti en nuestra tienda: aprovecha un 15% de descuento en referencias seleccionadas por tiempo limitado. Pide por este chat y te lo enviamos a domicilio. 🛵📦",
  },
  {
    name: "💊 Liquidación de Lotes Especiales",
    category: "promocion",
    content: "Hola {{nombre}}, te saludamos de tu droguería de confianza. Tenemos en súper descuento lotes seleccionados de canasta familiar y cuidado personal. Escríbenos 'Catálogo' para conocer las ofertas exclusivas de hoy.",
  },
  {
    name: "🧾 Recordatorio Amigable de Cuenta",
    category: "cobro",
    content: "Estimado(a) {{nombre}}, te saludamos cordialmente. Te recordamos que tienes un saldo pendiente en tu cuenta de fiado por ${{saldo}}. Puedes realizar tu abono en el mostrador o por transferencia. ¡Muchas gracias por tu puntualidad!",
  },
  {
    name: "🛵 Domicilios Gratis Fin de Semana",
    category: "novedad",
    content: "¡Hola {{nombre}}! 🎉 Este fin de semana tenemos envíos a domicilio totalmente GRATIS en compras superiores a $30.000. Haz tu pedido directamente respondiendo este mensaje.",
  },
]

export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const branchFilter = branchId ? { branchId } : {}

    let templates = await db.whatsAppTemplate.findMany({
      where: { ...branchFilter },
      orderBy: { createdAt: "desc" },
    })

    // Auto-sembrar si está vacío
    if (templates.length === 0) {
      for (const t of DEFAULT_TEMPLATES) {
        await db.whatsAppTemplate.create({
          data: {
            name: t.name,
            category: t.category,
            content: t.content,
            branchId,
          },
        })
      }
      templates = await db.whatsAppTemplate.findMany({
        where: { ...branchFilter },
        orderBy: { createdAt: "desc" },
      })
    }

    return NextResponse.json({
      ok: true,
      templates,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId

    const body = await req.json()
    const { name, category = "promocion", content } = body

    if (!name || !content) {
      return NextResponse.json({ error: "Nombre y contenido son obligatorios" }, { status: 400 })
    }

    const created = await db.whatsAppTemplate.create({
      data: {
        name: name.trim(),
        category,
        content: content.trim(),
        branchId,
      },
    })

    return NextResponse.json({
      ok: true,
      template: created,
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
