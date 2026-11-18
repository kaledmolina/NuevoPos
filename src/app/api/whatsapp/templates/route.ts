import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"
import { createMetaCloudTemplate, deleteMetaCloudTemplate } from "@/lib/meta-whatsapp-policy"

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
      templates: templates.map((t) => {
        const metaMatch = t.content.match(/<!--meta:(\{.*?\})-->/)
        let meta: any = null
        if (metaMatch) {
          try {
            meta = JSON.parse(metaMatch[1])
          } catch {}
        }

        const isMeta = Boolean(meta || /^[a-z0-9_]+$/.test(t.name))
        const status = meta?.status || (isMeta ? "APPROVED" : "LOCAL")

        return {
          ...t,
          cleanContent: t.content.replace(/<!--meta:\{.*?\}-->\n?/, "").trim(),
          isMetaTemplate: isMeta,
          metaLanguage: meta?.language || "es",
          metaStatus: status, // "APPROVED" | "PENDING" | "REJECTED" | "LOCAL"
          metaCategory: meta?.category || (t.category === "promocion" ? "MARKETING" : "UTILITY"),
          metaId: meta?.metaId || null,
        }
      }),
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
    const {
      name,
      category = "promocion",
      content,
      submitToMeta = true,
      metaCategory = "MARKETING",
      language = "es",
      headerText,
      footerText,
    } = body

    if (!name || !content) {
      return NextResponse.json({ error: "Nombre y contenido son obligatorios" }, { status: 400 })
    }

    // Si se solicita registrar y enviar a revisión de Meta Cloud API
    if (submitToMeta) {
      const metaRes = await createMetaCloudTemplate({
        branchId,
        name,
        category: metaCategory || (category === "promocion" ? "MARKETING" : "UTILITY"),
        language,
        bodyText: content,
        headerText,
        footerText,
      })

      if (!metaRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: metaRes.error,
            requiresWabaId: metaRes.requiresWabaId,
          },
          { status: 400 }
        )
      }

      return NextResponse.json({
        ok: true,
        template: metaRes.template,
        metaStatus: metaRes.metaStatus,
        message: metaRes.message,
      })
    }

    // Si es borrador local
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
      metaStatus: "LOCAL",
      message: "Borrador de plantilla local guardado. (Nota: Para difusiones masivas de Meta debes enviar la plantilla a aprobación).",
    })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID de plantilla requerido" }, { status: 400 })
    }

    const res = await deleteMetaCloudTemplate(id, branchId)
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true, message: res.message })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
