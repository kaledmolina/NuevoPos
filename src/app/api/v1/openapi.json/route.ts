import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "OmniPOS Core & Marketplace API",
      version: "1.0.0",
      description: "API REST completa y extensible de OmniPOS para clientes (marketplace de negocios y pedidos), repartidores (app de domiciliarios), vendedores móviles y administradores.",
      contact: {
        name: "Soporte OmniPOS",
        email: "kaledmoly@gmail.com",
      },
    },
    servers: [
      {
        url: "/api/v1",
        description: "Servidor Principal OmniPOS API v1",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Ingresa tu token de autenticación obtenido en /auth/login o /auth/register-client",
        },
      },
      schemas: {
        Business: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            rubro: { type: "string" },
            branchesCount: { type: "integer" },
            productsCount: { type: "integer" },
            branches: { type: "array", items: { type: "object" } },
          },
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            price: { type: "number" },
            stock: { type: "integer" },
            unit: { type: "string" },
            image: { type: "string" },
            description: { type: "string" },
            branchId: { type: "string" },
          },
        },
        Order: {
          type: "object",
          properties: {
            id: { type: "string" },
            orderNumber: { type: "string" },
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            deliveryAddress: { type: "string" },
            total: { type: "number" },
            status: { type: "string", enum: ["pendiente", "confirmado", "en_preparacion", "en_camino", "entregado", "cancelado"] },
            items: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
    paths: {
      "/auth/login": {
        post: {
          summary: "Iniciar sesión universal (Clientes, Domiciliarios, Vendedores, Admins)",
          tags: ["Autenticación"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["identifier", "pin"],
                  properties: {
                    identifier: { type: "string", example: "cliente@gmail.com" },
                    pin: { type: "string", example: "1234" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Autenticación exitosa con Bearer Token" },
            401: { description: "Credenciales inválidas" },
          },
        },
      },
      "/auth/register-client": {
        post: {
          summary: "Auto-registro de Clientes consumidores",
          tags: ["Autenticación"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "email", "pin"],
                  properties: {
                    name: { type: "string", example: "Carlos Gómez" },
                    email: { type: "string", example: "carlos@ejemplo.com" },
                    pin: { type: "string", example: "1234" },
                    phone: { type: "string", example: "3001234567" },
                    address: { type: "string", example: "Calle 45 # 12-34, Apto 302" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Cliente registrado e inicio de sesión automático" },
          },
        },
      },
      "/auth/me": {
        get: {
          summary: "Obtener perfil del usuario autenticado",
          tags: ["Autenticación"],
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "Perfil de usuario" } },
        },
      },
      "/businesses": {
        get: {
          summary: "Listar negocios activos (para que los clientes exploren)",
          tags: ["Negocios"],
          parameters: [
            { name: "rubro", in: "query", schema: { type: "string" }, description: "drogueria, tienda, ferreteria, ropa" },
            { name: "q", in: "query", schema: { type: "string" }, description: "Búsqueda por nombre o rubro" },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          ],
          responses: { 200: { description: "Lista de comercios con sedes y productos" } },
        },
      },
      "/businesses/{id}": {
        get: {
          summary: "Detalle de un negocio y sus categorías",
          tags: ["Negocios"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Detalle del negocio" } },
        },
      },
      "/products": {
        get: {
          summary: "Listar catálogo de productos (con filtro de negocio o sede)",
          tags: ["Productos"],
          parameters: [
            { name: "businessId", in: "query", schema: { type: "string" }, description: "ID del negocio" },
            { name: "branchId", in: "query", schema: { type: "string" }, description: "ID de la sede" },
            { name: "categoryId", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" }, description: "Búsqueda por nombre o código de barras" },
            { name: "inStock", in: "query", schema: { type: "string", enum: ["0", "1"] } },
          ],
          responses: { 200: { description: "Listado paginado de productos" } },
        },
        post: {
          summary: "Crear un nuevo producto (Admin / Vendedor)",
          tags: ["Productos"],
          security: [{ BearerAuth: [] }],
          responses: { 201: { description: "Producto creado" } },
        },
      },
      "/orders": {
        get: {
          summary: "Listar pedidos (filtrados automáticamente por rol del solicitante)",
          tags: ["Pedidos"],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "businessId", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "Listado de pedidos" } },
        },
        post: {
          summary: "Realizar un nuevo pedido a un negocio",
          tags: ["Pedidos"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["businessId", "customerName", "customerPhone", "items"],
                  properties: {
                    businessId: { type: "string" },
                    branchId: { type: "string" },
                    customerName: { type: "string", example: "Juan Pérez" },
                    customerPhone: { type: "string", example: "3109876543" },
                    customerEmail: { type: "string", example: "juan@ejemplo.com" },
                    deliveryAddress: { type: "string", example: "Carrera 15 # 80-20" },
                    deliveryNotes: { type: "string", example: "Timbre 201, portería" },
                    paymentMethod: { type: "string", enum: ["contraentrega", "efectivo", "transferencia", "nequi"], default: "contraentrega" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["productId", "quantity"],
                        properties: {
                          productId: { type: "string" },
                          quantity: { type: "integer", minimum: 1 },
                          notes: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Pedido creado y notificado al negocio" } },
        },
      },
      "/orders/{id}": {
        get: {
          summary: "Consultar detalle y rastreo en tiempo real de un pedido",
          tags: ["Pedidos"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Detalle y línea de tiempo del pedido" } },
        },
      },
      "/orders/{id}/status": {
        patch: {
          summary: "Actualizar estado del pedido (Confirmar, Preparar, En Camino, Entregar, Cancelar)",
          tags: ["Pedidos"],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: { type: "string", enum: ["confirmado", "en_preparacion", "en_camino", "entregado", "cancelado"] },
                    cancelReason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Estado actualizado" } },
        },
      },
      "/delivery/orders": {
        get: {
          summary: "Listar pedidos disponibles o asignados al domiciliario",
          tags: ["Domiciliarios"],
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "Lista de pedidos para reparto" } },
        },
      },
      "/delivery/orders/{id}/accept": {
        post: {
          summary: "Tomar pedido para entrega inmediata",
          tags: ["Domiciliarios"],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Pedido asignado al repartidor" } },
        },
      },
      "/delivery/orders/{id}/complete": {
        post: {
          summary: "Marcar pedido como entregado y cobrado",
          tags: ["Domiciliarios"],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Entrega completada" } },
        },
      },
      "/sales": {
        get: {
          summary: "Historial de ventas de la sede",
          tags: ["Ventas"],
          security: [{ BearerAuth: [] }],
          responses: { 200: { description: "Listado de ventas" } },
        },
        post: {
          summary: "Registrar venta inmediata (POS / Vendedor)",
          tags: ["Ventas"],
          security: [{ BearerAuth: [] }],
          responses: { 201: { description: "Venta registrada" } },
        },
      },
    },
  }

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
