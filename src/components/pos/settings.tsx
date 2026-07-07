"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatDateTime } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  Database, HardDrive, Trash2, Upload, Download, RotateCcw, RefreshCw, AlertTriangle,
  FileUp, CheckCircle2,
} from "lucide-react"

interface Backup {
  name: string
  size: number
  createdAt: string
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsView() {
  const setView = useAppStore((s) => s.setView)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const refreshKey = useAppStore((s) => s.refreshKey)

  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    apiFetch<Backup[]>("/api/backup")
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

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
      triggerRefresh()
      setTimeout(() => window.location.reload(), 1000)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRestoring(false)
    }
  }

  const downloadBackup = (b: Backup) => {
    fetch(`/api/backup/download?name=${encodeURIComponent(b.name)}`, { credentials: "same-origin" })
      .then((r) => r.ok ? r.blob() : Promise.reject(new Error("Error")))
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = b.name
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Backup descargado")
      })
      .catch(() => toast.error("No se pudo descargar"))
  }

  const deleteBackup = async (b: Backup) => {
    try {
      await apiFetch(`/api/backup?name=${encodeURIComponent(b.name)}`, { method: "DELETE" })
      toast.success("Backup eliminado")
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith(".db")) {
      toast.error("El archivo debe tener extensión .db")
      e.target.value = ""
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/backup/upload", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al subir")
      toast.success(data.message || "Backup subido")
      load()
      triggerRefresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const runSeed = async () => {
    setSeeding(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/seed", { method: "POST" })
      toast.success(res.message)
      triggerRefresh()
      setView("dashboard")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSeeding(false)
    }
  }

  const runReset = async () => {
    setResetting(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "BORRAR" }),
      })
      toast.success(res.message)
      setResetOpen(false)
      triggerRefresh()
      setView("dashboard")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold">Configuración del sistema</h2>
        <p className="text-sm text-muted-foreground">Gestiona los datos: copias de seguridad, datos de demostración y reseteo</p>
      </div>

      {/* SECCIÓN 1: Copias de seguridad */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><HardDrive className="h-5 w-5 text-primary" /> Copias de seguridad</CardTitle>
          <CardDescription>Crea, restaura, descarga o sube copias de seguridad de tu base de datos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Acciones: crear + subir */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={createBackup} disabled={creating} className="h-10">
              {creating ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Creando…</> : <><Database className="h-4 w-4 mr-2" /> Crear backup</>}
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              variant="outline"
              className="h-10"
            >
              {uploading ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Subiendo…</> : <><FileUp className="h-4 w-4 mr-2" /> Subir backup (.db)</>}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".db"
              className="hidden"
              onChange={handleUploadFile}
            />
          </div>

          <Separator />

          {/* Lista de backups */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Backups disponibles ({backups.length})
            </p>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
            ) : backups.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                <HardDrive className="h-8 w-8 mx-auto mb-1.5 opacity-40" />
                <p className="text-sm">No hay backups creados</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto scroll-thin space-y-1.5">
                {backups.map((b, i) => (
                  <div key={b.name} className="rounded-lg border p-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{b.name}</p>
                          {i === 0 && <Badge className="text-[10px] py-0 shrink-0">Reciente</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(b.createdAt)} · {formatSize(b.size)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs flex-1" title="Descargar" onClick={() => downloadBackup(b)}>
                        <Download className="h-3 w-3 mr-1" /> Descargar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-amber-600 hover:text-amber-700 border-amber-200" title="Restaurar" onClick={() => setRestoreTarget(b)}>
                        <RotateCcw className="h-3 w-3 mr-1" /> Restaurar
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-destructive hover:text-red-700 hover:bg-red-50 border-red-200" title="Eliminar backup" onClick={() => setDeleteTarget(b)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Borrar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 2: Datos de demostración */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-5 w-5 text-primary" /> Datos de demostración</CardTitle>
          <CardDescription>Carga un set de productos, clientes y proveedores de ejemplo para explorar el sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runSeed} disabled={seeding} className="w-full h-10">
            {seeding ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Cargando…</> : <><Database className="h-4 w-4 mr-2" /> Cargar datos demo</>}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">⚠️ Esto reemplazará todos los datos actuales.</p>
        </CardContent>
      </Card>

      {/* SECCIÓN 3: Borrar datos */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-destructive"><Trash2 className="h-5 w-5" /> Borrar todos los datos</CardTitle>
          <CardDescription>Elimina todo y deja el sistema vacío para uso real. Solo se conservan los usuarios</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setResetOpen(true)} variant="destructive" className="w-full h-10">
            <Trash2 className="h-4 w-4 mr-2" /> Borrar datos de prueba
          </Button>
          <p className="text-xs text-muted-foreground mt-2">⚠️ Asegúrate de hacer un backup primero. Esta acción es irreversible.</p>
        </CardContent>
      </Card>

      {/* Confirmación de borrar backup */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> ¿Eliminar backup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el backup{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{deleteTarget?.name}</code>{" "}
              del {deleteTarget && formatDateTime(deleteTarget.createdAt)}.
              <br /><br />
              <strong className="text-foreground">Esta acción no se puede deshacer.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteBackup(deleteTarget); setDeleteTarget(null) }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de restore */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> ¿Restaurar backup?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazarán <strong className="text-foreground">todos los datos actuales</strong> con el backup{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{restoreTarget?.name}</code>.
              Se creará un backup automático del estado actual por seguridad.
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

      {/* Confirmación de reset */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> ¿Borrar todos los datos?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán productos, ventas, compras, clientes, proveedores, cajas, categorías y movimientos. Solo se conservan los usuarios (admin y vendedor).
              <br /><br />
              <strong className="text-foreground">Esta acción es irreversible.</strong> Asegúrate de tener un backup si necesitas conservar datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runReset} disabled={resetting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {resetting ? <><RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> Borrando…</> : "Sí, borrar todo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
