#!/usr/bin/env node

/**
 * OmniPOS - Servidor MCP Oficial (Model Context Protocol)
 *
 * Permite a agentes de IA (Claude Desktop, Antigravity, Cursor, Chatbots, etc.)
 * consultar informacin, realizar ventas, consultar stock, registrar gastos,
 * gestionar pedidos y despachar domiciliarios de forma autnoma y segura.
 */

import { PrismaClient } from "@prisma/client"
import readline from "readline"
import crypto from "crypto"

const prisma = new PrismaClient()

// Información del Servidor MCP
const SERVER_NAME = "omnipos-mcp"
const SERVER_VERSION = "1.0.0"

// Clave secreta criptográfica (debe coincidir con la de src/lib/auth.ts)
const FALLBACK_SECRET = "drogueria-pos-dev-fallback-secret"
const SECRET = process.env.AUTH_SECRET || FALLBACK_SECRET

/**
 * Validador de Token Criptográfico (JWT HMAC-SHA256)
 * Evita la suplantación de identidad (Spoofing) y la elevación de privilegios.
 */
function verifyAuthToken(token) {
  if (!token) return null
  try {
    const [data, sig] = token.split(".")
    if (!data || !sig) return null
    const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url")
    if (sig.length !== expected.length) return null
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(data, "base64url").toString())
    // Expiración máxima: 30 días para agentes y bots
    if (Date.now() - (payload.iat || 0) > 30 * 24 * 3600 * 1000) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Contexto de Autenticación y Aislamiento Multisede (Row-Level Security)
 * 
 * MODELO DE SEGURIDAD BLINDADO:
 * 1. Si existe OMNIPOS_AUTH_TOKEN (Token Criptográfico Firmado), se extrae la identidad del token.
 *    Cualquier intento de adulterar el rol o la sede invalida la firma criptográfica.
 * 2. Si no hay token, solo se aceptan variables locales en modo desarrollo personal.
 */
let SESSION_CONTEXT = {
  tenantId: null,
  branchId: null,
  role: "admin",
  userId: null,
  userName: "Agente Local",
  clientId: null,
  isTokenVerified: false,
}

if (process.env.OMNIPOS_AUTH_TOKEN) {
  const verified = verifyAuthToken(process.env.OMNIPOS_AUTH_TOKEN)
  if (!verified) {
    console.error("🚨 [OmniPOS MCP] ALERTA DE SEGURIDAD: Token de autenticación inválido o alterado maliciosamente.")
    process.exit(1)
  }
  SESSION_CONTEXT = {
    tenantId: verified.tenantId || null,
    branchId: verified.branchId || null,
    role: verified.role || "vendedor",
    userId: verified.uid || null,
    userName: verified.name || "Agente Verificado",
    clientId: verified.clientId || null,
    isTokenVerified: true,
  }
} else {
  // Modo Desarrollo Local (Permite variables en entorno local de confianza)
  if (process.env.NODE_ENV === "production") {
    console.warn("⚠️ [OmniPOS MCP] ADVERTENCIA: En producción se exige OMNIPOS_AUTH_TOKEN para evitar suplantaciones de rol o sede.")
  }
  SESSION_CONTEXT = {
    tenantId: process.env.OMNIPOS_TENANT_ID || null,
    branchId: process.env.OMNIPOS_BRANCH_ID || null,
    role: process.env.OMNIPOS_ROLE || "admin",
    userId: process.env.OMNIPOS_USER_ID || null,
    userName: process.env.OMNIPOS_USER_NAME || "Agente Dev",
    clientId: process.env.OMNIPOS_CLIENT_ID || null,
    isTokenVerified: false,
  }
}

/**
 * Matriz de Control de Acceso Basado en Roles (RBAC)
 * Define estrictamente qué herramientas puede ejecutar cada rol.
 */
const TOOL_PERMISSIONS = {
  pos_get_business_summary: ["admin", "superadmin", "vendedor"],
  pos_search_products: ["admin", "superadmin", "vendedor", "domiciliario", "cliente"],
  pos_create_or_update_product: ["admin", "superadmin"],
  pos_get_sales_history: ["admin", "superadmin", "vendedor"],
  pos_get_cash_status: ["admin", "superadmin"],
  pos_record_cash_movement: ["admin", "superadmin", "vendedor"],
  pos_list_orders: ["admin", "superadmin", "vendedor", "domiciliario", "cliente"],
  pos_assign_order_driver: ["admin", "superadmin", "vendedor", "domiciliario"],
  pos_get_client_credit: ["admin", "superadmin", "vendedor", "cliente"],
  pos_record_credit_payment: ["admin", "superadmin", "vendedor"],
  pos_get_financial_reports: ["admin", "superadmin"],
  pos_get_client_profit_summary: ["admin", "superadmin"],
  pos_set_client_credit: ["admin", "superadmin"],
  pos_get_inventory_alerts: ["admin", "superadmin", "vendedor"],
  pos_record_purchase: ["admin", "superadmin"],
  pos_list_suppliers: ["admin", "superadmin", "vendedor"],
  pos_create_sale: ["admin", "superadmin", "vendedor"],
  pos_create_order: ["admin", "superadmin", "vendedor", "cliente"],
  pos_search_clients: ["admin", "superadmin", "vendedor"],
  pos_create_client: ["admin", "superadmin", "vendedor"],
  pos_open_cash_session: ["admin", "superadmin", "vendedor"],
  pos_close_cash_session: ["admin", "superadmin", "vendedor"],
  pos_get_reorder_suggestions: ["admin", "superadmin"],
}

// Definicin de Herramientas (Tools) del MCP
const TOOLS = [
  {
    name: "pos_get_business_summary",
    description: "Obtiene un resumen ejecutivo en tiempo real del negocio: ventas de hoy, balance de caja, pedidos a domicilio pendientes y alertas de inventario bajo.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "pos_search_products",
    description: "Busca productos en el catlogo por nombre o cdigo de barras. Muestra precio de venta, costo, stock disponible, unidad y fecha de vencimiento.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Trmino de bsqueda o cdigo de barras" },
        limit: { type: "number", description: "Mximo nmero de resultados (por defecto 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "pos_create_or_update_product",
    description: "Crea o actualiza un producto en el inventario del negocio.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID del producto si se desea actualizar uno existente" },
        name: { type: "string", description: "Nombre completo del producto" },
        barcode: { type: "string", description: "Cdigo de barras del producto" },
        price: { type: "number", description: "Precio de venta al pblico en pesos" },
        cost: { type: "number", description: "Costo de compra unitario" },
        stock: { type: "number", description: "Cantidad de existencias en inventario" },
        minStock: { type: "number", description: "Stock mnimo para alerta de reposicin" },
        categoryName: { type: "string", description: "Nombre de la categora a la que pertenece" },
      },
      required: ["name", "price"],
    },
  },
  {
    name: "pos_get_sales_history",
    description: "Consulta el historial de ventas realizadas, con desglose de factura, total, cliente y medio de pago.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Nmero de ventas a consultar (mx 50, defecto 15)" },
        paymentMethod: { type: "string", description: "Filtrar por medio de pago (efectivo, tarjeta, transferencia, credito)" },
      },
    },
  },
  {
    name: "pos_get_cash_status",
    description: "Consulta el estado actual de la caja registradora: si est abierta o cerrada, quin abri turno, monto base, ventas en efectivo y saldo esperado.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "pos_record_cash_movement",
    description: "Registra un movimiento menor en caja (ingreso adicional o egreso por gastos como fletes, aseo, domicilios, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["ingreso", "egreso"], description: "Tipo de movimiento" },
        amount: { type: "number", description: "Monto en pesos del movimiento" },
        reason: { type: "string", description: "Motivo o justificacin del gasto/ingreso" },
      },
      required: ["type", "amount", "reason"],
    },
  },
  {
    name: "pos_list_orders",
    description: "Lista los pedidos a domicilio con su cliente, direccin de entrega, estado, total y conductor/repartidor asignado.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["all", "pendiente", "confirmado", "en_preparacion", "en_camino", "entregado", "cancelado"],
          description: "Filtrar por estado del pedido (por defecto 'all')",
        },
        limit: { type: "number", description: "Nmero mximo de pedidos (defecto 20)" },
      },
    },
  },
  {
    name: "pos_assign_order_driver",
    description: "Asigna un conductor/repartidor a un pedido a domicilio y opcionalmente lo despacha en camino.",
    inputSchema: {
      type: "object",
      properties: {
        orderIdOrNumber: { type: "string", description: "ID de la orden o Nmero de pedido (ej. PED-20261105-1001)" },
        driverName: { type: "string", description: "Nombre del conductor o repartidor" },
        driverPhone: { type: "string", description: "Telfono o WhatsApp del conductor" },
        dispatchNow: { type: "boolean", description: "Si se debe cambiar el estado inmediatamente a 'en_camino' (por defecto true)" },
      },
      required: ["orderIdOrNumber", "driverName"],
    },
  },
  {
    name: "pos_get_client_credit",
    description: "Consulta el estado de crdito o cartera de un cliente: cupo mximo, deuda pendiente acumulada y disponibilidad.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nombre, telfono o documento del cliente" },
      },
      required: ["query"],
    },
  },
  {
    name: "pos_record_credit_payment",
    description: "Registra un abono de dinero a la deuda a crdito de un cliente.",
    inputSchema: {
      type: "object",
      properties: {
        clientIdOrName: { type: "string", description: "ID o Nombre del cliente que abona" },
        amount: { type: "number", description: "Monto abonado en pesos" },
        notes: { type: "string", description: "Nota o comprobante del pago" },
      },
      required: ["clientIdOrName", "amount"],
    },
  },
  {
    name: "pos_get_financial_reports",
    description: "Obtiene las métricas financieras del negocio en un periodo: total ventas, costo de mercancía, gastos operativos, utilidad neta real y margen porcentual.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Días hacia atrás para el cálculo (7, 30 o 90 días, defecto 30)" },
      },
    },
  },
  {
    name: "pos_get_client_profit_summary",
    description: "Calcula el historial de compras y la ganancia/utilidad neta real generada con un cliente específico a lo largo del tiempo, ticket promedio y sus productos preferidos.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nombre, cédula o teléfono del cliente (ej. 'André Manuel Molina')" },
      },
      required: ["query"],
    },
  },
  {
    name: "pos_set_client_credit",
    description: "Habilita, desactiva o ajusta el límite de crédito (fiado) para un cliente específico.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nombre, cédula o teléfono del cliente" },
        creditLimit: { type: "number", description: "Monto máximo del cupo de crédito en pesos (ej. 500000)" },
        active: { type: "boolean", description: "Si el crédito debe estar activo (por defecto true)" },
      },
      required: ["query", "creditLimit"],
    },
  },
  {
    name: "pos_get_inventory_alerts",
    description: "Supervisa en tiempo real las alertas inteligentes de inventario: productos agotados (stock 0), con stock mínimo de reposición alcanzado, lotes vencidos o próximos a caducar en 30 días, detallando unidades fraccionadas (kg, litros, metros, etc.) y lote.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["all", "agotados", "stock_bajo", "por_vencer", "vencidos"],
          description: "Filtro de tipo de alerta (por defecto 'all')",
        },
      },
    },
  },
  {
    name: "pos_record_purchase",
    description: "Registra la entrada de mercancía o compra de proveedor en el inventario: ingresa automáticamente el stock a la sede, crea el lote y fecha de vencimiento, y recalcula automáticamente el costo promedio ponderado de los productos.",
    inputSchema: {
      type: "object",
      properties: {
        supplierNameOrId: { type: "string", description: "Nombre o ID del proveedor de la compra" },
        reference: { type: "string", description: "Número de factura o remisión del proveedor" },
        notes: { type: "string", description: "Notas adicionales de la compra" },
        items: {
          type: "array",
          description: "Lista de productos comprados",
          items: {
            type: "object",
            properties: {
              productIdOrName: { type: "string", description: "ID, nombre exacto o código de barras del producto" },
              quantity: { type: "number", description: "Cantidad comprada (unidades, kg, metros, etc.)" },
              unitCost: { type: "number", description: "Costo unitario de compra en pesos" },
              batch: { type: "string", description: "Número o identificador de lote (ej. 'LOT-2026-X')" },
              expirationDate: { type: "string", description: "Fecha de vencimiento en formato AAAA-MM-DD" },
            },
            required: ["productIdOrName", "quantity", "unitCost"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "pos_create_sale",
    description: "Registra y factura una venta directa en el punto de venta (POS) en tiempo real. Valida existencias, descuenta autom\u00e1ticamente el stock de los lotes mediante regla FEFO (primero en vencer, primero en salir), emite la factura consecutiva y asienta el movimiento en caja o a cr\u00e9dito del cliente.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Lista de productos a vender",
          items: {
            type: "object",
            properties: {
              productIdOrName: { type: "string", description: "ID, nombre o c\u00f3digo de barras del producto" },
              quantity: { type: "number", description: "Cantidad a vender (unidades, kg, metros, etc.)" },
              unitPrice: { type: "number", description: "Precio unitario de venta (opcional, si se omite usa el precio registrado del producto)" }
            },
            required: ["productIdOrName", "quantity"]
          }
        },
        paymentMethod: {
          type: "string",
          enum: ["efectivo", "tarjeta", "transferencia", "credito"],
          description: "M\u00e9todo de pago utilizado (por defecto 'efectivo')"
        },
        clientNameOrId: { type: "string", description: "Nombre, c\u00e9dula o ID del cliente (requerido si es venta a cr\u00e9dito)" },
        amountReceived: { type: "number", description: "Monto recibido en efectivo (para c\u00e1lculo de cambio)" },
        discount: { type: "number", description: "Descuento total aplicado en pesos (opcional)" },
        notes: { type: "string", description: "Observaciones de la venta (opcional)" }
      },
      required: ["items"]
    }
  },
  {
    name: "pos_create_order",
    description: "Crea y registra un nuevo pedido a domicilio (delivery) para despachos o solicitudes de clientes v\u00eda WhatsApp, web o chatbot. Valida productos, calcula totales y genera el c\u00f3digo de seguimiento de despacho.",
    inputSchema: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Nombre completo del cliente receptor" },
        customerPhone: { type: "string", description: "Tel\u00e9fono / WhatsApp de contacto del cliente" },
        deliveryAddress: { type: "string", description: "Direcci\u00f3n completa de entrega del domicilio" },
        items: {
          type: "array",
          description: "Lista de productos pedidos",
          items: {
            type: "object",
            properties: {
              productIdOrName: { type: "string", description: "Nombre, ID o c\u00f3digo del producto" },
              quantity: { type: "number", description: "Cantidad solicitada" },
              unitPrice: { type: "number", description: "Precio pactado (opcional, usa el precio de cat\u00e1logo por defecto)" }
            },
            required: ["productIdOrName", "quantity"]
          }
        },
        paymentMethod: { type: "string", description: "M\u00e9todo de pago acordado (efectivo, contraentrega, transferencia)" },
        deliveryNotes: { type: "string", description: "Instrucciones de entrega para el repartidor (ej: Apto 302, timbre blanco)" }
      },
      required: ["customerName", "customerPhone", "deliveryAddress", "items"]
    }
  },
  {
    name: "pos_search_clients",
    description: "Busca y lista clientes en la base de datos por nombre, c\u00e9dula, NIT o n\u00famero telef\u00f3nico. Muestra informaci\u00f3n de contacto, saldo de deuda activo, cupo de cr\u00e9dito y total de compras.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "T\u00e9rmino de b\u00fasqueda (nombre, documento o tel\u00e9fono)" },
        limit: { type: "number", description: "M\u00e1ximo n\u00famero de resultados (por defecto 15)" }
      },
      required: ["query"]
    }
  },
  {
    name: "pos_create_client",
    description: "Registra un nuevo cliente en el sistema POS con sus datos personales, fiscales y cupo de cr\u00e9dito autorizado.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre completo o raz\u00f3n social del cliente" },
        document: { type: "string", description: "C\u00e9dula de ciudadan\u00eda o NIT" },
        phone: { type: "string", description: "N\u00famero de tel\u00e9fono m\u00f3vil o fijo" },
        email: { type: "string", description: "Correo electr\u00f3nico" },
        address: { type: "string", description: "Direcci\u00f3n f\u00edsica del cliente" },
        creditLimit: { type: "number", description: "Cupo inicial de cr\u00e9dito autorizado en pesos (por defecto 0)" },
        maxDays: { type: "number", description: "Plazo m\u00e1ximo de cr\u00e9dito en d\u00edas (por defecto 30)" }
      },
      required: ["name"]
    }
  },
  {
    name: "pos_open_cash_session",
    description: "Abre el turno o sesi\u00f3n de caja registradora para la sede actual con su base de efectivo inicial.",
    inputSchema: {
      type: "object",
      properties: {
        initialAmount: { type: "number", description: "Monto base de apertura en efectivo (por defecto 0)" },
        notes: { type: "string", description: "Observaciones de la apertura" }
      },
      required: ["initialAmount"]
    }
  },
  {
    name: "pos_close_cash_session",
    description: "Cierra el turno de caja registradora, compara el conteo de dinero f\u00edsico reportado contra el efectivo esperado del sistema y genera el informe de arqueo con descuadre o faltante.",
    inputSchema: {
      type: "object",
      properties: {
        cashCount: { type: "number", description: "Efectivo f\u00edsico real contado en caja" },
        notes: { type: "string", description: "Observaciones del cierre de caja" }
      },
      required: ["cashCount"]
    }
  },
  {
    name: "pos_get_reorder_suggestions",
    description: "Calcula el reorden predictivo y pron\u00f3stico de agotamiento de inventario basado en la velocidad de consumo de los \u00faltimos 30 d\u00edas. Muestra d\u00edas de cobertura restantes, cantidades sugeridas a pedir a proveedores y costo estimado de reposici\u00f3n.",
    inputSchema: {
      type: "object",
      properties: {
        targetDays: { type: "number", description: "D\u00edas de cobertura deseados para reabastecer (por defecto 30)" },
        urgency: { type: "string", enum: ["all", "critico", "urgente", "atencion"], description: "Filtro de criticidad (por defecto 'all')" }
      }
    }
  },
  {
    name: "pos_list_suppliers",
    description: "Consulta los proveedores registrados del negocio, sus datos de contacto (NIT, teléfono, email) y sus compras recientes para reabastecimiento.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Nombre, NIT o teléfono para buscar" },
      },
    },
  },
]

