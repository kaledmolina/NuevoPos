# Worklog — Sistema POS para Droguería

Este archivo registra el trabajo de todos los agentes en el proyecto.
Cada sección comienza con `---` y sigue el formato establecido.

---
Task ID: 1
Agent: Coordinator (Z.ai Code)
Task: Foundation del sistema POS de droguería (schema, db, lib, shell, vistas core)

Work Log:
- Definí el schema Prisma completo: Category, Product (con stock, minStock, expirationDate, batch, location, barcode, cost, price, unit), Client, Supplier, Sale, SaleItem, Purchase, PurchaseItem, CashSession, CashTransaction, Transaction (ingresos/egresos), Setting.
- Ejecuté `bun run db:push` (SQLite en db/custom.db). Cliente Prisma generado.
- Creé `src/lib/format.ts` (formatCurrency COP, formatDate, daysUntil, expirationStatus, nextInvoiceNumber).
- Creé `src/lib/store.ts` (Zustand: view activa, sidebar móvil, carrito POS, refreshKey global).
- Creé `src/lib/api.ts` (apiFetch helper).
- Actualicé `src/app/globals.css` con tema verde esmeralda (farmacia) para light/dark + scrollbar.
- Actualicé `src/app/layout.tsx` (metadata droguería, Toaster Sonner).
- Creé API routes core:
  - `/api/seed` (POST): carga datos demo (8 categorías, 26 productos con vencimientos variados incluidos vencidos/por vencer, 6 clientes, 4 proveedores, caja abierta, 1 venta ejemplo).
  - `/api/products` (GET con filtros q/categoryId/lowStock/expiring, POST) y `/api/products/[id]` (PATCH, DELETE).
  - `/api/categories` (GET, POST).
  - `/api/sales` (GET list, POST checkout con validación de stock, descuento, métodos de pago, registro en caja) y `/api/sales/[id]` (PATCH anular reversa stock).
  - `/api/cash` (GET sesión abierta, POST abrir), `/api/cash/history` (GET), `/api/cash/close` (POST arqueo con cálculo de esperado y diferencia), `/api/cash/transaction` (POST ingreso/egreso en caja abierta).
  - `/api/settings` (GET).
  - `/api/dashboard` (GET métricas: ventas hoy/mes, valor inventario, alertas stock bajo/vencimientos, flujo mes, caja actual, ventas por día 7d, top productos).
- Creé vistas core (componentes en `src/components/pos/`):
  - `dashboard.tsx`: KPIs, alertas (stock bajo, por vencer, vencidos), gráfico área 7 días, top productos, flujo del mes, ventas recientes, resumen inventario.
  - `pos-terminal.tsx`: búsqueda/escaneo, grid de productos, carrito con cantidades, cliente, descuento, método de pago, efectivo recibido + cambio, checkout, modal recibo imprimible.
  - `products.tsx`: tabla inventario con filtros, badges de stock/vencimiento, CRUD completo (modal), exportar CSV, alertas.
  - `sales.tsx`: historial de ventas con filtros, detalle en modal, anular venta.
- Creé STUBS para módulos delegados: `clients.tsx`, `suppliers.tsx`, `purchases.tsx`, `cash.tsx`, `finance.tsx`, `reports.tsx` (placeholder).
- Construí el shell en `src/app/page.tsx`: sidebar oscuro con grupos de navegación, header con título/subtítulo dinámico, footer sticky, sidebar móvil (Sheet), modal "cargar datos demo". Renderiza la vista activa según `useAppStore.view`.

Stage Summary:
- Foundation completa y funcional. La app compila con vistas core operativas (Dashboard, POS, Productos, Ventas) sobre el schema de BD.
- Convenciones establecidas: moneda COP vía `formatCurrency`, toasts con `sonner`, estado global con Zustand (`useAppStore`), fetch con `apiFetch`, refresh global con `triggerRefresh()`.
- Rutas API disponibles para que los subagentes consuman: products, categories, sales, cash, dashboard, settings. Los subagentes crearán: clients, suppliers, purchases, transactions, reports.
- Pendiente (subagentes paralelos): Clientes/Proveedores (CRUD), Compras (con actualización de stock), Caja/Arqueo (vista), Ingresos/Egresos, Reportes.
- Esquema de archivos que los subagentes deben respetar:
  - Vistas: `src/components/pos/<modulo>.tsx` (export default, "use client")
  - APIs: `src/app/api/<modulo>/route.ts` y `[id]/route.ts` cuando aplique
  - Usar `db` desde `@/lib/db`, formatos desde `@/lib/format`, `apiFetch` desde `@/lib/api`, `useAppStore` desde `@/lib/store`

---
Task ID: 4a
Agent: full-stack-developer
Task: Módulos CRUD de Clientes y Proveedores (API + vistas)

Work Log:
- Revisé el worklog previo y los patrones establecidos (products.tsx como referencia de estilo, schema Prisma con `Client` y `Supplier`, helpers de `@/lib/*`, store Zustand, `apiFetch`, `formatDateTime`).
- Creé las rutas de API para clientes:
  - `src/app/api/clients/route.ts`: `GET(?q=)` filtra por nombre/documento/teléfono (contains), incluye `_count: { select: { sales: true } }`; `POST` valida `name` requerido, normaliza strings (trim, ""→null).
  - `src/app/api/clients/[id]/route.ts`: `PATCH` actualiza campos opcionalmente; `DELETE` verifica primero ventas asociadas y responde 409 si las hay (evita romper integridad referencial).
- Creé las rutas de API para proveedores (mismo patrón):
  - `src/app/api/suppliers/route.ts`: `GET(?q=)` filtra por nombre/documento/teléfono/contactName, incluye `_count: { select: { purchases: true } }`; `POST` valida `name`.
  - `src/app/api/suppliers/[id]/route.ts`: `PATCH` + `DELETE` con verificación de compras asociadas (409 si existen).
