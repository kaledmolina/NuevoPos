"use client"

import { useState, useMemo } from "react"
import { toast } from "sonner"
import Link from "next/link"
import {
  IconCode,
  IconTerminal2,
  IconCopy,
  IconCheck,
  IconKey,
  IconBuildingStore,
  IconBoxSeam,
  IconShoppingCart,
  IconTruck,
  IconReceipt2,
  IconSearch,
  IconPlayerPlay,
  IconDownload,
  IconInfoCircle,
  IconDeviceMobile,
  IconChecklist,
  IconRobot,
  IconCpu,
  IconSparkles,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCash,
  IconCreditCard,
  IconMenu2,
  IconX,
  IconBrandWhatsapp,
  IconArrowLeft,
  IconChecklist as IconTOC,
  IconDatabase,
  IconShieldCheck,
  IconAlertCircle,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { Zap } from "lucide-react"

// Tipos para el Índice de Documentación
export interface DocSection {
  id: string
  title: string
  subtitle?: string
  category: "general" | "mcp" | "endpoints"
  badge?: string
  badgeVariant?: "default" | "secondary" | "outline" | "destructive"
  icon: any
  subHeadings?: Array<{ id: string; label: string }>
}

export interface EndpointDef {
  id: string
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  path: string
  title: string
  description: string
  category: "auth" | "businesses" | "products" | "orders" | "delivery" | "sales" | "cash" | "credit" | "utilities"
  roles: string[]
  headers?: Record<string, string>
  queryParams?: Array<{ name: string; type: string; required: boolean; description: string }>
  requestBody?: Record<string, unknown>
  responseExample: Record<string, unknown>
  responseStatus: number
}

// Catálogo de Secciones y Artículos del Índice (Sin despliegue en servidor robusto, enfocado en API y MCP)
const SECTIONS_CATALOG: Array<{ group: string; items: DocSection[] }> = [
  // --- GENERAL ---
  {
    group: "Índice General",
    items: [
      {
        id: "intro",
        title: "Introducción a OmniPOS API",
        icon: IconBuildingStore,
        category: "general",
        subHeadings: [
          { id: "sinopsis", label: "Sinopsis" },
          { id: "como-funciona", label: "¿Cómo Funciona el Sistema?" },
          { id: "paridad", label: "Paridad Total Web & Endpoints" },
          { id: "base-urls", label: "Direcciones Base (Base URLs)" },
        ],
      },
      {
        id: "rate-limit",
        title: "Límite de request",
        badge: "80 req/min",
        badgeVariant: "secondary",
        icon: IconClock,
        category: "general",
        subHeadings: [
          { id: "sinopsis-rate", label: "Sinopsis" },
          { id: "control-tasa", label: "Control de Tasa (Rate Limiting)" },
          { id: "consideraciones-clave", label: "Consideraciones clave" },
          { id: "headers-ratelimit", label: "Encabezados en Respuestas" },
          { id: "parametros-header", label: "Parámetros" },
        ],
      },
      {
        id: "responses",
        title: "Respuestas del API",
        icon: IconTerminal2,
        category: "general",
        subHeadings: [
          { id: "formato-estandar", label: "Formato Estándar JSON" },
          { id: "codigos-http", label: "Códigos de Estado HTTP" },
          { id: "manejo-errores", label: "Manejo de Errores y Excepciones" },
        ],
      },
      {
        id: "auth",
        title: "Autenticación",
        badge: "Bearer JWT",
        icon: IconKey,
        category: "general",
        subHeadings: [
          { id: "auth-modelo", label: "Modelo de Acceso Universal" },
          { id: "login-universal", label: "Cómo Iniciar Sesión" },
          { id: "registro-clientes", label: "Auto-Registro de Clientes" },
          { id: "roles-sistema", label: "Roles y Permisos" },
        ],
      },
    ],
  },

  // --- SERVIDOR MCP (MODEL CONTEXT PROTOCOL) ---
  {
    group: "🤖 Servidor MCP (Agentes IA)",
    items: [
      {
        id: "mcp-overview",
        title: "Introducción al Servidor MCP",
        badge: "Nuevo",
        badgeVariant: "default",
        icon: IconRobot,
        category: "mcp",
        subHeadings: [
          { id: "mcp-que-es", label: "¿Qué es el Protocolo MCP?" },
          { id: "mcp-flujo", label: "¿Cómo se Comunica el Agente?" },
          { id: "mcp-ventajas", label: "Ventajas vs APIs Tradicionales" },
        ],
      },
      {
        id: "mcp-config",
        title: "Configuración de Agentes",
        icon: IconCpu,
        category: "mcp",
        subHeadings: [
          { id: "mcp-claude", label: "Claude Desktop Paso a Paso" },
          { id: "mcp-cursor", label: "Cursor / Antigravity IDE" },
          { id: "mcp-security", label: "Seguridad Criptográfica & Anti-Suplantación" },
          { id: "mcp-test-cli", label: "Comprobar Funcionamiento" },
        ],
      },
      {
        id: "mcp-tools",
        title: "Catálogo de Herramientas (13 Tools)",
        badge: "13 Tools",
        badgeVariant: "outline",
        icon: IconSparkles,
        category: "mcp",
        subHeadings: [
          { id: "tool-summary", label: "pos_get_business_summary" },
          { id: "tool-products", label: "pos_search_products" },
          { id: "tool-create-product", label: "pos_create_or_update_product" },
          { id: "tool-sales-history", label: "pos_get_sales_history" },
          { id: "tool-cash", label: "pos_get_cash_status" },
          { id: "tool-cash-movements", label: "pos_record_cash_movement" },
          { id: "tool-orders", label: "pos_list_orders" },
          { id: "tool-assign-driver", label: "pos_assign_order_driver" },
          { id: "tool-credit", label: "pos_get_client_credit" },
          { id: "tool-credit-payment", label: "pos_record_credit_payment" },
          { id: "tool-finance", label: "pos_get_financial_reports" },
          { id: "tool-client-profit", label: "pos_get_client_profit_summary" },
          { id: "tool-set-credit", label: "pos_set_client_credit" },
          { id: "tool-inventory-alerts", label: "pos_get_inventory_alerts" },
          { id: "tool-record-purchase", label: "pos_record_purchase" },
          { id: "tool-create-sale", label: "pos_create_sale" },
          { id: "tool-create-order", label: "pos_create_order" },
          { id: "tool-search-clients", label: "pos_search_clients" },
          { id: "tool-create-client", label: "pos_create_client" },
          { id: "tool-open-cash", label: "pos_open_cash_session" },
          { id: "tool-close-cash", label: "pos_close_cash_session" },
          { id: "tool-suppliers", label: "pos_list_suppliers" },
        ],
      },
      {
        id: "mcp-prompts",
        title: "Casos de Uso & Prompts para IA",
        icon: IconChecklist,
        category: "mcp",
        subHeadings: [
          { id: "prompt-arqueo", label: "1. Arqueo y Cierre de Caja" },
          { id: "prompt-despacho", label: "2. Asignación de Domicilios" },
          { id: "prompt-cartera", label: "3. Abono a Crédito de Cliente" },
          { id: "prompt-stock", label: "4. Alertas de Inventario Crítico" },
          { id: "prompt-rentabilidad", label: "5. Reporte de Utilidad y Rentabilidad" },
        ],
      },
    ],
  },

  // --- ENDPOINTS Y COLECCIONES ---
  {
    group: "Colecciones & Endpoints",
    items: [
      {
        id: "ep-businesses",
        title: "Negocios y Sedes",
        icon: IconBuildingStore,
        category: "endpoints",
        subHeadings: [
          { id: "businesses-list", label: "GET /api/v1/businesses" },
          { id: "businesses-detail", label: "GET /api/v1/businesses/{id}" },
        ],
      },
      {
        id: "ep-products",
        title: "Productos y Catálogo",
        icon: IconBoxSeam,
        category: "endpoints",
        subHeadings: [
          { id: "products-list", label: "GET /api/v1/products" },
        ],
      },
      {
        id: "ep-orders",
        title: "Pedidos y Marketplace",
        icon: IconShoppingCart,
        category: "endpoints",
        subHeadings: [
          { id: "orders-create", label: "POST /api/v1/orders" },
          { id: "orders-list", label: "GET /api/v1/orders" },
          { id: "orders-assign", label: "POST /api/v1/orders/{id}/assign" },
          { id: "orders-status", label: "PATCH /api/v1/orders/{id}/status" },
        ],
      },
      {
        id: "ep-delivery",
        title: "App de Domiciliarios",
        icon: IconTruck,
        category: "endpoints",
        subHeadings: [
          { id: "delivery-orders", label: "GET /api/v1/delivery/orders" },
          { id: "delivery-accept", label: "POST /api/v1/delivery/orders/{id}/accept" },
          { id: "delivery-complete", label: "POST /api/v1/delivery/orders/{id}/complete" },
          { id: "delivery-settlement", label: "GET /api/v1/delivery/settlement" },
        ],
      },
      {
        id: "ep-sales",
        title: "App de Vendedores (Preventa)",
        icon: IconReceipt2,
        category: "endpoints",
        subHeadings: [
          { id: "sales-create", label: "POST /api/v1/sales" },
        ],
      },
      {
        id: "ep-cash",
        title: "Caja y Arqueo",
        icon: IconCash,
        category: "endpoints",
        subHeadings: [
          { id: "cash-status", label: "GET /api/cash-sessions" },
        ],
      },
      {
        id: "ep-credit",
        title: "Crédito y Cartera",
        icon: IconCreditCard,
        category: "endpoints",
        subHeadings: [
          { id: "credit-status", label: "GET /api/credit/accounts" },
        ],
      },
      {
        id: "ep-utilities",
        title: "Utilidades & OpenAPI",
        icon: IconCode,
        category: "endpoints",
        subHeadings: [
          { id: "system-info", label: "GET /api/v1/info" },
        ],
      },
    ],
  },
]

// Lista detallada de endpoints con request/response interactivos
const DETAILED_ENDPOINTS: Record<string, EndpointDef[]> = {
  "ep-businesses": [
    {
      id: "businesses-list",
      method: "GET",
      path: "/api/v1/businesses",
      title: "Listar Negocios y Comercios Disponibles",
      description: "Consulta las empresas registradas en el marketplace (droguerías, minimarkets, ferreterías). Permite filtrar por rubro y obtener sus sedes físicas con dirección y teléfono.",
      category: "businesses",
      roles: ["Público"],
      queryParams: [
        { name: "rubro", type: "string", required: false, description: "Filtrar por actividad comercial: 'drogueria', 'tienda', 'ferreteria'" },
        { name: "limit", type: "number", required: false, description: "Límite máximo de resultados (por defecto 20)" },
      ],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          businesses: [
            {
              id: "ten_drogueria_central",
              name: "Droguería La Principal",
              rubro: "drogueria",
              ownerPhone: "3104567890",
              branches: [
                { id: "br_centro", name: "Sede Centro", address: "Calle 10 # 5-20", phone: "3104567890", isMain: true }
              ]
            }
          ],
          total: 1
        }
      }
    },
    {
      id: "businesses-detail",
      method: "GET",
      path: "/api/v1/businesses/{id}",
      title: "Detalle de un Negocio Específico",
      description: "Retorna información detallada de una empresa en particular, incluyendo sus sedes activas, teléfonos de contacto y configuración comercial.",
      category: "businesses",
      roles: ["Público"],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          business: {
            id: "ten_drogueria_central",
            name: "Droguería La Principal",
            rubro: "drogueria",
            branchesCount: 1,
            branches: [{ id: "br_centro", name: "Sede Centro", address: "Calle 10 # 5-20" }]
          }
        }
      }
    }
  ],
  "ep-products": [
    {
      id: "products-list",
      method: "GET",
      path: "/api/v1/products",
      title: "Consultar Catálogo de Productos y Existencias",
      description: "Busca productos por nombre o código de barras escaneado. Retorna precio de venta, existencia en inventario, categoría y sede asociada.",
      category: "products",
      roles: ["Público"],
      queryParams: [
        { name: "businessId", type: "string", required: false, description: "ID del comercio/empresa que vende" },
        { name: "query", type: "string", required: false, description: "Palabra clave o código de barras" },
        { name: "inStock", type: "number", required: false, description: "Enviar '1' para ocultar productos con stock en cero" },
      ],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          products: [
            {
              id: "prd_acetaminofen",
              name: "Acetaminofén 500mg (Caja x 100)",
              barcode: "770123456789",
              price: 18500,
              stock: 45,
              categoryName: "Medicamentos"
            }
          ],
          total: 1
        }
      }
    }
  ],
  "ep-orders": [
    {
      id: "orders-create",
      method: "POST",
      path: "/api/v1/orders",
      title: "Crear Pedido de Compra / Domicilio",
      description: "Registra una orden de compra generada por un cliente o vendedor. Valida inventario, calcula subtotales y emite un código de pedido único para seguimiento.",
      category: "orders",
      roles: ["Autenticado o Cliente Público"],
      headers: { "Content-Type": "application/json" },
      requestBody: {
        businessId: "ten_drogueria_central",
        customerName: "Carlos Gómez",
        customerPhone: "3118904567",
        deliveryAddress: "Carrera 7 # 120-45, Apto 502",
        deliveryNotes: "Dejar en portería",
        paymentMethod: "contraentrega",
        items: [
          { productId: "prd_acetaminofen", quantity: 2, notes: "Fecha de vencimiento lejana" }
        ]
      },
      responseStatus: 201,
      responseExample: {
        ok: true,
        data: {
          order: {
            id: "ord_20261105_1001",
            orderNumber: "PED-20261105-1001",
            status: "pendiente",
            customerName: "Carlos Gómez",
            total: 37000,
            deliveryFee: 0,
            createdAt: "2026-11-05T09:15:00.000Z"
          }
        },
        message: "Pedido creado exitosamente con número PED-20261105-1001"
      }
    },
    {
      id: "orders-list",
      method: "GET",
      path: "/api/v1/orders",
      title: "Listar Pedidos en Curso",
      description: "Consulta los pedidos. Se filtra de forma inteligente según el rol autenticado: clientes ven sus pedidos, los comercios ven los de su sede y los domiciliarios ven sus envíos asignados más los pedidos libres disponibles de su sede.",
      category: "orders",
      roles: ["Autenticado (Cliente, Domiciliario, Vendedor, Admin)"],
      headers: { Authorization: "Bearer <TU_TOKEN_AQUI>" },
      queryParams: [
        { name: "status", type: "string", required: false, description: "Filtrar por estado: 'pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'" },
        { name: "branchId", type: "string", required: false, description: "ID de sede (validado contra sedes autorizadas)" },
      ],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          orders: [
            {
              id: "ord_20261105_1001",
              orderNumber: "PED-20261105-1001",
              customerName: "Carlos Gómez",
              total: 37000,
              status: "en_camino",
              deliveryDriverName: "Andrés Repartidor"
            }
          ]
        }
      }
    },
    {
      id: "orders-assign",
      method: "POST",
      path: "/api/v1/orders/{id}/assign",
      title: "Asignar Conductor / Repartidor al Pedido",
      description: "Asigna un repartidor dedicado al pedido (o permite al domiciliario auto-asignarse con protección atómica 409). Opcionalmente actualiza el estado a 'en_camino' y guarda la hora exacta de salida a reparto.",
      category: "orders",
      roles: ["admin", "superadmin", "vendedor", "domiciliario"],
      headers: {
        Authorization: "Bearer <TU_TOKEN_AQUI>",
        "Content-Type": "application/json"
      },
      requestBody: {
        deliveryDriverId: "usr_domiciliario_andres",
        deliveryDriverName: "Andrés Repartidor",
        deliveryDriverPhone: "3123456789",
        dispatchNow: true
      },
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          order: {
            id: "ord_20261105_1001",
            orderNumber: "PED-20261105-1001",
            status: "en_camino",
            deliveryDriverName: "Andrés Repartidor",
            deliveryDriverPhone: "3123456789",
            assignedAt: "2026-11-05T09:16:00.000Z",
            dispatchedAt: "2026-11-05T09:16:00.000Z"
          }
        },
        message: "Conductor Andrés Repartidor asignado con éxito"
      }
    },
    {
      id: "orders-status",
      method: "PATCH",
      path: "/api/v1/orders/{id}/status",
      title: "Actualizar Estado de Envío o Pago del Pedido",
      description: "Permite cambiar el estado logístico del pedido. Un domiciliario solo puede modificar pedidos asignados a su cuenta y únicamente hacia 'en_camino' o 'entregado' (sin permiso para marcar 'pagado'). Admin/Vendedor puede confirmar pago recibido ('pagado') al cuadrar caja.",
      category: "orders",
      roles: ["admin", "superadmin", "vendedor", "domiciliario"],
      headers: {
        Authorization: "Bearer <TU_TOKEN_AQUI>",
        "Content-Type": "application/json"
      },
      requestBody: {
        status: "en_camino"
      },
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          order: {
            id: "ord_20261105_1001",
            orderNumber: "PED-20261105-1001",
            status: "en_camino",
            paymentStatus: "pendiente",
            dispatchedAt: "2026-11-10T14:20:00.000Z"
          }
        }
      }
    }
  ],
  "ep-delivery": [
    {
      id: "delivery-orders",
      method: "GET",
      path: "/api/v1/delivery/orders",
      title: "Listar Pedidos Disponibles y Asignados al Repartidor",
      description: "Endpoint principal para el Portal Web y App Móvil de Domiciliarios: retorna pedidos libres sin conductor para tomar (Primero en Aceptar), envíos activos en ruta y entregas históricas del repartidor autenticado, junto con contadores resumen.",
      category: "delivery",
      roles: ["domiciliario", "vendedor", "admin", "superadmin"],
      headers: { Authorization: "Bearer <TOKEN_DEL_DOMICILIARIO>" },
      queryParams: [
        { name: "scope", type: "string", required: false, description: "'all' (por defecto), 'available' (sin conductor), 'active' (mis envíos en curso), 'delivered' (entregados), 'mine' (todos los míos)" },
        { name: "status", type: "string", required: false, description: "Filtrar por estado: 'pendiente', 'confirmado', 'en_preparacion', 'en_camino', 'entregado'" },
        { name: "paymentStatus", type: "string", required: false, description: "'unsettled' / 'por_liquidar', 'pendiente', 'por_cobrar' o 'pagado'" },
        { name: "branchId", type: "string", required: false, description: "ID de sede autorizada (opcional; usa sede por defecto o todas las asignadas)" },
        { name: "q", type: "string", required: false, description: "Búsqueda por # orden, cliente, teléfono o dirección" }
      ],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          orders: [
            {
              id: "ord_20261110_6158",
              orderNumber: "PED-20261110-6158",
              customerName: "Kaled Molina",
              customerPhone: "573004200048",
              deliveryAddress: "Calle 6 carrera 7, Barrio La Granja",
              deliveryLatitude: 8.7559,
              deliveryLongitude: -75.8881,
              subtotal: 9200,
              deliveryFee: 5000,
              total: 14200,
              paymentMethod: "contraentrega",
              paymentStatus: "pendiente",
              status: "pendiente",
              deliveryDriverId: null
            }
          ],
          counts: {
            available: 1,
            active: 2,
            delivered: 14,
            unsettled: 3
          },
          pagination: {
            total: 17,
            page: 1,
            pageSize: 30,
            totalPages: 1
          }
        }
      }
    },
    {
      id: "delivery-accept",
      method: "POST",
      path: "/api/v1/delivery/orders/{id}/accept",
      title: "Tomar Pedido Disponible (Adjudicación Atómica Primero en Aceptar)",
      description: "Adjudica el pedido al domiciliario de forma atómica con protección contra condiciones de carrera (HTTP 409 si otro repartidor ya lo tomó). Con dispatchNow: false o mode: 'claim' lo reserva en estado 'confirmado'; por defecto lo marca 'en_camino' y notifica al cliente.",
      category: "delivery",
      roles: ["domiciliario", "admin", "superadmin"],
      headers: {
        Authorization: "Bearer <TOKEN_DEL_DOMICILIARIO>",
        "Content-Type": "application/json"
      },
      requestBody: {
        dispatchNow: true,
        mode: "pickup"
      },
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          order: {
            id: "ord_20261110_6158",
            orderNumber: "PED-20261110-6158",
            status: "en_camino",
            deliveryDriverId: "usr_domi_1",
            deliveryDriverName: "kaled_domi",
            assignedAt: "2026-11-10T14:05:00.000Z",
            dispatchedAt: "2026-11-10T14:05:00.000Z"
          },
          message: "¡Pedido aceptado y en camino! Dirígete a entregarlo a Kaled Molina."
        }
      }
    },
    {
      id: "delivery-complete",
      method: "POST",
      path: "/api/v1/delivery/orders/{id}/complete",
      title: "Marcar Pedido como Entregado (Pasa a Sin Liquidar en Cuadre)",
      description: "Finaliza la entrega logística registrando deliveredAt. Regla contable: el estado de pago pasa a 'por_cobrar' (Sin Liquidar) salvo que ya estuviera verificado como 'pagado'; solo Caja/Admin confirma 'pagado' al recibir el efectivo del cuadre.",
      category: "delivery",
      roles: ["domiciliario", "admin", "superadmin"],
      headers: {
        Authorization: "Bearer <TOKEN_DEL_DOMICILIARIO>",
        "Content-Type": "application/json"
      },
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          order: {
            id: "ord_20261110_6158",
            orderNumber: "PED-20261110-6158",
            status: "entregado",
            paymentStatus: "por_cobrar",
            deliveredAt: "2026-11-10T14:22:00.000Z"
          },
          message: "Entrega finalizada (#PED-20261110-6158). El cobro quedó registrado como Sin Liquidar hasta realizar tu Cuadre de Caja."
        }
      }
    },
    {
      id: "delivery-settlement",
      method: "GET",
      path: "/api/v1/delivery/settlement",
      title: "Resumen & Cuadre de Caja del Domiciliario (Pedidos X + Domicilios Y)",
      description: "Consulta el estado financiero del reparto con aislamiento estricto: un domiciliario solo ve su propio cuadre (mySettlement) e historial de liquidaciones, con desglose exacto de Valor en Pedidos (X) + Valor en Domicilios (Y) = Total a Entregar en Caja, entregas en ruta, transferencias por verificar y recibos históricos.",
      category: "delivery",
      roles: ["domiciliario", "vendedor", "admin", "superadmin"],
      headers: { Authorization: "Bearer <TOKEN_DEL_DOMICILIARIO>" },
      queryParams: [
        { name: "range", type: "string", required: false, description: "'all' (por defecto), 'today', 'yesterday', '7d'" },
        { name: "branchId", type: "string", required: false, description: "ID de sede o 'all' para todas las sedes autorizadas" },
        { name: "driverId", type: "string", required: false, description: "Solo Admin/Vendedor: filtrar un domiciliario específico" }
      ],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          role: "domiciliario",
          range: "all",
          cashRegisterOpen: true,
          summary: {
            totalUnsettledCashOrders: 3,
            totalUnsettledProductsAmount: 45000,
            totalUnsettledDeliveryFees: 15000,
            totalUnsettledGrossAmount: 60000,
            totalUnsettledNonCashOrders: 1,
            totalUnsettledNonCashAmount: 22000,
            totalInTransitOrders: 1,
            totalInTransitAmount: 14200
          },
          mySettlement: {
            driverId: "usr_domi_1",
            driverName: "kaled_domi",
            unsettledCashCount: 3,
            unsettledCashProductsTotal: 45000,
            unsettledCashDeliveryTotal: 15000,
            unsettledCashGrossTotal: 60000,
            unsettledNonCashCount: 1,
            unsettledNonCashTotal: 22000,
            inTransitCount: 1,
            settledTodayCount: 4,
            settledTodayGrossTotal: 84000
          },
          history: [
            {
              settlementRef: "CUA-DOM-20261110-1200",
              orderCount: 4,
              productsTotal: 64000,
              deliveryFeeTotal: 20000,
              expectedCash: 84000,
              receivedCash: 84000,
              difference: 0,
              settledBy: "Admin Principal"
            }
          ]
        }
      }
    }
  ],
  "ep-sales": [
    {
      id: "sales-create",
      method: "POST",
      path: "/api/v1/sales",
      title: "Registrar Venta Directa en Campo (Preventa)",
      description: "Genera una factura en tiempo real para vendedores en terreno o mostradores remotos, descontando stock inmediatamente.",
      category: "sales",
      roles: ["vendedor", "admin", "superadmin"],
      headers: {
        Authorization: "Bearer <TOKEN_DEL_VENDEDOR>",
        "Content-Type": "application/json"
      },
      requestBody: {
        clientId: "cli_123",
        paymentMethod: "efectivo",
        amountReceived: 20000,
        items: [
          { productId: "prd_acetaminofen", quantity: 1, unitPrice: 18500 }
        ]
      },
      responseStatus: 201,
      responseExample: {
        ok: true,
        data: {
          sale: {
            id: "sal_999",
            invoiceNumber: "FAC-000452",
            subtotal: 18500,
            total: 18500,
            change: 1500,
            status: "completada"
          }
        },
        message: "Venta registrada con éxito"
      }
    }
  ],
  "ep-cash": [
    {
      id: "cash-status",
      method: "GET",
      path: "/api/cash-sessions",
      title: "Estado Actual de Caja Registradora",
      description: "Consulta el arqueo en vivo: cajero responsable, base de apertura, ventas acumuladas en efectivo y saldo esperado en gaveta.",
      category: "cash",
      roles: ["cajero", "admin", "superadmin"],
      headers: { Authorization: "Bearer <TU_TOKEN_AQUI>" },
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          status: "abierta",
          openedBy: "Admin Principal",
          openingAmount: 100000,
          cashSales: 450000,
          expectedInDrawer: 550000
        }
      }
    }
  ],
  "ep-credit": [
    {
      id: "credit-status",
      method: "GET",
      path: "/api/credit/accounts",
      title: "Consulta de Cartera y Crédito de Clientes",
      description: "Retorna el cupo otorgado, saldo pendiente acumulado y cupo disponible por cliente.",
      category: "credit",
      roles: ["cajero", "vendedor", "admin"],
      headers: { Authorization: "Bearer <TU_TOKEN_AQUI>" },
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          client: "Carlos Gómez",
          creditLimit: 500000,
          currentBalance: 120000,
          availableCredit: 380000,
          status: "al_dia"
        }
      }
    }
  ],
  "ep-utilities": [
    {
      id: "system-info",
      method: "GET",
      path: "/api/v1/info",
      title: "Información y Estado de la API",
      description: "Consulta metadatos de la API, versión activa, módulos soportados y estado de conexión.",
      category: "utilities",
      roles: ["Público"],
      responseStatus: 200,
      responseExample: {
        ok: true,
        data: {
          name: "OmniPOS Core & Marketplace API",
          version: "1.0.0",
          status: "online",
          baseUrl: "/api/v1",
          mcpServerReady: true
        }
      }
    }
  ]
}

