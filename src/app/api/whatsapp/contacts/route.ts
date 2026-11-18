import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireBranchAccess } from "@/lib/branch"
import { calculateCareWindow } from "@/lib/meta-whatsapp-policy"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const branchFilter = branchId ? { branchId } : {}

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")?.trim().toLowerCase() || ""
    const filterWindow = searchParams.get("window") // "open" | "closed"
    const filterDebt = searchParams.get("debt") === "true"

    // 1. Obtener todos los clientes registrados
    const clients = await db.client.findMany({
      where: {
        ...branchFilter,
        isGeneric: false,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { phone: { contains: search } },
                { document: { contains: search } },
                { email: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        creditAccount: true,
        orders: {
          select: {
            id: true,
            total: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    // 2. Obtener los últimos mensajes por teléfono para calcular la ventana de Meta 24h
    const messages = await db.whatsAppMessage.findMany({
      where: {
        ...branchFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    })

    // Mapear último mensaje del cliente (customer) y último mensaje general por teléfono
    const lastCustomerMsgByPhone = new Map<string, Date>()
    const lastMsgByPhone = new Map<string, { text: string; date: Date; sender: string }>()
    const unreadCountByPhone = new Map<string, number>()
    const allChatPhones = new Set<string>()

    for (const msg of messages) {
      allChatPhones.add(msg.phone)
      if (!lastMsgByPhone.has(msg.phone)) {
        lastMsgByPhone.set(msg.phone, {
          text: msg.text,
          date: msg.createdAt,
          sender: msg.sender,
        })
      }
      if (msg.sender === "customer" && !lastCustomerMsgByPhone.has(msg.phone)) {
        lastCustomerMsgByPhone.set(msg.phone, msg.createdAt)
      }
      if (msg.sender === "customer" && msg.status === "unread") {
        unreadCountByPhone.set(msg.phone, (unreadCountByPhone.get(msg.phone) || 0) + 1)
      }
    }

    // 3. Ensamblar lista de clientes
    const formattedClients = clients.map((c) => {
      const cleanPhone = c.phone || ""
      const lastCustDate = cleanPhone ? lastCustomerMsgByPhone.get(cleanPhone) || null : null
      const careWindow = calculateCareWindow(lastCustDate)
      const lastMsg = cleanPhone ? lastMsgByPhone.get(cleanPhone) || null : null
      const unreadCount = cleanPhone ? unreadCountByPhone.get(cleanPhone) || 0 : 0

      const totalSpent = c.orders.reduce((acc, o) => acc + (o.status !== "cancelado" ? o.total : 0), 0)
      const ordersCount = c.orders.length
      const lastOrder = c.orders[0] || null

      return {
        id: c.id,
        name: c.name,
        phone: c.phone || "",
        document: c.document || "",
        email: c.email || "",
        address: c.address || "",
        notes: c.notes || "",
        channel: c.phone?.startsWith("tg_") ? "telegram" : "whatsapp",
        creditLimit: c.creditAccount?.creditLimit || 0,
        balance: c.creditAccount?.balance || 0,
        ordersCount,
        totalSpent,
        lastOrderDate: lastOrder?.createdAt || null,
        lastMessageText: lastMsg?.text || null,
        lastMessageDate: lastMsg?.date || null,
        unreadCount,
        careWindow,
        isRegisteredClient: true,
        createdAt: c.createdAt,
      }
    })

    // 4. Incluir también contactos que han escrito por WhatsApp/Telegram pero aún no están en Client
    const existingPhoneSet = new Set(clients.map((c) => c.phone).filter(Boolean))
    const unregisteredContacts: any[] = []

    for (const phone of Array.from(allChatPhones)) {
      if (!existingPhoneSet.has(phone)) {
        if (search && !phone.toLowerCase().includes(search)) {
          continue
        }
        const lastCustDate = lastCustomerMsgByPhone.get(phone) || null
        const careWindow = calculateCareWindow(lastCustDate)
        const lastMsg = lastMsgByPhone.get(phone) || null
        const unreadCount = unreadCountByPhone.get(phone) || 0

        unregisteredContacts.push({
          id: `chat_${phone}`,
          name: `Contacto ${phone.replace("tg_", "@")}`,
          phone,
          document: "",
          email: "",
          address: "",
          notes: "Contacto captado vía mensajería",
          channel: phone.startsWith("tg_") ? "telegram" : "whatsapp",
          creditLimit: 0,
          balance: 0,
          ordersCount: 0,
          totalSpent: 0,
          lastOrderDate: null,
          lastMessageText: lastMsg?.text || null,
          lastMessageDate: lastMsg?.date || null,
          unreadCount,
          careWindow,
          isRegisteredClient: false,
          createdAt: lastMsg?.date || new Date(),
        })
      }
    }

    let combined = [...formattedClients, ...unregisteredContacts]

    // Filtros adicionales
    if (filterWindow === "open") {
      combined = combined.filter((c) => c.careWindow.isOpen)
    } else if (filterWindow === "closed") {
      combined = combined.filter((c) => !c.careWindow.isOpen)
    }

    if (filterDebt) {
      combined = combined.filter((c) => (c.balance || 0) > 0)
    }

    // Resumen de estadísticas
    const summary = {
      totalContacts: combined.length,
      registeredClients: formattedClients.length,
      unregisteredChats: unregisteredContacts.length,
      withDebt: combined.filter((c) => (c.balance || 0) > 0).length,
      activeCareWindow: combined.filter((c) => c.careWindow.isOpen).length,
    }

    return NextResponse.json({
      ok: true,
      contacts: combined,
      summary,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId
    const branchFilter = branchId ? { branchId } : {}

    const body = await req.json()

    // Soporte para importación masiva de contactos (CSV o JSON)
    if (body.action === "import" && Array.isArray(body.contacts)) {
      let imported = 0
      let updated = 0
      const errors: string[] = []

      for (const item of body.contacts) {
        const rawPhone = item.phone ? String(item.phone).replace(/[^0-9+]/g, "").trim() : ""
        const rawName = item.name ? String(item.name).trim() : ""

        if (!rawPhone || !rawName) {
          errors.push(`Fila ignorada: Nombre y Teléfono son requeridos (${rawName || "Sin nombre"})`)
          continue
        }

        try {
          const existing = await db.client.findFirst({
            where: {
              OR: [{ phone: rawPhone }, { phone: rawPhone.replace("+", "") }],
              ...branchFilter,
            },
            include: { creditAccount: true },
          })

          if (existing) {
            await db.client.update({
              where: { id: existing.id },
              data: {
                name: rawName,
                document: item.document ? String(item.document).trim() : existing.document,
                email: item.email ? String(item.email).trim() : existing.email,
                address: item.address ? String(item.address).trim() : existing.address,
                notes: item.notes ? String(item.notes).trim() : existing.notes,
              },
            })
            updated++
          } else {
            await db.client.create({
              data: {
                name: rawName,
                phone: rawPhone,
                document: item.document ? String(item.document).trim() : null,
                email: item.email ? String(item.email).trim() : null,
                address: item.address ? String(item.address).trim() : null,
                notes: item.notes ? String(item.notes).trim() : null,
                branchId,
                creditAccount: {
                  create: {
                    creditLimit: Number(item.creditLimit) || 0,
                    active: Number(item.creditLimit) > 0,
                    balance: 0,
                  },
                },
              },
            })
            imported++
          }
        } catch (e: any) {
          errors.push(`Error al procesar ${rawName} (${rawPhone}): ${e.message}`)
        }
      }

      return NextResponse.json({
        ok: true,
        message: `Importación completada: ${imported} contacto(s) creados, ${updated} actualizados.`,
        importedCount: imported,
        updatedCount: updated,
        errors: errors.length > 0 ? errors : undefined,
      })
    }

    const {
      phone,
      name,
      document,
      email,
      address,
      notes,
      creditLimit = 0,
    } = body

    if (!phone || !name || !name.trim()) {
      return NextResponse.json({ error: "Teléfono y Nombre son requeridos" }, { status: 400 })
    }

    const cleanPhone = String(phone).replace(/[^0-9+]/g, "")

    // Buscar si ya existe el cliente por teléfono
    let client = await db.client.findFirst({
      where: {
        OR: [{ phone: cleanPhone }, { phone: cleanPhone.replace("+", "") }],
        ...branchFilter,
      },
      include: { creditAccount: true },
    })

    if (client) {
      client = await db.client.update({
        where: { id: client.id },
        data: {
          name: name.trim(),
          document: document ? String(document).trim() : client.document,
          email: email ? String(email).trim() : client.email,
          address: address ? String(address).trim() : client.address,
          notes: notes ? String(notes).trim() : client.notes,
        },
        include: { creditAccount: true },
      })

      // Actualizar cupo si se indicó
      if (client.creditAccount && Number(creditLimit) >= 0) {
        await db.creditAccount.update({
          where: { id: client.creditAccount.id },
          data: {
            creditLimit: Number(creditLimit),
            active: Number(creditLimit) > 0,
          },
        })
      }
    } else {
      client = await db.client.create({
        data: {
          name: name.trim(),
          phone: cleanPhone,
          document: document ? String(document).trim() : null,
          email: email ? String(email).trim() : null,
          address: address ? String(address).trim() : null,
          notes: notes ? String(notes).trim() : null,
          branchId,
          creditAccount: {
            create: {
              creditLimit: Number(creditLimit) || 0,
              active: Number(creditLimit) > 0,
              balance: 0,
            },
          },
        },
        include: { creditAccount: true },
      })
    }

    return NextResponse.json({
      ok: true,
      client,
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
    const phone = searchParams.get("phone")

    if (!id && !phone) {
      return NextResponse.json({ error: "Se requiere ID o teléfono del contacto" }, { status: 400 })
    }

    if (id && !id.startsWith("chat_")) {
      await db.client.delete({ where: { id } })
    } else if (phone) {
      await db.client.deleteMany({
        where: {
          phone,
          ...(branchId ? { branchId } : {}),
        },
      })
    }

    return NextResponse.json({ ok: true, message: "Contacto eliminado correctamente" })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
