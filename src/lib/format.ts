// Utilidades de formato para el sistema POS de droguería (moneda COP)

export function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0
  if (isNaN(n)) return "$0"
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

// Formato compacto para KPIs en móvil: $1.2k, $3.4M, $890
export function formatCurrencyCompact(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0
  if (isNaN(n) || n === 0) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (abs >= 10_000) return `$${Math.round(n / 1000)}k`
  if (abs >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return formatCurrency(n)
}

export function formatNumber(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0
  if (isNaN(n)) return "0"
  return new Intl.NumberFormat("es-CO").format(n)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Días hasta el vencimiento (negativo = ya vencido)
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export function expirationStatus(date: Date | string | null | undefined): {
  label: string
  variant: "expired" | "soon" | "ok"
} {
  const days = daysUntil(date)
  if (days === null) return { label: "Sin fecha", variant: "ok" }
  if (days < 0) return { label: `Vencido hace ${Math.abs(days)}d`, variant: "expired" }
  if (days === 0) return { label: "Vence hoy", variant: "soon" }
  if (days <= 30) return { label: `Vence en ${days}d`, variant: "soon" }
  return { label: `Vence en ${days}d`, variant: "ok" }
}

// Generar número de factura consecutivo
export function nextInvoiceNumber(last?: string | null): string {
  const today = new Date()
  const yy = String(today.getFullYear()).slice(-2)
  const mm = String(today.getMonth() + 1).padStart(2, "0")
  const prefix = `F${yy}${mm}-`
  if (!last || !last.startsWith(prefix)) return `${prefix}0001`
  const num = parseInt(last.slice(prefix.length), 10)
  return `${prefix}${String(num + 1).padStart(4, "0")}`
}

// Tiempo relativo legible: "hace unos segundos", "hace 3 min", etc.
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 45) return "hace unos segundos"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `hace ${diffHours} h`
  return formatDate(d)
}