- Implementé `src/components/pos/clients.tsx` (vista "use client"):
  - Header con icono `Users`, conteo de clientes + total de compras registradas, botón "Nuevo cliente".
  - Barra de búsqueda (nombre, cédula, teléfono) con icono.
  - Tabla responsive: Nombre (con avatar circular + datos compactos en móvil), Documento (hidden md), Teléfono (hidden sm), Email (hidden lg), Compras como Badge mono, Acciones (editar/eliminar icon buttons).
  - Estados de loading (skeletons), empty (con CTA si no hay búsqueda), error (toast).
  - Dialog max-w-lg con grid 2 cols en md: name*, document, phone, email, address, notes (textarea). Muestra fecha de registro en edición.
  - AlertDialog de confirmación de borrado. Toasts sonner. `triggerRefresh()` + reload local tras cada mutación.
- Implementé `src/components/pos/suppliers.tsx` (vista "use client") con el mismo patrón:
  - Header con icono `Building2`, conteo + total de compras.
  - Tabla: Nombre, Documento (hidden md), Contacto (hidden lg, con icono Contact), Teléfono (hidden sm), Compras Badge, Acciones.
  - Dialog max-w-lg: name*, document, contactName, phone, email, address, notes.
- Validé con `bun run lint` → 0 errores en todos los archivos nuevos.
- Verifiqué que los iconos `Contact`, `Building2`, `Users`, `User` existen en `lucide-react`.

Stage Summary:
- Módulos de Clientes y Proveedores completos y operativos: APIs REST (GET/POST/PATCH/DELETE) con filtrado por búsqueda, conteo de relaciones y validación de integridad referencial al borrar.
- Vistas consistentes con el resto del sistema (mismo look-and-feel que `products.tsx`): responsive mobile-first, estados de carga/vacío/error, diálogos accesibles, toasts, refresh global.
- Integración limpia con el shell existente: los componentes ya están referenciados en `src/app/page.tsx` y se cargan al navegar a las vistas `clients`/`suppliers`.
- Convenciones respetadas: `db` desde `@/lib/db`, `apiFetch` desde `@/lib/api`, `useAppStore` con `refreshKey`/`triggerRefresh`, `formatDateTime` de `@/lib/format`, `dynamic = "force-dynamic"`, `params: Promise<{ id: string }>` con `await`, todo en español, tema esmeralda.
- Pendiente (otros subagentes): Compras (que consume proveedores y actualiza stock), Caja/Arqueo, Ingresos/Egresos, Reportes.

---
Task ID: 4c
Agent: full-stack-developer
Task: Vista de Caja y Arqueo (src/components/pos/cash.tsx) — apertura, movimientos (ingreso/egreso), arqueo con cálculo esperado/declarado/diferencia, historial de sesiones.

Work Log:
- Revisé worklog previo y los endpoints de cash ya existentes (GET/POST /api/cash, GET /api/cash/history, POST /api/cash/close, POST /api/cash/transaction). Confirmé convenciones: apiFetch, useAppStore (refreshKey/triggerRefresh), formatCurrency/formatDateTime, sonner, tema esmeralda, shadcn/ui New York.
- Reemplacé el stub `src/components/pos/cash.tsx` por una vista completa `"use client"` con un único `load()` que trae en paralelo `/api/cash` (sesión abierta) y `/api/cash/history`; se reejecuta al cambiar `refreshKey` y tras cada mutación.
- Helpers de cálculo (solo efectivo): `breakdown(session)` → { ventas, ingresos, egresos, esperado } donde esperado = openingAmount + ventas efectivo + ingresos efectivo − egresos efectivo (coincide con el cálculo del backend en /api/cash/close). `effectiveBalance()` reutiliza `breakdown().esperado`. `diferenciaInfo(diff)` → color/label (cuadrado=emerald, faltante=red, sobrante=amber).
- Estado CERRADO: tarjeta prominente "Caja cerrada" con icono Wallet y botón "Abrir caja" → Dialog (monto inicial numérico + responsable). Debajo, historial completo en tabla (apertura, responsable, inicial, esperado, cierre, diferencia con color, estado badge, ojo de detalle).
- Estado ABIERTO: tarjeta resumen con gradiente esmeralda mostrando openedAt, openedBy y el **saldo en efectivo** (esperado) en grande + mini-grid (inicial, ventas efectivo, ingresos efectivo, egresos efectivo). Tres botones de acción: Ingreso (esmeralda), Egreso (rojo), Cerrar caja/Arqueo (ámbar). Tabla de movimientos ordenada descendente por fecha, con scroll `max-h-[28rem]`, badges de tipo (venta=primary, ingreso=emerald outline, egreso=destructive), método, referencia, monto con signo/color (egreso −rojo, ingreso/venta +esmeralda).
- Dialog de Arqueo: resumen del cálculo (inicial, +ventas, +ingresos, −egresos, =esperado), input de monto contado (declarado) precargado con el esperado, **diferencia en vivo** = declarado − esperado con color y label dinámico (Cuadrado/Faltante/Sobrante), responsable del cierre y notas opcionales. "Confirmar cierre" → POST /api/cash/close { id, closingAmount, closedBy, notes }.
- Dialog de Ingreso/Egreso: tipo fijo, monto, concepto, método (Select efectivo/tarjeta/transferencia), referencia opcional; aviso cuando el método no es efectivo (no afecta el arqueo).
- Dialog de Detalle de historial: como /api/cash/history devuelve solo `_count` (no transactions) y no puedo agregar rutas, muestro el resumen del arqueo (inicial, esperado, declarado, diferencia con badge, responsables, fechas, notas, n° de movimientos) — detalle útil de la sesión cerrada.
- Validaciones: montos numéricos > 0, campos obligatorios (responsable, concepto), toasts de éxito/error con sonner, estados loading (Skeleton) y error (con reintentar). Todos los valores monetarios con formatCurrency (COP).
- Responsive: gradiente y acciones apilan en móvil (grid-cols-1 sm:grid-cols-3), tablas con overflow-x-auto, columnas ocultas en pantallas pequeñas (sm:/md:/lg:).
- `bun run lint` pasa sin errores. Compilación limpia en dev.log.

Stage Summary:
- Vista de Caja y Arqueo completa y funcional, integrada con los endpoints existentes sin modificarlos ni agregar nuevos.
- Arqueo claro y transparente: muestra explícitamente monto inicial, ventas/ingresos/egresos en efectivo, monto esperado, monto contado (declarado) y diferencia en vivo con semáforo de color.
- Cumple convenciones del proyecto (esmeralda, shadcn/ui, apiFetch, useAppStore, sonner, formatCurrency). Lista para uso en producción dentro del shell existente.

