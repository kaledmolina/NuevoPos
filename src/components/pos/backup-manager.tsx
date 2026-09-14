"use client"

import { useEffect, useState, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatDateTime } from "@/lib/format"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Database, Download, RotateCcw, Trash2, RefreshCw, AlertTriangle, HardDrive } from "lucide-react"

interface Backup {
  name: string
  size: number
  createdAt: string
}

export default function BackupManager({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const role = useAppStore((s) => s.role)
  const isSuperAdmin = role === "superadmin"
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    apiFetch<Backup[]>("/api/backup")
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const createBackup = async () => {
    setCreating(true)
    try {
      const res = await apiFetch<{ ok: boolean; backup: string }>("/api/backup", { method: "POST" })
      toast.success(`Backup creado: ${res.backup}`)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const restoreBackup = async (b: Backup) => {
    setRestoring(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/backup/restore", {
        method: "POST",
        body: JSON.stringify({ backup: b.name }),
      })
      toast.success(res.message)
      setRestoreTarget(null)
      onOpenChange(false)
      triggerRefresh()
      // Recargar la página tras 1s para que todos los datos se actualicen
      setTimeout(() => window.location.reload(), 1000)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRestoring(false)
    }
  }

  const downloadBackup = (b: Backup) => {
    // Descargar via fetch con autenticación
    fetch(`/api/backup/download?name=${encodeURIComponent(b.name)}`, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("Error al descargar")
        return r.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = b.name
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Backup descargado")
      })
      .catch(() => toast.error("No se pudo descargar el backup"))
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto scroll-thin">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" /> {isSuperAdmin ? "Copias de seguridad del sistema" : "Copias de seguridad de tu negocio"}
            </DialogTitle>
            <DialogDescription>
              {isSuperAdmin
                ? "Crea, restaura o descarga copias de seguridad completas de la base de datos del sistema (MySQL)."
                : "Crea, restaura o descarga copias de seguridad de los datos de tu negocio y sedes aisladas."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            {/* Botón crear backup */}
            <Button onClick={createBackup} disabled={creating} className="w-full h-10">
              {creating ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Creando…</> : <><Database className="h-4 w-4 mr-2" /> Crear backup ahora</>}
            </Button>

            <Separator />

            {/* Lista de backups */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" /> Backups disponibles ({backups.length})
              </p>

              {loading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
              ) : backups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No hay backups creados</p>
                  <p className="text-xs mt-1">Crea tu primer backup con el botón de arriba</p>
                </div>
              ) : (
                backups.map((b, i) => (
                  <div key={b.name} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{b.name}</p>
                          {i === 0 && <Badge className="text-[10px] py-0">Más reciente</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(b.createdAt)} · {formatSize(b.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs flex-1"
                        title="Descargar backup"
                        onClick={() => downloadBackup(b)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Descargar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs flex-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                        title="Restaurar este backup"
                        onClick={() => setRestoreTarget(b)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de restore */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> ¿Restaurar backup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazarán <strong className="text-foreground">{isSuperAdmin ? "todos los datos actuales del sistema" : "los datos actuales de tus sedes"}</strong> con el backup{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{restoreTarget?.name}</code> del{" "}
              {restoreTarget && formatDateTime(restoreTarget.createdAt)}.
              <br /><br />
              Antes de restaurar, se creará automáticamente una copia del estado previo por seguridad. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && restoreBackup(restoreTarget)}
              disabled={restoring}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {restoring ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Restaurando…</> : <><RotateCcw className="h-4 w-4 mr-1.5" /> Sí, restaurar</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