export default function ApiDocsView() {
  const [activeSectionId, setActiveSectionId] = useState<string>("rate-limit")
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "Índice General": true,
    "🤖 Servidor MCP (Agentes IA)": true,
    "Colecciones & Endpoints": true,
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [liveTestResults, setLiveTestResults] = useState<Record<string, { loading: boolean; data?: unknown; error?: string }>>({})

  // Copiar al portapapeles con feedback
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success("Copiado al portapapeles")
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Scroll suave al hacer clic en subHeadings
  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // Toggle de grupo de acordeón
  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  // Encontrar el item actual seleccionado
  const currentSection = useMemo(() => {
    for (const grp of SECTIONS_CATALOG) {
      const found = grp.items.find((item) => item.id === activeSectionId)
      if (found) return found
    }
    return SECTIONS_CATALOG[0].items[0]
  }, [activeSectionId])

  // Filtrado de items por búsqueda
  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return SECTIONS_CATALOG
    const q = searchQuery.toLowerCase().trim()
    return SECTIONS_CATALOG.map((grp) => ({
      ...grp,
      items: grp.items.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.id.toLowerCase().includes(q) ||
          it.subHeadings?.some((sh) => sh.label.toLowerCase().includes(q))
      ),
    })).filter((grp) => grp.items.length > 0)
  }, [searchQuery])

  // Ejecución interactiva de endpoints GET
  const handleTestEndpoint = async (ep: EndpointDef) => {
    setLiveTestResults((prev) => ({ ...prev, [ep.id]: { loading: true } }))
    try {
      const res = await fetch(ep.path)
      const data = await res.json()
      setLiveTestResults((prev) => ({ ...prev, [ep.id]: { loading: false, data } }))
      toast.success(`Respuesta 200 OK recibida de ${ep.path}`)
    } catch (e) {
      setLiveTestResults((prev) => ({ ...prev, [ep.id]: { loading: false, error: (e as Error).message } }))
      toast.error(`Error consultando: ${(e as Error).message}`)
    }
  }

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 font-mono font-bold"
      case "POST":
        return "bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-mono font-bold"
      case "PATCH":
        return "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-400 dark:border-zinc-600 font-mono font-bold"
      case "PUT":
        return "bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 font-mono font-bold"
      case "DELETE":
        return "bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 border border-zinc-700 dark:border-zinc-300 font-mono font-bold"
      default:
        return "bg-muted text-foreground"
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#070b14] text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-950  flex flex-col font-sans relative">
      {/* Background ambient mesh and floating glows identical to landing page */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-white dark:bg-black opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] opacity-60 dark:opacity-40" />
        <div className="absolute -top-32 left-1/4 w-[750px] h-[550px] rounded-full bg-zinc-300/20 dark:bg-zinc-800/20 blur-[130px]" />
        <div className="absolute top-20 right-1/4 w-[600px] h-[500px] rounded-full bg-zinc-200/25 dark:bg-zinc-800/20 blur-[140px]" />
      </div>

      {/* ============================================================== */}
      {/* 1. TOP NAVBAR (ESTILO OMNIPOS UNIFICADO CON LA LANDING)        */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 dark:bg-slate-950/85 border-b border-slate-200/90 dark:border-slate-800/90 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Abrir menú de navegación"
          >
            {mobileMenuOpen ? <IconX className="w-5 h-5" /> : <IconMenu2 className="w-5 h-5" />}
          </button>

          <Link href="/" className="flex items-center gap-2.5 select-none group">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950 dark:bg-white text-white dark:text-black shadow-md group-hover:rotate-12 transition-transform">
              <Zap className="h-4 w-4 fill-white dark:fill-black" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm sm:text-base tracking-tight text-zinc-950 dark:text-white transition-colors">
                Omni<span className="text-zinc-950 dark:text-white">POS</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
                Docs & MCP
              </span>
            </div>
          </Link>

          {/* Buscador de cabecera */}
          <div className="hidden md:flex items-center relative w-64 lg:w-80 ml-3">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Buscar en la documentación..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 pl-9 pr-12 h-8 text-xs rounded-full text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-zinc-950 dark:focus-visible:ring-white"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
              Ctrl K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Enlace rápido al simulador */}
          <Link
            href="/#mockup-interactive"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white px-2.5 py-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-850 transition-colors"
          >
            <span>Simulador POS</span>
          </Link>

          {/* Selector de Tema Claro / Oscuro con animaciones */}
          <ThemeToggle showLabel />

          {/* Volver a la Landing / POS */}
          <Link href="/">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs rounded-full bg-slate-950 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-950 shadow-sm font-semibold px-4 cursor-pointer"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>Volver a la Tienda</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. CONTENEDOR PRINCIPAL: 3 COLUMNAS (SIDEBAR - ARTÍCULO - TOC) */}
      {/* ============================================================== */}
      <div className="flex-1 flex w-full max-w-7xl mx-auto relative z-10">
        {/* ============================================================ */}
        {/* COLUMNA 1: SIDEBAR IZQUIERDO (ÍNDICE ESTILO FACTUS / MODERNO)*/}
        {/* ============================================================ */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-72 bg-white/95 dark:bg-slate-950/90 backdrop-blur-2xl border-r border-slate-200/80 dark:border-slate-800/80 pt-16 lg:pt-5 px-3 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 shrink-0",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Título del Índice */}
          <div className="px-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60 mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Índice de Contenido
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-zinc-950 dark:bg-white dark:text-zinc-950/10 text-zinc-950 dark:text-white border border-zinc-200 dark:border-zinc-800">
              v2.0 MCP
            </span>
          </div>

          {/* Navegación por Grupos */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            {filteredCatalog.map((grp) => {
              const isExpanded = expandedGroups[grp.group] !== false
              return (
                <div key={grp.group} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(grp.group)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold text-[11px] uppercase tracking-wider rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <span>{grp.group}</span>
                    {isExpanded ? (
                      <IconChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <IconChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-0.5 pl-1">
                      {grp.items.map((item) => {
                        const IconComponent = item.icon
                        const isActive = activeSectionId === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setActiveSectionId(item.id)
                              setMobileMenuOpen(false)
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all text-xs font-semibold group cursor-pointer",
                              isActive
                                ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold border border-zinc-300 dark:border-zinc-700 shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-900/60"
                            )}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <IconComponent
                                className={cn(
                                  "h-4 w-4 shrink-0 transition-colors",
                                  isActive ? "text-zinc-950 dark:text-white" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                                )}
                              />
                              <span className="truncate">{item.title}</span>
                            </div>
                            {item.badge && (
                              <Badge
                                variant={item.badgeVariant || "secondary"}
                                className={cn(
                                  "text-[9px] px-1.5 py-0 h-4 border-0 ml-1 shrink-0",
                                  isActive
                                    ? "bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white"
                                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                )}
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer del Sidebar: Estado del MCP Server */}
          <div className="p-3 border border-slate-200/80 dark:border-slate-800/80 mt-auto bg-slate-50 dark:bg-slate-900/60 rounded-2xl mb-2 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Servidor MCP Activo</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              JSON-RPC 2.0 por stdio listo para Cursor, Claude Desktop o Gemini.
            </p>
          </div>
        </aside>

        {/* Backdrop para móviles */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs lg:hidden"
          />
        )}

        {/* ============================================================ */}
        {/* COLUMNA 2: CONTENIDO PRINCIPAL (ARTÍCULO DOCUMENTAL) */}
        {/* ============================================================ */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-6 lg:py-8 space-y-8 overflow-x-hidden">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>OmniPOS Docs</span>
            <span>/</span>
            <span className="capitalize">{currentSection.category}</span>
            <span>/</span>
            <span className="text-zinc-950 dark:text-white font-semibold">{currentSection.title}</span>
          </div>

          {/* ========================================================== */}
          {/* 1. INTRODUCCIÓN GENERAL A LA API */}
          {/* ========================================================== */}
          {activeSectionId === "intro" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 id="sinopsis" className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Introducción a OmniPOS API
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  OmniPOS es una plataforma integral de punto de venta, inventarios, créditos y marketplace para comercios físicos (droguerías, minimarkets, ferreterías, tiendas de barrio). Esta API REST expone de forma segura todas las funciones operativas del negocio para ser consumidas por aplicaciones móviles, sistemas externos o agentes de Inteligencia Artificial.
                </p>
              </div>

              {/* ¿Cómo Funciona? */}
              <div id="como-funciona" className="space-y-4 pt-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconBuildingStore className="h-5 w-5 text-zinc-950 dark:text-white" />
                  ¿Cómo Funciona el Sistema en la Práctica?
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  El sistema opera bajo un modelo centralizado donde todos los clientes y canales interactúan con la misma base de datos en tiempo real:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs space-y-2">
                    <div className="h-8 w-8 rounded-lg bg-zinc-950 dark:bg-white dark:text-zinc-950/10 text-zinc-950 dark:text-white flex items-center justify-center font-bold text-sm">1</div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Punto de Venta Físico</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Cajeros escanean códigos de barras, cobran en efectivo, tarjeta o crédito a clientes y abren/cierran turnos de caja registradora.</p>
                  </div>
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs space-y-2">
                    <div className="h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center font-bold text-sm">2</div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Domicilios & Preventa</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Clientes hacen pedidos desde la web, los domiciliarios reciben la dirección en su móvil y los vendedores de campo emiten facturas en terreno.</p>
                  </div>
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs space-y-2">
                    <div className="h-8 w-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 flex items-center justify-center font-bold text-sm">3</div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">Agentes IA Autónomos</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Mediante el Servidor MCP, un asistente de IA consulta stock, calcula utilidades netas, asigna repartidores y registra abonos en lenguaje natural.</p>
                  </div>
                </div>
              </div>

              {/* Paridad Total */}
              <div id="paridad" className="p-5 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/70  space-y-2">
                <div className="flex items-center gap-2 text-zinc-950 dark:text-white font-bold text-sm">
                  <IconCheck className="h-5 w-5" />
                  <span>100% de Paridad: La API hace todo lo que la Web hace</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  No hay funciones ocultas en la interfaz gráfica. Cuando el cajero hace clic en "Cobrar", se envía exactamente la misma petición <code className="bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 rounded font-mono text-xs font-semibold">POST /api/sales</code> que cualquier sistema externo o bot puede invocar.
                </p>
              </div>

              {/* Base URLs */}
              <div id="base-urls" className="space-y-3 pt-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Direcciones Base del Servicio (Base URLs)</h3>
                <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs space-y-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ruta Base de la API:</span>
                  <div className="bg-[#090d16] p-3 rounded-xl border border-slate-800 font-mono text-xs text-zinc-200 flex items-center justify-between shadow-xs">
                    <span>/api/v1 (o http://localhost:3000/api/v1 en desarrollo local)</span>
                    <button
                      onClick={() => copyToClipboard("/api/v1", "url-local")}
                      className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
                    >
                      <IconCopy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 2. LÍMITE DE REQUEST (RATE LIMITING - IDÉNTICO A FACTUS) */}
          {/* ========================================================== */}
          {activeSectionId === "rate-limit" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 id="sinopsis-rate" className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Introducción a OmniPOS API
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Para garantizar la estabilidad del servicio, proteger la base de datos y asegurar un tiempo de respuesta óptimo en cada venta, la API implementa políticas de control de tasa de peticiones.
                </p>
              </div>

              {/* Sección: Control de Tasa */}
              <div id="control-tasa" className="space-y-3 pt-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconClock className="h-5 w-5 text-zinc-950 dark:text-white" />
                  Control de Tasa (Rate Limiting)
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Para garantizar la estabilidad del servicio, la API implementa un límite de{" "}
                  <strong className="text-slate-900 dark:text-white font-bold">80 solicitudes por minuto por usuario</strong> o dirección IP.
                </p>
              </div>

              {/* Consideraciones clave */}
              <div id="consideraciones-clave" className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Consideraciones clave:
                </h3>
                <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <li className="flex items-start gap-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 mt-2 shrink-0" />
                    <span>
                      <strong className="text-slate-900 dark:text-white font-semibold">Excedente de límite:</strong> Si se supera esta cuota, la aplicación rechazará las peticiones adicionales devolviendo el código de estado{" "}
                      <code className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 rounded font-mono text-xs font-semibold">
                        HTTP 429 ("Too Many Requests")
                      </code>
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-950 dark:bg-white dark:text-zinc-950 mt-2 shrink-0" />
                    <span>
                      <strong className="text-slate-900 dark:text-white font-semibold">Restablecimiento:</strong> Una vez alcanzado el límite, el usuario deberá esperar a que finalice el ciclo de un minuto para que su cuota se reinicie y pueda realizar llamadas nuevamente.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Callout / Cuadro de Nota estilo Factus / OmniPOS */}
              <div className="relative rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900/70 p-4 sm:p-5 space-y-2 shadow-xs">
                <div className="flex items-center gap-2 text-zinc-950 dark:text-white font-bold text-sm">
                  <IconInfoCircle className="h-5 w-5 text-zinc-950 dark:text-white shrink-0" />
                  <span>Nota</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pl-7">
                  Ten en cuenta que los encabezados <code className="bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 rounded font-mono text-xs font-semibold">X-RateLimit-Reset</code> y{" "}
                  <code className="bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-1.5 py-0.5 rounded font-mono text-xs font-semibold">Retry-After</code> se incluyen únicamente cuando se ha excedido el límite de peticiones, facilitando al cliente la gestión del tiempo de espera para reanudar el consumo de la API.
                </p>
              </div>

              {/* Parámetros / Headers de Rate Limit */}
              <div id="headers-ratelimit" className="space-y-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <h3 id="parametros-header" className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Parámetros
                </h3>

                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-3 font-semibold">Encabezado</th>
                        <th className="p-3 font-semibold">Tipo</th>
                        <th className="p-3 font-semibold">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-zinc-950 dark:text-white font-bold">X-RateLimit-Limit</td>
                        <td className="p-3 font-mono text-slate-500">integer</td>
                        <td className="p-3">El número máximo de solicitudes permitidas en la ventana de 60 segundos (80 solicitudes).</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-zinc-950 dark:text-white font-bold">X-RateLimit-Remaining</td>
                        <td className="p-3 font-mono text-slate-500">integer</td>
                        <td className="p-3">El número de solicitudes que aún puedes realizar antes de alcanzar el bloqueo temporal.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-zinc-950 dark:text-white font-bold">X-RateLimit-Reset</td>
                        <td className="p-3 font-mono text-slate-500">timestamp</td>
                        <td className="p-3">Hora Unix en segundos en la que tu cuota de peticiones se restablecerá a 80.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-zinc-950 dark:text-white font-bold">Retry-After</td>
                        <td className="p-3 font-mono text-slate-500">seconds</td>
                        <td className="p-3">Cantidad exacta de segundos que tu aplicación debe esperar antes de reintentar la solicitud.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 3. RESPUESTAS DEL API Y CÓDIGOS DE ESTADO */}
          {/* ========================================================== */}
          {activeSectionId === "responses" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Respuestas del API y Códigos de Estado
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Todas las respuestas devueltas por OmniPOS son objetos en formato JSON con una estructura predecible que facilita el consumo tanto en aplicaciones web/móviles como en agentes autónomos.
                </p>
              </div>

              {/* Formato Estándar */}
              <div id="formato-estandar" className="space-y-4 pt-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconTerminal2 className="h-5 w-5 text-zinc-950 dark:text-white" />
                  Formato Estándar de Respuesta (JSON Envelope)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Respuesta Exitosa */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider block">Respuesta Exitosa (200 / 201):</span>
                    <pre className="bg-[#090d16] p-4 rounded-2xl border border-slate-800 font-mono text-xs text-slate-200 overflow-x-auto shadow-md">
{`{
  "ok": true,
  "data": {
    "id": "sal_999",
    "invoiceNumber": "FAC-000452",
    "total": 18500
  },
  "message": "Venta registrada con éxito"
}`}
                    </pre>
                  </div>

                  {/* Respuesta con Error */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-zinc-950 dark:text-white uppercase tracking-wider block">Respuesta con Error (4xx / 5xx):</span>
                    <pre className="bg-[#090d16] p-4 rounded-2xl border border-slate-800 font-mono text-xs text-slate-200 overflow-x-auto shadow-md">
{`{
  "ok": false,
  "error": "Stock insuficiente para este producto",
  "code": "INSUFFICIENT_STOCK",
  "status": 400
}`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Códigos HTTP */}
              <div id="codigos-http" className="space-y-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Significado de los Códigos HTTP</h3>
                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-3 font-semibold">Código</th>
                        <th className="p-3 font-semibold">Estado</th>
                        <th className="p-3 font-semibold">¿Cuándo se emite?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-950 dark:text-white">200</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">OK</td>
                        <td className="p-3">La consulta o actualización se completó con éxito.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-950 dark:text-white">201</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Created</td>
                        <td className="p-3">Un nuevo recurso fue creado (ej. una nueva venta, pedido o cliente).</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">400</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Bad Request</td>
                        <td className="p-3">Faltan campos obligatorios o los datos enviados no son válidos.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">401</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Unauthorized</td>
                        <td className="p-3">No enviaste el Bearer Token o el token ha expirado.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">403</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Forbidden</td>
                        <td className="p-3">El usuario autenticado no tiene permisos para esa acción (ej. un repartidor anulando facturas).</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">404</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Not Found</td>
                        <td className="p-3">El ID de pedido, producto o cliente no existe en la base de datos.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">429</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Too Many Requests</td>
                        <td className="p-3">Superaste el límite de 80 peticiones por minuto. Espera los segundos indicados en <code className="text-zinc-950 dark:text-white font-bold">Retry-After</code>.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 4. AUTENTICACIÓN UNIVERSAL (BEARER TOKEN JWT) */}
          {/* ========================================================== */}
          {activeSectionId === "auth" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Autenticación Universal
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  OmniPOS utiliza un modelo de autenticación simplificado y seguro basado en <strong className="text-slate-900 dark:text-white">PIN de 4 dígitos</strong> y <strong className="text-slate-900 dark:text-white">Bearer Token JWT</strong>. Tanto el dueño del negocio, los cajeros, los repartidores de pedidos y los clientes que compran por el marketplace usan el mismo flujo.
                </p>
              </div>

              {/* Cómo Iniciar Sesión */}
              <div id="login-universal" className="space-y-4 pt-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconKey className="h-5 w-5 text-zinc-950 dark:text-white" />
                  1. Cómo Iniciar Sesión (`POST /api/v1/auth/login`)
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Envía el correo o teléfono del usuario junto con su PIN numérico. Si las credenciales son correctas, el servidor devuelve un token que dura 7 días:
                </p>

                <div className="bg-[#090d16] p-4 sm:p-5 rounded-2xl border border-slate-800 font-mono text-xs text-slate-200 overflow-x-auto space-y-2 shadow-md">
                  <div className="text-zinc-200 font-bold">Petición HTTP:</div>
                  <div>POST /api/v1/auth/login</div>
                  <div className="text-slate-400">Content-Type: application/json</div>
                  <div className="mt-2 text-slate-300">{`{\n  "identifier": "carlos@ejemplo.com",\n  "pin": "1234"\n}`}</div>
                  <div className="pt-2 text-zinc-200 font-bold">Respuesta del Servidor (200 OK):</div>
                  <div className="text-zinc-300">{`{\n  "ok": true,\n  "data": {\n    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",\n    "tokenType": "Bearer",\n    "user": { "name": "Carlos Gómez", "role": "cliente" }\n  }\n}`}</div>
                </div>
              </div>

              {/* Cómo enviar el token */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md shadow-xs space-y-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider block">
                  Cómo incluir el token en las siguientes peticiones:
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Agrega en los encabezados HTTP de tu aplicación o cliente:
                </p>
                <div className="bg-[#090d16] p-3 rounded-xl border border-slate-800 font-mono text-xs text-zinc-200 flex items-center justify-between">
                  <span>Authorization: Bearer &lt;TU_TOKEN_RECIBIDO&gt;</span>
                  <button
                    onClick={() => copyToClipboard("Authorization: Bearer <TU_TOKEN_RECIBIDO>", "auth-header")}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Roles del Sistema */}
              <div id="roles-sistema" className="space-y-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Roles y Niveles de Acceso</h3>
                <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="p-3 font-semibold">Rol</th>
                        <th className="p-3 font-semibold">¿Para quién es?</th>
                        <th className="p-3 font-semibold">Permisos Principales</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-950 dark:text-white">admin / superadmin</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Dueño o Administrador de la Tienda</td>
                        <td className="p-3">Acceso total: inventario, caja, compras, reportes de rentabilidad y creación de colaboradores.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-700 dark:text-zinc-300">cajero</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Operador de caja física</td>
                        <td className="p-3">Cobro de ventas, apertura y arqueo de caja registradora, cobro de abonos a crédito.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-700 dark:text-zinc-300">domiciliario</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Repartidor o conductor</td>
                        <td className="p-3">Tomar pedidos disponibles (Primero en Aceptar), pasar sus envíos a en_camino/entregado y consultar su Cuadre de Caja (X + Y) sin acceso a marcar pagado ni datos globales de caja.</td>
                      </tr>
                      <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono font-bold text-zinc-700 dark:text-zinc-300">cliente</td>
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">Consumidor final del marketplace</td>
                        <td className="p-3">Explorar comercios, agregar productos al carrito y hacer seguimiento de sus domicilios.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 5. SERVIDOR MCP (MODEL CONTEXT PROTOCOL) - EXPLICACIÓN CLAVE */}
          {/* ========================================================== */}
          {activeSectionId === "mcp-overview" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <Badge className="bg-zinc-950 dark:bg-white dark:text-zinc-950/15 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 font-bold mb-2">
                  Inteligencia Artificial Integrada
                </Badge>
                <h1 id="mcp-que-es" className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  ¿Qué es el Servidor MCP de OmniPOS?
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Imagina que tu agente de inteligencia artificial (como Claude, Cursor o Antigravity) no solo pueda responder preguntas teóricas, sino que tenga <strong className="text-slate-900 dark:text-white">acceso seguro y directo a tu tienda</strong> para consultar stock, registrar gastos de caja, asignar domiciliarios o decirte la ganancia del día.
                </p>
              </div>

              {/* Explicación Sencilla */}
              <div id="mcp-flujo" className="space-y-4 pt-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconRobot className="h-5 w-5 text-zinc-950 dark:text-white" />
                  ¿Cómo Funciona el Flujo de Conversación?
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  El protocolo MCP convierte el lenguaje cotidiano en acciones reales en tu base de datos:
                </p>

                <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-[#090d16] space-y-3 font-mono text-xs shadow-md">
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-200 font-bold shrink-0">1. Tú escribes:</span>
                    <span className="text-slate-100">"¿Cuánto vendimos hoy y cuánta plata debe haber en la caja en efectivo?"</span>
                  </div>
                  <div className="flex items-start gap-2 pl-4 border-l-2 border-zinc-400 dark:border-zinc-600">
                    <span className="text-zinc-950 dark:text-white font-bold shrink-0">2. El Agente detecta:</span>
                    <span className="text-slate-300">Ejecuta automáticamente las herramientas <code className="text-zinc-200">pos_get_business_summary</code> y <code className="text-zinc-200">pos_get_cash_status</code>.</span>
                  </div>
                  <div className="flex items-start gap-2 pl-4 border-l-2 border-zinc-400 dark:border-zinc-600">
                    <span className="text-zinc-300 font-bold shrink-0">3. El Servidor MCP:</span>
                    <span className="text-slate-300">Consulta la base de datos local en 1 milisegundo y devuelve el saldo exacto y las ventas del turno.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-200 font-bold shrink-0">4. El Agente responde:</span>
                    <span className="text-slate-100">"Hoy se han registrado 12 ventas por un total de $340.000 COP. La base inicial fue de $100.000, por lo que en gaveta debes tener $440.000 en efectivo."</span>
                  </div>
                </div>
              </div>

              {/* Ventajas */}
              <div id="mcp-ventajas" className="space-y-3 pt-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Ventajas del MCP frente a escribir código a mano</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md shadow-xs space-y-2">
                    <span className="font-bold text-sm text-zinc-950 dark:text-white flex items-center gap-1.5">
                      <IconSparkles className="h-4 w-4" /> Sin Latencia de Red
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      El servidor corre localmente con Node.js sobre flujos estándar (stdio). La comunicación es instantánea y no requiere configurar túneles complejos ni exponer puertos públicos.
                    </p>
                  </div>
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md shadow-xs space-y-2">
                    <span className="font-bold text-sm text-zinc-950 dark:text-white flex items-center gap-1.5">
                      <IconCheck className="h-4 w-4" /> Seguridad y Validación Estricta
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Cada herramienta valida los tipos de datos (números, strings, IDs) antes de tocar la base de datos, evitando que el modelo de lenguaje cometa errores de formato.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 6. CONFIGURACIÓN DE AGENTES (CLAUDE, CURSOR, ANTIGRAVITY) */}
          {/* ========================================================== */}
          {activeSectionId === "mcp-config" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Cómo Conectar tu Agente de IA al Sistema
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Sigue estas sencillas instrucciones para conectar Claude Desktop o tu editor favorito al sistema POS en menos de dos minutos.
                </p>
              </div>

              {/* Claude Desktop */}
              <div id="mcp-claude" className="space-y-3 pt-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconCpu className="h-5 w-5 text-zinc-950 dark:text-white" />
                  Opción 1: Conectar en Claude Desktop
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Abre tu archivo de configuración de Claude Desktop en tu computador:
                </p>
                <div className="bg-[#090d16] p-3 rounded-xl border border-slate-800 font-mono text-xs text-zinc-200">
                  Windows: %APPDATA%\Claude\claude_desktop_config.json
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Pega el siguiente bloque de configuración y reinicia Claude:</p>

                <div className="relative">
                  <div className="bg-[#090d16] p-4 sm:p-5 rounded-2xl border border-slate-800 font-mono text-xs text-slate-200 overflow-x-auto shadow-md">
                    <pre>
{`{
  "mcpServers": {
    "omnipos": {
      "command": "node",
      "args": [
        "C:\\\\Users\\\\Mi Pc\\\\Desktop\\\\hositnge\\\\NuevoPos\\\\scripts\\\\mcp-server.mjs"
      ]
    }
  }
}`}
                    </pre>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`{\n  "mcpServers": {\n    "omnipos": {\n      "command": "node",\n      "args": ["C:\\\\Users\\\\Mi Pc\\\\Desktop\\\\hositnge\\\\NuevoPos\\\\scripts\\\\mcp-server.mjs"]\n    }\n  }\n}`, "claude-cfg")}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                  >
                    {copiedId === "claude-cfg" ? <IconCheck className="h-4 w-4 text-zinc-200" /> : <IconCopy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Cursor / Antigravity */}
              <div id="mcp-cursor" className="space-y-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <IconTerminal2 className="h-5 w-5 text-zinc-950 dark:text-white" />
                  Opción 2: Conectar en Cursor / Antigravity IDE
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Ve a <strong>Settings &gt; Features &gt; MCP &gt; Add New MCP Server</strong> y coloca:
                </p>
                <div className="bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 space-y-2 text-xs shadow-xs backdrop-blur-md">
                  <div><strong>Nombre del servidor:</strong> <code className="text-zinc-950 dark:text-white font-bold ml-1">omnipos</code></div>
                  <div><strong>Tipo de transporte:</strong> <code className="text-zinc-950 dark:text-white font-bold ml-1">command</code></div>
                  <div><strong>Comando:</strong> <code className="text-zinc-950 dark:text-white font-mono font-bold ml-1">node "c:\Users\Mi Pc\Desktop\hositnge\NuevoPos\scripts\mcp-server.mjs"</code></div>
                </div>
              </div>

              {/* Seguridad Criptográfica y Aislamiento Multisede */}
              <div id="mcp-security" className="space-y-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <IconShieldCheck className="h-5 w-5 text-zinc-900 dark:text-zinc-200" />
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Seguridad Criptográfica & Aislamiento Anti-Suplantación
                  </h2>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-950 dark:bg-white/5 space-y-2">
                  <div className="font-bold text-xs sm:text-sm text-zinc-950 dark:text-white dark:text-zinc-900 dark:text-white flex items-center gap-2">
                    <IconAlertCircle className="h-4 w-4 shrink-0" />
                    ¿Qué pasa si un usuario malintencionado intenta escribir "OMNIPOS_ROLE": "admin"?
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    En modo local de desarrollo personal (en tu propio computador), tú eres el dueño absoluto de tu máquina. Pero en <strong>producción, redes de sucursales o bots de WhatsApp</strong>, el sistema <strong>NUNCA confía en texto plano</strong> autodeclarado por el cliente.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md space-y-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <IconKey className="h-4 w-4 text-zinc-900 dark:text-zinc-200" /> 1. Token Criptográfico Firmado (JWT)
                    </span>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      El administrador genera un token inalterable usando <code className="text-zinc-200">node scripts/generate-mcp-token.mjs</code>. El token contiene el rol exacto (<code className="text-zinc-200">vendedor</code>) y la sede autorizada (<code className="text-zinc-200">sede_norte</code>), firmado con HMAC-SHA256 y una clave maestra secreta (<code className="text-zinc-200">AUTH_SECRET</code>).
                    </p>
                  </div>

                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur-md space-y-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                      <IconShieldCheck className="h-4 w-4 text-zinc-900 dark:text-zinc-200" /> 2. Imposibilidad de Fraude
                    </span>
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                      Si un empleado o atacante intenta cambiar el rol a "admin" o consultar otra sede, <strong>la firma matemática se destruye instantáneamente</strong>. El servidor MCP rechaza la conexión con error crítico y se desconecta de inmediato.
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-[#090d16] space-y-2 font-mono text-xs">
                  <div className="text-zinc-200 font-bold">Generar un Token Criptográfico para un Agente de Sede Específica:</div>
                  <div className="text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                    <span>node scripts/generate-mcp-token.mjs --role vendedor --branch sede_norte --name "Bot Mostrador"</span>
                    <button
                      onClick={() => copyToClipboard('node scripts/generate-mcp-token.mjs --role vendedor --branch sede_norte --name "Bot Mostrador"', "copy-gen-tok")}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                    >
                      <IconCopy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Prueba Rápida en Consola */}
              <div id="mcp-test-cli" className="space-y-3 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Comprobar Funcionamiento en Consola</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ya dejamos preparado un script de prueba automatizado para verificar que las 11 herramientas responden con éxito:
                </p>
                <div className="bg-[#090d16] p-3 rounded-xl border border-slate-800 font-mono text-xs text-zinc-200 flex items-center justify-between">
                  <span>node scripts/test-mcp.mjs</span>
                  <button
                    onClick={() => copyToClipboard("node scripts/test-mcp.mjs", "cmd-test2")}
                    className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 7. CATÁLOGO DE 11 HERRAMIENTAS MCP (EXPLICADAS AL DETALLE) */}
          {/* ========================================================== */}
          {activeSectionId === "mcp-tools" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Catálogo Detallado de Herramientas MCP
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Cada una de estas 11 herramientas le permite al modelo de lenguaje realizar una tarea específica en el sistema. A continuación se explica para qué sirve cada una, qué datos recibe y qué información entrega.
                </p>
              </div>

              <div className="space-y-6">
                {[
                  {
                    id: "tool-summary",
                    name: "pos_get_business_summary",
                    title: "1. Resumen Ejecutivo del Negocio",
                    desc: "¿Para qué sirve? Permite al agente obtener una fotografía instantánea del negocio: cuánto se ha vendido hoy en pesos, si la caja registradora está abierta, cuántos pedidos a domicilio faltan por despachar y cuántos productos tienen stock crítico.",
                    params: "No requiere ningún parámetro.",
                    exampleQ: '"¿Cómo va el negocio hoy?" o "¿Hay pedidos pendientes de despacho?"',
                    returns: '{ ventas_hoy: { cantidad_ventas, total_ingresado_cop }, caja_actual: { estado, responsable }, domicilios_pendientes_despacho: 3, inventario: { stock_bajo: 2 } }'
                  },
                  {
                    id: "tool-products",
                    name: "pos_search_products",
                    title: "2. Búsqueda y Consulta de Productos",
                    desc: "¿Para qué sirve? Busca cualquier producto en el inventario por nombre o código de barras escaneado. Informa el precio de venta al público, el costo de compra, el stock disponible y la fecha de vencimiento más próxima.",
                    params: "query (texto de búsqueda, ej. 'dolex' o '770123...'), limit (máximo de resultados, opcional).",
                    exampleQ: '"¿Cuánto cuesta el Acetaminofén y cuántas cajas quedan?"',
                    returns: '{ total_encontrados: 1, productos: [{ nombre: "Acetaminofén 500mg", precio_venta: 18500, stock_actual: 45, vencimiento: "2027-08-30" }] }'
                  },
                  {
                    id: "tool-create-product",
                    name: "pos_create_or_update_product",
                    title: "3. Crear o Actualizar Producto en Catálogo",
                    desc: "¿Para qué sirve? Permite que el agente agregue un nuevo producto al catálogo o actualice el precio de venta, costo y stock de uno existente.",
                    params: "name (nombre), price (precio de venta), stock (unidades), barcode (código de barras, opcional), categoryName (categoría, opcional).",
                    exampleQ: '"Sube el precio del Alcohol Antiséptico a $6.000 y ponle 20 unidades de stock."',
                    returns: '{ ok: true, mensaje: "Producto actualizado con éxito", producto: { ... } }'
                  },
                  {
                    id: "tool-sales-history",
                    name: "pos_get_sales_history",
                    title: "4. Historial de Facturas y Ventas",
                    desc: "¿Para qué sirve? Consulta las últimas ventas completadas en el sistema, mostrando el número de factura, cliente, método de pago (efectivo, tarjeta, transferencia, crédito) y productos incluidos.",
                    params: "limit (número de ventas a traer, ej. 10), paymentMethod (filtro opcional: 'efectivo', 'tarjeta', etc.).",
                    exampleQ: '"Muéstrame las últimas 5 ventas pagadas por transferencia."',
                    returns: '{ total_consultadas: 5, ventas: [{ factura: "FAC-000452", total: 18500, cliente: "Consumidor Final" }] }'
                  },
                  {
                    id: "tool-cash",
                    name: "pos_get_cash_status",
                    title: "5. Arqueo y Balance de Caja Registradora",
                    desc: "¿Para qué sirve? Verifica si hay un turno de caja abierto en este momento, quién es el cajero responsable, con cuánto dinero inició el turno (base) y cuánto dinero en efectivo debe haber en la gaveta sumando las ventas.",
                    params: "No requiere parámetros.",
                    exampleQ: '"¿Cuánta plata en efectivo debe haber en la gaveta en este momento?"',
                    returns: '{ estado: "Abierta", cajero_responsable: "Carlos Gómez", base_inicial_cop: 100000, ventas_efectivo_cop: 450000, total_esperado_en_gaveta_cop: 550000 }'
                  },
                  {
                    id: "tool-cash-movements",
                    name: "pos_record_cash_movement",
                    title: "6. Registrar Gastos o Ingresos Menores en Caja",
                    desc: "¿Para qué sirve? Registra gastos operativos inmediatos (ej. pago de flete de $15.000, compra de artículos de aseo) o ingresos menores para que el arqueo de caja cuadre al centavo al final del día.",
                    params: "type ('egreso' o 'ingreso'), amount (monto en pesos), reason (motivo o justificación del gasto).",
                    exampleQ: '"Registra un gasto de caja de $12.000 para pagar el almuerzo del repartidor."',
                    returns: '{ ok: true, mensaje: "Movimiento de Egreso por $12.000 registrado en caja.", transaccion: { ... } }'
                  },
                  {
                    id: "tool-orders",
                    name: "pos_list_orders",
                    title: "7. Listado y Estado de Domicilios",
                    desc: "¿Para qué sirve? Lista los pedidos a domicilio con su dirección de entrega, cliente, teléfono, total a cobrar y si ya tienen repartidor asignado.",
                    params: "status ('pendiente', 'confirmado', 'en_camino', 'entregado', 'all'), limit (opcional).",
                    exampleQ: '"¿Qué pedidos están pendientes de repartir?"',
                    returns: '{ total: 2, pedidos: [{ orden: "PED-20261105-1001", cliente: "Carlos Gómez", total: 37000, repartidor_asignado: "Sin conductor" }] }'
                  },
                  {
                    id: "tool-assign-driver",
                    name: "pos_assign_order_driver",
                    title: "8. Asignar Domiciliario y Despachar Pedido",
                    desc: "¿Para qué sirve? Asigna un repartidor a un pedido específico y cambia automáticamente su estado a 'en_camino' con la hora de salida registrada.",
                    params: "orderIdOrNumber (código de orden, ej. 'PED-20261105-1001'), driverName (nombre del repartidor), driverPhone (opcional).",
                    exampleQ: '"Asigna el pedido PED-20261105-1001 a Andrés Repartidor y ponlo en camino."',
                    returns: '{ ok: true, mensaje: "Conductor Andrés Repartidor asignado al pedido. Estado: en_camino", pedido: { ... } }'
                  },
                  {
                    id: "tool-credit",
                    name: "pos_get_client_credit",
                    title: "9. Consulta de Cartera y Cupo de Crédito",
                    desc: "¿Para qué sirve? Consulta el estado de cuenta por cobrar de un cliente frecuente: cuánto dinero debe actualmente, cuánto cupo máximo tiene autorizado y cuánto cupo le queda disponible.",
                    params: "query (nombre, cédula o teléfono del cliente).",
                    exampleQ: '"¿Cuánto dinero debe el cliente Carlos Gómez en su cuenta de fiado?"',
                    returns: '{ cliente: "Carlos Gómez", limite_credito_cop: 500000, deuda_actual_cop: 120000, cupo_disponible_cop: 380000, estado: "Tiene saldo pendiente por pagar" }'
                  },
                  {
                    id: "tool-credit-payment",
                    name: "pos_record_credit_payment",
                    title: "10. Registrar Abono a Cuenta de Crédito",
                    desc: "¿Para qué sirve? Descuenta dinero de la deuda de un cliente cuando viene a pagar una factura a crédito y recalcula su saldo restante al instante.",
                    params: "clientIdOrName (nombre o ID del cliente), amount (monto abonado en pesos), notes (opcional).",
                    exampleQ: '"Registra un abono de $50.000 para Carlos Gómez."',
                    returns: '{ ok: true, mensaje: "Abono de $50.000 registrado con éxito", saldo_anterior_cop: 120000, nuevo_saldo_pendiente_cop: 70000 }'
                  },
                  {
                    id: "tool-finance",
                    name: "pos_get_financial_reports",
                    title: "11. Métricas Financieras y Utilidad Neta",
                    desc: "¿Para qué sirve? Calcula con total precisión matemática la utilidad real del negocio en los últimos días: ventas totales menos el costo de compra de la mercancía vendida menos los gastos registrados en caja, indicando el margen porcentual neto.",
                    params: "days (días a calcular hacia atrás, ej. 7, 30 o 90).",
                    exampleQ: '"¿Cuál fue la utilidad real y el margen de ganancia de los últimos 30 días?"',
                    returns: '{ periodo_dias: 30, ventas_totales_cop: 15400000, utilidad_bruta_cop: 5200000, gastos_operativos_cop: 850000, utilidad_neta_real_cop: 4350000, margen_neto_porcentaje: "28.2%" }'
                  },
                  {
                    id: "tool-client-profit",
                    name: "pos_get_client_profit_summary",
                    title: "12. Ganancia Neta Generada por Cliente",
                    desc: "¿Para qué sirve? Analiza todas las ventas históricas de un cliente en particular, calcula el total de dinero comprado, descuenta el costo de compra de cada producto vendido y te entrega la ganancia neta exacta en pesos, margen porcentual y sus productos preferidos.",
                    params: "query (nombre, cédula o teléfono del cliente, ej. 'André Manuel Molina').",
                    exampleQ: '"¿Cuánta ganancia le he sacado al cliente André Manuel Molina?"',
                    returns: '{ cliente: { nombre: "André Manuel Molina" }, resumen_ganancias: { total_dinero_comprado_cop: 450000, costo_total_mercancia_cop: 310000, ganancia_neta_generada_cop: 140000, margen_ganancia_porcentaje: "31.1%" }, productos_mas_comprados: [...] }'
                  },
                  {
                    id: "tool-set-credit",
                    name: "pos_set_client_credit",
                    title: "13. Habilitar o Ajustar Cupo de Crédito (Fiado)",
                    desc: "¿Para qué sirve? Habilita una nueva línea de crédito a un cliente o ajusta su cupo máximo autorizado en pesos para permitirle comprar fiado de forma segura.",
                    params: "query (nombre o documento del cliente), creditLimit (monto del cupo en pesos, ej. 500000), active (opcional, true/false).",
                    exampleQ: '"Habilítale un cupo de crédito de $500.000 a André Manuel Molina."',
                    returns: '{ ok: true, mensaje: "Línea de crédito habilitada para André Manuel Molina con cupo de $500.000 COP", cupo_credito_cop: 500000, cupo_disponible_cop: 500000 }'
                  },
                  {
                    id: "tool-inventory-alerts",
                    name: "pos_get_inventory_alerts",
                    title: "14. Alertas Inteligentes de Inventario, Lotes y Vencimiento",
                    desc: "¿Para qué sirve? Supervisa en tiempo real productos agotados (stock 0), productos con stock mínimo de reposición alcanzado, lotes vencidos o próximos a caducar en 30 días, detallando unidades fraccionadas (kg, metros, litros, etc.) y número de lote.",
                    params: "filter (opcional: 'all', 'agotados', 'stock_bajo', 'por_vencer', 'vencidos').",
                    exampleQ: '"¿Qué productos están por acabarse y qué lotes vencen este mes?"',
                    returns: '{ resumen_alertas: { total_productos_stock_bajo: 3, total_lotes_por_vencer_30d: 1 }, detalles: { productos_stock_bajo: [...], productos_por_vencer: [...] } }'
                  },
                  {
                    id: "tool-record-purchase",
                    name: "pos_record_purchase",
                    title: "15. Entrada Automática de Compra & Recálculo de Costo Promedio",
                    desc: "¿Para qué sirve? Registra la entrada física de mercancía o factura de un proveedor: ingresa automáticamente el stock al punto de venta, genera el lote con fecha de caducidad y recalcula automáticamente el costo promedio ponderado de los productos.",
                    params: "items (array con productIdOrName, quantity, unitCost, batch, expirationDate), supplierNameOrId (opcional), reference (factura), notes.",
                    exampleQ: '"Registra compra a Distribuidora Central de 10 Coca-Cola a $2.000 cada una con lote LOT-2027 y vence 2027-12-31."',
                    returns: '{ ok: true, accion: "Compra registrada", productos_actualizados: [{ producto: "Coca-Cola", stock_nuevo: 20, nuevo_costo_promedio_ponderado: 1900, lote: "LOT-2027" }] }'
                  },
                  {
                    id: "tool-suppliers",
                    name: "pos_list_suppliers",
                    title: "16. Directorio de Proveedores & Reabastecimiento",
                    desc: "¿Para qué sirve? Consulta los proveedores registrados de la empresa, su NIT, teléfono, correo de contacto y número de compras realizadas para coordinar órdenes de reposición.",
                    params: "query (opcional: nombre, NIT o teléfono a buscar).",
                    exampleQ: '"Dime el teléfono del proveedor de lácteos para pedir más leche."',
                    returns: '{ total_proveedores: 4, proveedores: [{ nombre: "Lácteos del Norte", documento_nit: "900.123.456", telefono: "3101234567", compras_realizadas: 12 }] }'
                  },
                  {
                    id: "tool-create-sale",
                    name: "pos_create_sale",
                    title: "17. Venta Directa en Mostrador (Facturación & Deducción FEFO)",
                    desc: "¿Para qué sirve? Realiza y factura una venta directa en el punto de venta: valida existencias, descuenta automáticamente de los lotes ordenados por vencimiento más próximo (FEFO), emite la factura consecutiva y asienta el ingreso en caja o en la cuenta de crédito del cliente.",
                    params: "items (array con productIdOrName, quantity, unitPrice opcional), paymentMethod (efectivo, tarjeta, transferencia, credito), clientNameOrId (opcional o requerido si es a crédito), amountReceived, discount, notes.",
                    exampleQ: '"Vende 2 botellas de Coca-Cola en efectivo y recibió un billete de $10.000."',
                    returns: '{ ok: true, factura: "FAC-260002", total_cop: 3000, cambio_devuelto_cop: 7000, productos_vendidos: [...] }'
                  },
                  {
                    id: "tool-create-order",
                    name: "pos_create_order",
                    title: "18. Crear Pedido a Domicilio (Chatbots & WhatsApp)",
                    desc: "¿Para qué sirve? Genera un pedido a domicilio con código de rastreo (PED-...), calculando subtotales y guardando los datos de entrega y teléfono del cliente para despacho inmediato.",
                    params: "customerName, customerPhone, deliveryAddress, items (array con productIdOrName y quantity), deliveryNotes (opcional), paymentMethod.",
                    exampleQ: '"Crea un domicilio para Carlos Mendoza en Carrera 7 # 45-20: 1 Acetaminofén y 1 Suero Oral."',
                    returns: '{ ok: true, numero_orden: "PED-20261105-8289", cliente: "Carlos Mendoza", total_cop: 16300, estado: "pendiente" }'
                  },
                  {
                    id: "tool-search-clients",
                    name: "pos_search_clients",
                    title: "19. Directorio y Búsqueda de Clientes",
                    desc: "¿Para qué sirve? Permite encontrar clientes por nombre, documento o teléfono, verificando si tienen crédito activo, su deuda actual y el historial de compras.",
                    params: "query (nombre, teléfono o documento), limit (opcional).",
                    exampleQ: '"Busca al cliente Carlos Mendoza para ver si tiene saldo pendiente."',
                    returns: '{ total_encontrados: 1, clientes: [{ nombre: "Carlos Mendoza", saldo_deuda_cop: 0, cupo_maximo_cop: 200000 }] }'
                  },
                  {
                    id: "tool-create-client",
                    name: "pos_create_client",
                    title: "20. Registrar Nuevo Cliente & Cupo de Crédito",
                    desc: "¿Para qué sirve? Registra nuevos clientes en el sistema POS con sus datos personales, fiscales y cupo de crédito asignado para compras fiadas.",
                    params: "name (requerido), document, phone, email, address, creditLimit (opcional), maxDays (opcional).",
                    exampleQ: '"Registra al cliente María López con teléfono 3112233445 y cupo de crédito de $150.000."',
                    returns: '{ ok: true, cliente: { nombre: "María López", cupo_credito_autorizado: 150000, credito_habilitado: true } }'
                  },
                  {
                    id: "tool-open-cash",
                    name: "pos_open_cash_session",
                    title: "21. Apertura de Turno de Caja Registradora",
                    desc: "¿Para qué sirve? Abre la sesión de caja del turno de trabajo con una base inicial de dinero en efectivo.",
                    params: "initialAmount (monto en efectivo base), notes (opcional).",
                    exampleQ: '"Abre el turno de caja de hoy con una base de $100.000."',
                    returns: '{ ok: true, sesion_id: "...", base_inicial_cop: 100000, estado: "abierta" }'
                  },
                  {
                    id: "tool-close-cash",
                    name: "pos_close_cash_session",
                    title: "22. Cierre y Arqueo de Turno de Caja",
                    desc: "¿Para qué sirve? Cierra el turno de caja registradora, compara el conteo físico de dinero reportado contra el efectivo esperado del sistema y genera el informe de arqueo con descuadre o faltante.",
                    params: "cashCount (dinero físico contado en caja), notes (opcional).",
                    exampleQ: '"Cierra la caja registradora reportando $345.000 contados en efectivo."',
                    returns: '{ ok: true, efectivo_esperado_sistema_cop: 345000, efectivo_real_contado_cop: 345000, diferencia_descuadre_cop: 0, estado_cuadre: "Cuadre Exacto sin faltantes" }'
                  },
                ].map((tool) => (
                  <div key={tool.id} id={tool.id} className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">{tool.title}</h3>
                      <code className="text-xs font-mono bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 rounded-lg font-bold">
                        {tool.name}
                      </code>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{tool.desc}</p>
                    <div className="bg-[#090d16] p-3.5 rounded-xl border border-slate-800 space-y-1 text-xs font-mono">
                      <div className="text-slate-400"><strong>Parámetros:</strong> <span className="text-zinc-200">{tool.params}</span></div>
                      <div className="text-slate-400"><strong>Ejemplo de orden que le das al agente:</strong> <span className="text-zinc-900 dark:text-white">{tool.exampleQ}</span></div>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-200 truncate bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                      <strong>Retorna:</strong> {tool.returns}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 8. CASOS DE USO Y PROMPTS PARA EL AGENTE DE IA */}
          {/* ========================================================== */}
          {activeSectionId === "mcp-prompts" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                  Casos de Uso Reales con Prompts para IA
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Puedes copiar cualquiera de estos mensajes y pegarlo directamente en tu conversación con el agente de IA para ver cómo opera el sistema de forma autónoma.
                </p>
              </div>

              <div className="space-y-5">
                {[
                  {
                    id: "prompt-arqueo",
                    title: "1. Arqueo y Cuadre de Caja al Final del Día",
                    prompt: "¿Cuánto vendimos hoy en total, cuánta plata debe haber exactamente en la gaveta en efectivo y cuál fue el gasto mayor registrado?",
                    toolUsed: "pos_get_cash_status + pos_get_business_summary",
                    explanation: "El agente revisa la sesión de caja activa, suma las ventas en efectivo a la base inicial de apertura, resta los egresos menores y te entrega el cuadre listo para contar el dinero físico.",
                  },
                  {
                    id: "prompt-despacho",
                    title: "2. Despachar un Domicilio con Repartidor",
                    prompt: "Asigna el pedido PED-20261105-1001 al repartidor Andrés Repartidor con teléfono 3123456789 y márcalo en camino.",
                    toolUsed: "pos_assign_order_driver",
                    explanation: "El agente busca la orden, guarda los datos del conductor y cambia el estado a 'en_camino' con la marca de tiempo exacta de despacho.",
                  },
                  {
                    id: "prompt-cartera",
                    title: "3. Recibir Abono de un Cliente que Debe",
                    prompt: "El cliente Carlos Gómez vino a pagar $50.000 pesos en efectivo de su deuda, regístralo y dime cuánto le queda debiendo.",
                    toolUsed: "pos_record_credit_payment",
                    explanation: "El agente descuenta los $50.000 del saldo pendiente de Carlos Gómez, registra el recibo de abono y te confirma el saldo restante al instante.",
                  },
                  {
                    id: "prompt-stock",
                    title: "4. Saber qué Productos Pedir al Distribuidor",
                    prompt: "Dime qué productos tienen 5 o menos unidades de existencias para armar la lista de pedido al proveedor.",
                    toolUsed: "pos_search_products",
                    explanation: "El agente filtra los productos con stock igual o inferior al stock mínimo y te entrega una lista ordenada con nombre, código de barras y existencias.",
                  },
                  {
                    id: "prompt-rentabilidad",
                    title: "5. Conocer la Ganancia Real del Mes",
                    prompt: "Dame el informe de rentabilidad de los últimos 30 días con total de ventas, costo de la mercancía, gastos de caja y utilidad neta.",
                    toolUsed: "pos_get_financial_reports",
                    explanation: "El agente calcula la utilidad real deduciendo el costo de compra de cada artículo vendido y los gastos de operación registrados en caja.",
                  },
                  {
                    id: "prompt-ganancia-cliente",
                    title: "6. Consultar Ganancia Generada con un Cliente Específico",
                    prompt: "¿Cuánta ganancia le he sacado al cliente André Manuel Molina y qué es lo que más me compra?",
                    toolUsed: "pos_get_client_profit_summary",
                    explanation: "El agente busca las ventas del cliente, resta el costo de compra de cada producto vendido y te entrega la ganancia neta en pesos, el margen porcentual y sus productos más consumidos.",
                  },
                  {
                    id: "prompt-habilitar-credito",
                    title: "7. Habilitar Cupo de Crédito a un Cliente",
                    prompt: "Habilítale un cupo de crédito (fiado) de $500.000 a André Manuel Molina para que pueda comprar a crédito.",
                    toolUsed: "pos_set_client_credit",
                    explanation: "El agente activa la cuenta de crédito del cliente, define su límite máximo autorizado en $500.000 COP y te confirma que ya puede llevar fiado en el mostrador.",
                  },
                ].map((item) => (
                  <div key={item.id} id={item.id} className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-xs space-y-3">
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">{item.title}</h3>
                    <div className="bg-[#090d16] p-3.5 rounded-xl border border-slate-800 font-mono text-xs text-zinc-200 flex items-center justify-between">
                      <span>"{item.prompt}"</span>
                      <button
                        onClick={() => copyToClipboard(item.prompt, item.id)}
                        className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white cursor-pointer"
                      >
                        {copiedId === item.id ? <IconCheck className="h-4 w-4 text-zinc-200" /> : <IconCopy className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span><strong>Herramienta que se activa:</strong> <code className="text-zinc-900 dark:text-zinc-200 dark:text-zinc-200 font-bold ml-1">{item.toolUsed}</code></span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* 9. DETALLE DE ENDPOINTS REST (VISTAS DINÁMICAS) */}
          {/* ========================================================== */}
          {currentSection.category === "endpoints" && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div>
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
                  {currentSection.title}
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                  Endpoints REST disponibles para integración directa. Cada uno cuenta con especificación de parámetros, encabezados requeridos y probador interactivo en vivo.
                </p>
              </div>

              <div className="space-y-6">
                {(DETAILED_ENDPOINTS[activeSectionId] || []).map((ep) => {
                  const liveResult = liveTestResults[ep.id]
                  return (
                    <div key={ep.id} id={ep.id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md overflow-hidden shadow-xs">
                      {/* Cabecera del Endpoint */}
                      <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={cn("px-2.5 py-1 rounded-lg text-xs border tracking-wide", getMethodBadgeClass(ep.method))}>
                            {ep.method}
                          </span>
                          <code className="text-sm font-bold text-slate-900 dark:text-white font-mono bg-white dark:bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800">
                            {ep.path}
                          </code>
                          {ep.roles.map((r, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-0">
                              {r}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {ep.method === "GET" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={liveResult?.loading}
                              onClick={() => handleTestEndpoint(ep)}
                              className="h-8 text-xs gap-1.5 border-zinc-400 dark:border-zinc-600 text-zinc-950 dark:text-white hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 cursor-pointer"
                            >
                              <IconPlayerPlay className="h-3.5 w-3.5" />
                              {liveResult?.loading ? "Consultando..." : "Probar en Vivo"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(ep.path, ep.id)}
                            className="h-8 text-xs gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            {copiedId === ep.id ? <IconCheck className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" /> : <IconCopy className="h-3.5 w-3.5" />}
                            Copiar Ruta
                          </Button>
                        </div>
                      </div>

                      {/* Cuerpo de la Documentación del Endpoint */}
                      <div className="p-4 sm:p-6 space-y-4 text-xs">
                        <div>
                          <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">{ep.title}</h3>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">{ep.description}</p>
                        </div>

                        {/* Parámetros Query */}
                        {ep.queryParams && (
                          <div className="space-y-2 pt-2">
                            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Parámetros de Consulta (Query Params):</span>
                            <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-950">
                              <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400">
                                  <tr>
                                    <th className="p-2.5 font-semibold">Parámetro</th>
                                    <th className="p-2.5 font-semibold">Tipo</th>
                                    <th className="p-2.5 font-semibold">Obligatorio</th>
                                    <th className="p-2.5 font-semibold">Descripción</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                                  {ep.queryParams.map((p, i) => (
                                    <tr key={i}>
                                      <td className="p-2.5 font-mono text-zinc-950 dark:text-white font-bold">{p.name}</td>
                                      <td className="p-2.5 font-mono text-slate-500">{p.type}</td>
                                      <td className="p-2.5">{p.required ? <span className="text-zinc-950 dark:text-white font-bold">Sí</span> : "Opcional"}</td>
                                      <td className="p-2.5">{p.description}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Request Body & Response */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                          {ep.requestBody && (
                            <div className="space-y-2">
                              <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Cuerpo de la Petición (Request Body JSON):</span>
                              <pre className="bg-[#090d16] p-3.5 rounded-xl border border-slate-800 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56 shadow-md">
                                <code>{JSON.stringify(ep.requestBody, null, 2)}</code>
                              </pre>
                            </div>
                          )}

                          <div className={cn("space-y-2", !ep.requestBody && "lg:col-span-2")}>
                            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block flex items-center justify-between">
                              <span>Respuesta Ejemplo ({ep.responseStatus}):</span>
                            </span>
                            <pre className="bg-[#090d16] p-3.5 rounded-xl border border-slate-800 text-zinc-200 font-mono text-[11px] overflow-x-auto max-h-56 shadow-md">
                              <code>{JSON.stringify(ep.responseExample, null, 2)}</code>
                            </pre>
                          </div>
                        </div>

                        {/* Resultado de prueba en vivo si existe */}
                        {liveResult && (
                          <div className="mt-4 p-4 rounded-xl border border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-900/60  space-y-2">
                            <span className="font-bold text-zinc-900 dark:text-zinc-100 dark:text-zinc-200 flex items-center gap-1.5">
                              <IconCheck className="h-4 w-4" /> Respuesta en Vivo desde el Servidor
                            </span>
                            <pre className="bg-[#090d16] p-3 rounded-lg border border-slate-800 text-slate-100 font-mono text-xs overflow-x-auto max-h-48">
                              <code>{JSON.stringify(liveResult.data || liveResult.error, null, 2)}</code>
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>

        {/* ============================================================ */}
        {/* COLUMNA 3: TOC DERECHO ("EN ESTA PÁGINA" - ESTILO UNIFICADO) */}
        {/* ============================================================ */}
        <aside className="hidden xl:block w-64 pt-8 px-4 shrink-0 text-xs">
          <div className="sticky top-20 space-y-3">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <IconTOC className="h-4 w-4 text-zinc-950 dark:text-white" />
              <span>En esta página</span>
            </div>

            <nav className="space-y-1 border-l border-slate-200 dark:border-slate-800 pl-3">
              {(currentSection.subHeadings || []).map((sh) => (
                <button
                  key={sh.id}
                  onClick={() => scrollToHeading(sh.id)}
                  className="block w-full text-left py-1 text-slate-600 dark:text-slate-400 hover:text-zinc-950 dark:text-zinc-100 dark:hover:text-zinc-200 transition-colors truncate cursor-pointer"
                >
                  {sh.label}
                </button>
              ))}
            </nav>

            {/* Tarjeta de soporte / comunidad */}
            <div className="mt-8 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md space-y-2 shadow-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">¿Necesitas ayuda?</span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Contacta directamente al equipo técnico o prueba tus prompts en vivo con el Servidor MCP.
              </p>
              <a
                href="https://wa.me/573000000000?text=Hola,%20tengo%20una%20duda%20sobre%20la%20API%20o%20el%20MCP%20de%20OmniPOS"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-zinc-950 dark:bg-white dark:text-zinc-950/10 text-zinc-950 dark:text-white hover:bg-zinc-950 dark:bg-white dark:text-zinc-950/20 font-bold text-xs transition-colors border border-zinc-300 dark:border-zinc-700 cursor-pointer"
              >
                <IconBrandWhatsapp className="h-4 w-4 text-[#25D366]" />
                <span>Chat de Soporte</span>
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* ============================================================== */}
      {/* 3. BOTÓN FLOTANTE DE WHATSAPP (IGUAL A LA IMAGEN) */}
      {/* ============================================================== */}
      <a
        href="https://wa.me/573000000000?text=Hola,%20tengo%20una%20consulta%20sobre%20la%20API%20de%20OmniPOS"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-[#25D366] hover:bg-[#20ba59] text-white flex items-center justify-center shadow-lg shadow-[#25D366]/30 transition-transform hover:scale-110 active:scale-95"
        title="Abrir chat de soporte en WhatsApp"
      >
        <IconBrandWhatsapp className="h-7 w-7" />
      </a>
    </div>
  )
}
