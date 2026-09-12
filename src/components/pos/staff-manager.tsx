"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore, type BranchItem } from "@/lib/store"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  IconUsers,
  IconUserPlus,
  IconUserCheck,
  IconShieldCheck,
  IconBuildingStore,
  IconPlus,
  IconPencil,
  IconTrash,
  IconKey,
  IconMail,
  IconPhone,
  IconMapPin,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconLoader2,
  IconEye,
  IconEyeOff,
  IconInfoCircle,
  IconLock,
  IconRefresh,
} from "@tabler/icons-react"

export interface StaffUser {
  id: string
  name: string
  email: string | null
  role: "admin" | "vendedor"
  isPrimary: boolean
  allowedBranchIds?: string[]
  active: boolean
  createdAt: string
}

export default function StaffManager() {
  const { role, activeBranch, setActiveBranch, fetchBranches, tenantName, tenantOwnerName, tenantOwnerEmail } = useAppStore()

  // Estados de Colaboradores
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Estados de Sedes
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const MAX_BRANCHES = 3

  // Modal Nuevo Colaborador
  const [newUserOpen, setNewUserOpen] = useState(false)
  const [newUserName, setNewUserName] = useState("")
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserRole, setNewUserRole] = useState<"admin" | "vendedor">("vendedor")
  const [newUserPin, setNewUserPin] = useState("")
  const [newUserPinConfirm, setNewUserPinConfirm] = useState("")
  const [newUserBranches, setNewUserBranches] = useState<string[]>([])
  const [showNewPin, setShowNewPin] = useState(false)
  const [savingNewUser, setSavingNewUser] = useState(false)

  // Modal Editar Colaborador
  const [editUserOpen, setEditUserOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<StaffUser | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRole, setEditRole] = useState<"admin" | "vendedor">("vendedor")
  const [editActive, setEditActive] = useState(true)
  const [editUserBranches, setEditUserBranches] = useState<string[]>([])
  const [savingEditUser, setSavingEditUser] = useState(false)

  // Modal Cambiar PIN
  const [changePinOpen, setChangePinOpen] = useState(false)
  const [pinTargetUser, setPinTargetUser] = useState<StaffUser | null>(null)
  const [newPinValue, setNewPinValue] = useState("")
  const [newPinConfirmValue, setNewPinConfirmValue] = useState("")
  const [showPinValue, setShowPinValue] = useState(false)
  const [savingPin, setSavingPin] = useState(false)

  // Modal Nueva Sede
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [branchName, setBranchName] = useState("")
  const [branchCode, setBranchCode] = useState("")
  const [branchAddress, setBranchAddress] = useState("")
  const [branchPhone, setBranchPhone] = useState("")
  const [savingBranch, setSavingBranch] = useState(false)

  // Modal Editar Sede
  const [editBranchOpen, setEditBranchOpen] = useState(false)
  const [selectedBranch, setSelectedBranch] = useState<BranchItem | null>(null)
  const [editBranchName, setEditBranchName] = useState("")
  const [editBranchCode, setEditBranchCode] = useState("")
  const [editBranchAddress, setEditBranchAddress] = useState("")
  const [editBranchPhone, setEditBranchPhone] = useState("")
  const [savingEditBranch, setSavingEditBranch] = useState(false)

  // Modal Eliminar Sede
  const [deleteBranchOpen, setDeleteBranchOpen] = useState(false)
  const [branchToDelete, setBranchToDelete] = useState<BranchItem | null>(null)
  const [deletingBranch, setDeletingBranch] = useState(false)

  // Cargar Usuarios
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await apiFetch<{ ok: boolean; users: StaffUser[] }>("/api/users")
      if (res.ok && res.users) {
        setUsers(res.users)
      }
    } catch (e) {
      toast.error("Error al cargar colaboradores: " + (e as Error).message)
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  // Cargar Sedes
  const loadBranches = useCallback(async () => {
    setLoadingBranches(true)
    try {
      const list = await fetchBranches()
      setBranches(list)
    } catch (e) {
      toast.error("Error al cargar sedes: " + (e as Error).message)
    } finally {
      setLoadingBranches(false)
    }
  }, [fetchBranches])

  useEffect(() => {
    loadUsers()
    loadBranches()
  }, [loadUsers, loadBranches])

  // Abrir Modal Nuevo Colaborador
  const handleOpenNewUser = () => {
    setNewUserName("")
    setNewUserEmail("")
    setNewUserRole("vendedor")
    setNewUserPin("")
    setNewUserPinConfirm("")
    // Por defecto habilitar la sede activa o todas las existentes
    if (activeBranch) {
      setNewUserBranches([activeBranch.id])
    } else if (branches.length > 0) {
      setNewUserBranches([branches[0].id])
    } else {
      setNewUserBranches([])
    }
    setNewUserOpen(true)
  }

  // Crear Colaborador
  const handleCreateUser = async () => {
    if (!newUserName.trim() || newUserName.trim().length < 2) {
      return toast.error("Ingresa un nombre de usuario de al menos 2 caracteres.")
    }
    if (!newUserPin || !/^\d{4,8}$/.test(newUserPin)) {
      return toast.error("El PIN debe contener entre 4 y 8 dígitos numéricos.")
    }
    if (newUserPin !== newUserPinConfirm) {
      return toast.error("Los PIN ingresados no coinciden.")
    }
    if (newUserRole === "admin" && newUserEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newUserEmail)) {
        return toast.error("Ingresa un correo electrónico válido.")
      }
    }
    if (newUserBranches.length === 0) {
      return toast.error("Debes asignar al menos una sede al colaborador.")
    }

    setSavingNewUser(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim() || null,
          role: newUserRole,
          pin: newUserPin.trim(),
          allowedBranchIds: newUserBranches,
        }),
      })
      toast.success(res.message || "Colaborador registrado con éxito.")
      setNewUserOpen(false)
      setNewUserName("")
      setNewUserEmail("")
      setNewUserRole("vendedor")
      setNewUserPin("")
      setNewUserPinConfirm("")
      setNewUserBranches([])
      loadUsers()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingNewUser(false)
    }
  }

  // Abrir Modal Editar Colaborador
  const handleOpenEditUser = (user: StaffUser) => {
    setSelectedUser(user)
    setEditName(user.name)
    setEditEmail(user.email || "")
    setEditRole(user.role)
    setEditActive(user.active)
    if (user.isPrimary) {
      setEditUserBranches(branches.map((b) => b.id))
    } else {
      setEditUserBranches(
        Array.isArray(user.allowedBranchIds) && user.allowedBranchIds.length > 0
          ? user.allowedBranchIds
          : branches.map((b) => b.id)
      )
    }
    setEditUserOpen(true)
  }

  // Guardar Edición Colaborador
  const handleSaveEditUser = async () => {
    if (!selectedUser) return
    if (!editName.trim() || editName.trim().length < 2) {
      return toast.error("El nombre debe tener al menos 2 caracteres.")
    }
    if (selectedUser.isPrimary && !editEmail.trim()) {
      return toast.error("El Administrador Principal debe tener un correo electrónico válido.")
    }
    if (!selectedUser.isPrimary && editUserBranches.length === 0) {
      return toast.error("Debes asignar al menos una sede al colaborador.")
    }

    setSavingEditUser(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/users", {
        method: "PUT",
        body: JSON.stringify({
          id: selectedUser.id,
          name: editName.trim(),
          email: editEmail.trim() || null,
          role: editRole,
          active: editActive,
          allowedBranchIds: selectedUser.isPrimary ? undefined : editUserBranches,
        }),
      })
      toast.success(res.message || "Colaborador actualizado.")
      setEditUserOpen(false)
      loadUsers()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingEditUser(false)
    }
  }

  // Abrir Modal Cambiar PIN
  const handleOpenChangePin = (user: StaffUser) => {
    setPinTargetUser(user)
    setNewPinValue("")
    setNewPinConfirmValue("")
    setChangePinOpen(true)
  }

  // Guardar Nuevo PIN
  const handleSavePin = async () => {
    if (!pinTargetUser) return
    if (!newPinValue || !/^\d{4,8}$/.test(newPinValue)) {
      return toast.error("El PIN debe tener entre 4 y 8 dígitos numéricos.")
    }
    if (newPinValue !== newPinConfirmValue) {
      return toast.error("Los PIN ingresados no coinciden.")
    }

    setSavingPin(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/users", {
        method: "PUT",
        body: JSON.stringify({
          id: pinTargetUser.id,
          pin: newPinValue.trim(),
        }),
      })
      toast.success(res.message || `PIN de ${pinTargetUser.name} actualizado.`)
      setChangePinOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingPin(false)
    }
  }

  // Activar / Desactivar Colaborador rápidamente
  const handleToggleUserActive = async (user: StaffUser) => {
    if (user.isPrimary) {
      return toast.error("El Administrador Principal no puede ser desactivado.")
    }
    const newStatus = !user.active
    try {
      await apiFetch("/api/users", {
        method: "PUT",
        body: JSON.stringify({ id: user.id, active: newStatus }),
      })
      toast.success(`Colaborador ${user.name} ${newStatus ? "activado" : "desactivado"}.`)
      loadUsers()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // Crear Sede (Validando máximo 3)
  const handleCreateBranch = async () => {
    if (branches.length >= MAX_BRANCHES) {
      return toast.error(`Límite alcanzado: Máximo ${MAX_BRANCHES} sedes permitidas.`)
    }
    if (!branchName.trim() || branchName.trim().length < 2) {
      return toast.error("Ingresa un nombre válido para la sede (mínimo 2 caracteres).")
    }

    setSavingBranch(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string; branch: BranchItem }>("/api/branches", {
        method: "POST",
        body: JSON.stringify({
          name: branchName.trim(),
          code: branchCode.trim() || null,
          address: branchAddress.trim() || null,
          phone: branchPhone.trim() || null,
        }),
      })
      toast.success(res.message || "Sede creada con éxito.")
      setNewBranchOpen(false)
      setBranchName("")
      setBranchCode("")
      setBranchAddress("")
      setBranchPhone("")
      loadBranches()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingBranch(false)
    }
  }

  // Abrir Modal Editar Sede
  const handleOpenEditBranch = (b: BranchItem) => {
    setSelectedBranch(b)
    setEditBranchName(b.name)
    setEditBranchCode(b.code || "")
    setEditBranchAddress(b.address || "")
    setEditBranchPhone(b.phone || "")
    setEditBranchOpen(true)
  }

  // Guardar Edición Sede
  const handleSaveEditBranch = async () => {
    if (!selectedBranch) return
    if (!editBranchName.trim() || editBranchName.trim().length < 2) {
      return toast.error("El nombre de la sede debe tener al menos 2 caracteres.")
    }

    setSavingEditBranch(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string; branch: BranchItem }>("/api/branches", {
        method: "PUT",
        body: JSON.stringify({
          id: selectedBranch.id,
          name: editBranchName.trim(),
          code: editBranchCode.trim() || null,
          address: editBranchAddress.trim() || null,
          phone: editBranchPhone.trim() || null,
        }),
      })
      toast.success(res.message || "Sede actualizada.")
      setEditBranchOpen(false)
      loadBranches()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSavingEditBranch(false)
    }
  }

  // Eliminar Sede
  const handleDeleteBranch = async () => {
    if (!branchToDelete) return
    if (branchToDelete.isMain) {
      return toast.error("La Sede Principal no puede ser eliminada.")
    }

    setDeletingBranch(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/api/branches?id=${branchToDelete.id}`, {
        method: "DELETE",
      })
      toast.success(res.message || "Sede eliminada.")
      setDeleteBranchOpen(false)
      setBranchToDelete(null)
      loadBranches()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeletingBranch(false)
    }
  }

  // Métricas
  const primaryAdmin = users.find((u) => u.isPrimary)
  const ownerDisplayName = primaryAdmin?.name || tenantOwnerName || "Administrador Principal"
  const ownerDisplayEmail = primaryAdmin?.email || tenantOwnerEmail || "admin@pos.com"
  const adminCount = users.filter((u) => u.role === "admin" && u.active).length
  const sellerCount = users.filter((u) => u.role === "vendedor" && u.active).length
  const branchUsagePercent = Math.min(Math.round((branches.length / MAX_BRANCHES) * 100), 100)

  return (
    <div className="p-3 sm:p-5 md:p-6 max-w-6xl mx-auto space-y-5 sm:space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <IconUsers className="h-6 w-6 text-primary" />
            Personal y Sedes
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Administra vendedores, administradores adicionales, credenciales PIN y sucursales físicas (máximo {MAX_BRANCHES} sedes).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadUsers()
              loadBranches()
            }}
            disabled={loadingUsers || loadingBranches}
            className="text-xs h-9 rounded-xl gap-1.5"
          >
            <IconRefresh className={cn("h-4 w-4", (loadingUsers || loadingBranches) && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Tarjetas de Métricas Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="rounded-xl border shadow-xs">
          <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <IconUsers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">Total Personal</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">{users.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-xs">
          <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
              <IconShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">Administradores</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">{adminCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-xs">
          <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <IconUserCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">Vendedores</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">{sellerCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-xs">
          <CardContent className="p-3.5 sm:p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <IconBuildingStore className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">Sedes Activas</p>
              <p className="text-lg sm:text-xl font-bold text-foreground">
                {branches.length} <span className="text-xs font-normal text-muted-foreground">/ {MAX_BRANCHES}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pestañas de Navegación: Personal vs Sedes */}
      <Tabs defaultValue="staff" className="w-full space-y-4">
        <TabsList className="grid grid-cols-2 max-w-xs h-10 p-1 bg-muted/60 border rounded-xl">
          <TabsTrigger value="staff" className="rounded-lg text-xs font-medium gap-1.5 data-[state=active]:bg-background shadow-xs">
            <IconUsers className="h-4 w-4" />
            <span>Colaboradores</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="rounded-lg text-xs font-medium gap-1.5 data-[state=active]:bg-background shadow-xs">
            <IconBuildingStore className="h-4 w-4" />
            <span>Sedes ({branches.length}/{MAX_BRANCHES})</span>
          </TabsTrigger>
        </TabsList>

        {/* ==================== PESTAÑA 1: GESTIÓN DE PERSONAL ==================== */}
        <TabsContent value="staff" className="space-y-4">
          {/* Banner Destacado del Administrador Principal */}
          {primaryAdmin && (
            <Card className="rounded-2xl border-primary/20 bg-primary/5 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                    {primaryAdmin.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-foreground truncate">{primaryAdmin.name}</h3>
                      <Badge variant="default" className="text-[10px] font-semibold bg-primary text-primary-foreground gap-1">
                        <IconShieldCheck className="h-3 w-3" /> Admin Principal
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-300">
                        Inmutable
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                      <IconMail className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{primaryAdmin.email || "Sin correo configurado (Recomendado configurar)"}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenChangePin(primaryAdmin)}
                    className="text-xs h-8 rounded-xl gap-1.5 border-border/80"
                  >
                    <IconKey className="h-3.5 w-3.5" /> Cambiar PIN
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleOpenEditUser(primaryAdmin)}
                    className="text-xs h-8 rounded-xl gap-1.5 shadow-xs"
                  >
                    <IconPencil className="h-3.5 w-3.5" /> Editar Correo
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Barra de Acciones y Título de Colaboradores */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <h3 className="text-base font-bold text-foreground">Equipo de Trabajo</h3>
              <p className="text-xs text-muted-foreground">
                Crea vendedores con acceso al terminal POS y caja, o añade otros administradores con acceso integral.
              </p>
            </div>
            <Button
              onClick={handleOpenNewUser}
              className="h-9 rounded-xl text-xs font-semibold gap-1.5 shadow-xs shrink-0"
            >
              <IconUserPlus className="h-4 w-4" /> Nuevo Colaborador
            </Button>
          </div>

          {/* Tabla de Colaboradores (Desktop) y Tarjetas (Mobile) */}
          <Card className="rounded-xl border shadow-xs overflow-hidden">
            {loadingUsers ? (
              <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Cargando personal...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-sm">No hay colaboradores registrados en el sistema.</p>
              </div>
            ) : (
              <>
                {/* Vista Desktop (Tabla) */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="w-[220px]">Colaborador</TableHead>
                        <TableHead>Rol en el Sistema</TableHead>
                        <TableHead>Sedes Asignadas</TableHead>
                        <TableHead>Correo Electrónico</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id} className={cn(!u.active && "opacity-60 bg-muted/20")}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className={cn("text-xs font-bold", u.role === "admin" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                                  {u.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                                  {u.name}
                                  {u.isPrimary && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                                      Principal
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {u.isPrimary ? (
                                    <span className="text-primary font-medium">Administrador Principal</span>
                                  ) : (
                                    <span>Pertenece a: <strong className="text-foreground font-semibold">{ownerDisplayName}</strong> ({ownerDisplayEmail})</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            {u.role === "admin" ? (
                              <Badge variant="default" className="text-[10px] font-semibold bg-primary text-primary-foreground gap-1">
                                <IconShieldCheck className="h-3 w-3" /> Administrador
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] font-semibold gap-1">
                                <IconUserCheck className="h-3 w-3 text-muted-foreground" /> Vendedor
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell>
                            {u.isPrimary ? (
                              <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/40 bg-primary/5 gap-1">
                                <IconBuildingStore className="h-3 w-3" /> Todas ({branches.length})
                              </Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-[220px]">
                                {(u.allowedBranchIds || []).length === 0 ? (
                                  <span className="text-[11px] text-muted-foreground italic">Sin sedes</span>
                                ) : (u.allowedBranchIds || []).length === branches.length && branches.length > 0 ? (
                                  <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/40 bg-primary/5 gap-1">
                                    <IconBuildingStore className="h-3 w-3" /> Todas ({branches.length})
                                  </Badge>
                                ) : (
                                  (u.allowedBranchIds || []).map((bId) => {
                                    const bObj = branches.find((b) => b.id === bId)
                                    return (
                                      <Badge key={bId} variant="secondary" className="text-[10px] font-normal py-0 px-1.5 h-5">
                                        {bObj ? bObj.name : "Sede"}
                                      </Badge>
                                    )
                                  })
                                )}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            {u.email ? (
                              <span className="flex items-center gap-1 font-medium text-foreground">
                                <IconMail className="h-3.5 w-3.5 text-primary shrink-0" />
                                {u.email}
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="text-muted-foreground/60 italic text-[11px] block">Sin correo personal</span>
                                <span className="text-[10px] text-primary flex items-center gap-1 font-medium truncate" title={`Correo de Admin Principal: ${ownerDisplayEmail}`}>
                                  <IconMail className="h-3 w-3 shrink-0" />
                                  Admin: {ownerDisplayEmail}
                                </span>
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Switch
                                checked={u.active}
                                disabled={u.isPrimary}
                                onCheckedChange={() => handleToggleUserActive(u)}
                                aria-label="Estado activo"
                              />
                              <span className={cn("text-[10px] font-medium", u.active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                                {u.active ? "Activo" : "Inactivo"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenChangePin(u)}
                                className="h-8 px-2 text-xs rounded-lg text-muted-foreground hover:text-foreground"
                                title="Cambiar PIN"
                              >
                                <IconKey className="h-3.5 w-3.5 mr-1" /> PIN
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditUser(u)}
                                className="h-8 px-2.5 text-xs rounded-lg gap-1"
                              >
                                <IconPencil className="h-3.5 w-3.5" /> Editar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Vista Mobile (Tarjetas) */}
                <div className="md:hidden divide-y divide-border">
                  {users.map((u) => (
                    <div key={u.id} className={cn("p-3.5 space-y-2.5", !u.active && "opacity-60 bg-muted/20")}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className={cn("text-xs font-bold", u.role === "admin" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                              {u.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold truncate text-foreground">{u.name}</p>
                              {u.isPrimary && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-primary text-primary-foreground">Principal</Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {u.isPrimary ? (u.email || ownerDisplayEmail) : `Pertenece a: ${ownerDisplayName} (${ownerDisplayEmail})`}
                            </p>
                          </div>
                        </div>


                        {u.role === "admin" ? (
                          <Badge variant="default" className="text-[10px] bg-primary text-primary-foreground shrink-0">
                            Admin
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            Vendedor
                          </Badge>
                        )}
                      </div>

                      {/* Sedes Asignadas en Mobile */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs bg-muted/30 p-2 rounded-lg">
                        <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1 shrink-0">
                          <IconBuildingStore className="h-3 w-3" /> Sedes:
                        </span>
                        {u.isPrimary ? (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 text-primary border-primary/40">
                            Todas ({branches.length})
                          </Badge>
                        ) : (u.allowedBranchIds || []).length === branches.length && branches.length > 0 ? (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 text-primary border-primary/40">
                            Todas ({branches.length})
                          </Badge>
                        ) : (
                          (u.allowedBranchIds || []).map((bId) => {
                            const bObj = branches.find((b) => b.id === bId)
                            return (
                              <Badge key={bId} variant="secondary" className="text-[9px] py-0 px-1.5 h-4">
                                {bObj ? bObj.name : "Sede"}
                              </Badge>
                            )
                          })
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={u.active}
                            disabled={u.isPrimary}
                            onCheckedChange={() => handleToggleUserActive(u)}
                          />
                          <span className="text-[11px] text-muted-foreground">{u.active ? "Activo" : "Inactivo"}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenChangePin(u)}
                            className="h-7 px-2 text-[11px] rounded-lg"
                          >
                            <IconKey className="h-3 w-3 mr-1" /> PIN
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleOpenEditUser(u)}
                            className="h-7 px-2.5 text-[11px] rounded-lg"
                          >
                            <IconPencil className="h-3 w-3 mr-1" /> Editar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ==================== PESTAÑA 2: GESTIÓN DE SEDES ==================== */}
        <TabsContent value="branches" className="space-y-4">
          {/* Banner de Cuota de Sedes (Máximo 3) */}
          <Card className="rounded-2xl border bg-card shadow-xs overflow-hidden">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <IconBuildingStore className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-bold text-foreground">Multi-Sede (Sucursales)</h3>
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {branches.length} de {MAX_BRANCHES} sedes
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El sistema permite registrar hasta <strong>{MAX_BRANCHES} sedes físicas</strong>. La Sede Principal permanece activa por defecto.
                  </p>
                </div>

                <Button
                  onClick={() => setNewBranchOpen(true)}
                  disabled={branches.length >= MAX_BRANCHES}
                  className="h-9 rounded-xl text-xs font-semibold gap-1.5 shadow-xs shrink-0 self-start sm:self-auto"
                >
                  <IconPlus className="h-4 w-4" /> Nueva Sede
                </Button>
              </div>

              {/* Barra de progreso de cuota */}
              <div className="space-y-1 pt-1">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300 rounded-full",
                      branches.length >= MAX_BRANCHES ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${branchUsagePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                  <span>{branches.length} utilizadas</span>
                  <span>{MAX_BRANCHES - branches.length} disponibles de {MAX_BRANCHES}</span>
                </div>
              </div>

              {branches.length >= MAX_BRANCHES && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 text-xs">
                  <IconAlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Has alcanzado el límite máximo permitido de {MAX_BRANCHES} sedes. Para agregar otra sede, debes editar o eliminar una sede secundaria.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Listado de Sedes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {loadingBranches ? (
              <div className="col-span-full p-8 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
                <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">Cargando sedes...</span>
              </div>
            ) : (
              branches.map((b) => {
                const isSelected = activeBranch?.id === b.id
                return (
                  <Card
                    key={b.id}
                    className={cn(
                      "rounded-2xl border transition-all duration-200 relative overflow-hidden flex flex-col",
                      isSelected ? "border-primary shadow-sm ring-1 ring-primary/25 bg-primary/[0.02]" : "hover:border-border/80"
                    )}
                  >
                    {/* Header de la tarjeta */}
                    <CardHeader className="p-4 pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-foreground truncate">{b.name}</h4>
                          {b.isMain && (
                            <Badge variant="default" className="text-[9px] bg-primary text-primary-foreground font-semibold px-1.5 py-0 h-4">
                              Principal
                            </Badge>
                          )}
                        </div>
                        {b.code && (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{b.code}</p>
                        )}
                      </div>

                      {isSelected ? (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] font-bold shrink-0 gap-1">
                          <IconCheck className="h-3 w-3" /> Activa
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActiveBranch(b)
                            toast.success(`Cambiado a sede: ${b.name}`)
                          }}
                          className="h-7 px-2 text-[10px] rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                        >
                          Seleccionar
                        </Button>
                      )}
                    </CardHeader>

                    {/* Contenido de contacto */}
                    <CardContent className="p-4 pt-0 space-y-2.5 flex-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2 text-xs">
                        <IconMapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{b.address || "Sin dirección registrada"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <IconPhone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{b.phone || "Sin teléfono"}</span>
                      </div>

                      {/* Bloque: A qué correo o admin principal pertenece esta sede */}
                      <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/15 text-xs space-y-1 mt-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                          <IconShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">
                            Admin: <strong className="text-foreground">{b.tenant?.ownerName || ownerDisplayName}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-primary text-[11px] font-medium">
                          <IconMail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{b.tenant?.ownerEmail || ownerDisplayEmail}</span>
                        </div>
                      </div>
                    </CardContent>

                    {/* Footer con acciones */}
                    <div className="p-3 bg-muted/30 border-t flex items-center justify-between gap-2 mt-auto">
                      <span className="text-[10px] text-muted-foreground">
                        {b.active ? "Sede Operativa" : "Sede Inactiva"}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditBranch(b)}
                          className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground"
                          title="Editar Sede"
                        >
                          <IconPencil className="h-3.5 w-3.5" />
                        </Button>
                        {!b.isMain && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setBranchToDelete(b)
                              setDeleteBranchOpen(true)
                            }}
                            className="h-7 w-7 p-0 rounded-lg text-destructive hover:bg-destructive/10"
                            title="Eliminar Sede"
                          >
                            <IconTrash className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== MODAL: NUEVO COLABORADOR ==================== */}
      <Dialog open={newUserOpen} onOpenChange={setNewUserOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconUserPlus className="h-5 w-5 text-primary" />
              Nuevo Colaborador
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registra un vendedor para el punto de venta o un nuevo administrador con PIN de acceso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nombre de Usuario *</Label>
              <Input
                placeholder="Ej. juan_ventas, maria_pos"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Rol Asignado *</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as "admin" | "vendedor")}>
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="vendedor">Vendedor (Punto de Venta, Caja y Ventas)</SelectItem>
                  <SelectItem value="admin">Administrador (Acceso total)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                Correo Electrónico {newUserRole === "admin" && "(Recomendado)"}
              </Label>
              <Input
                type="email"
                placeholder="colaborador@correo.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">PIN Numérico (4-8 dígitos) *</Label>
                <div className="relative">
                  <Input
                    type={showNewPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="••••"
                    value={newUserPin}
                    onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ""))}
                    className="h-9 text-xs rounded-xl pr-8 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPin ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Confirmar PIN *</Label>
                <Input
                  type={showNewPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="••••"
                  value={newUserPinConfirm}
                  onChange={(e) => setNewUserPinConfirm(e.target.value.replace(/\D/g, ""))}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>
            </div>

            {/* Sedes Asignadas */}
            <div className="space-y-2 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Sedes Asignadas ({newUserBranches.length}/{branches.length}) *
                </Label>
                <span className="text-[10px] text-muted-foreground">
                  {newUserBranches.length === 1 ? "1 sede fija" : `${newUserBranches.length} sedes conmutables`}
                </span>
              </div>
              <div className="space-y-1.5 rounded-xl border p-2.5 bg-muted/20">
                {branches.map((b) => {
                  const checked = newUserBranches.includes(b.id)
                  return (
                    <label
                      key={b.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors select-none",
                        checked ? "bg-primary/10 border-primary/40 font-medium" : "bg-card border-border hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUserBranches([...newUserBranches, b.id])
                            } else {
                              if (newUserBranches.length <= 1) {
                                toast.warning("El colaborador debe tener al menos una sede asignada.")
                                return
                              }
                              setNewUserBranches(newUserBranches.filter((id) => id !== b.id))
                            }
                          }}
                          className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                        />
                        <div className="flex items-center gap-1.5">
                          <IconBuildingStore className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{b.name}</span>
                        </div>
                      </div>
                      {b.isMain && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30">
                          Principal
                        </Badge>
                      )}
                    </label>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Si asignas 1 sede, solo verá esa sede. Si asignas 2 o 3, podrá alternar entre ellas.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setNewUserOpen(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateUser}
              disabled={savingNewUser}
              className="rounded-xl text-xs gap-1.5 shadow-xs"
            >
              {savingNewUser && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar Colaborador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: EDITAR COLABORADOR ==================== */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconPencil className="h-5 w-5 text-primary" />
              Editar Colaborador
            </DialogTitle>
            <DialogDescription className="text-xs">
              Modifica nombre de usuario, correo electrónico o rol en el sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nombre de Usuario *</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">
                Correo Electrónico {selectedUser?.isPrimary && "(Obligatorio para el Admin Principal)"}
              </Label>
              <Input
                type="email"
                placeholder="admin@correo.com"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Rol Asignado</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as "admin" | "vendedor")}
                disabled={selectedUser?.isPrimary}
              >
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="vendedor">Vendedor (Punto de Venta, Caja y Ventas)</SelectItem>
                  <SelectItem value="admin">Administrador (Acceso total)</SelectItem>
                </SelectContent>
              </Select>
              {selectedUser?.isPrimary && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  El rol del Administrador Principal no puede ser cambiado.
                </p>
              )}
            </div>

            {/* Sedes Asignadas */}
            <div className="space-y-2 pt-1 border-t border-border/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">
                  Sedes Asignadas {selectedUser?.isPrimary ? "(Acceso Total)" : `(${editUserBranches.length}/${branches.length}) *`}
                </Label>
                {!selectedUser?.isPrimary && (
                  <span className="text-[10px] text-muted-foreground">
                    {editUserBranches.length === 1 ? "1 sede fija" : `${editUserBranches.length} sedes conmutables`}
                  </span>
                )}
              </div>

              {selectedUser?.isPrimary ? (
                <div className="p-3 rounded-xl border bg-primary/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-primary text-xs font-semibold">
                    <IconShieldCheck className="h-4 w-4" />
                    <span>Acceso Total a Todas las Sedes</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    El Administrador Principal tiene autorización inherente en todas las sedes del sistema.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 rounded-xl border p-2.5 bg-muted/20">
                  {branches.map((b) => {
                    const checked = editUserBranches.includes(b.id)
                    return (
                      <label
                        key={b.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors select-none",
                          checked ? "bg-primary/10 border-primary/40 font-medium" : "bg-card border-border hover:bg-muted/40"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditUserBranches([...editUserBranches, b.id])
                              } else {
                                if (editUserBranches.length <= 1) {
                                  toast.warning("El colaborador debe tener al menos una sede asignada.")
                                  return
                                }
                                setEditUserBranches(editUserBranches.filter((id) => id !== b.id))
                              }
                            }}
                            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                          />
                          <div className="flex items-center gap-1.5">
                            <IconBuildingStore className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{b.name}</span>
                          </div>
                        </div>
                        {b.isMain && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/30">
                            Principal
                          </Badge>
                        )}
                      </label>
                    )
                  })}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Si asignas 1 sede, el usuario operará de forma aislada solo en ella.
                  </p>
                </div>
              )}
            </div>

            {!selectedUser?.isPrimary && (
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div>
                  <Label className="text-xs font-semibold block">Estado en el sistema</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {editActive ? "El usuario puede iniciar sesión y operar" : "Acceso bloqueado"}
                  </span>
                </div>
                <Switch checked={editActive} onCheckedChange={setEditActive} />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setEditUserOpen(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEditUser}
              disabled={savingEditUser}
              className="rounded-xl text-xs gap-1.5 shadow-xs"
            >
              {savingEditUser && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: CAMBIAR PIN ==================== */}
      <Dialog open={changePinOpen} onOpenChange={setChangePinOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconKey className="h-5 w-5 text-primary" />
              Cambiar PIN de Acceso
            </DialogTitle>
            <DialogDescription className="text-xs">
              Establece un nuevo PIN numérico de 4 a 8 dígitos para <strong>{pinTargetUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nuevo PIN Numérico</Label>
              <div className="relative">
                <Input
                  type={showPinValue ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="••••"
                  value={newPinValue}
                  onChange={(e) => setNewPinValue(e.target.value.replace(/\D/g, ""))}
                  className="h-9 text-xs rounded-xl pr-8 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPinValue(!showPinValue)}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  {showPinValue ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Confirmar Nuevo PIN</Label>
              <Input
                type={showPinValue ? "text" : "password"}
                inputMode="numeric"
                maxLength={8}
                placeholder="••••"
                value={newPinConfirmValue}
                onChange={(e) => setNewPinConfirmValue(e.target.value.replace(/\D/g, ""))}
                className="h-9 text-xs rounded-xl font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setChangePinOpen(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSavePin}
              disabled={savingPin}
              className="rounded-xl text-xs gap-1.5 shadow-xs"
            >
              {savingPin && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
              Actualizar PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: NUEVA SEDE ==================== */}
      <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconBuildingStore className="h-5 w-5 text-primary" />
              Nueva Sede / Sucursal
            </DialogTitle>
            <DialogDescription className="text-xs">
              Registra una nueva sucursal (Máximo {MAX_BRANCHES} sedes en total).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nombre de la Sede *</Label>
              <Input
                placeholder="Ej. Sede Norte, Sucursal Calle 80"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Código / Prefijo</Label>
                <Input
                  placeholder="Ej. SEDE-02"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Teléfono</Label>
                <Input
                  placeholder="Ej. +57 300 123 4567"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Dirección Física</Label>
              <Input
                placeholder="Ej. Carrera 15 # 45-20"
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setNewBranchOpen(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateBranch}
              disabled={savingBranch || branches.length >= MAX_BRANCHES}
              className="rounded-xl text-xs gap-1.5 shadow-xs"
            >
              {savingBranch && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
              Crear Sede
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: EDITAR SEDE ==================== */}
      <Dialog open={editBranchOpen} onOpenChange={setEditBranchOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconPencil className="h-5 w-5 text-primary" />
              Editar Sede
            </DialogTitle>
            <DialogDescription className="text-xs">
              Actualiza los datos y ubicación de la sede.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nombre de la Sede *</Label>
              <Input
                value={editBranchName}
                onChange={(e) => setEditBranchName(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Código / Prefijo</Label>
                <Input
                  value={editBranchCode}
                  onChange={(e) => setEditBranchCode(e.target.value.toUpperCase())}
                  className="h-9 text-xs rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Teléfono</Label>
                <Input
                  value={editBranchPhone}
                  onChange={(e) => setEditBranchPhone(e.target.value)}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Dirección Física</Label>
              <Input
                value={editBranchAddress}
                onChange={(e) => setEditBranchAddress(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setEditBranchOpen(false)} className="rounded-xl text-xs">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveEditBranch}
              disabled={savingEditBranch}
              className="rounded-xl text-xs gap-1.5 shadow-xs"
            >
              {savingEditBranch && <IconLoader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== ALERT DIALOG: ELIMINAR SEDE ==================== */}
      <AlertDialog open={deleteBranchOpen} onOpenChange={setDeleteBranchOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
              <IconTrash className="h-5 w-5 text-destructive" />
              Eliminar Sede
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              ¿Estás seguro de que deseas eliminar la sede <strong>{branchToDelete?.name}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBranch}
              disabled={deletingBranch}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl text-xs"
            >
              {deletingBranch ? "Eliminando..." : "Eliminar Sede"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
