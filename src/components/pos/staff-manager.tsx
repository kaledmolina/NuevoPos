"use client"

import { useState, useEffect, useCallback, useMemo, Fragment } from "react"
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
  IconCrown,
  IconSearch,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
} from "@tabler/icons-react"

export interface StaffUser {
  id: string
  name: string
  email: string | null
  role: "superadmin" | "admin" | "vendedor"
  isPrimary: boolean
  allowedBranchIds?: string[]
  assignedBranches?: { id: string; name: string; code: string | null }[]
  tenantId?: string | null
  tenantName?: string | null
  tenantOwnerName?: string | null
  tenantOwnerEmail?: string | null
  tenantBranchCount?: number
  active: boolean
  createdAt: string
}

export default function StaffManager() {
  const { role, activeBranch, setActiveBranch, fetchBranches, tenantName, tenantOwnerName, tenantOwnerEmail } = useAppStore()

  // Estados de Colaboradores
  const [users, setUsers] = useState<StaffUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Estados de Sedes
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const MAX_BRANCHES = 3

  // Filtro de negocio para Superadmin
  const [tenantsList, setTenantsList] = useState<{ id: string; name: string; rubro: string; ownerName: string }[]>([])
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>("all")

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

  // Dialog de confirmación moderno (reemplaza window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: "deactivate-admin" | "deactivate-admin-from-edit"
    user: StaffUser | null
    loading: boolean
  }>({ open: false, type: "deactivate-admin", user: null, loading: false })

  // ID del usuario cuyo toggle está en proceso de carga
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null)

  // Cargar lista de negocios si es Superadmin
  useEffect(() => {
    if (role === "superadmin") {
      apiFetch<{ ok: boolean; tenants: { id: string; name: string; rubro: string; ownerName: string }[] }>("/api/superadmin/tenants")
        .then((res) => {
          if (res.ok && Array.isArray(res.tenants)) {
            setTenantsList(res.tenants)
          }
        })
        .catch(() => {})
    }
  }, [role])

  // Cargar Usuarios
  const loadUsers = useCallback(async (tenantFilter?: string) => {
    setLoadingUsers(true)
    try {
      const filter = tenantFilter !== undefined ? tenantFilter : selectedTenantFilter
      const url = role === "superadmin" && filter !== "all"
        ? `/api/users?tenantId=${encodeURIComponent(filter)}`
        : "/api/users"
      const res = await apiFetch<{ ok: boolean; users: StaffUser[] }>(url)
      if (res.ok && res.users) {
        setUsers(res.users)
      }
    } catch (e) {
      toast.error("Error al cargar colaboradores: " + (e as Error).message)
    } finally {
      setLoadingUsers(false)
    }
  }, [role, selectedTenantFilter])

  // Cargar Sedes
  const loadBranches = useCallback(async (tenantFilter?: string) => {
    setLoadingBranches(true)
    try {
      const filter = tenantFilter !== undefined ? tenantFilter : selectedTenantFilter
      let list: BranchItem[] = []
      if (role === "superadmin" && filter !== "all") {
        const res = await apiFetch<{ ok: boolean; branches: BranchItem[] }>(`/api/branches?tenantId=${encodeURIComponent(filter)}`)
        if (res.ok && Array.isArray(res.branches)) {
          list = res.branches
        }
      } else {
        list = await fetchBranches()
      }
      setBranches(list)
    } catch (e) {
      toast.error("Error al cargar sedes: " + (e as Error).message)
    } finally {
      setLoadingBranches(false)
    }
  }, [role, selectedTenantFilter, fetchBranches])

  const handleTenantFilterChange = (val: string) => {
    setSelectedTenantFilter(val)
    loadUsers(val)
    loadBranches(val)
  }

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

  const handleOpenEditUser = (user: StaffUser) => {
    setSelectedUser(user)
    setEditName(user.name)
    setEditEmail(user.email || "")
    setEditRole(user.role === "admin" ? "admin" : "vendedor")
    setEditActive(user.active)
    const userTenantBranches = branches.filter((b) => (b.tenantId ?? b.tenant?.id ?? null) === (user.tenantId ?? null))
    const relevantBranches = userTenantBranches.length > 0 ? userTenantBranches : branches

    if (user.isPrimary) {
      setEditUserBranches(relevantBranches.map((b) => b.id))
    } else {
      setEditUserBranches(
        Array.isArray(user.allowedBranchIds) && user.allowedBranchIds.length > 0
          ? user.allowedBranchIds
          : relevantBranches.map((b) => b.id)
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

    // Si está desactivando al Admin Principal → abrir modal moderno en lugar de window.confirm
    if (selectedUser.isPrimary && selectedUser.active && !editActive) {
      setConfirmDialog({ open: true, type: "deactivate-admin-from-edit", user: selectedUser, loading: false })
      return
    }

    await doSaveEditUser()
  }

  // Ejecuta el guardado real del colaborador (puede venir del confirm dialog)
  const doSaveEditUser = async () => {
    if (!selectedUser) return
    setSavingEditUser(true)
    setConfirmDialog((d) => ({ ...d, loading: true }))
    try {
      const res = await apiFetch<{ ok: boolean; message: string; cascaded?: boolean }>("/api/users", {
        method: "PUT",
        body: JSON.stringify({
          id: selectedUser.id,
          name: editName.trim(),
          email: editEmail.trim() || null,
          role: editRole,
          active: (selectedUser.role === "superadmin" || selectedUser.email === "kaledmoly@gmail.com") ? true : editActive,
          allowedBranchIds: selectedUser.isPrimary ? undefined : editUserBranches,
        }),
      })
      if (selectedUser.isPrimary && !editActive) {
        toast.warning(res.message || "Administrador y colaboradores inactivados.", { duration: 5000 })
      } else {
        toast.success(res.message || "Colaborador actualizado.")
      }
      setConfirmDialog({ open: false, type: "deactivate-admin", user: null, loading: false })
      setEditUserOpen(false)
      loadUsers()
    } catch (e) {
      toast.error((e as Error).message)
      setConfirmDialog((d) => ({ ...d, loading: false }))
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

  // Activar / Desactivar Colaborador o Admin rápidamente (con loading animado)
  const handleToggleUserActive = (user: StaffUser) => {
    if (user.role === "superadmin" || user.email === "kaledmoly@gmail.com") {
      return toast.error("El Superadministrador del sistema está protegido permanentemente y no se puede deshabilitar nunca.")
    }
    if (user.isPrimary && role !== "superadmin") {
      return toast.error("Solo el Superadministrador puede modificar el estado del Administrador Principal.")
    }

    const newStatus = !user.active

    // Si es Admin Principal y se va a desactivar → abre el modal moderno de confirmación
    if (user.isPrimary && !newStatus) {
      setConfirmDialog({ open: true, type: "deactivate-admin", user, loading: false })
      return
    }

    doToggleUserActive(user, newStatus)
  }

  // Ejecuta el cambio de estado real (puede venir del confirm dialog)
  const doToggleUserActive = async (user: StaffUser, newStatus: boolean) => {
    setToggleLoadingId(user.id)
    setConfirmDialog((d) => ({ ...d, loading: true }))
    try {
      const res = await apiFetch<{ ok: boolean; message: string; cascaded?: boolean }>("/api/users", {
        method: "PUT",
        body: JSON.stringify({ id: user.id, active: newStatus }),
      })
      if (user.isPrimary && !newStatus) {
        toast.warning(res.message || `Admin "${user.name}" y todo su personal han sido desactivados.`, { duration: 5000 })
      } else {
        toast.success(res.message || `Usuario "${user.name}" ${newStatus ? "activado" : "desactivado"}.`)
      }
      setConfirmDialog({ open: false, type: "deactivate-admin", user: null, loading: false })
      loadUsers()
    } catch (e) {
      toast.error((e as Error).message)
      setConfirmDialog((d) => ({ ...d, loading: false }))
    } finally {
      setToggleLoadingId(null)
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

  // Agrupación y clasificación inteligente por negocio / administrador
  interface TenantStaffGroup {
    key: string
    tenantId: string | null
    tenantName: string
    ownerName: string
    ownerEmail: string
    branchesCount: number
    users: StaffUser[]
  }

  const groupedStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? users.filter((u) => {
          const matchName = u.name.toLowerCase().includes(q)
          const matchEmail = (u.email || "").toLowerCase().includes(q)
          const matchOwner = (u.tenantOwnerName || "").toLowerCase().includes(q)
          const matchBusiness = (u.tenantName || "").toLowerCase().includes(q)
          const matchBranch = (u.assignedBranches || []).some((b) => b.name.toLowerCase().includes(q))
          return matchName || matchEmail || matchOwner || matchBusiness || matchBranch
        })
      : users

    const map = new Map<string, TenantStaffGroup>()

    for (const u of filtered) {
      const key = u.tenantId ?? "superadmin"
      if (!map.has(key)) {
        map.set(key, {
          key,
          tenantId: u.tenantId ?? null,
          tenantName: u.tenantName || (u.tenantId === null ? "Administración SaaS" : "Negocio"),
          ownerName: u.tenantOwnerName || (u.isPrimary ? u.name : ownerDisplayName),
          ownerEmail: u.tenantOwnerEmail || (u.isPrimary ? (u.email || "") : ownerDisplayEmail),
          branchesCount: u.tenantBranchCount ?? 1,
          users: [],
        })
      }
      const g = map.get(key)!
      // Si este usuario es el isPrimary, actualiza el dueño del grupo con sus datos
      if (u.isPrimary) {
        if (u.tenantOwnerName) g.ownerName = u.tenantOwnerName
        if (u.tenantOwnerEmail) g.ownerEmail = u.tenantOwnerEmail
      }
      g.users.push(u)
    }

    // Ordenar colaboradores dentro de cada grupo: Admin Principal primero, luego el resto de colaboradores
    for (const g of map.values()) {
      g.users.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
        if (a.role !== b.role) {
          if (a.role === "superadmin") return -1
          if (b.role === "superadmin") return 1
          if (a.role === "admin") return -1
          if (b.role === "admin") return 1
        }
        return a.name.localeCompare(b.name)
      })
    }

    // Ordenar grupos: SaaS Superadmin de primero o empresas alfabéticamente
    const list = Array.from(map.values())
    list.sort((a, b) => {
      if (a.tenantId === null) return -1
      if (b.tenantId === null) return 1
      return a.tenantName.localeCompare(b.tenantName)
    })

    return list
  }, [users, searchQuery, ownerDisplayName, ownerDisplayEmail])

  // Estado de acordeón: por defecto todos recogidos / colapsados
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const toggleGroupExpand = (key: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Si hay búsqueda activa, expandir automáticamente los grupos que coincidan
  const isSearching = searchQuery.trim().length > 0

  const isGroupExpanded = (key: string) => {
    if (isSearching) return true
    return Boolean(expandedGroups[key])
  }

  const areAllExpanded =
    groupedStaff.length > 0 && groupedStaff.every((g) => isGroupExpanded(g.key))

  const toggleAllGroups = () => {
    if (areAllExpanded) {
      setExpandedGroups({})
    } else {
      const next: Record<string, boolean> = {}
      groupedStaff.forEach((g) => {
        next[g.key] = true
      })
      setExpandedGroups(next)
    }
  }

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
              <p className="text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
                {role === "superadmin" && selectedTenantFilter === "all" ? "Sedes Totales" : "Sedes Activas"}
              </p>
              <p className="text-lg sm:text-xl font-bold text-foreground">
                {branches.length}
                {!(role === "superadmin" && selectedTenantFilter === "all") && (
                  <span className="text-xs font-normal text-muted-foreground"> / {MAX_BRANCHES}</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selector de Negocio / Empresa para Superadministrador */}
      {role === "superadmin" && (
        <Card className="rounded-2xl border bg-muted/40 p-3 sm:p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                <IconCrown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Filtro Multi-Tenant SaaS
                  <Badge className="bg-amber-500 text-white text-[9px] py-0 px-1">Superadmin</Badge>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Filtra colaboradores y sucursales por negocio específico o examina el ecosistema completo.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">Empresa / Negocio:</span>
              <Select value={selectedTenantFilter} onValueChange={handleTenantFilterChange}>
                <SelectTrigger className="w-[260px] h-9 text-xs bg-background rounded-xl">
                  <SelectValue placeholder="Filtrar por negocio..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">🏢 Todos los Negocios ({tenantsList.length})</SelectItem>
                  {tenantsList.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.ownerName})
                    </SelectItem>
                  ))}
                  <SelectItem value="superadmin">🛡️ Sede Central Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      )}

      {/* Pestañas de Navegación: Personal vs Sedes */}
      <Tabs defaultValue="staff" className="w-full space-y-4">
        <TabsList className="grid grid-cols-2 max-w-xs h-10 p-1 bg-muted/60 border rounded-xl">
          <TabsTrigger value="staff" className="rounded-lg text-xs font-medium gap-1.5 data-[state=active]:bg-background shadow-xs">
            <IconUsers className="h-4 w-4" />
            <span>Colaboradores ({users.length})</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="rounded-lg text-xs font-medium gap-1.5 data-[state=active]:bg-background shadow-xs">
            <IconBuildingStore className="h-4 w-4" />
            <span>
              Sedes ({branches.length}
              {!(role === "superadmin" && selectedTenantFilter === "all") ? `/${MAX_BRANCHES}` : ""})
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ==================== PESTAÑA 1: GESTIÓN DE PERSONAL ==================== */}
        <TabsContent value="staff" className="space-y-4">
          {/* Banner Destacado del Administrador Principal */}
          {primaryAdmin && (role !== "superadmin" || selectedTenantFilter !== "all") ? (
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
                      {primaryAdmin.tenantName && (
                        <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30">
                          {primaryAdmin.tenantName}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-400 border-emerald-300">
                        Inmutable
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 truncate">
                      <IconMail className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{primaryAdmin.email || "Sin correo configurado"}</span>
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
          ) : role === "superadmin" && selectedTenantFilter === "all" ? (
            <Card className="rounded-2xl border-amber-500/20 bg-amber-500/5 shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                  <IconCrown className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground">Vista Global de Colaboradores (Multi-Tenant)</h3>
                  <p className="text-xs text-muted-foreground">
                    Se listan los usuarios y colaboradores de todos los negocios registrados. Cada uno está aislado a las sedes de su respectivo negocio.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}

          {/* Barra de Acciones y Título de Colaboradores */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            <div>
              <h3 className="text-base font-bold text-foreground">Equipo de Trabajo</h3>
              <p className="text-xs text-muted-foreground">
                Colaboradores organizados por administrador principal y con el detalle de sus sedes asignadas.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleAllGroups}
                className="h-9 rounded-xl text-xs font-medium gap-1 text-muted-foreground hover:text-foreground shrink-0 border-dashed"
                title={areAllExpanded ? "Colapsar todos los negocios" : "Desplegar todos los negocios"}
              >
                {areAllExpanded ? (
                  <>
                    <IconChevronUp className="h-3.5 w-3.5 text-primary" /> Colapsar Todos
                  </>
                ) : (
                  <>
                    <IconChevronDown className="h-3.5 w-3.5 text-primary" /> Desplegar Todos
                  </>
                )}
              </Button>
              <div className="relative w-full sm:w-64">
                <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar colaborador, sede o negocio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-8 text-xs rounded-xl"
                />
              </div>
              <Button
                onClick={handleOpenNewUser}
                className="h-9 rounded-xl text-xs font-semibold gap-1.5 shadow-xs shrink-0"
              >
                <IconUserPlus className="h-4 w-4" /> Nuevo Colaborador
              </Button>
            </div>
          </div>

          {/* Lista de Grupos por Negocio (Cards independientes con Acordeón por defecto recogido) */}
          {loadingUsers ? (
            <Card className="rounded-2xl border p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
              <IconLoader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs font-medium">Cargando personal y sedes...</span>
            </Card>
          ) : groupedStaff.length === 0 ? (
            <Card className="rounded-2xl border p-12 text-center text-muted-foreground">
              <IconUsers className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No se encontraron colaboradores.</p>
              {searchQuery ? (
                <p className="text-xs text-muted-foreground/80 mt-1">
                  No hay resultados para la búsqueda &quot;{searchQuery}&quot;.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Aún no hay colaboradores registrados en este negocio.
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-3.5">
              {groupedStaff.map((group) => {
                const isExpanded = isGroupExpanded(group.key)
                const primaryUser = group.users.find((u) => u.isPrimary)
                const isAdminInactive = primaryUser ? !primaryUser.active : false

                return (
                  <div
                    key={group.key}
                    className={cn(
                      "rounded-2xl border transition-all duration-300 overflow-hidden bg-card shadow-2xs",
                      isExpanded
                        ? "border-primary/40 ring-1 ring-primary/15 shadow-md"
                        : "border-border/70 hover:border-border hover:shadow-xs"
                    )}
                  >
                    {/* Encabezado del Negocio (Acordeón clickeable) */}
                    <div
                      onClick={() => toggleGroupExpand(group.key)}
                      className={cn(
                        "p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none",
                        "transition-all duration-200 group/header",
                        isExpanded
                          ? "bg-muted/40 border-b border-border/50"
                          : "bg-card hover:bg-muted/20"
                      )}
                      title={isExpanded ? `Clic para colapsar ${group.tenantName}` : `Clic para desplegar ${group.tenantName}`}
                    >
                      {/* Lado izquierdo: Chevron, Icono tienda, Nombre y Admin */}
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Chevron animado */}
                        <div
                          className={cn(
                            "h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-all duration-300",
                            isExpanded
                              ? "bg-primary/15 text-primary rotate-90"
                              : "bg-muted text-muted-foreground group-hover/header:bg-muted/80 group-hover/header:text-foreground"
                          )}
                        >
                          <IconChevronRight className="h-3.5 w-3.5 transition-transform duration-300" />
                        </div>

                        {/* Icono tienda con ligera animación al expandir */}
                        <div
                          className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center font-bold shrink-0 transition-all duration-300",
                            isExpanded
                              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                              : "bg-primary/10 text-primary group-hover/header:bg-primary/15"
                          )}
                        >
                          <IconBuildingStore className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{group.tenantName}</span>
                            {isAdminInactive && (
                              <Badge
                                variant="destructive"
                                className="text-[10px] h-5 bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 font-semibold gap-1"
                              >
                                Admin Inactivo · Personal Inactivo
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                            <span>
                              Admin: <strong className="text-foreground/90 font-medium">{group.ownerName}</strong>
                            </span>
                            {group.ownerEmail && (
                              <>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="text-muted-foreground/80 truncate">{group.ownerEmail}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Lado derecho: Badges de Sedes, Miembros y botón acción */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className="text-[11px] h-6 px-2.5 bg-background font-medium gap-1.5 text-muted-foreground border-border/70"
                        >
                          <IconBuildingStore className="h-3.5 w-3.5 text-primary shrink-0" />
                          {group.branchesCount} {group.branchesCount === 1 ? "Sede" : "Sedes"}
                        </Badge>

                        <Badge variant="secondary" className="text-[11px] h-6 px-2.5 font-medium gap-1.5">
                          <IconUsers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {group.users.length} {group.users.length === 1 ? "Miembro" : "Miembros"}
                        </Badge>

                        {/* Botón visual Desplegar/Colapsar animado */}
                        <div
                          className={cn(
                            "hidden sm:flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all duration-200",
                            isExpanded
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground group-hover/header:bg-muted/80 group-hover/header:text-foreground"
                          )}
                        >
                          <IconChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform duration-300",
                              isExpanded && "rotate-180"
                            )}
                          />
                          {isExpanded ? "Colapsar" : "Desplegar"}
                        </div>
                      </div>
                    </div>

                    {/* Contenido Desplegado — animación CSS grid-rows */}
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-300 ease-in-out",
                        isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      )}
                    >
                      <div className="overflow-hidden">
                        {/* Vista Desktop (Tabla Interna Espaciosa) */}
                        <div className="hidden md:block overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/15 hover:bg-muted/15 text-[11px] border-b border-border/40">
                                <TableHead className="py-2.5 px-4 font-semibold text-muted-foreground w-[260px]">
                                  COLABORADOR / EQUIPO
                                </TableHead>
                                <TableHead className="py-2.5 px-4 font-semibold text-muted-foreground w-[140px]">
                                  ROL EN EL SISTEMA
                                </TableHead>
                                <TableHead className="py-2.5 px-4 font-semibold text-muted-foreground min-w-[220px]">
                                  SEDES ASIGNADAS
                                </TableHead>
                                <TableHead className="py-2.5 px-4 font-semibold text-muted-foreground min-w-[200px]">
                                  CORREO / CONTACTO
                                </TableHead>
                                <TableHead className="py-2.5 px-4 font-semibold text-muted-foreground text-center w-[120px]">
                                  ESTADO
                                </TableHead>
                                <TableHead className="py-2.5 px-4 font-semibold text-muted-foreground text-right w-[150px]">
                                  ACCIONES
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.users.map((u) => {
                                const userBranchesList =
                                  u.assignedBranches && u.assignedBranches.length > 0
                                    ? u.assignedBranches
                                    : (u.allowedBranchIds || [])
                                        .map((id) => branches.find((b) => b.id === id))
                                        .filter((b): b is BranchItem => Boolean(b))
                                        .map((b) => ({ id: b.id, name: b.name, code: b.code || null }))

                                return (
                                  <TableRow
                                    key={u.id}
                                    className={cn(
                                      !u.active && "opacity-60 bg-muted/15",
                                      "hover:bg-muted/20 transition-colors border-b border-border/40 last:border-0",
                                      "animate-in fade-in slide-in-from-top-1 duration-200"
                                    )}
                                  >
                                    {/* Colaborador */}
                                    <TableCell className="py-3.5 px-4">
                                      {u.isPrimary ? (
                                        <div className="flex items-center gap-2.5">
                                          <Avatar className="h-8 w-8 shrink-0 ring-1 ring-primary/20">
                                            <AvatarFallback
                                              className={cn(
                                                "text-xs font-bold",
                                                u.role === "superadmin"
                                                  ? "bg-amber-500 text-white"
                                                  : "bg-primary text-primary-foreground"
                                              )}
                                            >
                                              {u.name.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                                              {u.name}
                                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold border border-amber-300 dark:border-amber-800">
                                                Titular
                                              </span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground truncate">
                                              {u.role === "superadmin"
                                                ? "Superadministrador SaaS"
                                                : "Administrador General"}
                                            </p>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2.5 pl-3">
                                          <span className="text-muted-foreground/60 text-sm font-mono select-none shrink-0">
                                            ↳
                                          </span>
                                          <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarFallback className="text-[11px] font-bold bg-muted text-foreground">
                                              {u.name.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="min-w-0">
                                            <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                                              {u.name}
                                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium border border-border/50">
                                                Colaborador
                                              </span>
                                            </p>
                                            <p className="text-[10px] text-muted-foreground truncate">
                                              Equipo de:{" "}
                                              <strong className="text-foreground/80 font-medium">
                                                {group.ownerName}
                                              </strong>
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </TableCell>

                                    {/* Rol */}
                                    <TableCell className="py-3.5 px-4">
                                      {u.role === "superadmin" ? (
                                        <Badge className="text-[10px] font-semibold bg-amber-500 text-white gap-1 shadow-xs">
                                          <IconCrown className="h-3 w-3" /> Superadmin
                                        </Badge>
                                      ) : u.role === "admin" ? (
                                        <Badge
                                          variant="default"
                                          className="text-[10px] font-semibold bg-primary text-primary-foreground gap-1"
                                        >
                                          <IconShieldCheck className="h-3 w-3" /> Administrador
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary" className="text-[10px] font-semibold gap-1">
                                          <IconUserCheck className="h-3 w-3 text-muted-foreground" /> Vendedor
                                        </Badge>
                                      )}
                                    </TableCell>

                                    {/* Sedes Asignadas (Inline, espacioso y sin apiñamiento) */}
                                    <TableCell className="py-3.5 px-4">
                                      {u.isPrimary ? (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] font-bold text-primary border-primary/30 bg-primary/5 gap-1 py-0.5 px-2"
                                          >
                                            <IconBuildingStore className="h-2.5 w-2.5 shrink-0" />
                                            Acceso Total ({userBranchesList.length})
                                          </Badge>
                                          {userBranchesList.map((b) => (
                                            <Badge
                                              key={b.id}
                                              variant="secondary"
                                              className="text-[10px] font-normal py-0.5 px-2 bg-muted/80 text-foreground/80 border border-border/50 gap-1"
                                            >
                                              <IconMapPin className="h-2.5 w-2.5 text-primary shrink-0" />
                                              {b.name}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {userBranchesList.length === 0 ? (
                                            <span className="text-[11px] text-muted-foreground/60 italic">
                                              Sin sedes asignadas
                                            </span>
                                          ) : (
                                            userBranchesList.map((b) => (
                                              <Badge
                                                key={b.id}
                                                variant="secondary"
                                                className="text-[10px] font-normal py-0.5 px-2 bg-muted/80 text-foreground/80 border border-border/50 gap-1"
                                              >
                                                <IconMapPin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                                {b.name}
                                              </Badge>
                                            ))
                                          )}
                                        </div>
                                      )}
                                    </TableCell>

                                    {/* Correo / Contacto */}
                                    <TableCell className="py-3.5 px-4 text-xs text-muted-foreground">
                                      {u.email ? (
                                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                                          <IconMail className="h-3.5 w-3.5 text-primary shrink-0" />
                                          {u.email}
                                        </span>
                                      ) : (
                                        <div
                                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                                          title={`Contacto vía Administrador: ${group.ownerEmail}`}
                                        >
                                          <IconMail className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                                          <span className="text-muted-foreground/60">Admin:</span>
                                          <span className="truncate max-w-[180px]">{group.ownerEmail}</span>
                                        </div>
                                      )}
                                    </TableCell>

                                    {/* Estado */}
                                    <TableCell className="py-3.5 px-4 text-center">
                                      {u.role === "superadmin" || u.email === "kaledmoly@gmail.com" ? (
                                        <div className="flex items-center justify-center">
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-300 dark:border-amber-800 gap-1 py-1 px-2.5 shadow-2xs select-none"
                                            title="El Superadministrador nunca puede ser deshabilitado"
                                          >
                                            <IconShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                            Siempre Activo
                                          </Badge>
                                        </div>
                                      ) : toggleLoadingId === u.id ? (
                                        <div className="flex items-center justify-center gap-1.5">
                                          <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
                                          <span className="text-[11px] text-muted-foreground animate-pulse">
                                            {u.active ? "Desactivando…" : "Activando…"}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-1.5">
                                          <Switch
                                            checked={u.active}
                                            disabled={role !== "superadmin" && u.isPrimary}
                                            onCheckedChange={() => handleToggleUserActive(u)}
                                            aria-label="Estado activo"
                                            title={
                                              role !== "superadmin" && u.isPrimary
                                                ? "Solo el Superadministrador puede modificar el estado del Admin Principal"
                                                : u.isPrimary
                                                ? "Inactivar al Admin Principal inactivará automáticamente a todos sus colaboradores"
                                                : undefined
                                            }
                                          />
                                          <span
                                            className={cn(
                                              "text-[11px] font-medium transition-colors",
                                              u.active
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-muted-foreground"
                                            )}
                                          >
                                            {u.active ? "Activo" : "Inactivo"}
                                          </span>
                                        </div>
                                      )}
                                    </TableCell>

                                    {/* Acciones */}
                                    <TableCell className="py-3.5 px-4 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleOpenChangePin(u)}
                                          className="h-8 px-2.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                                          title="Cambiar PIN"
                                        >
                                          <IconKey className="h-3.5 w-3.5 mr-1" /> PIN
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleOpenEditUser(u)}
                                          className="h-8 px-2.5 text-xs rounded-lg gap-1 border-border/80 hover:bg-primary/5 hover:text-primary hover:border-primary/40"
                                        >
                                          <IconPencil className="h-3.5 w-3.5" /> Editar
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Vista Mobile (Tarjetas Internas) */}
                        <div className="md:hidden divide-y divide-border/50">
                          {group.users.map((u) => {
                            const userBranchesList =
                              u.assignedBranches && u.assignedBranches.length > 0
                                ? u.assignedBranches
                                : (u.allowedBranchIds || [])
                                    .map((id) => branches.find((b) => b.id === id))
                                    .filter((b): b is BranchItem => Boolean(b))
                                    .map((b) => ({ id: b.id, name: b.name, code: b.code || null }))

                            return (
                              <div
                                key={u.id}
                                className={cn(
                                  "p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200",
                                  !u.active && "opacity-60 bg-muted/15"
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <Avatar className="h-8 w-8 shrink-0">
                                      <AvatarFallback
                                        className={cn(
                                          "text-xs font-bold",
                                          u.role === "superadmin"
                                            ? "bg-amber-500 text-white"
                                            : u.role === "admin"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-foreground"
                                        )}
                                      >
                                        {u.name.slice(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        {u.isPrimary ? (
                                          <IconCrown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                        ) : (
                                          <span className="text-primary font-bold text-xs select-none">↳</span>
                                        )}
                                        <p className="font-semibold text-xs text-foreground truncate">{u.name}</p>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <Badge
                                          variant={
                                            u.role === "superadmin"
                                              ? "default"
                                              : u.role === "admin"
                                              ? "secondary"
                                              : "outline"
                                          }
                                          className="text-[9px] px-1 py-0 h-3.5 font-normal"
                                        >
                                          {u.isPrimary
                                            ? "Admin Principal"
                                            : u.role === "superadmin"
                                            ? "Superadmin"
                                            : u.role === "admin"
                                            ? "Administrador"
                                            : "Colaborador"}
                                        </Badge>
                                        {u.isPrimary && (
                                          <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                                            Titular
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {u.role === "superadmin" || u.email === "kaledmoly@gmail.com" ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1.5 py-0 h-4 shrink-0 font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-300 dark:border-amber-800 gap-1 select-none"
                                    >
                                      <IconShieldCheck className="h-2.5 w-2.5 text-amber-500 shrink-0" />
                                      Siempre Activo
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant={u.active ? "outline" : "secondary"}
                                      className={cn(
                                        "text-[9px] px-1.5 py-0 h-4 shrink-0 font-medium",
                                        u.active
                                          ? "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {u.active ? "Activo" : "Inactivo"}
                                    </Badge>
                                  )}
                                </div>

                                {/* Sedes Asignadas */}
                                <div className="space-y-1">
                                  <span className="text-[10px] text-muted-foreground font-medium block">
                                    {u.isPrimary ? "Sedes de su negocio:" : "Sedes asignadas:"}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {u.isPrimary ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1.5 h-4 gap-1 font-semibold text-primary border-primary/30 bg-primary/5"
                                      >
                                        <IconBuildingStore className="h-2.5 w-2.5 shrink-0" />
                                        Todas ({userBranchesList.length} sedes)
                                      </Badge>
                                    ) : userBranchesList.length === 0 ? (
                                      <span className="text-[10px] text-muted-foreground/60 italic">
                                        Ninguna sede asignada
                                      </span>
                                    ) : (
                                      userBranchesList.map((b) => (
                                        <Badge
                                          key={b.id}
                                          variant="secondary"
                                          className="text-[10px] py-0 px-1.5 h-4 gap-1 font-normal bg-muted"
                                        >
                                          <IconMapPin className="h-2.5 w-2.5 text-primary shrink-0" />
                                          {b.name}
                                        </Badge>
                                      ))
                                    )}
                                  </div>
                                </div>

                                {/* Correo y Acciones */}
                                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    {u.role === "superadmin" || u.email === "kaledmoly@gmail.com" ? (
                                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 select-none">
                                        <IconShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                        Siempre Activo
                                      </span>
                                    ) : toggleLoadingId === u.id ? (
                                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 animate-pulse">
                                        <IconLoader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                        {u.active ? "Desactivando…" : "Activando…"}
                                      </span>
                                    ) : (
                                      <>
                                        <Switch
                                          checked={u.active}
                                          disabled={role !== "superadmin" && u.isPrimary}
                                          onCheckedChange={() => handleToggleUserActive(u)}
                                        />
                                        <span className="text-[11px] text-muted-foreground transition-colors">
                                          {u.active ? "Activo" : "Inactivo"}
                                        </span>
                                      </>
                                    )}
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
                            )
                          })}
                        </div>
                      </div>{/* /overflow-hidden */}
                    </div>{/* /grid animation wrapper */}
                  </div>
                )
              })}
            </div>
          )}
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
                      {role === "superadmin" && selectedTenantFilter === "all"
                        ? `${branches.length} sedes registradas`
                        : `${branches.length} de ${MAX_BRANCHES} sedes`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {role === "superadmin" && selectedTenantFilter === "all"
                      ? "Visualizando todas las sedes del ecosistema SaaS. Cada negocio tiene un límite de hasta 3 sedes físicas. Usa el filtro de negocio superior para administrar un negocio específico."
                      : `El negocio permite registrar hasta un máximo de ${MAX_BRANCHES} sedes físicas.`}
                  </p>
                </div>

                {!(role === "superadmin" && selectedTenantFilter === "all") && (
                  <Button
                    onClick={() => setNewBranchOpen(true)}
                    disabled={branches.length >= MAX_BRANCHES}
                    className="h-9 rounded-xl text-xs font-semibold gap-1.5 shadow-xs shrink-0 self-start sm:self-auto"
                  >
                    <IconPlus className="h-4 w-4" /> Nueva Sede
                  </Button>
                )}
              </div>

              {/* Barra de progreso de cuota */}
              {!(role === "superadmin" && selectedTenantFilter === "all") && (
                <>
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
                      <span>Has alcanzado el límite máximo permitido de {MAX_BRANCHES} sedes para este negocio. Para agregar otra sede, debes editar o eliminar una sede secundaria.</span>
                    </div>
                  )}
                </>
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
                disabled={selectedUser?.isPrimary || selectedUser?.role === "superadmin" || selectedUser?.email === "kaledmoly@gmail.com"}
              >
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="vendedor">Vendedor (Punto de Venta, Caja y Ventas)</SelectItem>
                  <SelectItem value="admin">Administrador (Acceso total)</SelectItem>
                </SelectContent>
              </Select>
              {(selectedUser?.isPrimary || selectedUser?.role === "superadmin" || selectedUser?.email === "kaledmoly@gmail.com") && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {selectedUser?.role === "superadmin" || selectedUser?.email === "kaledmoly@gmail.com"
                    ? "El rol de Superadministrador es permanente y protegido."
                    : "El rol del Administrador Principal no puede ser cambiado."}
                </p>
              )}
            </div>

            {/* Sedes Asignadas */}
            {(() => {
              const editModalBranches = selectedUser?.tenantId
                ? branches.filter((b) => (b.tenantId ?? b.tenant?.id ?? null) === (selectedUser.tenantId ?? null))
                : branches
              const relevantList = editModalBranches.length > 0 ? editModalBranches : branches

              return (
                <div className="space-y-2 pt-1 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      Sedes Asignadas {selectedUser?.isPrimary ? "(Acceso Total)" : `(${editUserBranches.length}/${relevantList.length}) *`}
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
                        <span>Acceso Total a Todas las Sedes del Negocio</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        El Administrador Principal tiene autorización inherente en todas las sedes de su negocio ({relevantList.length} sedes).
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 rounded-xl border p-2.5 bg-muted/20">
                      {relevantList.map((b) => {
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
              )
            })()}

            {selectedUser?.role === "superadmin" || selectedUser?.email === "kaledmoly@gmail.com" ? (
              <div className="p-3.5 rounded-xl border border-amber-300/70 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 flex items-start gap-2.5 text-xs">
                <IconShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-amber-900 dark:text-amber-300">Cuenta de Superadministrador Protegida</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400/90 leading-relaxed">
                    El Superadministrador principal del sistema cuenta con acceso maestro permanente y <strong>no se puede deshabilitar nunca</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div className="space-y-0.5 pr-2">
                  <Label className="text-xs font-semibold block">Estado en el sistema</Label>
                  <span className="text-[11px] text-muted-foreground block">
                    {editActive ? "El usuario puede iniciar sesión y operar" : "Acceso bloqueado"}
                  </span>
                  {selectedUser?.isPrimary && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-medium">
                      ⚠️ Al inactivar al Administrador Principal se inactivarán automáticamente todos sus colaboradores.
                    </span>
                  )}
                </div>
                <Switch
                  checked={editActive}
                  onCheckedChange={setEditActive}
                  disabled={role !== "superadmin" && selectedUser?.isPrimary}
                />
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

      {/* ==================== DIALOG: CONFIRMACIÓN INACTIVAR ADMIN PRINCIPAL ==================== */}
      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!confirmDialog.loading) setConfirmDialog((d) => ({ ...d, open }))
        }}
      >
        <DialogContent className="sm:max-w-sm rounded-2xl p-0 overflow-hidden gap-0">
          {/* Header de alerta */}
          <div className="relative bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-red-500/5 border-b border-amber-200/60 dark:border-amber-900/40 px-6 pt-6 pb-5">
            {/* Ícono de alerta animado */}
            <div className="flex items-center gap-3.5 mb-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping" style={{ animationDuration: "2s" }} />
                <div className="relative h-11 w-11 rounded-full bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-300 dark:border-amber-700 flex items-center justify-center shadow-md">
                  <IconAlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <div className="space-y-0.5">
                <DialogTitle className="text-sm font-bold text-foreground leading-tight">
                  Inactivar Administrador Principal
                </DialogTitle>
                <DialogDescription className="text-[11px] text-muted-foreground leading-snug">
                  Esta acción afectará a todo el equipo.
                </DialogDescription>
              </div>
            </div>

            {/* Info del usuario */}
            {confirmDialog.user && (
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-background/70 border border-border/60 backdrop-blur-sm">
                <Avatar className="h-8 w-8 shrink-0 shadow-xs">
                  <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                    {confirmDialog.user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{confirmDialog.user.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {confirmDialog.user.email || confirmDialog.user.tenantName || "Administrador Principal"}
                  </p>
                </div>
                <Badge variant="outline" className="ml-auto shrink-0 text-[9px] px-1.5 py-0 h-4 font-semibold text-primary border-primary/30 bg-primary/5">
                  Admin
                </Badge>
              </div>
            )}
          </div>

          {/* Cuerpo con advertencia de cascada */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex gap-2.5 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
              <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-destructive/90">Efecto en cascada automático</p>
                <p className="text-muted-foreground leading-relaxed text-[11px]">
                  Al inactivar al Administrador Principal, se inactivarán <strong className="text-foreground">automáticamente todos los colaboradores</strong> asociados a su negocio. Ninguno podrá iniciar sesión hasta que sea reactivado.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              ¿Estás seguro de que deseas continuar?
            </p>
          </div>

          {/* Footer de acciones */}
          <div className="px-6 pb-5 flex gap-2.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl text-xs h-9"
              disabled={confirmDialog.loading}
              onClick={() => setConfirmDialog({ open: false, type: "deactivate-admin", user: null, loading: false })}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1 rounded-xl text-xs h-9 gap-1.5 shadow-xs relative overflow-hidden"
              disabled={confirmDialog.loading}
              onClick={() => {
                if (!confirmDialog.user) return
                if (confirmDialog.type === "deactivate-admin") {
                  doToggleUserActive(confirmDialog.user, false)
                } else {
                  doSaveEditUser()
                }
              }}
            >
              {confirmDialog.loading ? (
                <>
                  <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                  Inactivando…
                </>
              ) : (
                <>
                  <IconX className="h-3.5 w-3.5" />
                  Sí, inactivar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
