"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { ViewKey } from "@/lib/permissions"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  IconBell,
  IconAlertTriangle,
  IconClockExclamation,
  IconCalendarTime,
  IconWallet,
  IconCreditCard,
  IconCircleCheck,
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

export interface SystemNotification {
  id: string
  type: "out_of_stock" | "low_stock" | "expired" | "expiring_soon" | "cash_closed" | "credit_overdue"
  severity: "critical" | "warning" | "info"
  title: string
  description: string
  targetView: "products" | "cash" | "credit"
  count?: number
  timestamp: string
}

interface NotificationsResponse {
  ok: boolean
  notifications: SystemNotification[]
  count: number
  criticalCount: number
  warningCount: number
  infoCount: number
}

interface NotificationsBellProps {
  onNavigate?: (view: ViewKey) => void
}

export function NotificationsBell({ onNavigate }: NotificationsBellProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<SystemNotification[]>([])
  const [counts, setCounts] = useState({ total: 0, critical: 0, warning: 0, info: 0 })
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const activeBranch = useAppStore((s) => s.activeBranch)
  const setView = useAppStore((s) => s.setView)
  const refreshKey = useAppStore((s) => s.refreshKey)

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true)
      const data = await apiFetch<NotificationsResponse>("/api/notifications")
      if (data && data.ok) {
        setNotifications(data.notifications || [])
        setCounts({
          total: data.count || 0,
          critical: data.criticalCount || 0,
          warning: data.warningCount || 0,
          info: data.infoCount || 0,
        })
      }
    } catch {
      // Silencioso para no saturar toasts
    } finally {
      setLoading(false)
    }
  }, [])

  // Cargar al montar, al cambiar de sede y periódicamente cada 60s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000)
    return () => clearInterval(interval)
  }, [fetchNotifications, activeBranch?.id, refreshKey])

  const handleNotificationClick = (item: SystemNotification) => {
    // Marcar como leída localmente
    setReadIds((prev) => new Set(prev).add(item.id))
    setOpen(false)

    // Redirigir a la vista objetivo correspondiente
    if (onNavigate) {
      onNavigate(item.targetView)
    } else {
      setView(item.targetView)
    }
  }

  const markAllAsRead = () => {
    const all = new Set(notifications.map((n) => n.id))
    setReadIds(all)
  }

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length
  const hasCritical = notifications.some((n) => n.severity === "critical" && !readIds.has(n.id))

  const getIcon = (type: SystemNotification["type"]) => {
    switch (type) {
      case "out_of_stock":
        return <IconAlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
      case "low_stock":
        return <IconClockExclamation className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      case "expired":
        return <IconAlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
      case "expiring_soon":
        return <IconCalendarTime className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      case "cash_closed":
        return <IconWallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      case "credit_overdue":
        return <IconCreditCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
    }
  }

  const getSeverityBg = (severity: SystemNotification["severity"], isRead: boolean) => {
    if (isRead) return "bg-card hover:bg-muted/40 opacity-70"
    switch (severity) {
      case "critical":
        return "bg-red-500/[0.08] hover:bg-red-500/[0.12] border-red-500/20"
      case "warning":
        return "bg-amber-500/[0.08] hover:bg-amber-500/[0.12] border-amber-500/20"
      case "info":
        return "bg-blue-500/[0.06] hover:bg-blue-500/[0.10] border-blue-500/20"
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative p-2 rounded-full border bg-card hover:bg-muted transition-all duration-200 shadow-2xs shrink-0 flex items-center justify-center",
            unreadCount > 0 && "border-primary/40",
            open && "ring-2 ring-primary/20"
          )}
          title={unreadCount > 0 ? `${unreadCount} alerta(s) de atención` : "Sin alertas pendientes"}
          aria-label="Abrir centro de notificaciones"
        >
          <IconBell
            className={cn(
              "h-4.5 w-4.5 text-muted-foreground transition-colors",
              unreadCount > 0 && "text-foreground",
              hasCritical && "animate-wiggle"
            )}
          />

          {/* Badge contador */}
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white shadow-xs animate-in zoom-in-50",
                hasCritical ? "bg-red-600 animate-pulse" : "bg-primary"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 sm:w-96 p-0 rounded-2xl shadow-xl overflow-hidden" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
              <IconBell className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Centro de Alertas</p>
              <p className="text-[10px] text-muted-foreground">
                {unreadCount === 0 ? "Todo al día" : `${unreadCount} pendientes de revisión`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
              onClick={fetchNotifications}
              disabled={loading}
              title="Actualizar alertas"
            >
              <IconRefresh className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] font-semibold text-primary hover:bg-primary/10 rounded-lg"
                onClick={markAllAsRead}
              >
                Marcar leídas
              </Button>
            )}
          </div>
        </div>

        {/* Resumen rápido de tags */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-b bg-muted/10 flex items-center gap-1.5 overflow-x-auto scroll-thin text-[10px]">
            {counts.critical > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 gap-1 shrink-0 font-bold">
                {counts.critical} Críticas
              </Badge>
            )}
            {counts.warning > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-1 shrink-0 text-amber-700 dark:text-amber-400 border-amber-400 bg-amber-500/10 font-bold">
                {counts.warning} Advertencias
              </Badge>
            )}
            {counts.info > 0 && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-1 shrink-0 text-blue-700 dark:text-blue-400 border-blue-400 bg-blue-500/10 font-medium">
                {counts.info} Operativas
              </Badge>
            )}
          </div>
        )}

        {/* Lista de Notificaciones */}
        <ScrollArea className="max-h-[380px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <IconCircleCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">¡Todo en orden!</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  No hay alertas de stock bajo, vencimientos ni descuadres pendientes.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {notifications.map((item) => {
                const isRead = readIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={cn(
                      "p-3.5 transition-colors cursor-pointer flex items-start gap-3 text-left relative",
                      getSeverityBg(item.severity, isRead)
                    )}
                  >
                    {/* Indicador no leído */}
                    {!isRead && (
                      <span className="absolute left-1 top-4 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}

                    <div className="h-8 w-8 rounded-xl bg-background border flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                      {getIcon(item.type)}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-xs font-bold leading-tight truncate", isRead ? "text-muted-foreground" : "text-foreground")}>
                          {item.title}
                        </p>
                        <span className="text-[9px] uppercase font-semibold text-primary shrink-0 flex items-center gap-0.5 hover:underline">
                          Ir <IconChevronRight className="h-2.5 w-2.5" />
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-2.5 border-t bg-muted/30 text-center">
          <p className="text-[10px] text-muted-foreground">
            Monitoreo en tiempo real de {activeBranch?.name ?? "Sede Actual"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
