"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import { useAppStore, type BranchItem } from "@/lib/store"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconBrandWhatsapp,
  IconSend,
  IconRobot,
  IconUser,
  IconCopy,
  IconCheck,
  IconTruckDelivery,
  IconSparkles,
  IconSettings,
  IconMessageCircle,
  IconRefresh,
  IconPackage,
  IconCreditCard,
  IconMapPin,
  IconPhone,
  IconUserCheck,
  IconFlame,
  IconPlus,
  IconSearch,
  IconSpeakerphone,
  IconDotsVertical,
  IconPencil,
  IconFileText,
  IconBuildingStore,
  IconKey,
  IconCpu,
  IconEye,
  IconEyeOff,
  IconShieldCheck,
  IconBolt,
  IconChecklist,
  IconExternalLink,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Conversation {
  phone: string
  client: {
    id: string
    name: string
    document: string | null
    phone: string | null
    email: string | null
    address: string | null
    notes: string | null
    creditBalance: number
    creditLimit: number
    totalPurchases: number
  } | null
  lastMessage: {
    text: string
    sender: "customer" | "bot" | "agent"
    createdAt: string
    status: string
  } | null
  unreadCount: number
  latestOrder: {
    id: string
    orderNumber: string
    status: string
    total: number
    deliveryAddress: string | null
    createdAt: string
    itemsCount: number
  } | null
  totalOrders: number
}

interface Message {
  id: string
  sender: "customer" | "bot" | "agent"
  text: string
  status: string
  createdAt: string
  order?: {
    id: string
    orderNumber: string
    status: string
    total: number
    deliveryAddress: string | null
  } | null
}

interface Template {
  id: string
  name: string
  category: string
  content: string
}

interface BranchConfig {
  id?: string
  branchId: string
  phoneNumber?: string | null
  metaPhoneNumberId?: string | null
  metaAccessToken?: string | null
  metaVerifyToken?: string | null
  deepseekApiKey?: string | null
  deepseekModel: string
  aiEnabled: boolean
  aiSystemPrompt?: string | null
  welcomeMessage?: string | null
  autoCreateOrders: boolean
  maxTokensPerReply: number
  hasDeepSeekKey?: boolean
  hasMetaToken?: boolean
  deepseekApiKeyMasked?: string
  metaAccessTokenMasked?: string
}