---
Task ID: 4e
Agent: full-stack-developer
Task: Módulo de Reportes y Analítica (vista + API)

Work Log:
- Creé `src/app/api/reports/route.ts` (GET `?range=7|30|90`, default 30). Endpoint server-side con Prisma que devuelve en una sola respuesta todas las métricas del período:
  - KPIs: totalSales, salesCount, avgTicket, totalProfit (Σ (unitPrice − unitCost) × qty), totalPurchases, totalIncome, totalExpenses.
  - salesByDay: 7 buckets diarios (range=7) o buckets semanales (range=30/90) con formato "dd/mm-dd/mm".
  - salesByCategory: agrupado por product.category.name, top 6 + "Otros" consolidado.
  - salesByPaymentMethod: agrupado por método con total y count.
  - topProducts: top 8 por cantidad con qty, total y profit.
  - inventorySummary: totalProducts, stockUnits, stockCostValue (Σ cost×stock), stockRetailValue (Σ price×stock), lowStockCount, expiredCount, expiringCount (≤30d usando daysUntil).
  - bestClients: top 5 clientes por monto comprado.
  - Carga paralela (Promise.all) de sales/saleItems/purchases/transactions/products con filtros createdAt gte/lte. try/catch con error 500.
- Creé `src/components/pos/reports.tsx` (export default, "use client") — vista de analítica con:
  - Header con título "Reportes" + icono BarChart3 y Select de rango (7/30/90 días) que re-fetch.
  - Fila de 6 KPIs: Ventas totales, Utilidad bruta, # Ventas, Ticket promedio, Compras, Flujo neto (ingresos−egresos). Cada uno con icono y tono temático (primary/emerald/teal/amber/orange/red).
  - Gráfico de ventas por día/semana (AreaChart con gradiente esmeralda) — usa var(--chart) y formato `oklch(0.55 0.13 162)` primary.
  - Fila de 2 charts: Ventas por categoría (PieChart donut con Cell coloreadas de la paleta esmeralda) y Métodos de pago (BarChart horizontal con barras coloreadas).
  - Fila de 2 tablas: Top productos (rank, nombre, qty, total, utilidad) y Mejores clientes (rank, nombre, # compras, total).
  - Sección Resumen de inventario: 4 tiles (productos, unidades, valor costo, valor venta) + 3 alertas (stock bajo, por vencer, vencidos) + margen potencial.
  - Skeletons durante fetch. Mensajes "Sin datos" en charts vacíos. Tooltips con formatCurrency. Responsive: grids 2 cols mobile → 3/6 cols en xl; charts stackean en mobile y se ponen lado a lado en lg.
  - Imports: apiFetch, useAppStore(refreshKey), formatCurrency/formatNumber, Card/Skeleton/Select/Table/Badge, lucide-react icons, recharts.
- Verifiqué con curl que el endpoint funciona para range=7/30/90 (con datos demo cargados): ventas por día/semana correctas, categorías, métodos de pago, top productos y resumen de inventario (26 productos, 5 stock bajo, 1 vencido, 6 por vencer). Lint pasa limpio.

Stage Summary:
- Módulo de Reportes completo y funcional sobre la base existente. Cumple scope: KPIs, 3 gráficos (Recharts: área + donut + barras), 2 tablas y resumen de inventario con alertas.
- Paleta esmeralda consistente con la farmacia (var(--chart-1..5) + oklch primary). Tooltips formateados en COP. Diseño responsive (mobile-first, sticky footer ya provisto por el shell). Manejo graceful de datos vacíos.
- Sin modificaciones a archivos fuera de scope. API sigue patrón `export const dynamic = "force-dynamic"` + `NextResponse.json` + `import { db } from "@/lib/db"`. Vista sigue patrón de dashboard/sales con `useAppStore(refreshKey)` y `apiFetch`.
- Archivos creados: `src/app/api/reports/route.ts`, `src/components/pos/reports.tsx` (reemplazo del stub).

---
Task ID: 4d
Agent: full-stack-developer
Task: Módulo de Ingresos y Egresos (Transaction) — API REST + vista finance.tsx completa

Work Log:
- Leí worklog.md y revisé la base: schema Prisma (model Transaction ya definido), librerías (`@/lib/db`, `@/lib/api`, `@/lib/store`, `@/lib/format`), patrones de API routes (`products`, `sales`), patrones de vistas (`products.tsx`, `sales.tsx`).
- Creé `src/app/api/transactions/route.ts`:
  - `GET`: lista hasta 300 movimientos `orderBy date desc`. Soporta `?type=ingreso|egreso`, `?from=ISO&to=ISO` (sobre campo `date`, `to` incluye todo el día), `?q=` (busca en `concept`, `category`, `description` con `contains`). Devuelve array JSON.
  - `POST`: valida `type` ∈ {ingreso, egreso}, `amount > 0`, `concept` no vacío. Defaults `method="efectivo"`, `date=now`. Si hay caja abierta, asocia `cashSessionId` y crea un `CashTransaction` espejo con `reference` al Transaction (para que aparezca en el arqueo). Devuelve 201.
- Creé `src/app/api/transactions/[id]/route.ts`:
  - `PATCH`: actualiza campos parcialmente; valida type/amount/concept; normaliza `date` y `description`; 404 si no existe.
  - `DELETE`: borra el Transaction y, si tenía `cashSessionId`, también elimina el `CashTransaction` espejo vía `reference`. 404 si no existe.
- Reemplacé el stub `src/components/pos/finance.tsx` con la vista completa ("use client"):
  - Header con icono `ArrowLeftRight` y subtítulo con conteo dinámico.
  - 3 tarjetas de resumen (Total Ingresos esmeralda, Total Egresos rojo, Balance neto con color según signo), computadas desde la lista filtrada actual.
  - Barra de filtros: búsqueda por concepto/categoría, Select de tipo (todos/ingresos/egresos), dos inputs date (desde/hasta), botón "Limpiar" cuando hay filtros activos, y dos botones "Nuevo ingreso" / "Nuevo egreso" (esmeralda/rojo, con iconos TrendingUp/TrendingDown).
  - Tabla dentro de Card con columnas: Fecha, Tipo (badge coloreado), Categoría, Concepto (con descripción como sub-línea), Método (badge), Monto (right-aligned, signo +/− y color), Acciones (editar/eliminar). Header sticky, scroll vertical máximo, scroll horizontal responsive. Skeletons mientras carga, estado vacío con CTA, estado de error con botón reintentar.
  - Dialog crear/editar (max-w-lg): Tipo (Select), Monto (number), Categoría (Input con `<datalist>` para presets según tipo: Servicios/Alquiler/Intereses/Otros ingresos o Servicios públicos/Salarios/Arriendo/Compras/Mantenimiento/Otros egresos — permite escribir libre o elegir sugerencia), Concepto, Descripción (Textarea), Método (Select), Fecha (date input default hoy). Validación cliente + toast. Llama POST o PATCH según `editing`, dispara `triggerRefresh()` y recarga.
  - AlertDialog de confirmación para eliminar.
  - Totales y saldo computados con `useMemo` desde `items`. Hook `load()` dependiente de `buildUrl()` (que depende de filtros), se re-ejecuta al cambiar filtros o `refreshKey`.
  - Totalmente responsive (mobile-first), tema esmeralda consistente, moneda COP vía `formatCurrency`, toasts con `sonner`.
- Probé manualmente los endpoints con curl: GET vacío `[]`, GET con `?type=ingreso`, GET con `?q=delivery`, POST crea y asocia a caja abierta (`cashSessionId` poblado), PATCH actualiza monto/concepto, DELETE remueve y deja lista vacía. Validaciones devuelven 400 con mensajes en español ("El tipo debe ser 'ingreso' o 'egreso'", "El monto debe ser mayor a 0", "El concepto es obligatorio"). PATCH/DELETE sobre ID inexistente devuelve 404.
- `bun run lint` pasa sin errores ni warnings.

Stage Summary:
- Módulo Ingresos/Egresos operativo end-to-end. Endpoints `/api/transactions` (GET con filtros + POST) y `/api/transactions/[id]` (PATCH + DELETE) funcionando, validando y enlazando con la caja abierta.
- Vista `finance.tsx` reemplaza el stub con una interfaz completa: resumen (ingresos/egresos/balance), filtros (tipo, fecha, búsqueda), tabla con badges de color por tipo/método, dialog de crear/editar con presets de categoría y entrada libre, y confirmación de eliminación.
- Convenciones respetadas: `apiFetch`, `useAppStore` (`triggerRefresh` + `refreshKey`), `formatCurrency` COP, `sonner` toasts, shadcn/ui (Card, Input, Select, Badge, Skeleton, Table, Dialog, AlertDialog, Textarea, Label, Button), iconos lucide-react.
- Integración con caja: cada Transaction creado durante una sesión abierta también se refleja en `CashTransaction` para el arqueo; al eliminar el Transaction se elimina también el CashTransaction espejo (vía `reference`).
- No se modificaron archivos fuera del scope (`page.tsx`, `schema.prisma`, `lib/*`, `globals.css`, `eslint.config.mjs`, ni APIs/vistas existentes). Work record del agente en `/agent-ctx/4d-full-stack-developer.md`.

---
Task ID: 4b
Agent: full-stack-developer
Task: Módulo de Compras (compras a proveedores) — API y vista Compras con registro, detalle y anulación, actualizando stock/costo de productos.

Work Log:
- Creé `src/app/api/purchases/route.ts`:
  - `GET`: lista compras con `supplier` e `items { include { product } }`, orderBy createdAt desc, take 200. Filtro opcional `?q=` por referencia o nombre del proveedor (vía `OR` con `supplier.name contains`). Wrap en try/catch (500).
  - `POST`: registra una compra. Body `{ reference, supplierId, notes, items:[{productId, quantity, unitCost, expirationDate?, batch?}] }`. Valida items no vacíos, cantidades > 0 y costos ≥ 0, y que todos los productos existan. Calcula subtotal = Σ(qty*unitCost), tax=0, total=subtotal. Usa `db.$transaction`: crea la compra con sus items y, por cada item, actualiza el producto (incrementa stock, setea `cost` al nuevo unitCost, y asigna `expirationDate`/`batch` solo si el producto NO los tenía). Retorna la compra creada con includes.
- Creé `src/app/api/purchases/[id]/route.ts`:
  - `GET`: detalle de compra con supplier + items+product (404 si no existe).
  - `PATCH({status:"anulada"})`: anula la compra si no está ya anulada. En transacción, por cada item obtiene el stock actual y lo decrementa sin bajar de 0 (`Math.max(0, stock - qty)`), luego marca status anulada. Retorna la compra actualizada con includes.
- Reescribí `src/components/pos/purchases.tsx` (era stub): vista Compras completa en español, tema esmeralda.
  - Header con ícono Truck, conteo y total del período (excluye anuladas), botón "Nueva compra".
  - Filtro de búsqueda por referencia/proveedor.
  - Tabla responsive: Referencia (mono), Proveedor (hidden md), Fecha (hidden sm), Items, Total, Estado (badge: recibida=esmeralda, pendiente=ámbar, anulada=destructive), Acción (ver detalle). Estados loading (skeletons) y vacío.
  - Diálogo "Nueva compra" (max-w-3xl, max-h-90vh scroll): campos Proveedor (Select, con opción "Sin proveedor"), Referencia, Notas. Buscador de productos inline (Input + lista filtrada clickeable, muestra código/stock/costo y marca "agregado"). Cada línea editable: cantidad, costo unit. (prellenado con product.cost), vencimiento (date), lote, subtotal y botón quitar. Total acumulado. Validación de ≥1 línea con qty>0. POST → toast, cierra, recarga, `triggerRefresh()`.
  - Diálogo detalle: referencia, proveedor, fecha, estado, notas, lista de items (qty × producto @ unitCost = subtotal, con lote/vencimiento), totales (subtotal/impuesto/total). Botón "Anular compra" con confirmación (AlertDialog) si status !== anulada → PATCH → toast, recarga, `triggerRefresh()`.
- Verificación con curl: POST incrementó stock (238→248), actualizó cost (1200→1500), respetó vencimiento/lote existentes; PATCH anular revirtió stock (248→238) y marcó anulada; GET single y filtro `?q=` OK. Limpié los datos de prueba.
- `bun run lint` pasa sin errores. Sin tocar archivos fuera de scope (schema, page.tsx, lib, etc.).

Stage Summary:
- Módulo Compras operativo end-to-end: registro de compras con actualización automática de inventario (stock + último costo + vencimiento/lote si aplica), listado filtrable, detalle y anulación con reversa de stock (sin negativos).
- APIs creadas: `GET/POST /api/purchases`, `GET/PATCH /api/purchases/[id]`. Consumen `/api/products` y `/api/suppliers` (proveído por agente paralelo) con fallback graceful.
- Vista `purchases.tsx` sigue convenciones del proyecto (apiFetch, useAppStore.refreshKey/triggerRefresh, formatCurrency, sonner, shadcn/ui New York, responsive mobile-first, tema esmeralda).
- Integración con dashboard: `triggerRefresh()` tras crear/anular refresca métricas y stock en otras vistas.

---
Task ID: 5
Agent: Coordinator (Z.ai Code)
Task: Integración final, verificación con Agent Browser y corrección de bugs

Work Log:
- Lancé 5 subagentes en paralelo (4a Clientes/Proveedores, 4b Compras, 4c Caja/Arqueo, 4d Ingresos/Egresos, 4e Reportes). Todos completaron con `bun run lint` limpio.
- Ejecuté seed de datos demo (curl POST /api/seed) → 26 productos, 8 categorías, 6 clientes, 4 proveedores, caja abierta, 1 venta ejemplo.
- Verifiqué con Agent Browser (agent-browser 0.27.3):
  - Dashboard: renderiza con KPIs reales (ventas hoy $11.000, valor inventario $10.582.500, caja $111.000), alertas (5 stock bajo, 7 por vencer, 1 vencido), gráfico 7 días, top productos, ventas recientes.
  - POS (golden path): agregar producto al carrito → cobrar → recibo "¡Venta exitosa! F2606-0002" → stock decrementado 238→237 ✓.
  - Compras (golden path): Nueva compra → buscar Vitamina C → qty 10 @ $3.600 → guardar → toast "Compra registrada, stock actualizado" → stock incrementado 70→80, cost actualizado ✓.
  - Las 8 vistas renderizan con contenido correcto: Productos (26), Compras (1), Clientes (6), Proveedores (4), Ventas (2/$13.800), Caja (sesión abierta $113.800), Ingresos/Egresos, Reportes (charts + KPIs).
- Bug encontrado y corregido: typo `annuling` (falta una 'l') en `src/components/pos/purchases.tsx:706` causaba ReferenceError "annuling is not defined" y crasheo de la vista Compras. El ESLint no lo detectó porque `no-undef` está desactivado. Corregido a `annulling`.
- Verifiqué responsive móvil (390x844): sidebar oculto, botón "Abrir menú" presente, footer sticky al bottom ✓.
- Verifiqué footer sticky en desktop ✓. Sin errores de runtime ni de consola.

Stage Summary:
- Sistema POS de droguería COMPLETO y verificado end-to-end en el navegador.
- Funcionalidades operativas: panel con métricas/alertas, punto de venta con checkout y recibo, inventario con CRUD + alertas de stock y vencimiento, compras a proveedores con actualización de stock, clientes, proveedores, historial de ventas con anulación, caja con apertura/cierre/arqueo, ingresos/egresos, y reportes con gráficos.
- `bun run lint` pasa sin errores. Dev server sin errores.
- Tema esmeralda (farmacia), responsive mobile-first, footer sticky, toasts sonner, moneda COP.

---
Task ID: V1
Agent: Coordinator (Z.ai Code)
Task: Supervisión completa del flujo de negocio end-to-end con Agent Browser

Work Log:
- Capturé baseline: 26 productos, 2 ventas ($13.800), 1 compra ($36.000), caja abierta $113.800.
- **Cierre de caja (arqueo)**: Abrí el diálogo de arqueo. Verifiqué cálculo: inicial $100.000 + ventas efectivo $13.800 = esperado $113.800. Probé semáforo de diferencia: declaré $110.000 → mostró "Faltante $3.800". Declaré $113.800 → "Cuadrado". Confirmé cierre. BD: status=cerrada, expected=113800, closing=113800, diff=0 ✓.
- **Apertura de caja**: Abrí nueva sesión con monto inicial $150.000, cajero "Cajero Supervisor". BD: status=abierta, opening=150000 ✓.
- **Registrar producto**: Creé "Paracetamol Infantil 120mg/5ml x 100ml" (barcode 7702001000999, categoría Analgésicos, cost $5.000, price $12.000, stock 10, minStock 5, vencimiento 2026-08-29, lote L9999, ubicación Estante E5). BD: todos los campos guardados correctamente ✓. (Nota: el input date controlado por React requiere setter nativo para fijar valor vía JS de prueba; por UI funciona normal).
- **Compra a proveedor**: Registré compra a "Distribuciones Farma S.A.S" de 15 unidades del Paracetamol Infantil @ $5.000 = $75.000. Stock incrementó 10→25 ✓, costo actualizado, vinculada al proveedor ✓.
- **Venta en POS**: Vendí 3 unidades de Paracetamol Infantil @ $12.000 = $36.000 en efectivo. Recibo "¡Venta exitosa! F2606-0003". Stock decrementó 25→22 ✓, caja registró movimiento tipo "venta" +$36.000 ✓.
- **Ingreso en caja**: Registré ingreso $50.000 "Adelanto de efectivo para cambio" ✓.
- **Egreso en caja**: Registré egreso $20.000 "Gastos de transporte" ✓.
- **Cierre con arqueo final**: Calculó esperado = $150.000 + $36.000 + $50.000 − $20.000 = $216.000. Declaré $216.000 → "Cuadrado". BD: expected=216000, closing=216000, diff=0 ✓.
- **Dashboard**: Refleja ventas hoy $49.800 (3 transacciones), valor inventario $10.927.700, caja cerrada, top productos (Acetaminofén #1, Paracetamol Infantil #2) ✓.
- **Reportes**: Ventas totales $49.800, utilidad bruta $29.000 (verificado manualmente), ticket promedio $16.600, compras $111.000 ✓. Gráficos renderizan sin errores.
- **Anulación de venta**: Anulé F2606-0003. Stock reversó 22→25 (+3 devueltos) ✓, estado cambió a "anulada" ✓.
- Reabrí caja con $100.000 para dejar la app lista.
- Errores de consola: 0. Solo advertencia menor de accesibilidad (DialogDescription faltante en algunos diálogos, no bloqueante).

Stage Summary:
- CICLO DE NEGOCIO COMPLETO VERIFICADO: abrir caja → registrar producto → comprar a proveedor (stock+) → vender (stock−, caja+) → ingreso/egreso caja → arqueo cierre (cuadre) → anular venta (stock reversa) → dashboard/reportes reflejan todo.
- Cálculos de arqueo correctos (esperado = inicial + ventas efectivo + ingresos efectivo − egresos efectivo).
- Stock consistente en todo el ciclo: 10 (registro) → 25 (+15 compra) → 22 (−3 venta) → 25 (+3 anulación).
- Todas las funciones operativas. Sin errores de runtime. App lista para usar con caja abierta.

---
Task ID: R1
Agent: Coordinator (Z.ai Code)
Task: Sistema de roles (Admin/Vendedor) + permisos + análisis de integridad de inventario

Work Log:
- Análisis de integridad de inventario: identifiqué 3 puntos de bypass — (1) edición manual de stock vía PATCH /api/products/[id] sin validación de valor (permite negativos), (2) sin trazabilidad/auditoría de cambios de stock, (3) cualquier usuario podía editar. Ahora mitigado con roles: solo admin puede editar inventario.
- Creé `src/lib/permissions.ts`: tipos Role/ViewKey, ROLE_CONFIG con matriz de permisos por rol (admin = todo; vendedor = dashboard/pos/products(read-only)/sales/cash, sin costos ni edición).
- Creé `src/lib/auth.ts`: helper server-side getRole()/requireAdmin() que lee cabecera x-user-role.
- Actualicé `src/lib/store.ts`: añadí hydrated/role/userName/hydrate()/login()/logout() con persistencia en localStorage (clave pos-session).
- Actualicé `src/lib/api.ts`: apiFetch adjunta x-user-role y x-user-name desde localStorage en cada petición.
- Creé `src/components/pos/login.tsx`: pantalla de login con selector de rol (2 tarjetas Admin/Vendedor), input de nombre, descripción de permisos del rol seleccionado.
- Actualicé `src/app/page.tsx`: gate de login (si no hay rol → LoginScreen), nav filtrado por ROLE_CONFIG[role].views, badge de usuario con avatar/iniciales en header, dropdown de usuario con logout, guardia de redirección si vista no permitida, botón "Cargar datos demo" solo para admin.
- Guardias server-side (requireAdmin) en: POST /api/products, PATCH/DELETE /api/products/[id], POST /api/purchases, PATCH /api/purchases/[id], POST /api/transactions, PATCH/DELETE /api/transactions/[id], PATCH /api/sales/[id] (anular), POST /api/seed.
- Actualicé `src/components/pos/products.tsx`: read-only para vendedor (sin botones Nuevo/Editar/Eliminar, sin columna Acciones, sin valor de stock en costo, badge "Solo lectura"), oculta costos en CSV.
- Actualicé `src/components/pos/sales.tsx`: botón "Anular venta" solo visible si canAnnulSales (admin).
- Actualicé `src/components/pos/dashboard.tsx`: oculta "Costo: $X" del card de inventario para vendedores (muestra "Valor de venta").
- Verificación con Agent Browser:
  * Login como VENDEDORA "Laura": nav muestra solo 5 secciones (Panel, POS, Productos, Ventas, Caja). POS por defecto. Productos en solo lectura (0 botones de acción). Vendió F2606-0004 ✓. No ve botón Anular en detalle de venta ✓.
  * Login como ADMIN "Carlos": nav muestra 10 secciones. Dashboard por defecto. Productos con edición completa + valor de stock en costo. Puede anular ventas (anuló F2606-0005, stock 235→236) ✓.
  * Verificación server-side con curl: anular/editar/comprar sin rol o con rol vendedor → 403 "Acción reservada para el administrador" ✓. Vender con rol vendedor → permitido (F2606-0005) ✓.
  * Responsive móvil (390x844): login y menú funcionan ✓.
  * Sin errores de consola/runtime. `bun run lint` limpio.

Stage Summary:
- Sistema de roles implementado y verificado: Admin (acceso completo) y Vendedor (solo vender + caja/arqueo + consulta).
- Permisos enforced en 3 capas: (1) UI filtra navegación y oculta acciones, (2) vistas respetan permisos (read-only, sin costos), (3) API rechaza con 403 operaciones no autorizadas.
- Mitigación de bypass de inventario: vendedores ya no pueden editar stock manualmente. Solo admin puede crear/editar productos, registrar compras y anular ventas.
- Nota honesta: el rol se transmite vía cabecera HTTP (x-user-role) desde el cliente; en un sistema de producción se debería usar NextAuth con sesiones/JWT server-side para evitar manipulación directa de la cabecera. La capa actual protege contra uso normal del UI pero no contra ataques deliberados al API.

---
Task ID: S1
Agent: Coordinator (Z.ai Code)
Task: Medidas de seguridad robustas (sesiones server-side) + verificación de ambos roles

Work Log:
- Vulnerabilidad identificada: el rol viajaba en cabecera HTTP `x-user-role` que un vendedor podía manipular desde la consola del navegador para escalar a admin.
- Solución implementada: **sesiones firmadas server-side con cookies httpOnly**.
  1. Modelo `User` en Prisma {id, name, role, pinHash, active}. db push + AUTH_SECRET en .env.
  2. `src/lib/auth.ts` reescrito: hashPin (HMAC-SHA256), verifyPin (timingSafeEqual anti timing-attack), sign/verify de sesión (payload base64url + firma HMAC), getSession (lee cookie httpOnly), createSessionCookie/clearSessionCookie (httpOnly, sameSite=lax, maxAge 12h), requireAdmin (403 si no admin), requireAuth (401 si no autenticado), checkRateLimit/resetRateLimit (5 intentos / 5 min).
  3. Endpoints auth: POST /api/auth/login (valida name+PIN contra BD, setea cookie firmada), POST /api/auth/logout (borra cookie), GET /api/auth/me (devuelve usuario desde cookie).
  4. Seed actualizado: crea usuarios `admin` (PIN 1234) y `vendedor` (PIN 0000) con PIN hasheado.
  5. Store reescrito: hydrate() consulta /api/auth/me (async), login() llama /api/auth/login, logout() llama /api/auth/logout. Ya NO se persiste nada en localStorage.
  6. apiFetch simplificado: ya no envía cabecera x-user-role; la cookie httpOnly viaja automáticamente (credentials: same-origin).
  7. login.tsx reescrito: selector de rol (atajo que prellena usuario) + input usuario + input PIN (password, numérico) + credenciales demo visibles.
  8. Guardias añadidas: requireAdmin en products (POST/PATCH/DELETE), purchases (POST/PATCH), transactions (POST/PATCH/DELETE), sales/[id] (PATCH anular), seed. requireAuth en sales (POST), cash (POST abrir), cash/close (POST arqueo), cash/transaction (POST).
- Verificación de seguridad con curl (6 tests de bypass):
  * Vendedor anula venta → 403 ✓
  * Vendedor crea producto → 403 ✓
  * Vendedor edita stock → 403 ✓
  * Vendedor crea compra → 403 ✓
  * Vendedor inyecta cabecera x-user-role: admin → 403 (cabecera ignorada) ✓
  * Anónimo anula venta → 401 ✓
  * Vendedor vende → permitido ✓
- Rate limiting: 5 intentos fallidos → HTTP 429 "Demasiados intentos. Intenta de nuevo en 300 segundos", bloquea incluso credenciales válidas ✓
- Verificación con Agent Browser:
  * FLUJO VENDEDOR: login (PIN 0000) → ve 5 secciones → vende F2606-0007 → consulta historial (sin botón Anular) → gestiona caja (registra egreso, ve saldo $105.400) ✓
  * FLUJO ADMIN: login (PIN 1234) → ve 10 secciones → dashboard con costos → anula venta F2606-0008 (stock 233→234) ✓
  * BYPASS desde navegador: vendedor manipula localStorage para fingir admin → recarga → /api/auth/me sigue devolviendo "vendedor" → intenta crear producto vía fetch → 403 ✓ (la cookie firmada es la única fuente de verdad)
- Sin errores de consola. `bun run lint` limpio.

Stage Summary:
- Sistema de seguridad robusto implementado: sesiones firmadas HMAC con cookies httpOnly, inaccesibles y no falsificables desde el cliente.
- PIN hasheado con HMAC + comparación timing-safe (anti timing attacks).
- Rate limiting en login (5 intentos/5 min) anti fuerza bruta.
- Cookies: httpOnly (no accesibles vía JS), sameSite=lax (anti CSRF), firmadas (anti falsificación).
- 3 capas de autorización enforced server-side: requireAuth (cualquier autenticado), requireAdmin (solo admin), y la UI filtra por rol.
- Bypass bloqueado: manipular localStorage, inyectar cabeceras, o llamar endpoints directamente → todos rechazados con 401/403.
- Credenciales demo: admin/1234 (acceso completo), vendedor/0000 (venta + caja).

---
Task ID: U4
Agent: full-stack-developer
Task: Mejorar UI/UX responsive (mobile-first) de las 5 vistas de listado (Productos, Ventas, Compras, Clientes, Proveedores) que usaban tablas con `hidden md:table-cell` y perdían información en móvil (390px) y se comprimían en tablet (768px).

Work Log:
- Leí worklog.md previo y los 5 archivos objetivo. Confirmé convenciones del proyecto (apiFetch, useAppStore, formatCurrency/formatDate/formatDateTime/expirationStatus, sonner, shadcn/ui New York, tema esmeralda, español, COP). No toqué archivos fuera de scope.
- Patrón uniforme aplicado en los 5 archivos: la tabla existente se envolvió en `<div className="hidden md:block">` (se mantiene intacta, solo desktop ≥768px) y se añadió un nuevo bloque `<div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">` con tarjetas para móvil/tablet-pequeña (<768px; 1 col en <640px, 2 cols en 640–768px). Ambas vistas consumen el mismo array de datos, así que se mantienen en sync.
- `src/components/pos/products.tsx`:
  * Barra de filtros reestructurada: input de búsqueda full-width arriba (h-10), debajo un contenedor horizontal-scrollable (`flex overflow-x-auto pb-1 -mx-1 px-1 scroll-thin`) con el Select de categoría + toggles "Stock bajo"/"Por vencer" (todos h-10, shrink-0). Ya no se envuelve torpemente.
  * Tarjeta móvil: nombre + código/unidad (mono), badge de categoría, precio grande (text-primary), badge de stock coloreado (destructive/secondary/outline) con "min X" si bajo, badge de vencimiento con icono CalendarClock (coloreado según exp.variant), y fila de acciones Editar + Eliminar (h-10) — solo si `canEdit`. Preserva la lógica `canEdit`/`canSeeCosts` (la tarjeta no muestra costo).
  * Estados loading/empty/filtered replicados en ambas vistas. Diálogos CRUD y exportar CSV sin tocar.
- `src/components/pos/sales.tsx`:
  * Filtro: búsqueda full-width + Select de método en horizontal-scrollable row.
  * Tarjeta móvil: factura (font-mono semibold), cliente, fecha, fila con badges pago+estado y total grande (text-primary), botón "ojo" h-10 w-10 para abrir el detalle. Opacidad-60 en anuladas.
  * `canAnnul` y el diálogo de detalle con anulación preservados.
- `src/components/pos/purchases.tsx`:
  * Filtro: búsqueda full-width en móvil (`md:max-w-md` en desktop).
  * Tarjeta móvil: referencia (mono, o "Sin ref." muted) + proveedor, fecha, fila con badge "{n} items" + StatusBadge + total grande, botón "ojo" h-10 w-10.
  * Diálogos nueva compra / detalle / anulación (incluye `annulling` y AlertDialog) preservados.
- `src/components/pos/clients.tsx` (añadí imports Phone, Mail, FileText):
  * Tarjeta móvil: avatar User + nombre prominent + badge "{n} compras"; debajo, datos con iconos: FileText (documento, mono), Phone, Mail (cada línea solo si existe el dato; mensaje "Sin datos de contacto" si vacío); botones Editar (flex-1) + Eliminar (h-10 w-10).
- `src/components/pos/suppliers.tsx` (añadí imports Phone, FileText):
  * Tarjeta móvil: avatar Building2 + nombre prominent + badge "{n} compras"; debajo, datos con iconos: FileText (NIT, mono), Contact (contacto), Phone; botones Editar (flex-1) + Eliminar (h-10 w-10).
- Touch targets: todos los icon buttons en tarjetas móviles son `h-10 w-10` (≥40px); los inputs de búsqueda pasaron a `h-10`. Los toggles "Stock bajo"/"Por vencer" y el Select de categoría también son `h-10`.
- Verificación: `bun run lint` → EXIT=0 (sin errores ni warnings). Dev server compila limpio (`✓ Compiled in ...`) tras cada cambio. No se modificaron archivos fuera de scope. Work record en `/agent-ctx/U4-full-stack-developer.md`.

Stage Summary:
- Las 5 vistas de listado ahora son mobile-first: en <768px muestran tarjetas legibles (1 col en móvil, 2 cols en tablet pequeña) con toda la información relevante visible (categoría/fecha/vencimiento/acciones en productos; fecha/cliente/estado/total en ventas; proveedor/fecha/items/estado en compras; documento/teléfono/email en clientes; NIT/contacto/teléfono en proveedores), y en ≥768px mantienen la tabla original sin cambios.
- Filtros/barras de búsqueda reestructurados para apilar correctamente en móvil (búsqueda full-width + fila scrollable de filtros), evitando el wrap torpe previo.
- Targets táctiles ≥40px en toda interacción móvil. Tema esmeralda, español y COP consistentes. Estados loading/empty/error en ambas vistas.
- Toda la funcionalidad existente preservada: CRUD dialogs, role permissions (canEdit/canSeeCosts/canAnnul), filtros, toasts, exportar CSV, anulación de ventas/compras con reversa de stock.

---
Task ID: U
Agent: Coordinator (Z.ai Code)
Task: Mejoras de UI/UX y responsive para tablet y móvil

Work Log:
- Auditoría con VLM (vision) de capturas en móvil 390px y tablet 768px. Problemas detectados:
  * Login: iconos de roles pequeños, bajo contraste del subtítulo, jerarquía débil.
  * POS móvil (crítico): el carrito requería scroll, no era accesible; los controles de pago competían por espacio con los productos.
  * Dashboard: valores monetarios se truncaban ($22.2... en vez de formato completo).
  * Tablas (productos/ventas/compras/clientes/proveedores): ilegibles en móvil con `hidden md:table-cell`.
- Mejoras aplicadas directamente:
  * **login.tsx**: logo más grande (h-16→h-20 en sm), subtítulo con `text-foreground/70 font-medium` (mejor contraste), RoleCard con iconos h-11/h-12, min-h-[88px], active:scale-[0.98] (feedback táctil), botón Ingresar h-12 con spinner Loader2.
  * **pos-terminal.tsx** (rediseño completo móvil): en móvil, los productos ocupan toda la pantalla en grid 2-col; **bottom bar fija** con botón carrito (badge contador) + total + botón Cobrar; el carrito abre como **drawer** (Sheet bottom, 90vh) con todos los controles (cliente, descuento, pago, efectivo, total). En desktop (lg+) se mantiene el panel lateral de 2 columnas. Touch targets h-8/h-10/h-12. Padding `pb-28` en móvil para que la bottom bar no tape contenido. safe-area-inset-bottom para iOS.
  * **globals.css**: añadido `.safe-pad` y `.safe-area-inset-bottom` (env(safe-area-inset-bottom)) + `-webkit-text-size-adjust:100%`.
  * **format.ts**: añadida `formatCurrencyCompact()` → $1.2k, $3.4M, $890 para KPIs en móvil.
  * **dashboard.tsx**: KPIs usan formato compacto en móvil (`sm:hidden`) y completo en desktop (`hidden sm:inline`); padding e iconos responsive (p-3 sm:p-5, icon h-4 sm:h-5).
- Subagente U4 (paralelo): convirtió las 5 vistas de lista (productos, ventas, compras, clientes, proveedores) de tabla-only a **cards en móvil + tabla en desktop**. Patrón: `hidden md:block` (tabla) + `md:hidden` (cards). Touch targets ≥40px. Preservó toda la funcionalidad (CRUD, permisos por rol, filtros, toasts).
- Verificación con Agent Browser + VLM:
  * **Login móvil**: jerarquía clara, touch targets adecuados, contraste mejorado ✓
  * **POS móvil**: bottom bar fija con total + badge carrito ✓, drawer del carrito funcional ✓, venta completa F2606-0009 registrada en móvil ✓
  * **Dashboard móvil**: KPIs con formato compacto ($22k), sin overflow ✓
  * **Productos móvil**: cards legibles con nombre/precio/stock/vencimiento, filtros apilados ✓
  * **Tablet 768px**: POS muestra panel lateral de carrito (2 col), productos en grid 3col, dashboard KPIs en grid, login centrado ✓
  * Sin errores de consola. `bun run lint` limpio (exit 0).

Stage Summary:
- UI/UX responsive completado para móvil (390px) y tablet (768px).
- El POS móvil fue la mejora más crítica: de un layout que requería scroll a una bottom bar fija + drawer, permitiendo vender sin perder el carrito de vista.
- Todas las tablas de lista ahora son cards en móvil y tablas en desktop, mejorando dramáticamente la legibilidad.
- KPIs del dashboard usan formato compacto en móvil para evitar truncamiento.
- Login mejorado en jerarquía visual, contraste y touch targets.
- Safe area de iOS respetada. Touch targets ≥40px en todas las interacciones móviles.
