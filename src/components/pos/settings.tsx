"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatDateTime } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { useTheme } from "next-themes"

import {
  IconBuildingStore,
  IconShieldLock,
  IconDatabase,
  IconDeviceFloppy,
  IconHelp,
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconLock,
  IconKey,
  IconHistory,
  IconAlertTriangle,
  IconDownload,
  IconRefresh,
  IconTrash,
  IconUpload,
  IconPill,
  IconHammer,
  IconShirt,
  IconShoppingBag,
  IconCheck,
  IconSparkles,
  IconFileText,
  IconPhone,
  IconMapPin,
  IconMail,
  IconCoin,
  IconCalendarTime,
  IconReceipt2,
  IconUserCheck,
  IconUsers,
  IconEye,
  IconEyeOff,
  IconUser,
  IconShieldCheck,
  IconClock,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { TOUR_STORAGE_KEY_PREFIX } from "@/components/pos/tour"

interface Backup {
  name: string
  size: number
  createdAt: string
  canDelete?: boolean
  ageDays?: number
  daysRemaining?: number
}

interface AuditLogItem {
  id: string
  action: string
  entityType: string
  userName: string
  role: string
  detail: string | null
  createdAt: string
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const RUBRO_OPTIONS = [
  { value: "tienda", label: "Tienda de Barrio / Minimarket / Abarrotes", icon: IconBuildingStore },
  { value: "drogueria", label: "Droguería / Farmacia", icon: IconPill },
  { value: "ferreteria", label: "Ferretería / Materiales & Herramientas", icon: IconHammer },
  { value: "ropa", label: "Tienda de Ropa / Calzado / Boutique", icon: IconShirt },
  { value: "general", label: "Comercio General / Variedades", icon: IconShoppingBag },
]

export default function SettingsView() {
  const { theme, setTheme } = useTheme()
  const setView = useAppStore((s) => s.setView)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const role = useAppStore((s) => s.role)
  const userName = useAppStore((s) => s.userName)
  const tenantName = useAppStore((s) => s.tenantName)
  const refreshKey = useAppStore((s) => s.refreshKey)

  const isDemoAccount =
    (userName?.toLowerCase() === "admin" || userName?.toLowerCase() === "vendedor") &&
    role !== "superadmin"

  // Configuración de la tienda
  const [settingsForm, setSettingsForm] = useState({
    store_name: "Droguería La Salud",
    store_rubro: "drogueria",
    store_nit: "",
    store_phone: "",
    store_address: "",
    store_email: "",
    currency: "COP",
    currency_symbol: "$",
    tax_rate: "0",
    tax_name: "IVA",
    enable_expiration: "true",
    receipt_message: "¡Gracias por su compra!",
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // Backups
  const [backups, setBackups] = useState<Backup[]>([])
  const [loadingBackups, setLoadingBackups] = useState(true)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringBackup, setRestoringBackup] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null)
  const [purgingOldBackups, setPurgingOldBackups] = useState(false)
  const [uploadingBackup, setUploadingBackup] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auditoría
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditActionFilter, setAuditActionFilter] = useState("all")

  // Seguridad: Cambio de PIN
  const [pinAdminCurrent, setPinAdminCurrent] = useState("")
  const [pinAdminNew, setPinAdminNew] = useState("")
  const [pinVendedorNew, setPinVendedorNew] = useState("")
  const [showPinAdminCurrent, setShowPinAdminCurrent] = useState(false)
  const [showPinAdminNew, setShowPinAdminNew] = useState(false)
  const [showPinVendedorNew, setShowPinVendedorNew] = useState(false)
  const [changingPinAdmin, setChangingPinAdmin] = useState(false)
  const [changingPinVendedor, setChangingPinVendedor] = useState(false)

  // Seed & Reset
  const [selectedDemoPreset, setSelectedDemoPreset] = useState("drogueria")
  const [seeding, setSeeding] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  // Cargar configuraciones iniciales
  const loadSettings = useCallback(() => {
    apiFetch<Record<string, string>>("/api/settings")
      .then((data) => {
        setSettingsForm((prev) => ({
          ...prev,
          ...data,
        }))
        if (data.store_rubro) {
          setSelectedDemoPreset(data.store_rubro)
        }
      })
      .catch(() => {})
  }, [])

  // Cargar Backups
  const loadBackups = useCallback(() => {
    setLoadingBackups(true)
    apiFetch<Backup[]>("/api/backup")
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setLoadingBackups(false))
  }, [])

  // Cargar Auditoría
  const loadAudit = useCallback(() => {
    setLoadingAudit(true)
    apiFetch<AuditLogItem[]>("/api/audit?limit=100")
      .then(setAuditLogs)
      .catch(() => setAuditLogs([]))
      .finally(() => setLoadingAudit(false))
  }, [])

  useEffect(() => {
    loadSettings()
    loadBackups()
    loadAudit()
  }, [loadSettings, loadBackups, loadAudit, refreshKey])

  // Guardar configuración
  const handleSaveSettings = async () => {
    if (!settingsForm.store_name.trim()) {
      return toast.error("El nombre de la tienda es obligatorio")
    }
    setSavingSettings(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/settings", {
        method: "POST",
        body: JSON.stringify(settingsForm),
      })
      toast.success(res.message || "Configuración guardada")
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingSettings(false)
    }
  }

  // Cambiar PIN Admin
  const handleChangeAdminPin = async () => {
    if (isDemoAccount) {
      return toast.warning("🔒 Cuenta Demo Protegida: No está permitido cambiar el PIN en las cuentas de prueba.")
    }
    if (!pinAdminNew || pinAdminNew.length < 4) {
      return toast.error("El nuevo PIN debe tener entre 4 y 8 dígitos")
    }
    setChangingPinAdmin(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({
          oldPin: pinAdminCurrent,
          newPin: pinAdminNew,
        }),
      })
      toast.success(res.message)
      setPinAdminCurrent("")
      setPinAdminNew("")
      loadAudit()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setChangingPinAdmin(false)
    }
  }

  // Cambiar PIN Vendedor (desde Admin)
  const handleChangeVendedorPin = async () => {
    if (isDemoAccount) {
      return toast.warning("🔒 Cuenta Demo Protegida: No está permitido cambiar el PIN en las cuentas de prueba.")
    }
    if (!pinVendedorNew || pinVendedorNew.length < 4) {
      return toast.error("El nuevo PIN para el vendedor debe tener al menos 4 dígitos")
    }
    setChangingPinVendedor(true)
    try {
      // Obtener ID del vendedor
      const users = await apiFetch<{ id: string; name: string }[]>("/api/auth/me")
      void users
      const res = await apiFetch<{ message: string }>("/api/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({
          newPin: pinVendedorNew,
          targetUserId: "vendedor", // handled in backend by role/target
        }),
      })
      toast.success(res.message)
      setPinVendedorNew("")
      loadAudit()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setChangingPinVendedor(false)
    }
  }

  // Crear backup
  const createBackup = async () => {
    setCreatingBackup(true)
    try {
      const res = await apiFetch<{ ok: boolean; backup: string }>("/api/backup", { method: "POST" })
      toast.success(`Copia de seguridad creada: ${res.backup}`)
      loadBackups()
      loadAudit()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreatingBackup(false)
    }
  }

  // Restaurar backup
  const restoreBackup = async (b: Backup) => {
    setRestoringBackup(true)
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
      setRestoringBackup(false)
    }
  }

  // Descargar backup
  const downloadBackup = (b: Backup) => {
    fetch(`/api/backup/download?name=${encodeURIComponent(b.name)}`, { credentials: "same-origin" })
      .then((r) => r.ok ? r.blob() : Promise.reject(new Error("Error al descargar")))
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = b.name
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Backup descargado en tu equipo")
      })
      .catch(() => toast.error("No se pudo descargar el archivo"))
  }

  // Eliminar backup individual
  const deleteBackup = async (b: Backup) => {
    try {
      await apiFetch(`/api/backup?name=${encodeURIComponent(b.name)}`, { method: "DELETE" })
      toast.success("Copia de seguridad eliminada")
      loadBackups()
      loadAudit()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Purgar backups con más de 5 días de antigüedad
  const purgeOldBackups = async () => {
    setPurgingOldBackups(true)
    try {
      const res = await apiFetch<{ message: string; deletedCount: number }>("/api/backup?purgeOld=1", {
        method: "DELETE",
      })
      toast.success(res.message)
      loadBackups()
      loadAudit()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPurgingOldBackups(false)
    }
  }

  // Subir backup (.json para tienda o .db para superadmin)
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isSuper = role === "superadmin"
    const isJson = file.name.endsWith(".json")
    const isDb = file.name.endsWith(".db")
    if (isSuper ? (!isJson && !isDb) : !isJson) {
      toast.error(
        isSuper
          ? "El archivo debe ser un respaldo válido con formato .json o .db"
          : "El archivo de respaldo de tienda debe tener formato .json"
      )
      e.target.value = ""
      return
    }
    setUploadingBackup(true)
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
      toast.success(data.message || "Copia de seguridad subida y verificada")
      loadBackups()
      loadAudit()
      triggerRefresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploadingBackup(false)
      e.target.value = ""
    }
  }

  // Cargar preset demo
  const runSeed = async (presetType: string) => {
    setSeeding(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/seed", {
        method: "POST",
        body: JSON.stringify({ type: presetType }),
      })
      toast.success(res.message)
      loadSettings()
      loadAudit()
      triggerRefresh()
      setView("dashboard")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSeeding(false)
    }
  }

  // Reseteo total
  const runReset = async () => {
    setResetting(true)
    try {
      const res = await apiFetch<{ message: string }>("/api/reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "BORRAR" }),
      })
      toast.success(res.message)
      setResetOpen(false)
      loadSettings()
      loadAudit()
      triggerRefresh()
      setView("dashboard")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResetting(false)
    }
  }

  const filteredLogs = auditLogs.filter((log) => {
    if (auditActionFilter === "all") return true
    return log.action.includes(auditActionFilter)
  })

  return (
    <div className="p-3 sm:p-5 md:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold">Configuración y Administración</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Ajustes del establecimiento, tipo de tienda, seguridad, copias de seguridad y registros
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full space-y-4">
        {/* Barra de navegación de pestañas responsive adaptada para móvil y escritorio */}
        <div className="w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="grid grid-cols-5 h-auto p-1 bg-muted/60 border border-border/80 rounded-xl gap-1 w-full min-w-[340px]">
            <TabsTrigger
              value="general"
              className="py-2 px-1 text-[11px] sm:text-xs font-medium rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
            >
              <IconBuildingStore className="h-4 w-4 shrink-0" />
              <span className="truncate">Negocio</span>
            </TabsTrigger>

            <TabsTrigger
              value="security"
              className="py-2 px-1 text-[11px] sm:text-xs font-medium rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
            >
              <IconShieldLock className="h-4 w-4 shrink-0" />
              <span className="truncate">Seguridad</span>
            </TabsTrigger>

            <TabsTrigger
              value="backups"
              className="py-2 px-1 text-[11px] sm:text-xs font-medium rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
            >
              <IconDeviceFloppy className="h-4 w-4 shrink-0" />
              <span className="truncate">Backups</span>
            </TabsTrigger>

            {role === "superadmin" && (
              <TabsTrigger
                value="demo"
                className="py-2 px-1 text-[11px] sm:text-xs font-medium rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
              >
                <IconDatabase className="h-4 w-4 shrink-0" />
                <span className="truncate">Demo</span>
              </TabsTrigger>
            )}

            <TabsTrigger
              value="help"
              className="py-2 px-1 text-[11px] sm:text-xs font-medium rounded-lg flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs transition-all"
            >
              <IconHelp className="h-4 w-4 shrink-0" />
              <span className="truncate">Ayuda</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ==================== PESTAÑA 1: NEGOCIO & RUBRO ==================== */}
        <TabsContent value="general" className="space-y-4">
          {/* Apariencia / Modo Oscuro */}
          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <IconSun className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold">Apariencia y Modo Oscuro</CardTitle>
                  <CardDescription className="text-xs">
                    Personaliza el tema visual según tu preferencia
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border transition-all gap-1.5 text-center",
                    theme === "light"
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border/80 hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <IconSun className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-[11px] sm:text-xs">Modo Claro</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border transition-all gap-1.5 text-center",
                    theme === "dark"
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border/80 hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <IconMoon className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-[11px] sm:text-xs">Modo Oscuro</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  className={cn(
                    "flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-lg border transition-all gap-1.5 text-center",
                    theme === "system"
                      ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                      : "border-border/80 hover:bg-muted/50 text-muted-foreground"
                  )}
                >
                  <IconDeviceDesktop className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-[11px] sm:text-xs">Automático</span>
                </button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden" data-tour="settings-store-form">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <IconBuildingStore className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold">Identidad y Tipo de Negocio</CardTitle>
                  <CardDescription className="text-xs">
                    Personaliza el sistema para tu rubro comercial
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3.5 sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1.5" data-tour="settings-rubro-selector">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconBuildingStore className="h-3.5 w-3.5 text-muted-foreground" /> Tipo de Negocio / Rubro *
                  </Label>
                  <Select
                    value={settingsForm.store_rubro}
                    onValueChange={(v) => {
                      setSettingsForm({
                        ...settingsForm,
                        store_rubro: v,
                        enable_expiration: v === "drogueria" || v === "tienda" ? "true" : "false",
                      })
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RUBRO_OPTIONS.map((r) => {
                        const Icon = r.icon
                        return (
                          <SelectItem key={r.value} value={r.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-xs sm:text-sm">{r.label}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconBuildingStore className="h-3.5 w-3.5 text-muted-foreground" /> Nombre del Establecimiento *
                  </Label>
                  <Input
                    value={settingsForm.store_name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, store_name: e.target.value })}
                    placeholder="Ej: Minimarket El Buen Vecino"
                    className="h-10 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconFileText className="h-3.5 w-3.5 text-muted-foreground" /> NIT / RUT / Cédula
                  </Label>
                  <Input
                    value={settingsForm.store_nit}
                    onChange={(e) => setSettingsForm({ ...settingsForm, store_nit: e.target.value })}
                    placeholder="900.123.456-7"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconPhone className="h-3.5 w-3.5 text-muted-foreground" /> Teléfono de Contacto
                  </Label>
                  <Input
                    value={settingsForm.store_phone}
                    onChange={(e) => setSettingsForm({ ...settingsForm, store_phone: e.target.value })}
                    placeholder="+57 310 555 0100"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconMapPin className="h-3.5 w-3.5 text-muted-foreground" /> Dirección
                  </Label>
                  <Input
                    value={settingsForm.store_address}
                    onChange={(e) => setSettingsForm({ ...settingsForm, store_address: e.target.value })}
                    placeholder="Calle 45 # 23-18, Barrio Central"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconMail className="h-3.5 w-3.5 text-muted-foreground" /> Correo Electrónico
                  </Label>
                  <Input
                    type="email"
                    value={settingsForm.store_email}
                    onChange={(e) => setSettingsForm({ ...settingsForm, store_email: e.target.value })}
                    placeholder="contacto@tunegocio.com"
                    className="h-10"
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconCoin className="h-3.5 w-3.5 text-muted-foreground" /> Moneda
                  </Label>
                  <Select
                    value={settingsForm.currency}
                    onValueChange={(v) => setSettingsForm({ ...settingsForm, currency: v })}
                  >
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COP">COP (Peso Colombiano)</SelectItem>
                      <SelectItem value="USD">USD (Dólar Estadounidense)</SelectItem>
                      <SelectItem value="MXN">MXN (Peso Mexicano)</SelectItem>
                      <SelectItem value="EUR">EUR (Euro)</SelectItem>
                      <SelectItem value="PEN">PEN (Sol Peruano)</SelectItem>
                      <SelectItem value="ARS">ARS (Peso Argentino)</SelectItem>
                      <SelectItem value="CLP">CLP (Peso Chileno)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconReceipt2 className="h-3.5 w-3.5 text-muted-foreground" /> Impuesto (%)
                  </Label>
                  <Input
                    type="number"
                    value={settingsForm.tax_rate}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tax_rate: e.target.value })}
                    placeholder="0"
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                    <IconFileText className="h-3.5 w-3.5 text-muted-foreground" /> Nombre del Impuesto
                  </Label>
                  <Input
                    value={settingsForm.tax_name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tax_name: e.target.value })}
                    placeholder="IVA / Impoconsumo"
                    className="h-10"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20 gap-3">
                <div className="space-y-0.5">
                  <Label className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                    <IconCalendarTime className="h-4 w-4 text-muted-foreground" /> Control de Fechas de Vencimiento
                  </Label>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Habilita alertas de productos por vencer y bloqueos en el POS.
                  </p>
                </div>
                <Switch
                  checked={settingsForm.enable_expiration === "true"}
                  onCheckedChange={(c) => setSettingsForm({ ...settingsForm, enable_expiration: c ? "true" : "false" })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <IconSparkles className="h-3.5 w-3.5 text-muted-foreground" /> Mensaje al pie del comprobante / ticket
                </Label>
                <Textarea
                  value={settingsForm.receipt_message}
                  onChange={(e) => setSettingsForm({ ...settingsForm, receipt_message: e.target.value })}
                  rows={2}
                  placeholder="¡Gracias por su compra! Vuelva pronto."
                />
              </div>

              <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full sm:w-auto h-10 px-6 font-semibold shadow-xs">
                {savingSettings ? <><IconRefresh className="h-4 w-4 mr-2 animate-spin" /> Guardando…</> : <><IconCheck className="h-4 w-4 mr-2" /> Guardar cambios</>}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PESTAÑA 2: SEGURIDAD & AUDITORÍA ==================== */}
        <TabsContent value="security" className="space-y-4 sm:space-y-5">
          {/* Banner de Acceso a Gestión de Personal y Sedes */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <IconUsers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-foreground">Gestión Completa de Personal & Sedes</p>
                <p className="text-[11px] sm:text-xs text-muted-foreground">
                  Registra múltiples vendedores, administradores adicionales y gestiona hasta 3 sedes físicas.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setView("personal")}
              className="h-8 rounded-xl text-xs font-semibold gap-1.5 shadow-xs shrink-0 self-start sm:self-auto"
            >
              <IconUsers className="h-3.5 w-3.5" /> Administrar Personal & Sedes
            </Button>
          </div>

          {isDemoAccount && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 shadow-xs">
              <IconShieldLock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  Cuentas de Demostración Protegidas
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Has iniciado sesión como usuario de prueba (<strong>{userName}</strong>). Por seguridad y para garantizar que otros clientes puedan continuar evaluando el sistema con los datos de acceso públicos (<strong>admin / 1234</strong> y <strong>vendedor / 0000</strong>), la modificación de PIN y credenciales está deshabilitada en el modo demo.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PIN Admin */}
            <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden flex flex-col">
              <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <IconKey className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm sm:text-base font-bold text-foreground">PIN de Administrador</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Control total y ajustes del negocio</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-medium border-border/70 bg-muted/30 shrink-0">
                    Admin
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-5 flex-1 flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">PIN Actual</Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <IconLock className="h-4 w-4" />
                      </div>
                      <Input
                        type={showPinAdminCurrent ? "text" : "password"}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Ingresa tu clave actual"
                        value={pinAdminCurrent}
                        onChange={(e) => setPinAdminCurrent(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        className="h-10 pl-9 pr-10 font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPinAdminCurrent(!showPinAdminCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label="Ver PIN"
                      >
                        {showPinAdminCurrent ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Nuevo PIN (4 a 8 dígitos)</Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <IconKey className="h-4 w-4" />
                      </div>
                      <Input
                        type={showPinAdminNew ? "text" : "password"}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Nuevo PIN numérico"
                        value={pinAdminNew}
                        onChange={(e) => setPinAdminNew(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        className="h-10 pl-9 pr-10 font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPinAdminNew(!showPinAdminNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label="Ver nuevo PIN"
                      >
                        {showPinAdminNew ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleChangeAdminPin}
                    disabled={changingPinAdmin || !pinAdminCurrent || !pinAdminNew}
                    className="w-full h-10 font-semibold shadow-xs"
                  >
                    {changingPinAdmin ? <IconRefresh className="h-4 w-4 animate-spin mr-2" /> : <IconKey className="h-4 w-4 mr-2" />}
                    Actualizar PIN Admin
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* PIN Vendedor */}
            <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden flex flex-col">
              <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground shrink-0">
                      <IconShieldLock className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm sm:text-base font-bold text-foreground">PIN de Vendedor</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Acceso exclusivo al terminal de cobro</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-medium border-border/70 bg-muted/30 shrink-0">
                    Cajero
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-5 flex-1 flex flex-col justify-between">
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Nuevo PIN para Vendedor (4 a 8 dígitos)</Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <IconShieldLock className="h-4 w-4" />
                      </div>
                      <Input
                        type={showPinVendedorNew ? "text" : "password"}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Ej. 0000"
                        value={pinVendedorNew}
                        onChange={(e) => setPinVendedorNew(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        className="h-10 pl-9 pr-10 font-mono tracking-wider"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPinVendedorNew(!showPinVendedorNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        aria-label="Ver PIN vendedor"
                      >
                        {showPinVendedorNew ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg bg-muted/30 p-2.5 border border-border/60">
                    Como administrador, puedes redefinir el PIN del vendedor directamente sin requerir la clave anterior.
                  </p>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={handleChangeVendedorPin}
                    disabled={changingPinVendedor || !pinVendedorNew}
                    variant="outline"
                    className="w-full h-10 font-semibold"
                  >
                    {changingPinVendedor ? <IconRefresh className="h-4 w-4 animate-spin mr-2" /> : <IconLock className="h-4 w-4 mr-2" />}
                    Guardar PIN Vendedor
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Visor de Auditoría */}
          <Card className="rounded-2xl shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 border-b bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground shrink-0">
                    <IconHistory className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base font-bold text-foreground">Registro de Auditoría en Tiempo Real</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Monitorea inicios de sesión, ventas, anulaciones y cambios</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
                  <Select value={auditActionFilter} onValueChange={setAuditActionFilter}>
                    <SelectTrigger className="h-9 text-xs flex-1 sm:w-[150px]"><SelectValue placeholder="Acción" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las acciones</SelectItem>
                      <SelectItem value="login">Inicios de sesión</SelectItem>
                      <SelectItem value="sale">Ventas</SelectItem>
                      <SelectItem value="product">Productos</SelectItem>
                      <SelectItem value="backup">Backups</SelectItem>
                      <SelectItem value="pin">Seguridad / PIN</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0 shrink-0" onClick={loadAudit} disabled={loadingAudit} aria-label="Recargar auditoría">
                    <IconRefresh className={`h-4 w-4 ${loadingAudit ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAudit ? (
                <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <IconHistory className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No hay registros de auditoría recientes</p>
                </div>
              ) : (
                <>
                  {/* Vista móvil compacta (tarjetas limpias) */}
                  <div className="block sm:hidden divide-y divide-border/60 max-h-96 overflow-y-auto scroll-thin">
                    {filteredLogs.map((log) => (
                      <div key={log.id} className="p-3.5 space-y-1.5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs text-foreground">{log.userName}</span>
                            <span className="text-[10px] text-muted-foreground">({log.role})</span>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono py-0 h-5">
                            {log.action}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground break-words leading-snug">
                          {log.detail ?? "Sin detalles adicionales"}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80 pt-0.5 font-mono">
                          <IconClock className="h-3 w-3 shrink-0" />
                          <span>{formatDateTime(log.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Vista de escritorio (tabla estructurada) */}
                  <div className="hidden sm:block max-h-80 overflow-y-auto scroll-thin">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Fecha / Hora</TableHead>
                          <TableHead className="text-xs">Usuario</TableHead>
                          <TableHead className="text-xs">Acción</TableHead>
                          <TableHead className="text-xs">Detalles</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.map((log) => (
                          <TableRow key={log.id} className="text-xs hover:bg-muted/30">
                            <TableCell className="text-muted-foreground font-mono whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                            <TableCell>
                              <span className="font-semibold">{log.userName}</span>{" "}
                              <span className="text-[10px] text-muted-foreground">({log.role})</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] font-mono py-0">{log.action}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[320px] truncate text-muted-foreground">{log.detail ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PESTAÑA 3: BACKUPS ==================== */}
        <TabsContent value="backups" className="space-y-4">
          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden" data-tour="settings-backup-section">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <IconDeviceFloppy className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold">
                    {role === "superadmin"
                      ? "Copias de Seguridad Globales (Base de Datos MySQL)"
                      : `Copias de Seguridad de ${tenantName || "Mi Negocio"} (Datos Aislados)`}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {role === "superadmin"
                      ? "Respaldos completos de la base de datos MySQL de toda la plataforma SaaS."
                      : "Respalda y restaura únicamente la información de tus sedes (catálogo, ventas, compras, clientes y cajas)."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3.5 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button onClick={createBackup} disabled={creatingBackup} className="h-10 font-semibold shadow-xs">
                  {creatingBackup ? (
                    <><IconRefresh className="h-4 w-4 mr-2 animate-spin" /> Creando copia…</>
                  ) : (
                    <><IconDatabase className="h-4 w-4 mr-2" /> {role === "superadmin" ? "Crear backup global (.json)" : "Crear respaldo de mi negocio (.json)"}</>
                  )}
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingBackup}
                  variant="outline"
                  className="h-10 font-semibold border-dashed"
                >
                  {uploadingBackup ? (
                    <><IconRefresh className="h-4 w-4 mr-2 animate-spin" /> Subiendo copia…</>
                  ) : (
                    <><IconUpload className="h-4 w-4 mr-2" /> {role === "superadmin" ? "Subir archivo de copia (.json)" : "Subir archivo de copia (.json)"}</>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.db"
                  className="hidden"
                  onChange={handleUploadFile}
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    Copias guardadas ({backups.length})
                  </p>
                  {backups.some((b) => b.canDelete) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={purgeOldBackups}
                      disabled={purgingOldBackups}
                      className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 font-semibold"
                    >
                      {purgingOldBackups ? <IconRefresh className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <IconTrash className="h-3.5 w-3.5 mr-1.5" />}
                      Purgar copias vencidas (+5 días)
                    </Button>
                  )}
                </div>

                <div className="p-3 rounded-xl border bg-muted/20 text-xs text-muted-foreground flex items-start gap-2.5">
                  <IconShieldLock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-foreground">Regla de Retención Activa:</strong> Las copias de seguridad están protegidas contra borrado durante sus primeros 5 días de vigencia para salvaguardar tu información. Una vez cumplidos los 5 días, quedan habilitadas para ser depuradas o eliminadas.
                  </p>
                </div>

                {loadingBackups ? (
                  <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
                ) : backups.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border border-dashed rounded-xl">
                    <IconDeviceFloppy className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No hay copias de seguridad registradas</p>
                    <p className="text-xs mt-1">Crea tu primer respaldo con el botón de arriba</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto scroll-thin space-y-2">
                    {backups.map((b, i) => (
                      <div key={b.name} className="rounded-xl border p-3 hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold truncate">{b.name}</p>
                            {i === 0 && <Badge className="text-[10px] py-0">Más reciente</Badge>}
                            {b.canDelete ? (
                              <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                                Depurable (+5 días)
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-foreground border-border bg-muted/50">
                                Vigente (protegida {b.daysRemaining ?? 5}d)
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDateTime(b.createdAt)} · {formatSize(b.size)}
                            {b.ageDays !== undefined && (
                              <span className="ml-1 opacity-75">· Antigüedad: {b.ageDays} día{b.ageDays === 1 ? "" : "s"}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" title="Descargar copia" onClick={() => downloadBackup(b)}>
                            <IconDownload className="h-3.5 w-3.5 mr-1" /> Descargar
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" title="Restaurar" onClick={() => setRestoreTarget(b)}>
                            <IconRefresh className="h-3.5 w-3.5 mr-1" /> Restaurar
                          </Button>
                          {b.canDelete ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 font-semibold"
                              title="Eliminar copia vencida"
                              onClick={() => setDeleteTarget(b)}
                            >
                              <IconTrash className="h-3.5 w-3.5 mr-1" /> Eliminar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled
                              className="h-8 text-xs text-muted-foreground opacity-60 cursor-not-allowed"
                              title={`Protegida contra borrado (faltan ${b.daysRemaining ?? 5} días)`}
                            >
                              <IconLock className="h-3.5 w-3.5 mr-1" /> Vigente ({b.daysRemaining ?? 5}d)
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== PESTAÑA 4: DATOS DEMO & RESETEO (SOLO SUPERADMIN) ==================== */}
        {role === "superadmin" && (
        <TabsContent value="demo" className="space-y-4">
          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <IconDatabase className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold">Cargar Catálogos de Demostración</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Carga un catálogo completo de prueba adaptado a tu tipo de tienda
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3.5 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {RUBRO_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const active = selectedDemoPreset === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedDemoPreset(opt.value)}
                      className={`text-left rounded-xl border p-3 transition-all flex items-start gap-2.5 ${
                        active
                          ? "border-primary bg-primary/5 shadow-xs"
                          : "border-border/80 hover:bg-muted/30"
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs sm:text-sm leading-tight">{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Productos, unidades, categorías y clientes de ejemplo.
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <Button
                onClick={() => runSeed(selectedDemoPreset)}
                disabled={seeding}
                className="w-full h-10 font-semibold shadow-xs"
              >
                {seeding ? (
                  <><IconRefresh className="h-4 w-4 mr-2 animate-spin" /> Cargando catálogo…</>
                ) : (
                  <><IconDatabase className="h-4 w-4 mr-2" /> Cargar datos de demostración seleccionados</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                ⚠️ Al cargar datos demo se reinicializarán los catálogos con el set de prueba seleccionado.
              </p>
            </CardContent>
          </Card>

          {/* Puesta a Punto / Limpieza de Datos Demo */}
          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <IconTrash className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-destructive">Puesta a Punto: Limpiar Datos de Prueba</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Deja el sistema completamente limpio y listo para registrar operaciones reales
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-3.5 sm:p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Si ya terminaste de explorar y probar el sistema con datos de demostración, esta opción elimina las ventas ficticias, compras de prueba, arqueos y deudas simuladas para que arranques tu contabilidad desde cero.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IconShieldLock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Se genera un respaldo preventivo automático antes de limpiar</span>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setResetOpen(true)}
                  className="h-10 font-semibold text-xs sm:text-sm shadow-xs"
                >
                  <IconTrash className="h-4 w-4 mr-1.5" /> Limpiar datos de prueba ahora
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Protección y Seguridad de Datos */}
          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <IconShieldLock className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold">Protección e Inmutabilidad de Datos Activa</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Políticas de seguridad empresarial para prevenir alteraciones
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-3.5 sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <IconShieldLock className="h-4 w-4 text-muted-foreground" /> Sin Borrado Físico
                  </span>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Facturas, compras y clientes con movimientos están protegidos permanentemente contra borrado destructivo.
                  </p>
                </div>
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <IconHistory className="h-4 w-4 text-muted-foreground" /> Auditoría Inmutable
                  </span>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Cada cambio de precio, inicio de sesión o anulación queda registrado en el historial de auditoría de solo lectura.
                  </p>
                </div>
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <IconLock className="h-4 w-4 text-muted-foreground" /> Arqueos Protegidos
                  </span>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Las sesiones de caja cerradas quedan selladas para evitar modificaciones financieras retroactivas.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* ==================== PESTAÑA 5: AYUDA & TUTORIAL ==================== */}
        <TabsContent value="help" className="space-y-4">
          <Card className="rounded-xl shadow-xs border-border/80 overflow-hidden">
            <CardHeader className="p-3.5 sm:p-4 pb-2 sm:pb-3 border-b bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground">
                  <IconHelp className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold">Tutorial Guiado y Ayuda Rápida</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Aprende a sacar el máximo provecho de tu punto de venta</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3.5 sm:p-4">
              <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <IconSparkles className="h-4 w-4 text-foreground" /> Tour Guiado Interactivo
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  ¿Tienes nuevos colaboradores o deseas repasar las funciones del sistema? Ejecuta el tour paso a paso con explicaciones detalladas para cada sección.
                </p>
                <Button
                  onClick={() => {
                    if (role) localStorage.removeItem(TOUR_STORAGE_KEY_PREFIX + role)
                    useAppStore.getState().startTour()
                    toast.success("Tour interactivo iniciado")
                  }}
                  className="h-10 font-semibold shadow-xs"
                >
                  <IconSparkles className="h-4 w-4 mr-2" /> Iniciar tour interactivo ahora
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <IconBuildingStore className="h-4 w-4 text-muted-foreground" /> Escaneo en POS
                  </p>
                  <p className="text-muted-foreground leading-relaxed">En el Punto de Venta, cualquier lector USB o inalámbrico de código de barras agrega productos automáticamente al carrito.</p>
                </div>
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <IconShieldLock className="h-4 w-4 text-muted-foreground" /> Arqueo de Caja Seguro
                  </p>
                  <p className="text-muted-foreground leading-relaxed">El sistema compara el efectivo esperado con el contado y registra discrepancias en el historial para auditorías.</p>
                </div>
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <IconCoin className="h-4 w-4 text-muted-foreground" /> Créditos / Fiados
                  </p>
                  <p className="text-muted-foreground leading-relaxed">Otorga crédito a clientes de confianza con límites definidos y registra abonos parciales o totales con saldo en vivo.</p>
                </div>
                <div className="p-3 rounded-xl border bg-card space-y-1 shadow-xs">
                  <p className="font-bold text-foreground flex items-center gap-1.5">
                    <IconDeviceFloppy className="h-4 w-4 text-muted-foreground" /> Respaldo Automático
                  </p>
                  <p className="text-muted-foreground leading-relaxed">Descarga copias de seguridad de tu base de datos antes de realizar cambios importantes con protección de 5 días.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmación eliminar backup */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <IconAlertTriangle className="h-5 w-5" /> ¿Eliminar copia de seguridad?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el archivo{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{deleteTarget?.name}</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteBackup(deleteTarget); setDeleteTarget(null) }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación restore */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <IconAlertTriangle className="h-5 w-5" /> ¿Restaurar copia de seguridad?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazarán todos los datos actuales con la copia{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{restoreTarget?.name}</code>.
              Se creará automáticamente un respaldo previo de seguridad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoringBackup}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && restoreBackup(restoreTarget)}
              disabled={restoringBackup}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {restoringBackup ? <><IconRefresh className="h-4 w-4 mr-1.5 animate-spin" /> Restaurando…</> : "Sí, restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación reset */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <IconAlertTriangle className="h-5 w-5" /> ¿Limpiar datos demo para empezar a facturar real?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <span>
                Esta acción vaciará las ventas de prueba, compras ficticias, turnos de caja y productos demo para que tu negocio empiece desde cero.
              </span>
              <br />
              <strong className="text-foreground">
                Tus cuentas de usuario (admin y vendedor) y ajustes de la tienda se conservarán intactos.
              </strong>
              <br />
              <span className="text-emerald-600 dark:text-emerald-400 block pt-1">
                🛡️ Se creará una copia de respaldo automática previa en la pestaña Backups antes de ejecutar la limpieza.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runReset} disabled={resetting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold">
              {resetting ? <><IconRefresh className="h-4 w-4 mr-1.5 animate-spin" /> Limpiando…</> : "Sí, limpiar datos de prueba"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