export default function WhatsAppAgentView() {
  const { branches, activeBranch, setActiveBranch } = useAppStore()

  // Pestañas principales
  const [mainTab, setMainTab] = useState<"crm" | "templates" | "config">("crm")

  // Estado Sede seleccionada para WhatsApp
  const currentBranchId = activeBranch?.id || branches[0]?.id || ""

  // Estado CRM
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingConv, setLoadingConv] = useState(true)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "with_orders">("all")

  // Mensajes del chat seleccionado
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [agentReplyText, setAgentReplyText] = useState("")
  const [sendingReply, setSendingReply] = useState(false)

  // Control IA por conversación
  const [aiActiveForChat, setAiActiveForChat] = useState<Record<string, boolean>>({})

  // Modal: Guardar / Editar Contacto CRM
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactForm, setContactForm] = useState({
    phone: "",
    name: "",
    document: "",
    email: "",
    address: "",
    notes: "",
    creditLimit: "0",
  })

  // Modal: Enviar Plantilla de Promoción
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [sendingBroadcast, setSendingBroadcast] = useState(false)

  // Modal: Simular mensaje entrante
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [simText, setSimText] = useState("")
  const [simulating, setSimulating] = useState(false)

  // Estado Configuración por Sede
  const [config, setConfig] = useState<BranchConfig>({
    branchId: currentBranchId,
    phoneNumber: "",
    metaPhoneNumberId: "",
    metaAccessToken: "",
    metaVerifyToken: "omnipos_verify_token_2026",
    deepseekApiKey: "",
    deepseekModel: "deepseek-chat",
    aiEnabled: true,
    aiSystemPrompt: "",
    welcomeMessage: "",
    autoCreateOrders: true,
    maxTokensPerReply: 250,
  })
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingDeepSeek, setTestingDeepSeek] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showMetaToken, setShowMetaToken] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)

  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // 1. Cargar Configuración de la Sede
  const loadBranchConfig = useCallback(async (bId: string) => {
    if (!bId) return
    try {
      setLoadingConfig(true)
      const res = await apiFetch<{ ok: boolean; config: BranchConfig }>(`/api/whatsapp/config?branchId=${encodeURIComponent(bId)}`)
      if (res && res.config) {
        setConfig({
          ...res.config,
          deepseekApiKey: res.config.deepseekApiKeyMasked || "",
          metaAccessToken: res.config.metaAccessTokenMasked || "",
        })
      }
    } catch {
      // noop
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  // 2. Cargar lista de conversaciones para la sede activa
  const loadConversations = useCallback(async (selectFirst = false) => {
    try {
      const url = currentBranchId
        ? `/api/whatsapp/conversations?branchId=${encodeURIComponent(currentBranchId)}`
        : "/api/whatsapp/conversations"
      const res = await apiFetch<{ ok: boolean; conversations: Conversation[] }>(url)
      if (res && res.ok) {
        const list = res.conversations || []
        setConversations(list)
        if (selectFirst && list.length > 0 && !selectedPhone) {
          setSelectedPhone(list[0].phone)
        }
      }
    } catch {
      // noop
    } finally {
      setLoadingConv(false)
    }
  }, [currentBranchId, selectedPhone])

  useEffect(() => {
    if (currentBranchId) {
      loadBranchConfig(currentBranchId)
      loadConversations(true)
    }
  }, [currentBranchId, loadBranchConfig, loadConversations])

  // Polling silencioso de conversaciones cada 8s
  useEffect(() => {
    const interval = setInterval(() => loadConversations(false), 8000)
    return () => clearInterval(interval)
  }, [loadConversations])

  // 3. Cargar mensajes del chat seleccionado
  const loadMessages = useCallback(async (phone: string) => {
    try {
      setLoadingMessages(true)
      const res = await apiFetch<{ ok: boolean; messages: Message[] }>(
        `/api/whatsapp/messages?phone=${encodeURIComponent(phone)}`
      )
      if (res && res.ok) {
        setChatMessages(res.messages || [])
      }
    } catch {
      // noop
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (selectedPhone) {
      loadMessages(selectedPhone)
    }
  }, [selectedPhone, loadMessages])

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  // 4. Cargar plantillas
  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiFetch<{ ok: boolean; templates: Template[] }>("/api/whatsapp/templates")
      if (res && res.ok) {
        setTemplates(res.templates || [])
        if (res.templates?.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(res.templates[0].id)
        }
      }
    } catch {
      // noop
    }
  }, [selectedTemplateId])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const selectedConv = conversations.find((c) => c.phone === selectedPhone) || null

  // Guardar configuración de la sede
  const handleSaveConfig = async () => {
    if (!currentBranchId) return
    setSavingConfig(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/whatsapp/config", {
        method: "POST",
        body: JSON.stringify({
          ...config,
          branchId: currentBranchId,
        }),
      })
      if (res && res.ok) {
        toast.success(res.message || "Configuración guardada para esta sede")
        loadBranchConfig(currentBranchId)
      }
    } catch (e) {
      toast.error("Error al guardar configuración: " + (e as Error).message)
    } finally {
      setSavingConfig(false)
    }
  }

  // Probar conexión directa con DeepSeek
  const handleTestDeepSeek = async () => {
    setTestingDeepSeek(true)
    try {
      const res = await apiFetch<{
        ok: boolean
        message: string
        latencyMs: number
        model: string
        reply: string
        error?: string
      }>("/api/whatsapp/test-deepseek", {
        method: "POST",
        body: JSON.stringify({
          apiKey: config.deepseekApiKey,
          model: config.deepseekModel,
          branchId: currentBranchId,
        }),
      })

      if (res && res.ok) {
        toast.success(`¡DeepSeek Conectado! Latencia: ${res.latencyMs}ms (${res.model})`)
      } else {
        toast.error(res.error || "No se pudo conectar con DeepSeek")
      }
    } catch (e) {
      toast.error("Error de conexión: " + (e as Error).message)
    } finally {
      setTestingDeepSeek(false)
    }
  }

  // Enviar mensaje manual desde el agente humano
  const handleSendAgentMessage = async () => {
    if (!selectedPhone || !agentReplyText.trim() || sendingReply) return

    setSendingReply(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: Message }>("/api/whatsapp/conversations", {
        method: "POST",
        body: JSON.stringify({
          phone: selectedPhone,
          text: agentReplyText.trim(),
          branchId: currentBranchId,
        }),
      })

      if (res && res.ok) {
        setAgentReplyText("")
        loadMessages(selectedPhone)
        loadConversations()
        toast.success("Mensaje enviado por WhatsApp")
      }
    } catch (e) {
      toast.error("Error al enviar mensaje: " + (e as Error).message)
    } finally {
      setSendingReply(false)
    }
  }

  // Simular mensaje de entrada con IA DeepSeek
  const handleSimulateInbound = async (presetText?: string) => {
    const text = (presetText || simText).trim()
    if (!selectedPhone || !text) return

    setSimulating(true)
    try {
      const res = await apiFetch<{
        ok: boolean
        botReply: string
        orderNumber?: string
        actionTaken?: string
      }>("/api/whatsapp/simulate", {
        method: "POST",
        body: JSON.stringify({
          phone: selectedPhone,
          customerName: selectedConv?.client?.name || "Cliente WhatsApp",
          message: text,
          branchId: currentBranchId,
        }),
      })

      if (res && res.ok) {
        setSimText("")
        setSimModalOpen(false)
        loadMessages(selectedPhone)
        loadConversations()
        if (res.orderNumber) {
          toast.success(`¡Orden #${res.orderNumber} creada automáticamente en la sede!`)
        } else {
          toast.info("Respuesta de IA generada en el chat")
        }
      }
    } catch (e) {
      toast.error("Error en simulación: " + (e as Error).message)
    } finally {
      setSimulating(false)
    }
  }

  // Guardar datos del contacto CRM
  const handleSaveContact = async () => {
    if (!contactForm.phone || !contactForm.name.trim()) {
      toast.error("El nombre es requerido")
      return
    }

    try {
      const res = await apiFetch<{ ok: boolean }>("/api/whatsapp/contacts", {
        method: "POST",
        body: JSON.stringify({
          ...contactForm,
          branchId: currentBranchId,
        }),
      })
      if (res && res.ok) {
        toast.success("Contacto guardado en el CRM")
        setContactModalOpen(false)
        loadConversations()
      }
    } catch (e) {
      toast.error("Error al guardar contacto: " + (e as Error).message)
    }
  }

  const openContactEditor = () => {
    if (!selectedConv) return
    setContactForm({
      phone: selectedConv.phone,
      name: selectedConv.client?.name || `Cliente (${selectedConv.phone.slice(-4)})`,
      document: selectedConv.client?.document || "",
      email: selectedConv.client?.email || "",
      address: selectedConv.client?.address || selectedConv.latestOrder?.deliveryAddress || "",
      notes: selectedConv.client?.notes || "",
      creditLimit: String(selectedConv.client?.creditLimit || 0),
    })
    setContactModalOpen(true)
  }

  // Enviar campaña de promoción
  const handleSendBroadcast = async (onlyCurrentContact = true) => {
    if (!selectedTemplateId) {
      toast.error("Selecciona una plantilla")
      return
    }

    setSendingBroadcast(true)
    try {
      const targetPhones = onlyCurrentContact && selectedPhone ? [selectedPhone] : []
      const res = await apiFetch<{ ok: boolean; totalSent: number }>("/api/whatsapp/broadcast", {
        method: "POST",
        body: JSON.stringify({
          templateId: selectedTemplateId,
          targetPhones,
          branchId: currentBranchId,
        }),
      })

      if (res && res.ok) {
        toast.success(`Campaña enviada a ${res.totalSent} destinatario(s)`)
        setTemplateModalOpen(false)
        if (selectedPhone) loadMessages(selectedPhone)
        loadConversations()
      }
    } catch (e) {
      toast.error("Error al enviar difusión: " + (e as Error).message)
    } finally {
      setSendingBroadcast(false)
    }
  }

  // Actualizar estado de pedido en 1 clic
  const handleQuickUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await apiFetch(`/api/v1/delivery/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      })
      toast.success(`Pedido actualizado a "${newStatus}"`)
      loadConversations()
      if (selectedPhone) loadMessages(selectedPhone)
    } catch (e) {
      toast.error("Error al actualizar pedido: " + (e as Error).message)
    }
  }

  const copyToClipboard = (text: string, type: "url" | "token") => {
    navigator.clipboard.writeText(text)
    if (type === "url") {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
    toast.success("Copiado al portapapeles")
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/whatsapp/webhook`
    : "https://tudominio.com/api/whatsapp/webhook"

  // Filtrado de conversaciones
  const filteredConversations = conversations.filter((c) => {
    const matchesSearch =
      c.phone.includes(searchFilter) ||
      (c.client?.name || "").toLowerCase().includes(searchFilter.toLowerCase()) ||
      (c.lastMessage?.text || "").toLowerCase().includes(searchFilter.toLowerCase())

    if (!matchesSearch) return false
    if (statusFilter === "unread") return c.unreadCount > 0
    if (statusFilter === "with_orders") return c.latestOrder !== null
    return true
  })

  return (
    <div className="p-3 sm:p-5 space-y-3 max-w-[1600px] mx-auto h-[calc(100vh-8.5rem)] min-h-[640px] flex flex-col overflow-hidden">
      {/* ========================================================= */}
      {/* 1. BARRA SUPERIOR & CONTROL MULTI-SEDE                   */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-xs shrink-0">
            <IconBrandWhatsapp className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-zinc-950 dark:text-white">
                Agente IA WhatsApp & CRM
              </h1>
              {config.hasDeepSeekKey ? (
                <Badge variant="outline" className="text-[10px] font-mono tracking-wider bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100">
                  ⚡ DeepSeek ({config.deepseekModel})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-mono text-zinc-500 border-dashed border-zinc-300 dark:border-zinc-700">
                  DeepSeek Pendiente
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Atención 24/7, consultas de catálogo, pedidos automáticos y fiados por sede.
            </p>
          </div>
        </div>

        {/* Selector de Sede + Pestañas de Vista */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de Sede Activa */}
          {branches.length > 1 && (
            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
              <IconBuildingStore className="h-3.5 w-3.5 text-zinc-500" />
              <span className="font-semibold text-zinc-500 text-[11px]">Sede:</span>
              <Select
                value={currentBranchId}
                onValueChange={(val) => {
                  const b = branches.find((x) => x.id === val)
                  if (b) setActiveBranch(b)
                }}
              >
                <SelectTrigger className="h-7 border-none bg-transparent shadow-none text-xs font-bold p-0 gap-1 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="text-xs rounded-xl">
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.isMain && "(Principal)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selector de Pestañas */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs">
            <button
              onClick={() => setMainTab("crm")}
              className={cn(
                "px-3 py-1.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                mainTab === "crm"
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-2xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
              )}
            >
              <IconMessageCircle className="h-3.5 w-3.5" />
              Chats & CRM ({conversations.length})
            </button>
            <button
              onClick={() => setMainTab("templates")}
              className={cn(
                "px-3 py-1.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                mainTab === "templates"
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-2xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
              )}
            >
              <IconSpeakerphone className="h-3.5 w-3.5" />
              Difusión
            </button>
            <button
              onClick={() => setMainTab("config")}
              className={cn(
                "px-3 py-1.5 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5",
                mainTab === "config"
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-2xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
              )}
            >
              <IconCpu className="h-3.5 w-3.5" />
              IA & Meta por Sede
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. VISTA CRM: BANDEJA 3 COLUMNAS SIN LAYOUT SHIFT         */}
      {/* ========================================================= */}
      {mainTab === "crm" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0 h-full">
          {/* -------------------------------------------------------- */}
          {/* COLUMNA 1: DIRECTORIO DE CONVERSACIONES (3 cols)         */}
          {/* -------------------------------------------------------- */}
          <div className="lg:col-span-3 flex flex-col h-full min-h-0 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
            {/* Buscador y Filtros */}
            <div className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 space-y-2 bg-zinc-50/50 dark:bg-zinc-950/40 shrink-0">
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Buscar cliente o teléfono..."
                  className="pl-8 h-8 text-xs bg-white dark:bg-zinc-900 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] gap-1">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer",
                    statusFilter === "all" ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  Todos
                </button>
                <button
                  onClick={() => setStatusFilter("unread")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer",
                    statusFilter === "unread" ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  No leídos
                </button>
                <button
                  onClick={() => setStatusFilter("with_orders")}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer",
                    statusFilter === "with_orders" ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  Con pedidos
                </button>
              </div>
            </div>

            {/* Lista scrollable de conversaciones */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {loadingConv && conversations.length === 0 ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-2.5 animate-pulse">
                      <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-24" />
                        <div className="h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded w-36" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 space-y-2">
                  <IconMessageCircle className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
                  <p className="font-semibold">Sin conversaciones aún en esta sede</p>
                  <p className="text-[11px] text-zinc-400">
                    Usa "+ Simular Mensaje" para probar el bot de DeepSeek con clientes ficticios.
                  </p>
                </div>
              ) : (
                filteredConversations.map((c) => {
                  const isSelected = selectedPhone === c.phone
                  const displayName = c.client?.name || `Contacto (${c.phone.slice(-4)})`
                  return (
                    <button
                      key={c.phone}
                      onClick={() => setSelectedPhone(c.phone)}
                      className={cn(
                        "w-full text-left p-3 transition-all cursor-pointer flex items-start gap-2.5",
                        isSelected
                          ? "bg-zinc-100 dark:bg-zinc-800/80 border-l-4 border-l-zinc-950 dark:border-l-white"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-950/50"
                      )}
                    >
                      <div className="relative shrink-0">
                        <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold flex items-center justify-center text-xs">
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                        {c.unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 rounded-full text-[9px] font-bold flex items-center justify-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-xs truncate text-zinc-950 dark:text-white">{displayName}</p>
                          <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                            {c.lastMessage ? new Date(c.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                        </div>

                        <p className="text-[11px] text-zinc-500 truncate">
                          {c.lastMessage ? c.lastMessage.text : "Sin mensajes recientes"}
                        </p>

                        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                          {c.latestOrder && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono uppercase border-zinc-300 dark:border-zinc-700">
                              📦 {c.latestOrder.status}
                            </Badge>
                          )}
                          {c.client?.creditBalance ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono text-zinc-700 dark:text-zinc-300">
                              Fiado: {formatCurrency(c.client.creditBalance)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer de la columna 1 */}
            <div className="p-2 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-zinc-500 font-mono">
                {conversations.length} contactos
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSimModalOpen(true)}
                className="h-7 text-xs font-semibold gap-1"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Simular Mensaje
              </Button>
            </div>
          </div>

          {/* -------------------------------------------------------- */}
          {/* COLUMNA 2: CHAT EN VIVO STREAMING (6 cols)               */}
          {/* -------------------------------------------------------- */}
          <div className="lg:col-span-6 flex flex-col h-full min-h-0 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
            {selectedPhone && selectedConv ? (
              <>
                {/* Cabecera del chat */}
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold flex items-center justify-center text-xs shrink-0">
                      {(selectedConv.client?.name || selectedPhone).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-xs truncate text-zinc-950 dark:text-white">
                          {selectedConv.client?.name || `Contacto (${selectedPhone.slice(-4)})`}
                        </p>
                        <Badge variant="outline" className="text-[9px] font-mono border-zinc-300 dark:border-zinc-700">
                          {selectedPhone}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                        <span>Sede: <strong>{activeBranch?.name || "Principal"}</strong></span>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-zinc-900 dark:text-zinc-100 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-950 dark:bg-white animate-pulse" />
                          Chat en tiempo real
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Acciones de cabecera */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTemplateModalOpen(true)}
                      className="h-7 text-xs rounded-lg gap-1 border-zinc-300 dark:border-zinc-700"
                    >
                      <IconSpeakerphone className="h-3 w-3" />
                      Promoción
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openContactEditor}
                      className="h-7 text-xs rounded-lg gap-1 border-zinc-300 dark:border-zinc-700"
                    >
                      <IconPencil className="h-3 w-3" />
                      Editar
                    </Button>
                  </div>
                </div>

                {/* Banner de Estado IA en este chat */}
                <div className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs shrink-0">
                  <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                    <IconRobot className="h-3.5 w-3.5" />
                    <span className="font-medium text-[11px]">
                      {aiActiveForChat[selectedPhone] === false ? (
                        <span className="text-zinc-500">IA Pausada para este chat (Atención humana exclusiva)</span>
                      ) : (
                        <span>
                          Bot IA Activo: {config.hasDeepSeekKey ? `DeepSeek (${config.deepseekModel})` : "Motor Local"}
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      setAiActiveForChat((prev) => ({
                        ...prev,
                        [selectedPhone]: prev[selectedPhone] === false ? true : false,
                      }))
                    }
                    className="text-[11px] font-semibold underline text-zinc-900 dark:text-zinc-100 cursor-pointer"
                  >
                    {aiActiveForChat[selectedPhone] === false ? "Reanudar IA" : "Pausar IA"}
                  </button>
                </div>

                {/* Mensajes del chat scrollables */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-zinc-50/30 dark:bg-zinc-950/20">
                  {loadingMessages ? (
                    <div className="py-12 text-center space-y-2">
                      <IconRefresh className="h-5 w-5 animate-spin mx-auto text-zinc-400" />
                      <p className="text-xs text-zinc-400">Cargando mensajes…</p>
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                      <IconMessageCircle className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto" />
                      <p>No hay mensajes en este chat aún.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSimulateInbound("Hola, ¿tienen leche y arroz disponible?")}
                        className="text-xs h-7"
                      >
                        Enviar mensaje de prueba como cliente
                      </Button>
                    </div>
                  ) : (
                    chatMessages.map((m) => {
                      const isCustomer = m.sender === "customer"
                      const isBot = m.sender === "bot"
                      return (
                        <div
                          key={m.id}
                          className={cn("flex flex-col max-w-[85%]", isCustomer ? "mr-auto items-start" : "ml-auto items-end")}
                        >
                          {/* Etiqueta de remitente */}
                          <div className="flex items-center gap-1 text-[10px] text-zinc-400 mb-0.5 px-1">
                            {isCustomer ? (
                              <>
                                <IconUser className="h-2.5 w-2.5" />
                                <span>{selectedConv.client?.name || "Cliente"}</span>
                              </>
                            ) : isBot ? (
                              <>
                                <IconRobot className="h-2.5 w-2.5" />
                                <span>OmniPOS Bot IA (DeepSeek)</span>
                              </>
                            ) : (
                              <>
                                <IconUserCheck className="h-2.5 w-2.5" />
                                <span>Agente Humano</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>

                          {/* Globo de mensaje */}
                          <div
                            className={cn(
                              "p-3 rounded-2xl text-xs leading-relaxed shadow-2xs whitespace-pre-line",
                              isCustomer
                                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white border border-zinc-200 dark:border-zinc-700 rounded-tl-xs"
                                : isBot
                                ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 rounded-tr-xs"
                                : "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-950 rounded-tr-xs"
                            )}
                          >
                            {m.text}
                          </div>

                          {/* Tarjeta de Orden vinculada */}
                          {m.order && (
                            <div className="mt-1.5 p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] space-y-1 w-full max-w-xs">
                              <div className="flex items-center justify-between font-bold">
                                <span>Pedido #{m.order.orderNumber}</span>
                                <Badge variant="outline" className="text-[9px] uppercase font-mono">
                                  {m.order.status}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-zinc-500">
                                <span>Total: {formatCurrency(m.order.total)}</span>
                                <span className="line-clamp-1 max-w-[120px]">{m.order.deliveryAddress}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                  <div ref={chatScrollRef} />
                </div>

                {/* Input de respuesta manual del agente */}
                <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
                  <div className="flex items-center gap-2">
                    <Input
                      value={agentReplyText}
                      onChange={(e) => setAgentReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleSendAgentMessage()
                        }
                      }}
                      placeholder="Escribe una respuesta como Agente Humano…"
                      className="h-10 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 flex-1"
                    />
                    <Button
                      onClick={handleSendAgentMessage}
                      disabled={sendingReply || !agentReplyText.trim()}
                      className="h-10 w-10 p-0 rounded-xl bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 shrink-0"
                    >
                      <IconSend className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-zinc-500 space-y-2">
                <IconMessageCircle className="h-12 w-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
                <p className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Selecciona una conversación</p>
                <p className="text-zinc-400 max-w-xs">
                  Haz clic en un contacto de la izquierda para ver el historial en vivo o genera un mensaje simulado.
                </p>
                <Button
                  size="sm"
                  onClick={() => setSimModalOpen(true)}
                  className="rounded-full text-xs h-8 mt-2"
                >
                  <IconPlus className="h-3.5 w-3.5 mr-1" />
                  Simular Mensaje de Cliente
                </Button>
              </div>
            )}
          </div>

          {/* -------------------------------------------------------- */}
          {/* COLUMNA 3: PERFIL CRM & SEGUIMIENTO PEDIDOS (3 cols)     */}
          {/* -------------------------------------------------------- */}
          <div className="lg:col-span-3 flex flex-col h-full min-h-0 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
            {selectedConv ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
                {/* 1. Tarjeta de Cliente CRM */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Perfil del Cliente
                    </span>
                    <button
                      onClick={openContactEditor}
                      className="text-[11px] font-semibold text-zinc-900 dark:text-white underline cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div>
                      <p className="font-bold text-xs text-zinc-950 dark:text-white">
                        {selectedConv.client?.name || `Cliente (${selectedConv.phone.slice(-4)})`}
                      </p>
                      <p className="text-[11px] text-zinc-500 font-mono">{selectedConv.phone}</p>
                    </div>

                    <div className="text-[11px] space-y-1 text-zinc-600 dark:text-zinc-400 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                      <div className="flex items-start gap-1.5">
                        <IconMapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {selectedConv.client?.address || selectedConv.latestOrder?.deliveryAddress || "Sin dirección guardada"}
                        </span>
                      </div>
                      {selectedConv.client?.email && (
                        <p className="text-[10px] text-zinc-400">{selectedConv.client.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Tarjeta Financiera: Saldo Fiado y Cupo */}
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    <span>Crédito & Fiados</span>
                    <IconCreditCard className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-500">Saldo Pendiente:</span>
                    <span className="text-sm font-black font-mono text-zinc-950 dark:text-white">
                      {formatCurrency(selectedConv.client?.creditBalance || 0)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] text-zinc-500">
                    <span>Cupo Autorizado:</span>
                    <span className="font-mono">{formatCurrency(selectedConv.client?.creditLimit || 0)}</span>
                  </div>
                </div>

                {/* 3. Seguimiento de Pedido Activo */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Último Pedido a Domicilio
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {selectedConv.totalOrders} órdenes
                    </Badge>
                  </div>

                  {selectedConv.latestOrder ? (
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-zinc-950 dark:text-white">
                          #{selectedConv.latestOrder.orderNumber}
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono uppercase">
                          {selectedConv.latestOrder.status}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Total a Cobrar:</span>
                        <span className="font-bold font-mono text-zinc-950 dark:text-white">
                          {formatCurrency(selectedConv.latestOrder.total)}
                        </span>
                      </div>

                      {/* Stepper de 1 clic para cambiar estado del pedido */}
                      <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 block">Cambiar estado rápido:</span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "en_preparacion")}
                            className="py-1 px-1 rounded-md text-[10px] font-semibold bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-colors"
                          >
                            Preparar
                          </button>
                          <button
                            onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "en_camino")}
                            className="py-1 px-1 rounded-md text-[10px] font-semibold bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 transition-colors"
                          >
                            En Camino
                          </button>
                          <button
                            onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "entregado")}
                            className="py-1 px-1 rounded-md text-[10px] font-semibold bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-950 transition-colors"
                          >
                            Entregado
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 text-center text-xs text-zinc-400 border border-dashed rounded-xl">
                      Sin pedidos registrados para este contacto.
                    </div>
                  )}
                </div>

                {/* 4. Enviar Promoción rápida */}
                <div className="pt-2">
                  <Button
                    onClick={() => setTemplateModalOpen(true)}
                    variant="outline"
                    className="w-full h-9 text-xs rounded-xl gap-1.5 border-zinc-300 dark:border-zinc-700"
                  >
                    <IconSpeakerphone className="h-4 w-4" />
                    Enviar Plantilla Promocional
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-zinc-400">
                Selecciona un contacto para ver su ficha CRM y órdenes activas.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. VISTA PROMOCIONES & DIFUSIÓN MASIVA                    */}
      {/* ========================================================= */}
      {mainTab === "templates" && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">Plantillas de Difusión WhatsApp</h2>
              <p className="text-xs text-zinc-500">Envía promociones y recordatorios personalizados con un solo clic.</p>
            </div>
            <Button
              onClick={() => handleSendBroadcast(false)}
              className="rounded-xl h-9 text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 gap-1.5"
            >
              <IconSpeakerphone className="h-4 w-4" />
              Enviar Difusión a Todos los Contactos ({conversations.length})
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {templates.map((tpl) => (
              <Card key={tpl.id} className="rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-2xs flex flex-col justify-between">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {tpl.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-sm font-bold mt-1 text-zinc-950 dark:text-white">{tpl.name}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800 text-xs whitespace-pre-line text-zinc-700 dark:text-zinc-300 font-mono text-[11px] max-h-40 overflow-y-auto">
                    {tpl.content}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedTemplateId(tpl.id)
                      setTemplateModalOpen(true)
                    }}
                    className="w-full text-xs h-8 rounded-lg"
                  >
                    Usar esta Plantilla
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. VISTA CONFIGURACIÓN IA DEEPSEEK & META POR SEDE         */}
      {/* ========================================================= */}
      {mainTab === "config" && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 max-w-5xl mx-auto w-full pb-8">
          {/* Header de configuración de Sede */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center font-bold">
                <IconBuildingStore className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-zinc-950 dark:text-white">
                  Sede Activa: {activeBranch?.name || "Sede Principal"}
                </p>
                <p className="text-xs text-zinc-500">
                  Cada sede tiene su propio número de WhatsApp, token de Meta y credencial de IA DeepSeek independiente.
                </p>
              </div>
            </div>

            <Button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="rounded-xl h-9 text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950"
            >
              {savingConfig ? "Guardando…" : "Guardar Configuración de Sede"}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tarjeta 1: Inteligencia Artificial DeepSeek */}
            <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconCpu className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                    <CardTitle className="text-sm font-bold text-zinc-950 dark:text-white">
                      Motor de IA DeepSeek
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="ai-enabled" className="text-xs font-medium cursor-pointer">
                      {config.aiEnabled ? "Activo" : "Pausado"}
                    </Label>
                    <Switch
                      id="ai-enabled"
                      checked={config.aiEnabled}
                      onCheckedChange={(v) => setConfig((c) => ({ ...c, aiEnabled: v }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-zinc-500">
                  Conecta DeepSeek para responder dudas, cotizar productos y generar pedidos a domicilio automáticamente.
                </p>
              </CardHeader>

              <CardContent className="p-4 space-y-3.5">
                {/* DeepSeek API Key */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      DeepSeek API Key (Token Secreto) *
                    </Label>
                    <a
                      href="https://platform.deepseek.com/api_keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-zinc-500 hover:text-zinc-950 dark:hover:text-white underline flex items-center gap-0.5"
                    >
                      Obtener Token en DeepSeek <IconExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={config.deepseekApiKey || ""}
                      onChange={(e) => setConfig((c) => ({ ...c, deepseekApiKey: e.target.value }))}
                      placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="pr-10 h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      {showApiKey ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Modelo DeepSeek & Límite de Tokens */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Modelo DeepSeek</Label>
                    <Select
                      value={config.deepseekModel}
                      onValueChange={(val) => setConfig((c) => ({ ...c, deepseekModel: val }))}
                    >
                      <SelectTrigger className="h-9 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="text-xs rounded-xl">
                        <SelectItem value="deepseek-chat">deepseek-chat (V3 - Rápido & Económico)</SelectItem>
                        <SelectItem value="deepseek-reasoner">deepseek-reasoner (R1 - Razonamiento)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Tokens Máx. por Respuesta</Label>
                    <Input
                      type="number"
                      value={config.maxTokensPerReply}
                      onChange={(e) => setConfig((c) => ({ ...c, maxTokensPerReply: parseInt(e.target.value, 10) || 250 }))}
                      className="h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                    />
                  </div>
                </div>

                {/* Botón de Test DeepSeek */}
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestDeepSeek}
                    disabled={testingDeepSeek}
                    className="w-full text-xs h-8 rounded-xl gap-1.5 border-zinc-300 dark:border-zinc-700"
                  >
                    <IconBolt className={cn("h-3.5 w-3.5", testingDeepSeek && "animate-spin")} />
                    {testingDeepSeek ? "Probando conexión…" : "⚡ Probar Conexión con DeepSeek"}
                  </Button>
                </div>

                {/* Directivas / System Prompt de la sede */}
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Instrucciones Especiales para esta Sede (Opcional)</Label>
                  <Textarea
                    value={config.aiSystemPrompt || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, aiSystemPrompt: e.target.value }))}
                    placeholder="Ej: Ofrecemos entregas gratis para pedidos mayores a $40.000. El horario de atención en esta sede es de 8:00 AM a 9:00 PM."
                    className="text-xs h-18 bg-zinc-50 dark:bg-zinc-950 resize-none"
                  />
                </div>

                {/* Mensaje de Bienvenida */}
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Mensaje de Saludo Inicial</Label>
                  <Textarea
                    value={config.welcomeMessage || ""}
                    onChange={(e) => setConfig((c) => ({ ...c, welcomeMessage: e.target.value }))}
                    placeholder="¡Hola! Bienvenido a nuestra sede. ¿En qué te podemos colaborar hoy?"
                    className="text-xs h-16 bg-zinc-50 dark:bg-zinc-950 resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tarjeta 2: Conexión con Meta Cloud API & Ahorro de Tokens */}
            <div className="space-y-4">
              <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-sm">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <IconBrandWhatsapp className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                    <CardTitle className="text-sm font-bold text-zinc-950 dark:text-white">
                      Conexión WhatsApp (Meta Cloud API)
                    </CardTitle>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Vincula el número oficial de WhatsApp Business de esta sede con Meta Developer Console.
                  </p>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Número de Teléfono</Label>
                      <Input
                        value={config.phoneNumber || ""}
                        onChange={(e) => setConfig((c) => ({ ...c, phoneNumber: e.target.value }))}
                        placeholder="+573001234567"
                        className="h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">Phone Number ID (Meta)</Label>
                      <Input
                        value={config.metaPhoneNumberId || ""}
                        onChange={(e) => setConfig((c) => ({ ...c, metaPhoneNumberId: e.target.value }))}
                        placeholder="1029384756..."
                        className="h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                      />
                    </div>
                  </div>

                  {/* Access Token de Meta */}
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Meta System User Access Token</Label>
                    <div className="relative">
                      <Input
                        type={showMetaToken ? "text" : "password"}
                        value={config.metaAccessToken || ""}
                        onChange={(e) => setConfig((c) => ({ ...c, metaAccessToken: e.target.value }))}
                        placeholder="EAAB..."
                        className="pr-10 h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMetaToken(!showMetaToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        {showMetaToken ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Webhook URL & Verify Token */}
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                      Datos para configurar en Meta App
                    </span>
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border text-[11px]">
                        <span className="truncate">{webhookUrl}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(webhookUrl, "url")}
                          className="h-6 text-[10px] px-2"
                        >
                          {copiedUrl ? <IconCheck className="h-3 w-3" /> : <IconCopy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border text-[11px]">
                        <span className="truncate">{config.metaVerifyToken}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(config.metaVerifyToken || "", "token")}
                          className="h-6 text-[10px] px-2"
                        >
                          {copiedToken ? <IconCheck className="h-3 w-3" /> : <IconCopy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tarjeta 3: Optimización y Ahorro de Tokens */}
              <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-50/50 dark:bg-zinc-950/40">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <IconShieldCheck className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                    <CardTitle className="text-sm font-bold text-zinc-950 dark:text-white">
                      Motor de Ahorro Extremo de Tokens
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-2">
                    <IconCheck className="h-3.5 w-3.5 text-zinc-950 dark:text-white shrink-0" />
                    <span><strong>Filtro Semántico RAG:</strong> Solo se envían al bot los 6 productos relevantes para la consulta del cliente (ahorro del 95% de tokens).</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconCheck className="h-3.5 w-3.5 text-zinc-950 dark:text-white shrink-0" />
                    <span><strong>Historial Condensado:</strong> Se mantiene un búfer de solo 4 mensajes recientes para no inflar la ventana de contexto.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconCheck className="h-3.5 w-3.5 text-zinc-950 dark:text-white shrink-0" />
                    <span><strong>Aislamiento por Sede:</strong> El bot únicamente conoce el catálogo e inventario físico de la sede a la que pertenece el número.</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. MODALES INTERACTIVOS (CRM, PROMOCIONES, SIMULADOR)     */}
      {/* ========================================================= */}

      {/* Modal 1: Simular Mensaje Entrante */}
      <Dialog open={simModalOpen} onOpenChange={setSimModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconRobot className="h-4 w-4" /> Simular Mensaje de Cliente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Prueba la respuesta autónoma de DeepSeek IA con el catálogo exclusivo de <strong>{activeBranch?.name || "esta sede"}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Mensaje del Cliente</Label>
              <Textarea
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                placeholder="Ej: Hola, ¿tienen leche y arroz? Mándame 2 a la Calle 15 # 4-20"
                className="text-xs h-20 rounded-xl resize-none"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-zinc-400 block">Pruebas rápidas:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Hola, ¿cuánto vale la leche?",
                  "¿Cuánto debo de fiado?",
                  "Envíame 2 bolsas de arroz a la Carrera 10 # 5-20",
                  "¿Qué productos tienen disponibles?",
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSimText(preset)}
                    className="text-[10px] px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors text-left"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setSimModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => handleSimulateInbound()}
              disabled={simulating || !simText.trim()}
              className="bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold"
            >
              {simulating ? "Procesando con IA…" : "Enviar Simulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Editar Contacto CRM */}
      <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconUser className="h-4 w-4" /> Datos de Contacto CRM
            </DialogTitle>
            <DialogDescription className="text-xs">
              Actualiza los datos del cliente para recordatorios y despachos automáticos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 pt-1 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Nombre Completo *</Label>
                <Input
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Ej. Kaled Moly"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Teléfono WhatsApp</Label>
                <Input
                  value={contactForm.phone}
                  readOnly
                  className="h-8 text-xs font-mono bg-zinc-100 dark:bg-zinc-800"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Dirección de Entrega</Label>
              <Input
                value={contactForm.address}
                onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })}
                placeholder="Ej. Calle 15 # 4-20 Apto 302"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Documento / Cédula</Label>
                <Input
                  value={contactForm.document}
                  onChange={(e) => setContactForm({ ...contactForm, document: e.target.value })}
                  placeholder="CC 1098..."
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Cupo de Crédito (COP)</Label>
                <Input
                  type="number"
                  value={contactForm.creditLimit}
                  onChange={(e) => setContactForm({ ...contactForm, creditLimit: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold">Notas del Cliente</Label>
              <Textarea
                value={contactForm.notes}
                onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                placeholder="Preferencias de entrega, productos habituales..."
                className="text-xs h-16 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setContactModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveContact}
              className="bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold"
            >
              Guardar Contacto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Enviar Plantilla de Promoción */}
      <Dialog open={templateModalOpen} onOpenChange={setTemplateModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconSpeakerphone className="h-4 w-4" /> Enviar Plantilla Promocional
            </DialogTitle>
            <DialogDescription className="text-xs">
              Envía una plantilla oficial personalizada a este contacto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Seleccionar Plantilla</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Selecciona una plantilla" />
                </SelectTrigger>
                <SelectContent className="text-xs rounded-xl">
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplateId && (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border text-xs whitespace-pre-line font-mono text-[11px]">
                {templates.find((t) => t.id === selectedTemplateId)?.content}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setTemplateModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => handleSendBroadcast(true)}
              disabled={sendingBroadcast || !selectedTemplateId}
              className="bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold"
            >
              {sendingBroadcast ? "Enviando…" : "Enviar por WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