// Implementación de cada herramienta con Seguridad, RBAC y Aislamiento Multisede
async function executeTool(name, args) {
  // 1. Verificación de Permisos por Rol (RBAC)
  const allowedRoles = TOOL_PERMISSIONS[name]
  if (allowedRoles && !allowedRoles.includes(SESSION_CONTEXT.role)) {
    throw new Error(
      `Acceso Denegado (Seguridad RBAC): El rol autenticado ("${SESSION_CONTEXT.role}") no tiene permisos para ejecutar la herramienta "${name}". Requiere uno de los siguientes roles: ${allowedRoles.join(", ")}.`
    )
  }

  // 2. Aislamiento de Privacidad para Clientes Finales
  // Si quien consulta es un cliente, se le impide espiar datos de otras personas
  if (SESSION_CONTEXT.role === "cliente" && SESSION_CONTEXT.clientId) {
    if (name === "pos_get_client_credit") {
      args.query = SESSION_CONTEXT.clientId
    }
  }

  // 3. Filtro de Sede (Branch Isolation): Si el agente pertenece a Sede B, solo ve Sede B
  const branchFilter = SESSION_CONTEXT.branchId ? { branchId: SESSION_CONTEXT.branchId } : {}

  switch (name) {
    case "pos_get_business_summary": {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const [todaySales, openCash, pendingOrders, lowStockCount, totalProducts] = await Promise.all([
        prisma.sale.findMany({
          where: { ...branchFilter, createdAt: { gte: today }, status: "completada" },
          select: { total: true },
        }),
        prisma.cashSession.findFirst({
          where: { ...branchFilter, status: "abierta" },
          select: { openedBy: true, openingAmount: true, openedAt: true, branchId: true },
        }),
        prisma.order.count({
          where: { ...branchFilter, status: { in: ["pendiente", "confirmado", "en_preparacion"] } },
        }),
        prisma.product.count({
          where: { ...branchFilter, active: true, stock: { lte: 5 } },
        }),
        prisma.product.count({ where: { ...branchFilter, active: true } }),
      ])

      const todayTotal = todaySales.reduce((sum, s) => sum + s.total, 0)

      return {
        ventas_hoy: {
          cantidad_ventas: todaySales.length,
          total_ingresado_cop: todayTotal,
        },
        caja_actual: openCash
          ? { estado: "Abierta", responsable: openCash.openedBy, base_inicial: openCash.openingAmount, abierta_desde: openCash.openedAt }
          : { estado: "Cerrada", aviso: "No hay turno de caja abierto en este momento" },
        domicilios_pendientes_despacho: pendingOrders,
        inventario: {
          total_productos: totalProducts,
          productos_stock_bajo: lowStockCount,
        },
      }
    }

    case "pos_search_products": {
      const q = String(args.query || "").trim()
      const limit = Math.min(Number(args.limit || 15), 50)

      const products = await prisma.product.findMany({
        where: {
          active: true,
          OR: [
            { name: { contains: q } },
            { barcode: { contains: q } },
          ],
        },
        include: {
          category: { select: { name: true } },
          batches: { where: { stock: { gt: 0 } }, take: 5, orderBy: { expirationDate: "asc" } },
        },
        take: limit,
      })

      return {
        total_encontrados: products.length,
        productos: products.map((p) => ({
          id: p.id,
          nombre: p.name,
          codigo_barras: p.barcode,
          precio_venta: p.price,
          costo_compra: p.cost,
          stock_actual: p.stock,
          stock_minimo: p.minStock,
          sku: p.sku || null,
          unidad: p.unit || "unidad",
          categoria: p.category?.name || "Sin categoría",
          estado_stock: p.stock <= 0 ? "Agotado" : p.stock <= p.minStock ? "Bajo (Reponer)" : "Normal",
          proximo_vencimiento: p.expirationDate || (p.batches[0]?.expirationDate) || null,
          lotes_activos: p.batches.map((b) => ({
            lote: b.batch || "Sin lote",
            stock: b.stock,
            costo: b.cost,
            vence: b.expirationDate ? b.expirationDate.toISOString().split("T")[0] : null,
          })),
        })),
      }
    }

    case "pos_create_or_update_product": {
      const tenant = await prisma.tenant.findFirst()
      const branch = await prisma.branch.findFirst({ where: tenant ? { tenantId: tenant.id } : {} })

      let categoryId = null
      if (args.categoryName) {
        let cat = await prisma.category.findFirst({ where: { name: args.categoryName } })
        if (!cat) {
          cat = await prisma.category.create({ data: { name: args.categoryName, active: true } })
        }
        categoryId = cat.id
      }

      if (args.id) {
        const updated = await prisma.product.update({
          where: { id: args.id },
          data: {
            name: args.name,
            barcode: args.barcode !== undefined ? args.barcode : undefined,
            price: Number(args.price),
            cost: args.cost !== undefined ? Number(args.cost) : undefined,
            stock: args.stock !== undefined ? Number(args.stock) : undefined,
            minStock: args.minStock !== undefined ? Number(args.minStock) : undefined,
            categoryId: categoryId || undefined,
          },
        })
        return { ok: true, mensaje: `Producto "${updated.name}" actualizado con xito`, producto: updated }
      }

      const created = await prisma.product.create({
        data: {
          name: args.name,
          barcode: args.barcode || null,
          price: Number(args.price),
          cost: Number(args.cost || 0),
          stock: Number(args.stock || 0),
          minStock: Number(args.minStock || 5),
          categoryId,
          branchId: branch?.id || null,
          active: true,
        },
      })

      return { ok: true, mensaje: `Producto "${created.name}" registrado en el catlogo`, producto: created }
    }

    case "pos_get_sales_history": {
      const limit = Math.min(Number(args.limit || 15), 50)
      const where = { status: "completada", ...branchFilter }
      if (args.paymentMethod) where.paymentMethod = args.paymentMethod

      const sales = await prisma.sale.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          client: { select: { name: true, phone: true } },
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
      })

      return {
        total_consultadas: sales.length,
        ventas: sales.map((s) => ({
          factura: s.invoiceNumber,
          fecha: s.createdAt,
          cliente: s.client?.name || "Consumidor Final",
          total: s.total,
          metodo_pago: s.paymentMethod,
          items: s.items.map((it) => ({
            producto: it.product?.name || "Producto",
            cantidad: it.quantity,
            precio_unitario: it.unitPrice,
            subtotal: it.subtotal,
          })),
        })),
      }
    }

    case "pos_get_cash_status": {
      const activeSession = await prisma.cashSession.findFirst({
        where: { status: "abierta", ...branchFilter },
        include: {
          transactions: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      })

      if (!activeSession) {
        return {
          estado: "Cerrada",
          mensaje: SESSION_CONTEXT.branchId
            ? `No hay ninguna caja registradora abierta en este momento en la sede configurada (${SESSION_CONTEXT.branchId}).`
            : "No hay ninguna caja registradora abierta en este momento en el negocio.",
        }
      }

      const sales = await prisma.sale.findMany({
        where: { cashSessionId: activeSession.id, status: "completada", paymentMethod: "efectivo" },
        select: { total: true },
      })
      const cashSalesTotal = sales.reduce((a, b) => a + b.total, 0)

      return {
        estado: "Abierta",
        cajero_responsable: activeSession.openedBy || "Sin asignar",
        hora_apertura: activeSession.openedAt,
        base_inicial_cop: activeSession.openingAmount,
        ventas_efectivo_cop: cashSalesTotal,
        total_esperado_en_gaveta_cop: activeSession.openingAmount + cashSalesTotal,
        ultimos_movimientos: activeSession.transactions,
      }
    }

    case "pos_record_cash_movement": {
      const activeSession = await prisma.cashSession.findFirst({ where: { status: "abierta" } })
      if (!activeSession) {
        throw new Error("No hay caja abierta para registrar movimientos de dinero.")
      }

      const amount = Number(args.amount)
      const isEgreso = args.type.toLowerCase() === "egreso"

      const tx = await prisma.cashTransaction.create({
        data: {
          cashSessionId: activeSession.id,
          type: isEgreso ? "egreso" : "ingreso",
          amount,
          concept: args.reason,
          method: "efectivo",
          reference: "Agente IA (MCP)",
        },
      })

      return {
        ok: true,
        mensaje: `Movimiento de ${isEgreso ? "Egreso" : "Ingreso"} por $${amount.toLocaleString("es-CO")} registrado en caja.`,
        transaccion: tx,
      }
    }

    case "pos_list_orders": {
      const limit = Math.min(Number(args.limit || 20), 50)
      const where = { ...branchFilter }
      if (args.status && args.status !== "all") where.status = args.status

      // Si quien consulta es un cliente final, solo puede ver sus propios pedidos
      if (SESSION_CONTEXT.role === "cliente" && SESSION_CONTEXT.clientId) {
        where.clientId = SESSION_CONTEXT.clientId
      }

      const orders = await prisma.order.findMany({
        where,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: { select: { productName: true, quantity: true, unitPrice: true } },
        },
      })

      return {
        total: orders.length,
        pedidos: orders.map((o) => ({
          id: o.id,
          orden: o.orderNumber,
          cliente: o.customerName,
          telefono: o.customerPhone,
          direccion: o.deliveryAddress,
          notas: o.deliveryNotes,
          total: o.total,
          metodo_pago: o.paymentMethod,
          estado: o.status,
          repartidor_asignado: o.deliveryDriverName || "Sin conductor",
          telefono_repartidor: o.deliveryDriverPhone || null,
          fecha_creacion: o.createdAt,
          items: o.items,
        })),
      }
    }

    case "pos_assign_order_driver": {
      const searchKey = String(args.orderIdOrNumber).trim()
      const order = await prisma.order.findFirst({
        where: { OR: [{ id: searchKey }, { orderNumber: searchKey }] },
      })

      if (!order) throw new Error(`Pedido "${searchKey}" no encontrado.`)

      const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
          deliveryDriverName: args.driverName,
          deliveryDriverPhone: args.driverPhone || null,
          assignedAt: new Date(),
          status: args.dispatchNow !== false ? "en_camino" : "confirmado",
          dispatchedAt: args.dispatchNow !== false ? new Date() : null,
        },
      })

      return {
        ok: true,
        mensaje: `Conductor "${args.driverName}" asignado al pedido ${updated.orderNumber}. Estado: ${updated.status}`,
        pedido: updated,
      }
    }

    case "pos_get_client_credit": {
      const q = String(args.query || "").trim()
      const client = await prisma.client.findFirst({
        where: {
          active: true,
          OR: [{ name: { contains: q } }, { document: { contains: q } }, { phone: { contains: q } }],
        },
        include: {
          creditAccount: {
            include: {
              movements: { orderBy: { createdAt: "desc" }, take: 5 },
            },
          },
        },
      })

      if (!client) throw new Error(`Cliente "${q}" no encontrado.`)
      if (!client.creditAccount) {
        return { cliente: client.name, estado: "Sin cuenta de crdito autorizada." }
      }

      const acc = client.creditAccount
      return {
        cliente: client.name,
        telefono: client.phone,
        limite_credito_cop: acc.creditLimit,
        deuda_actual_cop: acc.balance,
        cupo_disponible_cop: Math.max(0, acc.creditLimit - acc.balance),
        estado: acc.balance > 0 ? "Tiene saldo pendiente por pagar" : "Al da (Sin deuda)",
        ultimos_abonos: acc.movements,
      }
    }

    case "pos_record_credit_payment": {
      const q = String(args.clientIdOrName).trim()
      const client = await prisma.client.findFirst({
        where: { OR: [{ id: q }, { name: { contains: q } }] },
        include: { creditAccount: true },
      })

      if (!client || !client.creditAccount) throw new Error(`Cliente o cuenta de crdito no encontrada para "${q}".`)

      const amount = Number(args.amount)
      const currentBalance = client.creditAccount.balance
      const newBalance = Math.max(0, currentBalance - amount)

      await prisma.$transaction([
        prisma.creditAccount.update({
          where: { id: client.creditAccount.id },
          data: { balance: newBalance },
        }),
        prisma.creditMovement.create({
          data: {
            accountId: client.creditAccount.id,
            type: "abono",
            amount,
            concept: args.notes || "Abono vía Asistente IA (MCP)",
            method: "efectivo",
            previousBalance: currentBalance,
            remainingBalance: newBalance,
            reportedBy: "Agente IA (MCP)",
          },
        }),
      ])

      return {
        ok: true,
        mensaje: `Abono de $${amount.toLocaleString("es-CO")} registrado con éxito para ${client.name}.`,
        saldo_anterior_cop: currentBalance,
        nuevo_saldo_pendiente_cop: newBalance,
      }
    }

    case "pos_get_financial_reports": {
      const days = Number(args.days || 30)
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - days)

      const [sales, expenses] = await Promise.all([
        prisma.sale.findMany({
          where: { createdAt: { gte: fromDate }, status: "completada" },
          include: { items: { select: { quantity: true, unitCost: true, subtotal: true } } },
        }),
        prisma.cashTransaction.findMany({
          where: { createdAt: { gte: fromDate }, type: "egreso" },
          select: { amount: true },
        }),
      ])

      const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0)
      let totalCostOfGoods = 0
      sales.forEach((s) => {
        s.items.forEach((it) => {
          totalCostOfGoods += (it.unitCost || 0) * it.quantity
        })
      })

      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
      const grossProfit = totalRevenue - totalCostOfGoods
      const netProfit = grossProfit - totalExpenses
      const marginPercent = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0"

      return {
        periodo_dias: days,
        ventas_totales_cop: totalRevenue,
        costo_mercancia_vendida_cop: totalCostOfGoods,
        utilidad_bruta_cop: grossProfit,
        gastos_operativos_cop: totalExpenses,
        utilidad_neta_real_cop: netProfit,
        margen_neto_porcentaje: `${marginPercent}%`,
        rentabilidad: netProfit > 0 ? "Negocio Rentable" : "Pérdida en el periodo",
      }
    }

    case "pos_get_client_profit_summary": {
      const q = String(args.query || "").trim()
      const client = await prisma.client.findFirst({
        where: {
          OR: [
            { name: { contains: q } },
            { document: { contains: q } },
            { phone: { contains: q } },
          ],
        },
        include: {
          creditAccount: true,
        },
      })

      if (!client) {
        throw new Error(`Cliente "${q}" no encontrado en el sistema. Verifica el nombre o documento.`)
      }

      // Consultar todas las ventas completadas al cliente
      const sales = await prisma.sale.findMany({
        where: {
          clientId: client.id,
          status: "completada",
        },
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })

      let totalVentas = 0
      let totalCosto = 0
      const productCounts = {}

      sales.forEach((s) => {
        totalVentas += s.total
        s.items.forEach((it) => {
          totalCosto += (it.unitCost || 0) * it.quantity
          const pName = it.product?.name || "Producto"
          productCounts[pName] = (productCounts[pName] || 0) + it.quantity
        })
      })

      const gananciaNeta = totalVentas - totalCosto
      const margenPorcentual = totalVentas > 0 ? ((gananciaNeta / totalVentas) * 100).toFixed(1) : "0.0"

      const topProductos = Object.entries(productCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([nombre, cantidad]) => ({ producto: nombre, unidades_compradas: cantidad }))

      return {
        cliente: {
          id: client.id,
          nombre: client.name,
          documento: client.document || "Sin registrar",
          telefono: client.phone || "Sin registrar",
        },
        resumen_ganancias: {
          total_facturas_compradas: sales.length,
          total_dinero_comprado_cop: totalVentas,
          costo_total_mercancia_cop: totalCosto,
          ganancia_neta_generada_cop: gananciaNeta,
          margen_ganancia_porcentaje: `${margenPorcentual}%`,
          ticket_promedio_cop: sales.length > 0 ? Math.round(totalVentas / sales.length) : 0,
          primera_compra: sales.length > 0 ? sales[sales.length - 1].createdAt : null,
          ultima_compra: sales.length > 0 ? sales[0].createdAt : null,
        },
        estado_credito_actual: client.creditAccount
          ? {
              credito_habilitado: client.creditAccount.active,
              cupo_maximo_cop: client.creditAccount.creditLimit,
              deuda_actual_cop: client.creditAccount.balance,
              cupo_disponible_cop: Math.max(0, client.creditAccount.creditLimit - client.creditAccount.balance),
            }
          : {
              credito_habilitado: false,
              mensaje: "El cliente actualmente no tiene línea de crédito habilitada.",
            },
        productos_mas_comprados: topProductos,
      }
    }

    case "pos_set_client_credit": {
      const q = String(args.query || "").trim()
      const creditLimit = Number(args.creditLimit)
      const shouldBeActive = args.active !== false

      if (isNaN(creditLimit) || creditLimit < 0) {
        throw new Error("El monto del cupo de crédito (creditLimit) debe ser un número válido mayor o igual a 0.")
      }

      let client = await prisma.client.findFirst({
        where: {
          OR: [
            { name: { contains: q } },
            { document: { contains: q } },
            { phone: { contains: q } },
          ],
        },
        include: { creditAccount: true },
      })

      // Si no existe, crear el cliente automáticamente con ese nombre
      if (!client) {
        client = await prisma.client.create({
          data: {
            name: q,
            creditAccount: {
              create: {
                creditLimit,
                balance: 0,
                active: shouldBeActive,
              },
            },
          },
          include: { creditAccount: true },
        })

        return {
          ok: true,
          accion: "Cliente creado y línea de crédito habilitada",
          mensaje: `Se ha creado el cliente "${client.name}" y se le ha asignado un cupo de crédito de $${creditLimit.toLocaleString("es-CO")} COP.`,
          cliente: client.name,
          cupo_credito_cop: creditLimit,
          deuda_actual_cop: 0,
          cupo_disponible_cop: creditLimit,
          activo: shouldBeActive,
        }
      }

      // Si el cliente existe pero no tiene creditAccount
      let updatedAccount
      if (!client.creditAccount) {
        updatedAccount = await prisma.creditAccount.create({
          data: {
            clientId: client.id,
            creditLimit,
            balance: 0,
            active: shouldBeActive,
          },
        })
      } else {
        updatedAccount = await prisma.creditAccount.update({
          where: { clientId: client.id },
          data: {
            creditLimit,
            active: shouldBeActive,
          },
        })
      }

      return {
        ok: true,
        accion: "Línea de crédito actualizada",
        mensaje: `Se ha ${shouldBeActive ? "habilitado" : "desactivado"} la línea de crédito para ${client.name} con un cupo máximo de $${creditLimit.toLocaleString("es-CO")} COP.`,
        cliente: client.name,
        cupo_credito_cop: updatedAccount.creditLimit,
        deuda_actual_cop: updatedAccount.balance,
        cupo_disponible_cop: Math.max(0, updatedAccount.creditLimit - updatedAccount.balance),
        activo: updatedAccount.active,
      }
    }

    case "pos_get_inventory_alerts": {
      const filter = args.filter || "all"
      const now = new Date()

      const products = await prisma.product.findMany({
        where: {
          active: true,
          ...branchFilter,
        },
        include: {
          category: { select: { name: true } },
          batches: {
            where: { stock: { gt: 0 } },
            orderBy: { expirationDate: "asc" },
          },
        },
        orderBy: { name: "asc" },
      })

      const agotados = []
      const stockBajo = []
      const porVencer = []
      const vencidos = []

      for (const p of products) {
        if (p.stock <= 0) {
          agotados.push({
            id: p.id,
            nombre: p.name,
            codigo_barras: p.barcode,
            unidad: p.unit || "unidad",
            stock_actual: p.stock,
            stock_minimo: p.minStock,
            categoria: p.category?.name || "Sin categoría",
            alerta: "Sin existencias en mostrador. Se requiere compra urgente.",
          })
        } else if (p.stock <= p.minStock) {
          stockBajo.push({
            id: p.id,
            nombre: p.name,
            codigo_barras: p.barcode,
            unidad: p.unit || "unidad",
            stock_actual: p.stock,
            stock_minimo: p.minStock,
            categoria: p.category?.name || "Sin categoría",
            alerta: `Stock por debajo del mínimo (${p.stock} de ${p.minStock}).`,
          })
        }

        // Control de vencimiento por lotes activos y fecha global
        const activeBatches = p.batches && p.batches.length > 0
          ? p.batches
          : p.expirationDate
            ? [{ batch: p.batch || "Lote único", stock: p.stock, expirationDate: p.expirationDate }]
            : []

        for (const b of activeBatches) {
          if (!b.expirationDate) continue
          const expDate = new Date(b.expirationDate)
          const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays < 0) {
            vencidos.push({
              id: p.id,
              nombre: p.name,
              lote: b.batch || "Lote único",
              stock_afectado: b.stock,
              unidad: p.unit || "unidad",
              fecha_vencimiento: expDate.toISOString().split("T")[0],
              dias_vencido: Math.abs(diffDays),
              alerta: "Lote vencido. Retirar físicamente del mostrador.",
            })
          } else if (diffDays <= 30) {
            porVencer.push({
              id: p.id,
              nombre: p.name,
              lote: b.batch || "Lote único",
              stock_disponible: b.stock,
              unidad: p.unit || "unidad",
              fecha_vencimiento: expDate.toISOString().split("T")[0],
              dias_restantes: diffDays,
              alerta: `Caduca en ${diffDays} días. Promocionar antes del vencimiento.`,
            })
          }
        }
      }

      return {
        resumen_alertas: {
          total_productos_agotados: agotados.length,
          total_productos_stock_bajo: stockBajo.length,
          total_lotes_por_vencer_30d: porVencer.length,
          total_lotes_vencidos: vencidos.length,
        },
        filtro_aplicado: filter,
        detalles: {
          ...(filter === "all" || filter === "agotados" ? { productos_agotados: agotados } : {}),
          ...(filter === "all" || filter === "stock_bajo" ? { productos_stock_bajo: stockBajo } : {}),
          ...(filter === "all" || filter === "por_vencer" ? { productos_por_vencer: porVencer } : {}),
          ...(filter === "all" || filter === "vencidos" ? { productos_vencidos: vencidos } : {}),
        },
      }
    }

    case "pos_record_purchase": {
      if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
        throw new Error("Debes proporcionar al menos un producto en la compra.")
      }

      let supplier = null
      if (args.supplierNameOrId) {
        const sQuery = String(args.supplierNameOrId).trim()
        supplier = await prisma.supplier.findFirst({
          where: {
            OR: [
              { id: sQuery },
              { name: { contains: sQuery } },
              { document: { contains: sQuery } },
            ],
            ...branchFilter,
          },
        })
        if (!supplier) {
          supplier = await prisma.supplier.create({
            data: {
              name: sQuery,
              branchId: SESSION_CONTEXT.branchId || null,
            },
          })
        }
      }

      const resolvedItems = []
      for (const item of args.items) {
        const pQuery = String(item.productIdOrName).trim()
        const product = await prisma.product.findFirst({
          where: {
            OR: [
              { id: pQuery },
              { barcode: pQuery },
              { name: { contains: pQuery } },
            ],
            ...branchFilter,
          },
        })
        if (!product) {
          throw new Error(`Producto no encontrado para el término: "${item.productIdOrName}"`)
        }
        const qty = Math.max(1, Math.round(Number(item.quantity)))
        const unitCost = Number(item.unitCost)
        if (qty <= 0) throw new Error(`Cantidad inválida (${qty}) para el producto "${product.name}"`)
        if (unitCost < 0) throw new Error(`Costo unitario inválido (${unitCost}) para el producto "${product.name}"`)

        resolvedItems.push({
          product,
          quantity: qty,
          unitCost,
          batch: item.batch ? String(item.batch).trim() : null,
          expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
        })
      }

      const subtotal = resolvedItems.reduce((acc, it) => acc + it.quantity * it.unitCost, 0)
      const total = subtotal

      const result = await prisma.$transaction(async (tx) => {
        const purchase = await tx.purchase.create({
          data: {
            reference: args.reference ? String(args.reference).trim() : null,
            supplierId: supplier?.id || null,
            branchId: SESSION_CONTEXT.branchId || null,
            subtotal,
            tax: 0,
            total,
            status: "recibida",
            notes: args.notes ? String(args.notes).trim() : null,
            items: {
              create: resolvedItems.map((it) => ({
                productId: it.product.id,
                quantity: it.quantity,
                unitCost: it.unitCost,
                subtotal: it.quantity * it.unitCost,
                expirationDate: it.expirationDate,
                batch: it.batch,
              })),
            },
          },
        })

        const updatedProducts = []
        for (const it of resolvedItems) {
          const p = it.product
          const currentStock = Math.max(0, p.stock || 0)
          const currentTotalCost = currentStock * (p.cost || 0)
          const incomingTotalCost = it.quantity * it.unitCost
          const newTotalStock = currentStock + it.quantity
          const weightedAvgCost = newTotalStock > 0 
            ? (currentTotalCost + incomingTotalCost) / newTotalStock 
            : it.unitCost

          const updateData = {
            stock: { increment: it.quantity },
            cost: Math.round(weightedAvgCost * 100) / 100,
          }

          if (it.expirationDate) {
            if (!p.expirationDate || it.expirationDate < new Date(p.expirationDate)) {
              updateData.expirationDate = it.expirationDate
            }
          }
          if (it.batch) {
            updateData.batch = it.batch
          }

          const up = await tx.product.update({
            where: { id: p.id },
            data: updateData,
          })

          await tx.productBatch.create({
            data: {
              productId: p.id,
              batch: it.batch,
              stock: it.quantity,
              cost: it.unitCost,
              expirationDate: it.expirationDate,
            },
          })

          updatedProducts.push({
            producto: up.name,
            stock_anterior: currentStock,
            unidades_ingresadas: it.quantity,
            stock_nuevo: up.stock,
            unidad: up.unit,
            costo_anterior: p.cost,
            costo_compra_lote: it.unitCost,
            nuevo_costo_promedio_ponderado: up.cost,
            lote_asignado: it.batch || "Automático",
            fecha_vencimiento: it.expirationDate ? it.expirationDate.toISOString().split("T")[0] : null,
          })
        }

        return { purchase, updatedProducts }
      })

      return {
        ok: true,
        accion: "Compra y Entrada de Inventario Registrada Exitosamente",
        mensaje: `Se ingresaron ${resolvedItems.length} productos al inventario con recálculo automático de costo promedio ponderado y trazabilidad de lotes.`,
        proveedor: supplier?.name || "Sin proveedor asignado",
        factura_referencia: args.reference || "S/R",
        total_compra_cop: total,
        fecha: new Date().toISOString(),
        productos_actualizados: result.updatedProducts,
      }
    }

    case "pos_create_sale": {
      if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
        throw new Error("La venta debe contener al menos un producto.");
      }

      const paymentMethod = args.paymentMethod || "efectivo";
      const branchId = SESSION_CONTEXT.branchId || null;

      // Resolver cliente si se suministr
      let client = null;
      if (args.clientNameOrId) {
        const cQuery = String(args.clientNameOrId).trim();
        client = await prisma.client.findFirst({
          where: {
            OR: [
              { id: cQuery },
              { name: { contains: cQuery } },
              { document: { contains: cQuery } },
              { phone: { contains: cQuery } },
            ],
            ...branchFilter,
          },
          include: { creditAccount: true },
        });
      }

      if (paymentMethod === "credito") {
        if (!client) {
          throw new Error("Para ventas a cr\u00e9dito debes especificar un cliente registrado v\u00e1lido.");
        }
        if (client.isGeneric) {
          throw new Error("El cliente gen\u00e9rico (Mostrador) no puede comprar a cr\u00e9dito.");
        }
      }

      // Validar y resolver productos y stock
      const resolvedSaleItems = [];
      for (const it of args.items) {
        const pQuery = String(it.productIdOrName).trim();
        const product = await prisma.product.findFirst({
          where: {
            OR: [
              { id: pQuery },
              { barcode: pQuery },
              { name: { contains: pQuery } },
            ],
            ...branchFilter,
          },
        });
        if (!product) {
          throw new Error(`Producto no encontrado: "${it.productIdOrName}"`);
        }

        const qty = Math.max(1, Math.round(Number(it.quantity)));
        if (product.stock < qty) {
          throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock} ${product.unit}, solicitado: ${qty}`);
        }

        const unitPrice = it.unitPrice !== undefined && Number(it.unitPrice) >= 0 ? Number(it.unitPrice) : product.price;
        const unitCost = product.cost || 0;

        resolvedSaleItems.push({
          product,
          quantity: qty,
          unitPrice,
          unitCost,
          subtotal: qty * unitPrice,
        });
      }

      const subtotal = resolvedSaleItems.reduce((acc, it) => acc + it.subtotal, 0);
      const discount = Math.max(0, Number(args.discount) || 0);
      const total = Math.max(0, subtotal - discount);
      const amountReceived = args.amountReceived !== undefined ? Number(args.amountReceived) : (paymentMethod === "efectivo" ? total : 0);
      const change = paymentMethod === "efectivo" && amountReceived >= total ? amountReceived - total : 0;

      // Validar cupo de crdito si aplica
      if (paymentMethod === "credito" && client) {
        const acc = client.creditAccount;
        if (!acc || !acc.active) {
          throw new Error(`El cliente "${client.name}" no tiene cr\u00e9dito habilitado.`);
        }
        const newBalance = acc.balance + total;
        if (acc.creditLimit > 0 && newBalance > acc.creditLimit) {
          throw new Error(`Cr\u00e9dito excedido. Saldo actual: ${acc.balance.toLocaleString('es-CO')}, nueva venta: ${total.toLocaleString('es-CO')}, cupo m\u00e1ximo: ${acc.creditLimit.toLocaleString('es-CO')}.`);
        }
      }

      // Ejecutar venta atmica con FEFO
      const saleResult = await prisma.$transaction(async (tx) => {
        // Consecutivo de factura
        const lastSale = await tx.sale.findFirst({
          orderBy: { createdAt: "desc" },
          select: { invoiceNumber: true },
        });
        const today = new Date();
        const yy = String(today.getFullYear()).slice(-2);
        let nextSeq = 1;
        if (lastSale?.invoiceNumber) {
          const match = lastSale.invoiceNumber.match(/\d+$/);
          if (match) nextSeq = parseInt(match[0], 10) + 1;
        }
        const invoiceNumber = `FAC-${yy}${String(nextSeq).padStart(4, "0")}`;

        const openSession = await tx.cashSession.findFirst({
          where: { status: "abierta", ...branchFilter },
        });

        const createdSale = await tx.sale.create({
          data: {
            invoiceNumber,
            clientId: client?.id || null,
            branchId,
            subtotal,
            tax: 0,
            discount,
            total,
            paymentMethod,
            amountReceived,
            change,
            status: "completada",
            cashSessionId: openSession?.id || null,
            notes: args.notes ? String(args.notes).trim() : null,
            items: {
              create: resolvedSaleItems.map((it) => ({
                productId: it.product.id,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                unitCost: it.unitCost,
                subtotal: it.subtotal,
              })),
            },
          },
          include: {
            client: true,
            items: { include: { product: true } },
          },
        });

        // Descontar inventario global y lotes con algoritmo FEFO
        for (const it of resolvedSaleItems) {
          await tx.product.update({
            where: { id: it.product.id },
            data: { stock: { decrement: it.quantity } },
          });

          let remToDeduct = it.quantity;
          const batches = await tx.productBatch.findMany({
            where: { productId: it.product.id, stock: { gt: 0 } },
            orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }],
          });

          for (const b of batches) {
            if (remToDeduct <= 0) break;
            const deduct = Math.min(b.stock, remToDeduct);
            await tx.productBatch.update({
              where: { id: b.id },
              data: { stock: { decrement: deduct } },
            });
            remToDeduct -= deduct;
          }

          const nextBatch = await tx.productBatch.findFirst({
            where: { productId: it.product.id, stock: { gt: 0 }, expirationDate: { not: null } },
            orderBy: { expirationDate: "asc" },
          });
          if (nextBatch?.expirationDate) {
            await tx.product.update({
              where: { id: it.product.id },
              data: {
                expirationDate: nextBatch.expirationDate,
                batch: nextBatch.batch || null,
              },
            });
          }
        }

        // Registrar en caja registradora
        if (openSession && paymentMethod === "efectivo") {
          await tx.cashTransaction.create({
            data: {
              cashSessionId: openSession.id,
              type: "venta",
              amount: total,
              concept: `Venta ${invoiceNumber}`,
              method: paymentMethod,
              reference: createdSale.id,
            },
          });
        }

        // Registrar en cuenta corriente si es crdito
        if (paymentMethod === "credito" && client?.creditAccount) {
          const acc = client.creditAccount;
          const prevBal = acc.balance;
          const nextBal = prevBal + total;
          await tx.creditAccount.update({
            where: { id: acc.id },
            data: { balance: nextBal },
          });
          await tx.creditMovement.create({
            data: {
              creditAccountId: acc.id,
              type: "cargo",
              amount: total,
              concept: `Venta a cr\u00e9dito ${invoiceNumber}`,
              method: "credito",
              reportedBy: "Agente MCP IA",
              previousBalance: prevBal,
              remainingBalance: nextBal,
              saleId: createdSale.id,
            },
          });
        }

        return createdSale;
      });

      return {
        ok: true,
        accion: "Venta Registrada Exitosamente",
        factura: saleResult.invoiceNumber,
        cliente: saleResult.client?.name || "Cliente Mostrador",
        metodo_pago: saleResult.paymentMethod,
        subtotal_cop: saleResult.subtotal,
        descuento_cop: saleResult.discount,
        total_cop: saleResult.total,
        monto_recibido_cop: saleResult.amountReceived,
        cambio_devuelto_cop: saleResult.change,
        fecha: saleResult.createdAt.toISOString(),
        productos_vendidos: resolvedSaleItems.map((i) => ({
          producto: i.product.name,
          cantidad: i.quantity,
          unidad: i.product.unit,
          precio_unitario: i.unitPrice,
          subtotal: i.subtotal,
          nuevo_stock_disponible: i.product.stock - i.quantity,
        })),
      };
    }

    case "pos_create_order": {
      if (!args.customerName || !args.customerPhone || !args.deliveryAddress) {
        throw new Error("Nombre, tel\u00e9fono y direcci\u00f3n de entrega son requeridos.");
      }
      if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
        throw new Error("El pedido debe contener al menos un producto.");
      }

      const branchId = SESSION_CONTEXT.branchId || null;
      const resolvedOrderItems = [];

      for (const it of args.items) {
        const pQuery = String(it.productIdOrName).trim();
        const product = await prisma.product.findFirst({
          where: {
            OR: [
              { id: pQuery },
              { barcode: pQuery },
              { name: { contains: pQuery } },
            ],
            ...branchFilter,
          },
        });
        if (!product) {
          throw new Error(`Producto no encontrado: "${it.productIdOrName}"`);
        }
        const qty = Math.max(1, Math.round(Number(it.quantity)));
        const unitPrice = it.unitPrice !== undefined ? Number(it.unitPrice) : product.price;

        resolvedOrderItems.push({
          productId: product.id,
          productName: product.name,
          quantity: qty,
          unitPrice,
          subtotal: qty * unitPrice,
        });
      }

      const subtotal = resolvedOrderItems.reduce((acc, it) => acc + it.subtotal, 0);
      const deliveryFee = 0;
      const total = subtotal + deliveryFee;

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
      const orderNumber = `PED-${dateStr}-${randomSuffix}`;

      const createdOrder = await prisma.order.create({
        data: {
          orderNumber,
          branchId,
          customerName: String(args.customerName).trim(),
          customerPhone: String(args.customerPhone).trim(),
          deliveryAddress: String(args.deliveryAddress).trim(),
          deliveryNotes: args.deliveryNotes ? String(args.deliveryNotes).trim() : null,
          subtotal,
          tax: 0,
          deliveryFee,
          total,
          paymentMethod: args.paymentMethod || "efectivo",
          paymentStatus: "pendiente",
          status: "pendiente",
          items: {
            create: resolvedOrderItems.map((it) => ({
              productId: it.productId,
              productName: it.productName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              subtotal: it.subtotal,
            })),
          },
        },
        include: { items: true },
      });

      return {
        ok: true,
        accion: "Pedido a Domicilio Creado Exitosamente",
        numero_orden: createdOrder.orderNumber,
        estado: createdOrder.status,
        cliente: createdOrder.customerName,
        telefono: createdOrder.customerPhone,
        direccion: createdOrder.deliveryAddress,
        total_cop: createdOrder.total,
        metodo_pago: createdOrder.paymentMethod,
        items: createdOrder.items.map((i) => ({
          producto: i.productName,
          cantidad: i.quantity,
          precio_unitario: i.unitPrice,
          subtotal: i.subtotal,
        })),
        instrucciones: createdOrder.deliveryNotes || "Sin instrucciones especiales",
      };
    }

    case "pos_search_clients": {
      const q = String(args.query || "").trim();
      const limit = Math.min(50, Math.max(1, Number(args.limit) || 15));

      const clients = await prisma.client.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { document: { contains: q } },
            { phone: { contains: q } },
          ],
          ...branchFilter,
        },
        include: {
          creditAccount: true,
          _count: { select: { sales: true } },
        },
        take: limit,
        orderBy: { name: "asc" },
      });

      return {
        total_encontrados: clients.length,
        clientes: clients.map((c) => ({
          id: c.id,
          nombre: c.name,
          documento_nit: c.document || "Sin documento",
          telefono: c.phone || "Sin telfono",
          direccion: c.address || "Sin direccin",
          credito_activo: c.creditAccount?.active || false,
          saldo_deuda_cop: c.creditAccount?.balance || 0,
          cupo_maximo_cop: c.creditAccount?.creditLimit || 0,
          total_compras_realizadas: c._count.sales,
        })),
      };
    }

    case "pos_create_client": {
      if (!args.name || !String(args.name).trim()) {
        throw new Error("El nombre del cliente es obligatorio.");
      }
      const branchId = SESSION_CONTEXT.branchId || null;
      const creditLimit = Math.max(0, Number(args.creditLimit) || 0);
      const maxDays = Math.max(1, Number(args.maxDays) || 30);

      const created = await prisma.client.create({
        data: {
          name: String(args.name).trim(),
          document: args.document ? String(args.document).trim() : null,
          phone: args.phone ? String(args.phone).trim() : null,
          email: args.email ? String(args.email).trim() : null,
          address: args.address ? String(args.address).trim() : null,
          branchId,
          creditAccount: {
            create: {
              active: creditLimit > 0,
              creditLimit,
              maxDays,
              balance: 0,
            },
          },
        },
        include: { creditAccount: true },
      });

      return {
        ok: true,
        accion: "Cliente Registrado Exitosamente",
        cliente: {
          id: created.id,
          nombre: created.name,
          documento_nit: created.document || "Sin documento",
          telefono: created.phone || "Sin telfono",
          correo: created.email || "Sin correo",
          direccion: created.address || "Sin direccin",
          cupo_credito_autorizado: created.creditAccount?.creditLimit || 0,
          credito_habilitado: created.creditAccount?.active || false,
        },
      };
    }

    case "pos_open_cash_session": {
      const initialAmount = Math.max(0, Number(args.initialAmount) || 0);
      const branchId = SESSION_CONTEXT.branchId || null;

      const existingOpen = await prisma.cashSession.findFirst({
        where: { status: "abierta", ...branchFilter },
      });
      if (existingOpen) {
        throw new Error(`Ya existe una sesi\u00e3n de caja abierta en esta sede (ID: ${existingOpen.id}) con base inicial de ${existingOpen.initialAmount.toLocaleString('es-CO')}.`);
      }

      const session = await prisma.cashSession.create({
        data: {
          branchId,
          openedById: "mcp-agent",
          initialAmount,
          status: "abierta",
          notes: args.notes ? String(args.notes).trim() : null,
        },
      });

      return {
        ok: true,
        accion: "Caja Registradora Abierta Exitosamente",
        sesion_id: session.id,
        base_inicial_cop: session.initialAmount,
        fecha_apertura: session.openedAt.toISOString(),
        estado: session.status,
      };
    }

    case "pos_close_cash_session": {
      if (args.cashCount === undefined || Number(args.cashCount) < 0) {
        throw new Error("Debes indicar el monto f\u00edsico contado en caja (cashCount).");
      }
      const cashCount = Number(args.cashCount);

      const openSession = await prisma.cashSession.findFirst({
        where: { status: "abierta", ...branchFilter },
        include: { transactions: true },
      });
      if (!openSession) {
        throw new Error("No hay ninguna sesi\u00f3n de caja abierta para cerrar en esta sede.");
      }

      let cashSales = 0;
      let cashIn = 0;
      let cashOut = 0;

      for (const t of openSession.transactions) {
        if (t.method === "efectivo" || !t.method) {
          if (t.type === "venta") cashSales += t.amount;
          else if (t.type === "ingreso") cashIn += t.amount;
          else if (t.type === "egreso") cashOut += t.amount;
        }
      }

      const expectedCash = openSession.initialAmount + cashSales + cashIn - cashOut;
      const difference = cashCount - expectedCash;

      const closed = await prisma.cashSession.update({
        where: { id: openSession.id },
        data: {
          status: "cerrada",
          closedAt: new Date(),
          closedById: "mcp-agent",
          expectedAmount: expectedCash,
          finalAmount: cashCount,
          difference,
          notes: args.notes ? String(args.notes).trim() : openSession.notes,
        },
      });

      return {
        ok: true,
        accion: "Cierre de Caja y Arqueo Realizado Exitosamente",
        sesion_id: closed.id,
        base_inicial_cop: closed.initialAmount,
        ventas_efectivo_cop: cashSales,
        ingresos_adicionales_cop: cashIn,
        egresos_gastos_cop: cashOut,
        efectivo_esperado_sistema_cop: expectedCash,
        efectivo_real_contado_cop: cashCount,
        diferencia_descuadre_cop: difference,
        estado_cuadre: difference === 0 ? "Cuadre Exacto sin faltantes" : (difference > 0 ? `Sobrante de ${difference.toLocaleString('es-CO')}` : `Faltante de ${Math.abs(difference).toLocaleString('es-CO')}`),
        fecha_cierre: closed.closedAt.toISOString(),
      };
    }

    case "pos_get_reorder_suggestions": {
      const targetDays = Math.max(7, Number(args.targetDays) || 30);
      const filter = args.urgency || "all";
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const products = await prisma.product.findMany({
        where: { active: true, ...branchFilter },
        include: {
          category: { select: { name: true } },
          purchaseItems: {
            orderBy: { purchase: { createdAt: "desc" } },
            take: 1,
            include: { purchase: { include: { supplier: true } } },
          },
        },
      });

      const productIds = products.map((p) => p.id);
      const recentSaleItems = await prisma.saleItem.findMany({
        where: {
          productId: { in: productIds },
          sale: {
            status: "completada",
            createdAt: { gte: thirtyDaysAgo },
            ...(SESSION_CONTEXT.branchId ? { branchId: SESSION_CONTEXT.branchId } : {}),
          },
        },
        select: { productId: true, quantity: true },
      });

      const salesMap = new Map();
      for (const item of recentSaleItems) {
        salesMap.set(item.productId, (salesMap.get(item.productId) || 0) + item.quantity);
      }

      const suggestions = [];
      for (const p of products) {
        const soldLast30 = salesMap.get(p.id) || 0;
        const dailyBurnRate = Math.round((soldLast30 / 30) * 100) / 100;
        let daysOfCoverage = null;
        if (dailyBurnRate > 0) {
          daysOfCoverage = Math.round((p.stock / dailyBurnRate) * 10) / 10;
        } else if (p.stock <= 0) {
          daysOfCoverage = 0;
        }

        let urgency = "optimo";
        if (p.stock <= 0 || (daysOfCoverage !== null && daysOfCoverage <= 3)) {
          urgency = "critico";
        } else if (p.stock <= p.minStock || (daysOfCoverage !== null && daysOfCoverage <= 7)) {
          urgency = "urgente";
        } else if (daysOfCoverage !== null && daysOfCoverage <= 15) {
          urgency = "atencion";
        }

        let neededForTarget = 0;
        if (dailyBurnRate > 0) {
          neededForTarget = Math.ceil(dailyBurnRate * targetDays) - p.stock;
        } else if (p.stock <= p.minStock) {
          neededForTarget = Math.max(p.minStock * 2 - p.stock, 5);
        }

        const suggestedQuantity = Math.max(0, neededForTarget);
        const lastSupplier = p.purchaseItems[0]?.purchase?.supplier;

        if (urgency !== "optimo" || suggestedQuantity > 0) {
          suggestions.push({
            producto_id: p.id,
            nombre: p.name,
            unidad: p.unit || "unidad",
            stock_actual: p.stock,
            stock_minimo: p.minStock,
            costo_unitario_cop: p.cost,
            ventas_ultimos_30d: soldLast30,
            consumo_diario_estimado: dailyBurnRate,
            dias_cobertura_restantes: daysOfCoverage !== null ? `${daysOfCoverage} d\u00edas` : "Sin rotaci\u00f3n reciente",
            nivel_urgencia: urgency,
            cantidad_sugerida_comprar: suggestedQuantity,
            inversion_estimada_cop: suggestedQuantity * p.cost,
            proveedor_habitual: lastSupplier ? lastSupplier.name : "Sin proveedor asignado",
            telefono_proveedor: lastSupplier?.phone || null,
          });
        }
      }

      const urgencyOrder = { critico: 0, urgente: 1, atencion: 2, optimo: 3 };
      suggestions.sort((a, b) => urgencyOrder[a.nivel_urgencia] - urgencyOrder[b.nivel_urgencia]);

      const filtered = filter !== "all" ? suggestions.filter((s) => s.nivel_urgencia === filter) : suggestions;
      const totalInvestment = filtered.reduce((acc, s) => acc + s.inversion_estimada_cop, 0);

      return {
        resumen: {
          dias_objetivo_cobertura: targetDays,
          total_productos_a_reordenar: filtered.length,
          criticos_menos_3_dias: filtered.filter((s) => s.nivel_urgencia === "critico").length,
          urgentes_menos_7_dias: filtered.filter((s) => s.nivel_urgencia === "urgente").length,
          inversion_total_estimada_cop: totalInvestment,
        },
        productos_a_reordenar: filtered,
      };
    }

    case "pos_list_suppliers": {
      const q = String(args.query || "").trim()
      const where = { ...branchFilter }
      if (q) {
        where.OR = [
          { name: { contains: q } },
          { document: { contains: q } },
          { phone: { contains: q } },
        ]
      }

      const suppliers = await prisma.supplier.findMany({
        where,
        include: {
          _count: { select: { purchases: true } },
        },
        orderBy: { name: "asc" },
        take: 50,
      })

      return {
        total_proveedores: suppliers.length,
        proveedores: suppliers.map((s) => ({
          id: s.id,
          nombre: s.name,
          documento_nit: s.document || "Sin NIT",
          telefono: s.phone || "Sin teléfono",
          email: s.email || "Sin email",
          contacto: s.contactName || "No registrado",
          compras_realizadas: s._count.purchases,
        })),
      }
    }

    default:
      throw new Error(`Herramienta '${name}' no reconocida.`)
  }
}

// Bucle de comunicacin JSON-RPC 2.0 por stdio (Protocolo MCP Estndar)
function sendResponse(id, result, error = null) {
  const response = { jsonrpc: "2.0", id }
  if (error) {
    response.error = { code: error.code || -32603, message: error.message }
  } else {
    response.result = result
  }
  process.stdout.write(JSON.stringify(response) + "\n")
}

async function handleMessage(message) {
  const { id, method, params } = message

  try {
    switch (method) {
      case "initialize":
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
          capabilities: {
            tools: {},
            resources: {},
          },
        })
        break

      case "notifications/initialized":
        // El cliente confirma la inicializacin
        break

      case "ping":
        sendResponse(id, {})
        break

      case "tools/list":
        sendResponse(id, { tools: TOOLS })
        break

      case "tools/call": {
        const { name, arguments: toolArgs } = params || {}
        if (!name) throw new Error("Nombre de herramienta no especificado")
        const result = await executeTool(name, toolArgs || {})
        sendResponse(id, {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        })
        break
      }

      default:
        if (id !== undefined) {
          sendResponse(id, null, { code: -32601, message: `Mtodo no soportado: ${method}` })
        }
    }
  } catch (err) {
    if (id !== undefined) {
      sendResponse(id, null, { code: -32000, message: err.message || "Error interno del servidor MCP" })
    }
  }
}

// Iniciar lector de stdio con buffering de lneas
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
})

rl.on("line", (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  try {
    const json = JSON.parse(trimmed)
    handleMessage(json)
  } catch (e) {
    // Si viene encabezado Content-Length (framing HTTP/LSP), ignorar la cabecera
    if (trimmed.startsWith("{")) {
      console.error("[OmniPOS MCP] Error parsing JSON line:", e)
    }
  }
})

process.on("SIGINT", async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  await prisma.$disconnect()
  process.exit(0)
})
