"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  IconBrandWhatsapp,
  IconBrandTelegram,
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
  IconTrash,
  IconUserX,
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
  IconAlertTriangle,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconVolume,
  IconVolumeOff,
  IconChecks,
  IconClock,
  IconInfoCircle,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { ClientAiUsage } from "@/lib/ai-token-tracker"

interface CareWindow {
  isOpen: boolean
  expiresAt: string | null
  hoursLeft: number
  minutesLeft: number
  formattedTimeLeft: string
}

export interface MetaQuota {
  monthlyLimit: number
  usedThisMonth: number
  remainingFree: number
  percentUsed: number
  resetsAt: string
  isExceeded: boolean
  botMessagesCount?: number
  agentMessagesCount?: number
  customerIncomingCount?: number
  model?: "per_message"
}

function playNotificationSound() {
  if (typeof window === "undefined") return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {})
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08) // A5

    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.35)
  } catch (e) {
    console.debug("[Audio notification]", e)
  }
}

interface Conversation {
  phone: string
  channel?: "whatsapp" | "telegram"
  careWindow?: CareWindow
  session?: {
    status: "abierta" | "pendiente" | "cerrada"
    openedAt: string
    closedAt: string | null
    closedReason?: string | null
  } | null
  aiUsage?: ClientAiUsage | null
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
    subtotal?: number
    deliveryFee?: number
    deliveryAddress: string | null
    createdAt: string
    itemsCount: number
    paymentMethod?: string
    paymentStatus?: string
    deliveryDriverName?: string | null
    deliveryDriverPhone?: string | null
    deliveryNotes?: string | null
    notes?: string | null
    items?: {
      id: string
      name: string
      quantity: number
      unitPrice: number
      subtotal: number
    }[]
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
    subtotal?: number
    deliveryFee?: number
    deliveryAddress: string | null
  } | null
}

interface Template {
  id: string
  name: string
  category: string
  content: string
}

export const CURATED_OPENROUTER_MODELS = [
  // --- MODELO GRATUITO OFICIAL (ROUTER AUTOMÁTICO DE MODELOS FREE DE OPENROUTER) ---
  {
    id: "openrouter/free",
    name: "OpenRouter Free Models Router",
    provider: "OpenRouter",
    badge: "🎁 100% Gratis ($0) • Auto-Ruta",
    isFree: true,
  },

  // --- MODELOS ESTÁNDAR / PAGO ---
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Chat Pago)", provider: "DeepSeek", badge: "🔥 Muy Económico", isFree: false },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Pago)", provider: "DeepSeek", badge: "🧠 Razonamiento Máximo", isFree: false },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta Llama 3.3 70B (Pago)", provider: "Meta", badge: "⚡ Inteligente & Veloz", isFree: false },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", badge: "🚀 Máxima Velocidad", isFree: false },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", badge: "👑 Calidad Superior", isFree: false },
  { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o Mini", provider: "OpenAI", badge: "💡 Barato & Fiable", isFree: false },
  { id: "openai/gpt-4o", name: "OpenAI GPT-4o", provider: "OpenAI", badge: "🌟 Gama Alta", isFree: false },
  { id: "mistralai/mistral-large-2411", name: "Mistral Large", provider: "Mistral", badge: "🇪🇺 Fluido en Español", isFree: false },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", provider: "Alibaba", badge: "📊 Alta Precisión", isFree: false },
]

export interface OpenRouterQuotaInfo {
  ok: boolean
  configured: boolean
  isFreeModel: boolean
  model: string
  isExhausted: boolean
  exhaustedReason: string | null
  lastExhaustedAt: string | null
  probeSuccess?: boolean | null
  probeLatency?: number | null
  keyInfo?: {
    label?: string
    usageUsd?: number
    limitUsd?: number | null
    isFreeTier?: boolean
    rateLimit?: {
      requests: number
      interval: string
    } | null
  } | null
  message: string
}

interface BranchConfig {
  id?: string
  branchId: string
  phoneNumber?: string | null
  metaPhoneNumberId?: string | null
  metaAccessToken?: string | null
  metaVerifyToken?: string | null
  telegramBotToken?: string | null
  telegramBotUsername?: string | null
  telegramEnabled?: boolean
  aiProvider?: "deepseek" | "openrouter"
  deepseekApiKey?: string | null
  deepseekModel: string
  openrouterApiKey?: string | null
  openrouterModel?: string
  aiEnabled: boolean
  aiSystemPrompt?: string | null
  welcomeMessage?: string | null
  autoCreateOrders: boolean
  maxTokensPerReply: number
  hasDeepSeekKey?: boolean
  hasOpenRouterKey?: boolean
  hasMetaToken?: boolean
  hasTelegramToken?: boolean
  deepseekApiKeyMasked?: string
  openrouterApiKeyMasked?: string
  metaAccessTokenMasked?: string
  telegramBotTokenMasked?: string
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
  const [statusFilter, setStatusFilter] = useState<"all" | "whatsapp" | "telegram" | "unread" | "with_orders" | "abiertas" | "cerradas">("all")

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

  // Modal: Detalle y Gestión de Pedido desde el CRM
  const [orderDetailModalOpen, setOrderDetailModalOpen] = useState(false)
  const [customerOrdersModalOpen, setCustomerOrdersModalOpen] = useState(false)
  const [customerOrdersList, setCustomerOrdersList] = useState<any[]>([])
  const [loadingCustomerOrders, setLoadingCustomerOrders] = useState(false)

  // Meta Cloud API Cuota 1.000 Mensual y Políticas
  const [metaQuota, setMetaQuota] = useState<MetaQuota | null>(null)
  const [metaQuotaModalOpen, setMetaQuotaModalOpen] = useState(false)
  const [syncingTemplates, setSyncingTemplates] = useState(false)

  // Notificaciones de Audio & Escribiendo
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundEnabledRef = useRef(true)
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])
  const [isTyping, setIsTyping] = useState<"cliente" | "ia" | "agente" | null>(null)

  // Modal: Ranking y Reporte de Consumo de Tokens por Cliente
  const [aiUsageModalOpen, setAiUsageModalOpen] = useState(false)
  const [aiUsageReport, setAiUsageReport] = useState<{
    clients: ClientAiUsage[]
    summary: {
      totalTokens: number
      promptTokens: number
      completionTokens: number
      totalCostUsd: number
      totalClients: number
      totalReplies: number
      freeModelReplies: number
    }
  } | null>(null)
  const [loadingAiUsageReport, setLoadingAiUsageReport] = useState(false)
  const [aiUsageSearch, setAiUsageSearch] = useState("")

  // Modal: Historial detallado de consultas de un cliente
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedClientUsageDetail, setSelectedClientUsageDetail] = useState<ClientAiUsage | null>(null)

  const fetchAiUsageReport = async () => {
    try {
      setLoadingAiUsageReport(true)
      const res = await apiFetch<{
        ok: boolean
        clients: ClientAiUsage[]
        summary: any
      }>("/api/whatsapp/ai-usage")
      if (res && res.ok) {
        setAiUsageReport({ clients: res.clients, summary: res.summary })
      }
    } catch {
      // noop
    } finally {
      setLoadingAiUsageReport(false)
    }
  }

  const handleResetClientAiTokens = async (phone: string) => {
    if (!confirm("¿Deseas restablecer a 0 el conteo de tokens y gasto de IA de este cliente?")) return
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>("/api/whatsapp/ai-usage", {
        method: "POST",
        body: JSON.stringify({ action: "reset", phone }),
      })
      if (res && res.ok) {
        toast.success("Contador de tokens de este cliente restablecido a 0")
        loadConversations(false)
        if (aiUsageModalOpen) fetchAiUsageReport()
      }
    } catch (e: any) {
      toast.error("Error al restablecer: " + e.message)
    }
  }

  // Modal: Simular mensaje entrante
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [simText, setSimText] = useState("")
  const [simPhone, setSimPhone] = useState("+573105551234")
  const [simCustomerName, setSimCustomerName] = useState("Carlos Mendoza")
  const [simChannel, setSimChannel] = useState<"whatsapp" | "telegram">("whatsapp")
  const [simulating, setSimulating] = useState(false)

  const openSimModal = () => {
    if (selectedPhone) {
      setSimPhone(selectedPhone)
      const isTg = selectedPhone.startsWith("tg_") || selectedConv?.channel === "telegram"
      setSimChannel(isTg ? "telegram" : "whatsapp")
      setSimCustomerName(selectedConv?.client?.name || (isTg ? "Usuario Telegram" : "Cliente WhatsApp"))
    } else {
      setSimPhone("+573105551234")
      setSimChannel("whatsapp")
      setSimCustomerName("Carlos Mendoza")
    }
    setSimModalOpen(true)
  }

  // Estado Configuración por Sede
  const [config, setConfig] = useState<BranchConfig>({
    branchId: currentBranchId,
    phoneNumber: "",
    metaPhoneNumberId: "",
    metaAccessToken: "",
    metaVerifyToken: "omnipos_verify_token_2026",
    telegramBotToken: "",
    telegramBotUsername: "",
    telegramEnabled: false,
    aiProvider: "deepseek",
    deepseekApiKey: "",
    deepseekModel: "deepseek-chat",
    openrouterApiKey: "",
    openrouterModel: "deepseek/deepseek-chat",
    aiEnabled: true,
    aiSystemPrompt: "",
    welcomeMessage: "",
    autoCreateOrders: true,
    maxTokensPerReply: 250,
  })
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingAi, setTestingAi] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false)
  const [showMetaToken, setShowMetaToken] = useState(false)
  const [showTelegramToken, setShowTelegramToken] = useState(false)
  const [isCustomModel, setIsCustomModel] = useState(false)
  const [customOpenRouterModel, setCustomOpenRouterModel] = useState("")
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedTgWebhook, setCopiedTgWebhook] = useState(false)

  // Estado del monitor de cuota y peticiones gratis en OpenRouter
  const [openrouterQuota, setOpenrouterQuota] = useState<OpenRouterQuotaInfo | null>(null)
  const [loadingQuota, setLoadingQuota] = useState(false)

  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const prevMsgCountRef = useRef(0)

  // Desplazamiento garantizado hacia el final del chat
  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainerRef.current
    if (el) {
      el.scrollTo({
        top: el.scrollHeight + 1000,
        behavior: smooth ? "smooth" : "auto",
      })
    } else {
      chatScrollRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" })
    }
  }, [])

  // 1.1 Verificar estado y cuota de peticiones gratuitas en OpenRouter
  const checkOpenRouterQuota = useCallback(
    async (probe = false) => {
      try {
        setLoadingQuota(true)
        const url = `/api/whatsapp/openrouter-quota?branchId=${encodeURIComponent(currentBranchId)}${probe ? "&probe=true" : ""}`
        const res = await apiFetch<OpenRouterQuotaInfo>(url)
        if (res && res.ok) {
          setOpenrouterQuota(res)
          if (probe) {
            if (res.isExhausted) {
              toast.error(res.exhaustedReason || "Cuota o límite de peticiones gratuitas alcanzado en OpenRouter (Error 429).")
            } else {
              toast.success("✅ Peticiones gratuitas de OpenRouter activas y respondiendo normalmente.")
            }
          }
        }
      } catch (err: any) {
        if (probe) {
          toast.error("Error al comprobar cuota: " + err.message)
        }
      } finally {
        setLoadingQuota(false)
      }
    },
    [currentBranchId]
  )

  // 1. Cargar Configuración de la Sede
  const loadBranchConfig = useCallback(async (bId: string) => {
    if (!bId) return
    try {
      setLoadingConfig(true)
      const res = await apiFetch<{ ok: boolean; config: BranchConfig }>(`/api/whatsapp/config?branchId=${encodeURIComponent(bId)}`)
      if (res && res.config) {
        let loadedModel = res.config.openrouterModel || "openrouter/free"
        if (loadedModel.endsWith(":free") && loadedModel !== "openrouter/free") {
          loadedModel = "openrouter/free"
        }
        const isPreset = CURATED_OPENROUTER_MODELS.some((m) => m.id === loadedModel)
        setIsCustomModel(!isPreset && !!loadedModel)
        if (!isPreset && loadedModel) {
          setCustomOpenRouterModel(loadedModel)
        }
        setConfig({
          ...res.config,
          aiProvider: res.config.aiProvider || "deepseek",
          openrouterModel: loadedModel,
          deepseekApiKey: res.config.deepseekApiKeyMasked || "",
          openrouterApiKey: res.config.openrouterApiKeyMasked || "",
          metaAccessToken: res.config.metaAccessTokenMasked || "",
          telegramBotToken: res.config.telegramBotTokenMasked || res.config.telegramBotToken || "",
          telegramBotUsername: res.config.telegramBotUsername || "",
          telegramEnabled: Boolean(res.config.telegramEnabled),
        })
        if (res.config.aiProvider === "openrouter" || res.config.hasOpenRouterKey) {
          checkOpenRouterQuota(false)
        }
      }
    } catch {
      // noop
    } finally {
      setLoadingConfig(false)
    }
  }, [checkOpenRouterQuota])

  // Polling periódico de cuota OpenRouter si se usa un modelo gratuito (cada 30s)
  useEffect(() => {
    const isFree =
      config.aiProvider === "openrouter" &&
      (config.openrouterModel === "openrouter/free" || config.openrouterModel?.endsWith(":free"))
    if (!isFree) return

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      checkOpenRouterQuota(false)
    }, 30000)
    return () => clearInterval(interval)
  }, [config.aiProvider, config.openrouterModel, checkOpenRouterQuota])

  // 2. Cargar lista de conversaciones para la sede activa
  const loadConversations = useCallback(async (selectFirst = false) => {
    try {
      const url = currentBranchId
        ? `/api/whatsapp/conversations?branchId=${encodeURIComponent(currentBranchId)}`
        : "/api/whatsapp/conversations"
      const res = await apiFetch<{ ok: boolean; conversations: Conversation[]; metaQuota?: MetaQuota }>(url)
      if (res && res.ok) {
        const list = res.conversations || []
        if (res.metaQuota) {
          setMetaQuota(res.metaQuota)
        }
        setConversations((prev) => {
          const prevUnread = prev.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
          const newUnread = list.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
          if (newUnread > prevUnread && soundEnabledRef.current) {
            playNotificationSound()
          }
          return list
        })
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

  // Polling silencioso de conversaciones cada 5s solo si la pestaña está visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      loadConversations(false)
    }, 5000)
    return () => clearInterval(interval)
  }, [loadConversations])

  // 3. Cargar mensajes del chat seleccionado con soporte para refresco en tiempo real sin parpadeo
  const loadMessages = useCallback(async (phone: string, silent = false) => {
    try {
      if (!silent) setLoadingMessages(true)
      const url = currentBranchId
        ? `/api/whatsapp/messages?phone=${encodeURIComponent(phone)}&branchId=${encodeURIComponent(currentBranchId)}`
        : `/api/whatsapp/messages?phone=${encodeURIComponent(phone)}`
      const res = await apiFetch<{ ok: boolean; messages: Message[] }>(url)
      if (res && res.ok && res.messages) {
        setChatMessages((prev) => {
          if (prev.length > 0 && res.messages.length > prev.length) {
            const lastNew = res.messages[res.messages.length - 1]
            if (lastNew && lastNew.sender === "customer") {
              if (soundEnabledRef.current) {
                playNotificationSound()
              }
              setIsTyping("ia")
              setTimeout(() => setIsTyping(null), 3500)
            }
          }
          // Solo actualizar el estado si realmente hay cambios para no disparar renders innecesarios
          if (prev.length === res.messages.length) {
            const lastPrev = prev[prev.length - 1]
            const lastNew = res.messages[res.messages.length - 1]
            if (lastPrev?.id === lastNew?.id && lastPrev?.status === lastNew?.status) {
              return prev
            }
          }
          return res.messages
        })
      }
    } catch {
      // noop
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }, [currentBranchId])

  // Refresco en tiempo real del chat activo cada 2.5s (sin recargar la página, solo con ventana activa)
  useEffect(() => {
    if (!selectedPhone) return
    loadMessages(selectedPhone, false)
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      loadMessages(selectedPhone, true)
    }, 2500)
    return () => clearInterval(interval)
  }, [selectedPhone, loadMessages])

  // Scroll instantáneo al fondo al cargar mensajes o cambiar de chat
  useEffect(() => {
    if (chatMessages.length > 0) {
      scrollToBottom(false)
      const t1 = setTimeout(() => scrollToBottom(false), 60)
      const t2 = setTimeout(() => scrollToBottom(false), 250)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [selectedPhone, chatMessages.length, scrollToBottom])

  // Scroll suave cuando llega un mensaje nuevo en tiempo real
  useEffect(() => {
    if (chatMessages.length > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      scrollToBottom(true)
    }
    prevMsgCountRef.current = chatMessages.length
  }, [chatMessages, scrollToBottom])

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
      const finalOpenRouterModel =
        isCustomModel && customOpenRouterModel.trim()
          ? customOpenRouterModel.trim()
          : config.openrouterModel || "deepseek/deepseek-chat"

      const res = await apiFetch<{ ok: boolean; message: string }>("/api/whatsapp/config", {
        method: "POST",
        body: JSON.stringify({
          ...config,
          openrouterModel: finalOpenRouterModel,
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

  // Probar conexión directa con DeepSeek u OpenRouter
  const handleTestAi = async (overrideProvider?: "deepseek" | "openrouter") => {
    const prov = overrideProvider || config.aiProvider || "deepseek"
    const isOpener = prov === "openrouter"
    const chosenModel = isOpener
      ? isCustomModel && customOpenRouterModel.trim()
        ? customOpenRouterModel.trim()
        : config.openrouterModel || "deepseek/deepseek-chat"
      : config.deepseekModel

    setTestingAi(true)
    try {
      const res = await apiFetch<{
        ok: boolean
        message: string
        latencyMs: number
        model: string
        reply: string
        provider?: string
        error?: string
      }>("/api/whatsapp/test-deepseek", {
        method: "POST",
        body: JSON.stringify({
          provider: prov,
          apiKey: isOpener ? config.openrouterApiKey : config.deepseekApiKey,
          model: chosenModel,
          branchId: currentBranchId,
        }),
      })

      if (res && res.ok) {
        toast.success(`¡${isOpener ? "OpenRouter" : "DeepSeek"} Conectado! Modelo: ${res.model} (${res.latencyMs}ms)`)
        if (isOpener) checkOpenRouterQuota(false)
      } else {
        toast.error(res.error || `No se pudo conectar con ${isOpener ? "OpenRouter" : "DeepSeek"}`)
        if (isOpener) checkOpenRouterQuota(false)
      }
    } catch (e) {
      toast.error("Error de conexión: " + (e as Error).message)
    } finally {
      setTestingAi(false)
    }
  }

  // Probar y conectar Bot de Telegram
  const handleTestTelegram = async () => {
    if (!config.telegramBotToken?.trim()) {
      toast.error("Ingresa el Bot Token proporcionado por @BotFather")
      return
    }
    setTestingTelegram(true)
    try {
      const res = await apiFetch<{
        ok: boolean
        bot: { id: number; first_name: string; username: string }
        webhookUrl: string
        webhookSet: boolean
        webhookStatusNote: string
        message: string
        error?: string
      }>("/api/telegram/test", {
        method: "POST",
        body: JSON.stringify({
          token: config.telegramBotToken,
          branchId: currentBranchId,
          action: "connect",
        }),
      })

      if (res && res.ok) {
        toast.success(res.message || `¡Bot ${res.bot.username} conectado!`)
        if (res.webhookStatusNote) {
          toast.info(res.webhookStatusNote)
        }
        setConfig((c) => ({
          ...c,
          telegramBotUsername: res.bot.username,
          telegramEnabled: true,
          hasTelegramToken: true,
        }))
        loadBranchConfig(currentBranchId)
      } else {
        toast.error(res.error || "No se pudo conectar con el bot de Telegram")
      }
    } catch (e) {
      toast.error("Error al conectar Telegram: " + (e as Error).message)
    } finally {
      setTestingTelegram(false)
    }
  }

  // Desvincular Bot de Telegram
  const handleDisconnectTelegram = async () => {
    if (!confirm("¿Deseas desvincular el bot de Telegram de esta sede?")) return
    try {
      await apiFetch("/api/telegram/test", {
        method: "POST",
        body: JSON.stringify({
          branchId: currentBranchId,
          action: "disconnect",
        }),
      })
      toast.success("Bot de Telegram desvinculado con éxito")
      setConfig((c) => ({
        ...c,
        telegramBotToken: "",
        telegramBotUsername: "",
        telegramEnabled: false,
        hasTelegramToken: false,
      }))
      loadBranchConfig(currentBranchId)
    } catch (e) {
      toast.error("Error al desvincular: " + (e as Error).message)
    }
  }

  // Sincronizar plantillas con Meta Cloud API
  const handleSyncTemplates = async () => {
    setSyncingTemplates(true)
    try {
      const res = await apiFetch<{
        ok: boolean
        message: string
        syncedCount: number
        error?: string
      }>("/api/whatsapp/templates/sync", {
        method: "POST",
      })
      if (res && res.ok) {
        toast.success(res.message || `Se sincronizaron ${res.syncedCount} plantillas oficiales desde Meta`)
        loadTemplates()
      } else {
        toast.error(res?.error || "No se pudieron sincronizar las plantillas de Meta")
      }
    } catch (e) {
      toast.error("Error al sincronizar plantillas con Meta: " + (e as Error).message)
    } finally {
      setSyncingTemplates(false)
    }
  }

  // Enviar mensaje manual desde el agente humano con actualización optimista inmediata
  const handleSendAgentMessage = async () => {
    if (!selectedPhone || !agentReplyText.trim() || sendingReply) return

    const textToSend = agentReplyText.trim()
    const isTg = selectedPhone.startsWith("tg_") || selectedConv?.channel === "telegram"
    setAgentReplyText("")

    // Inserción optimista inmediata en la vista para respuesta instantánea
    const optimisticMessage: Message = {
      id: "temp-" + Date.now(),
      text: textToSend,
      sender: "agent",
      status: "sent",
      createdAt: new Date().toISOString(),
    }
    setChatMessages((prev) => [...prev, optimisticMessage])
    setTimeout(() => scrollToBottom(true), 30)

    setIsTyping("agente")
    setSendingReply(true)
    try {
      const res = await apiFetch<{ ok: boolean; message: Message }>("/api/whatsapp/conversations", {
        method: "POST",
        body: JSON.stringify({
          phone: selectedPhone,
          text: textToSend,
          branchId: currentBranchId,
        }),
      })

      if (res && res.ok) {
        await loadMessages(selectedPhone, true)
        loadConversations(false)
        toast.success(isTg ? "Mensaje enviado por Telegram" : "Mensaje enviado por WhatsApp")
      }
    } catch (e) {
      toast.error("Error al enviar mensaje: " + (e as Error).message)
      loadMessages(selectedPhone, true)
    } finally {
      setSendingReply(false)
      setIsTyping(null)
    }
  }

  // Simular mensaje de entrada con IA DeepSeek u OpenRouter
  const handleSimulateInbound = async (presetText?: string) => {
    const text = (presetText || simText).trim()
    const targetPhone = (simPhone || selectedPhone || (simChannel === "telegram" ? "tg_573105551234" : "+573105551234")).trim()
    const targetName = (simCustomerName || selectedConv?.client?.name || (simChannel === "telegram" ? "Carlos (Telegram)" : "Carlos Mendoza")).trim()

    if (!text) {
      toast.error("Ingresa el mensaje a simular")
      return
    }

    setIsTyping("cliente")
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
          phone: targetPhone,
          customerName: targetName,
          message: text,
          branchId: currentBranchId,
          channel: simChannel,
        }),
      })

      if (res && res.ok) {
        setSimText("")
        setSimModalOpen(false)
        setSelectedPhone(targetPhone)

        // Actualización optimista inmediata en la UI con la respuesta de la IA generada
        if (res.botReply) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: "sim-inbound-" + Date.now(),
              sender: "customer",
              text,
              status: "read",
              createdAt: new Date().toISOString(),
            },
            {
              id: "sim-bot-" + Date.now(),
              sender: "bot",
              text: res.botReply,
              status: "delivered",
              createdAt: new Date(Date.now() + 50).toISOString(),
            },
          ])
        }

        await loadConversations(false)
        await loadMessages(targetPhone, true)
        setTimeout(() => scrollToBottom(false), 60)
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
      setIsTyping(null)
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

  // Vaciar mensajes del chat
  const handleClearChat = async () => {
    if (!selectedPhone) return
    if (!window.confirm("¿Estás seguro de que deseas vaciar todos los mensajes de este chat? Esta acción no se puede deshacer.")) {
      return
    }
    try {
      await apiFetch(`/api/whatsapp/conversations?phone=${encodeURIComponent(selectedPhone)}&action=clear_chat`, {
        method: "DELETE",
      })
      toast.success("Historial de mensajes vaciado correctamente")
      setChatMessages([])
      loadConversations(false)
    } catch (err: any) {
      toast.error(err.message || "Error al vaciar el chat")
    }
  }

  // Eliminar contacto por completo del CRM
  const handleDeleteContact = async () => {
    if (!selectedPhone) return
    if (!window.confirm("¿Eliminar este contacto y todo su historial? Se borrarán sus mensajes y el registro del cliente.")) {
      return
    }
    try {
      await apiFetch(`/api/whatsapp/conversations?phone=${encodeURIComponent(selectedPhone)}&action=delete_contact`, {
        method: "DELETE",
      })
      toast.success("Contacto eliminado con éxito")
      setSelectedPhone(null)
      setChatMessages([])
      loadConversations(false)
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar el contacto")
    }
  }

  // Cambiar estado o cerrar/reabrir sesión de conversación (Estrategia Chatbot)
  const handleToggleSession = async (
    action: "close" | "reopen" | "status",
    targetStatus?: "abierta" | "pendiente" | "cerrada"
  ) => {
    if (!selectedPhone) return
    const isClosing = action === "close" || targetStatus === "cerrada"
    const newStatus = targetStatus || (action === "reopen" ? "abierta" : "cerrada")

    try {
      const res = await apiFetch<{ ok: boolean; session: any }>("/api/whatsapp/conversations/session", {
        method: "POST",
        body: JSON.stringify({
          phone: selectedPhone,
          action: isClosing ? "close" : undefined,
          status: newStatus,
        }),
      })

      if (res?.ok && res.session) {
        setConversations((prev) =>
          prev.map((c) => (c.phone === selectedPhone ? { ...c, session: res.session } : c))
        )
        if (isClosing) {
          toast.success("Conversación cerrada con éxito. El próximo pedido iniciará limpio.")
        } else {
          toast.success(`Conversación marcada como ${newStatus}`)
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar sesión de conversación")
    }
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

  // Actualizar estado de envío / pedido en 1 clic
  const handleQuickUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      })
      const labels: Record<string, string> = {
        pendiente: "Pendiente",
        confirmado: "Confirmado",
        en_preparacion: "En Preparación",
        en_camino: "En Camino con Domiciliario",
        entregado: "Entregado con Éxito",
        cancelado: "Cancelado",
      }
      toast.success(`Estado de pedido actualizado a: ${labels[newStatus] || newStatus}`)
      await loadConversations()
      if (selectedPhone) loadMessages(selectedPhone, true)
    } catch (e) {
      toast.error("Error al actualizar estado de pedido: " + (e as Error).message)
    }
  }

  // Actualizar estado de pago en 1 clic (ej: Confirmar Pago / Marcar Pagado)
  const handleQuickUpdatePaymentStatus = async (orderId: string, paymentStatus: "pagado" | "pendiente", paymentMethod?: string) => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          paymentStatus,
          ...(paymentMethod ? { paymentMethod } : {}),
        }),
      })
      if (paymentStatus === "pagado") {
        toast.success("¡Pago verificado y registrado en Ventas oficial!")
      } else {
        toast.info("Pago marcado como pendiente")
      }
      await loadConversations()
      if (selectedPhone) loadMessages(selectedPhone, true)
    } catch (e) {
      toast.error("Error al actualizar pago: " + (e as Error).message)
    }
  }

  // Actualizar método de pago en 1 clic (Efectivo <-> Transferencia)
  const handleQuickUpdatePaymentMethod = async (orderId: string, paymentMethod: "efectivo" | "transferencia") => {
    try {
      await apiFetch(`/api/v1/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod }),
      })
      toast.success(`Forma de pago cambiada a: ${paymentMethod === "transferencia" ? "Transferencia" : "Efectivo"}`)
      await loadConversations()
      if (selectedPhone) loadMessages(selectedPhone, true)
    } catch (e) {
      toast.error("Error al actualizar forma de pago: " + (e as Error).message)
    }
  }

  // Consultar todas las órdenes del cliente activo
  const handleOpenCustomerOrders = async (phone: string) => {
    setLoadingCustomerOrders(true)
    setCustomerOrdersModalOpen(true)
    try {
      const res = await apiFetch<{ orders: any[] }>(`/api/v1/delivery/orders?search=${encodeURIComponent(phone)}&pageSize=50`)
      if (res && res.orders) {
        setCustomerOrdersList(res.orders)
      }
    } catch {
      // noop
    } finally {
      setLoadingCustomerOrders(false)
    }
  }

  const copyToClipboard = (text: string, type: "url" | "token" | "tg_url") => {
    navigator.clipboard.writeText(text)
    if (type === "url") {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else if (type === "tg_url") {
      setCopiedTgWebhook(true)
      setTimeout(() => setCopiedTgWebhook(false), 2000)
    } else {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
    toast.success("Copiado al portapapeles")
  }

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/whatsapp/webhook`
    : "https://tudominio.com/api/whatsapp/webhook"

  const tgWebhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/telegram/webhook?branchId=${currentBranchId}`
    : `https://tudominio.com/api/telegram/webhook?branchId=${currentBranchId}`

  // Filtrado de conversaciones
  const filteredConversations = conversations.filter((c) => {
    const isTg = c.channel === "telegram" || c.phone.startsWith("tg_")
    const matchesSearch =
      c.phone.includes(searchFilter) ||
      (c.client?.name || "").toLowerCase().includes(searchFilter.toLowerCase()) ||
      (c.lastMessage?.text || "").toLowerCase().includes(searchFilter.toLowerCase())

    if (!matchesSearch) return false
    if (statusFilter === "whatsapp") return !isTg
    if (statusFilter === "telegram") return isTg
    if (statusFilter === "unread") return c.unreadCount > 0
    if (statusFilter === "with_orders") return c.latestOrder !== null
    if (statusFilter === "abiertas") return (c.session?.status || "abierta") !== "cerrada"
    if (statusFilter === "cerradas") return c.session?.status === "cerrada"
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
                Agente IA Omnicanal & CRM
              </h1>
              {config.aiProvider === "openrouter" ? (
                config.hasOpenRouterKey ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                      ⚡ OpenRouter ({config.openrouterModel?.split("/")[1] || config.openrouterModel || "deepseek-chat"})
                    </Badge>
                    {(config.openrouterModel === "openrouter/free" || config.openrouterModel?.endsWith(":free")) && (
                      openrouterQuota?.isExhausted ? (
                        <Badge
                          variant="outline"
                          onClick={() => setMainTab("config")}
                          className="text-[10px] font-mono tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 flex items-center gap-1 animate-pulse cursor-pointer hover:bg-rose-500/25 transition"
                          title={openrouterQuota.exhaustedReason || "Cuota gratuita agotada"}
                        >
                          <IconAlertTriangle className="h-3 w-3 text-rose-500" />
                          ⚠️ Cuota Free Agotada
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1"
                        >
                          🎁 Free: Peticiones OK
                        </Badge>
                      )
                    )}
                  </div>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-mono text-amber-600 dark:text-amber-400 border-dashed border-amber-400">
                    OpenRouter Pendiente
                  </Badge>
                )
              ) : config.hasDeepSeekKey ? (
                <Badge variant="outline" className="text-[10px] font-mono tracking-wider bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100">
                  ⚡ DeepSeek ({config.deepseekModel})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] font-mono text-zinc-500 border-dashed border-zinc-300 dark:border-zinc-700">
                  DeepSeek Pendiente
                </Badge>
              )}
              {config.telegramBotUsername && config.telegramEnabled && (
                <Badge variant="outline" className="text-[10px] font-mono tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1">
                  <IconBrandTelegram className="h-3 w-3 text-blue-500" />
                  Telegram ({config.telegramBotUsername})
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Omnicanal 24/7 (WhatsApp + Telegram), catálogo inteligente, pedidos automáticos y fiados por sede.
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

          {/* Botón Consumo IA por Cliente */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              fetchAiUsageReport()
              setAiUsageModalOpen(true)
            }}
            className="h-8 text-xs font-bold rounded-full gap-1.5 border-purple-300 dark:border-purple-800 bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 cursor-pointer shadow-2xs"
            title="Ver cuánto en tokens y gasto de IA ha consumido cada cliente"
          >
            <IconBolt className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            <span className="hidden sm:inline">Consumo IA por Cliente</span>
            <span className="sm:hidden">Tokens IA</span>
          </Button>

          {/* Botón / Contador Nueva Política Meta: 1.000 Mensajes Salientes Gratis */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMetaQuotaModalOpen(true)}
            className="h-8 text-xs font-bold rounded-full gap-1.5 border-emerald-300 dark:border-emerald-800 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 cursor-pointer shadow-2xs"
            title="Nueva política de Meta: 1.000 mensajes de servicio gratis al mes por número telefónico"
          >
            <IconBrandWhatsapp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Meta Free:</span>
            <span><strong>{metaQuota?.usedThisMonth ?? 0} / {metaQuota?.monthlyLimit ?? 1000} msgs</strong></span>
          </Button>

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
              Canales & IA por Sede
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

              <div className="flex items-center justify-between text-[11px] gap-1 flex-wrap">
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
                  onClick={() => setStatusFilter("abiertas")}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1",
                    statusFilter === "abiertas" ? "bg-emerald-600 text-white font-bold" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Abiertas
                </button>
                <button
                  onClick={() => setStatusFilter("cerradas")}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1",
                    statusFilter === "cerradas" ? "bg-zinc-700 text-white font-bold" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  Cerradas
                </button>
                <button
                  onClick={() => setStatusFilter("whatsapp")}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1",
                    statusFilter === "whatsapp" ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  <IconBrandWhatsapp className="h-3 w-3" /> WA
                </button>
                <button
                  onClick={() => setStatusFilter("telegram")}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md font-semibold transition-colors cursor-pointer flex items-center gap-1",
                    statusFilter === "telegram" ? "bg-blue-600 text-white" : "text-zinc-500 hover:text-foreground"
                  )}
                >
                  <IconBrandTelegram className="h-3 w-3" /> TG
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
                  Pedidos
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
                    Usa "+ Simular Mensaje" para probar el bot con WhatsApp o Telegram.
                  </p>
                </div>
              ) : (
                filteredConversations.map((c) => {
                  const isSelected = selectedPhone === c.phone
                  const isTg = c.channel === "telegram" || c.phone.startsWith("tg_")
                  const displayName = c.client?.name || (isTg ? `Telegram (@${c.phone.replace("tg_", "")})` : `Contacto (${c.phone.slice(-4)})`)
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
                        <div className={cn(
                          "h-9 w-9 rounded-full font-bold flex items-center justify-center text-xs",
                          isTg
                            ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                        )}>
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                        {isTg ? (
                          <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white dark:bg-zinc-900 shadow-xs flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                            <IconBrandTelegram className="h-2.5 w-2.5 text-blue-500" />
                          </span>
                        ) : (
                          <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white dark:bg-zinc-900 shadow-xs flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                            <IconBrandWhatsapp className="h-2.5 w-2.5 text-emerald-500" />
                          </span>
                        )}
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
                          {c.session?.status === "cerrada" ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-zinc-500 border-zinc-300 dark:border-zinc-700 bg-zinc-100/70 dark:bg-zinc-800/60 gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                              Cerrada
                            </Badge>
                          ) : c.session?.status === "pendiente" ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800 bg-amber-500/10 gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Pendiente
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-500/10 gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Abierta
                            </Badge>
                          )}
                          {isTg ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 gap-0.5">
                              <IconBrandTelegram className="h-2.5 w-2.5" /> Telegram
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30 gap-0.5">
                              <IconBrandWhatsapp className="h-2.5 w-2.5" /> WhatsApp
                            </Badge>
                          )}
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
                          {c.aiUsage && c.aiUsage.totalTokens > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 font-mono bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 gap-0.5"
                              title={`Consumo IA: ${c.aiUsage.totalTokens.toLocaleString()} tokens (${c.aiUsage.totalReplies} respuestas). Gasto: $${c.aiUsage.estimatedCostUsd} USD`}
                            >
                              ⚡ {c.aiUsage.totalTokens >= 1000 ? `${(c.aiUsage.totalTokens / 1000).toFixed(1)}k` : c.aiUsage.totalTokens} tok
                            </Badge>
                          )}
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
                onClick={openSimModal}
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
                {/* Cabecera del chat — Minimalista, Limpia y Sin Botones Redundantes */}
                <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    {(() => {
                      const isTg = selectedPhone.startsWith("tg_") || selectedConv.channel === "telegram"
                      const displayName = selectedConv.client?.name || (isTg ? `Telegram (@${selectedPhone.replace("tg_", "")})` : `Contacto (${selectedPhone.slice(-4)})`)
                      const currentStatus = selectedConv.session?.status || "abierta"
                      return (
                        <>
                          <div className={cn(
                            "h-10 w-10 rounded-full font-bold flex items-center justify-center text-xs shrink-0 relative shadow-2xs",
                            isTg ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"
                          )}>
                            {displayName.slice(0, 2).toUpperCase()}
                            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center shadow-xs">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="font-bold text-sm truncate text-zinc-950 dark:text-white">
                                {displayName}
                              </h2>

                              {/* Estado interactivo único (Abierta / Pendiente / Cerrada) — Sin botón Cerrar redundante */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer shadow-2xs hover:opacity-90",
                                      currentStatus === "pendiente"
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-400/40"
                                        : currentStatus === "cerrada"
                                        ? "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-400/40"
                                        : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-400/40"
                                    )}
                                    title="Haz clic para cambiar el estado del chat"
                                  >
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full shrink-0",
                                        currentStatus === "pendiente"
                                          ? "bg-amber-500"
                                          : currentStatus === "cerrada"
                                          ? "bg-zinc-400"
                                          : "bg-emerald-500"
                                      )}
                                    />
                                    <span className="capitalize">{currentStatus}</span>
                                    <IconChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-52 text-xs rounded-xl shadow-lg">
                                  <DropdownMenuItem
                                    onClick={() => handleToggleSession("status", "abierta")}
                                    className="cursor-pointer gap-2"
                                  >
                                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                    <span>🟢 Marcar como <strong>Abierta</strong></span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleToggleSession("status", "pendiente")}
                                    className="cursor-pointer gap-2"
                                  >
                                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                                    <span>🟠 Marcar como <strong>Pendiente</strong></span>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleToggleSession(currentStatus === "cerrada" ? "reopen" : "close")}
                                    className="cursor-pointer gap-2 text-rose-600 focus:text-rose-700"
                                  >
                                    <span className="h-2 w-2 rounded-full bg-zinc-400" />
                                    <span>{currentStatus === "cerrada" ? "🔄 Reabrir Conversación" : "⚪ Cerrar Conversación"}</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* Subtítulo limpio: Número + Sede + Ventana 24h Meta + Live */}
                            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-mono">
                                {isTg ? <IconBrandTelegram className="h-3 w-3 text-blue-500" /> : <IconBrandWhatsapp className="h-3 w-3 text-emerald-600" />}
                                {isTg ? `Telegram: ${selectedPhone.replace("tg_", "")}` : selectedPhone}
                              </span>
                              <span>·</span>
                              <span>{activeBranch?.name || "Principal"}</span>
                              <span>·</span>

                              {/* Indicador de Ventana 24h Meta */}
                              {selectedConv?.careWindow && (
                                <>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium border",
                                      selectedConv.careWindow.isOpen
                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                    )}
                                    title={
                                      selectedConv.careWindow.isOpen
                                        ? "Ventana 24h abierta: mensajes libres e ilimitados de servicio"
                                        : "Ventana 24h expirada: según políticas de Meta, debes enviar una plantilla para reanudar"
                                    }
                                  >
                                    <IconClock className="h-2.5 w-2.5" />
                                    {selectedConv.careWindow.isOpen ? `24h: ${selectedConv.careWindow.formattedTimeLeft}` : "24h Expirada"}
                                  </span>
                                  <span>·</span>
                                </>
                              )}

                              {/* Indicador Escribiendo o En vivo */}
                              {isTyping ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 animate-pulse">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                  Escribiendo...
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  En vivo
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Acciones de cabecera minimalistas y limpias */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Botón Silenciar / Activar Sonido */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const next = !soundEnabled
                        setSoundEnabled(next)
                        soundEnabledRef.current = next
                        if (next) playNotificationSound()
                        toast.info(next ? "Sonido de mensajes activado" : "Sonido silenciado")
                      }}
                      className="h-8 w-8 p-0 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      title={soundEnabled ? "Silenciar notificaciones sonoras" : "Activar sonido de nuevos mensajes"}
                    >
                      {soundEnabled ? (
                        <IconVolume className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <IconVolumeOff className="h-4 w-4 text-zinc-400" />
                      )}
                    </Button>

                    {/* Botón Plantilla */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTemplateModalOpen(true)}
                      className="h-8 text-xs rounded-xl gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      title="Enviar plantilla oficial o promoción"
                    >
                      <IconSpeakerphone className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="hidden sm:inline">Plantilla</span>
                    </Button>

                    {/* Botón Editar Contacto */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openContactEditor}
                      className="h-8 text-xs rounded-xl gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      title="Editar datos del cliente"
                    >
                      <IconPencil className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>

                    {/* Menú de opciones adicionales (Vaciar chat / Eliminar contacto) */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-xl text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                        >
                          <IconDotsVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 text-xs rounded-xl shadow-lg">
                        <DropdownMenuItem
                          onClick={() => handleToggleSession(selectedConv.session?.status === "cerrada" ? "reopen" : "close")}
                          className="cursor-pointer gap-2"
                        >
                          <IconRefresh className="h-3.5 w-3.5 text-zinc-500" />
                          {selectedConv.session?.status === "cerrada" ? "Reabrir Conversación" : "Cerrar Conversación"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleClearChat} className="cursor-pointer gap-2 text-amber-600 focus:text-amber-700">
                          <IconTrash className="h-3.5 w-3.5" />
                          Vaciar Historial del Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDeleteContact} className="cursor-pointer gap-2 text-rose-600 focus:text-rose-700">
                          <IconUserX className="h-3.5 w-3.5" />
                          Eliminar Contacto del CRM
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Banner de Estado IA en este chat — Suave y No Intrusivo */}
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/70 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between text-xs shrink-0">
                  <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      aiActiveForChat[selectedPhone] === false ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                    )} />
                    <span className="font-medium text-[11px]">
                      {aiActiveForChat[selectedPhone] === false ? (
                        <span className="text-amber-700 dark:text-amber-300 font-semibold">
                          Modo Agente Humano activo (IA pausada para este chat)
                        </span>
                      ) : (
                        <span>
                          Bot IA Activo:{" "}
                          <strong className="text-zinc-900 dark:text-zinc-100">
                            {config.aiProvider === "openrouter"
                              ? config.hasOpenRouterKey
                                ? `OpenRouter (${config.openrouterModel?.split("/")[1] || config.openrouterModel})`
                                : "Motor Local"
                              : config.hasDeepSeekKey
                              ? `DeepSeek (${config.deepseekModel})`
                              : "Motor Local"}
                          </strong>
                          {config.aiProvider === "openrouter" &&
                            (config.openrouterModel === "openrouter/free" || config.openrouterModel?.endsWith(":free")) && (
                              <span
                                className={cn(
                                  "ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold",
                                  openrouterQuota?.isExhausted
                                    ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40"
                                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                )}
                              >
                                {openrouterQuota?.isExhausted ? "⚠️ Cuota Free Agotada" : "🎁 Free OK"}
                              </span>
                            )}
                        </span>
                      )}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setAiActiveForChat((prev) => ({
                        ...prev,
                        [selectedPhone]: prev[selectedPhone] === false ? true : false,
                      }))
                    }
                    className="h-6 px-2 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg cursor-pointer"
                  >
                    {aiActiveForChat[selectedPhone] === false ? "▶ Reanudar IA" : "⏸ Pausar IA"}
                  </Button>
                </div>

                {/* Alerta visible si la cuota gratuita de OpenRouter está agotada */}
                {config.aiProvider === "openrouter" &&
                  (config.openrouterModel === "openrouter/free" || config.openrouterModel?.endsWith(":free")) &&
                  openrouterQuota?.isExhausted && (
                    <div className="mx-3 my-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-950 dark:text-rose-200 flex items-start justify-between gap-3 text-xs shrink-0 shadow-xs">
                      <div className="flex items-start gap-2">
                        <IconAlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-bold text-[11px] text-rose-950 dark:text-rose-100">
                            Cuota o límite de peticiones gratuitas agotado en OpenRouter (Error 429)
                          </p>
                          <p className="text-[10px] text-rose-800/90 dark:text-rose-300/90 leading-tight">
                            {openrouterQuota.exhaustedReason ||
                              "La API no puede responder en este momento porque se ha alcanzado el límite gratuito. Espera unos minutos o cambia de modelo en Configuración."}
                          </p>
                          {openrouterQuota.lastExhaustedAt && (
                            <p className="text-[9px] text-rose-700/80 dark:text-rose-400/80 font-mono">
                              Detectado: {formatDateTime(openrouterQuota.lastExhaustedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => checkOpenRouterQuota(true)}
                          disabled={loadingQuota}
                          className="h-6 px-2 text-[10px] font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 border-transparent hover:text-white gap-1 cursor-pointer"
                        >
                          <IconRefresh className={cn("h-2.5 w-2.5", loadingQuota && "animate-spin")} />
                          {loadingQuota ? "Probando..." : "Comprobar"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setMainTab("config")}
                          className="h-6 px-2 text-[10px] font-bold rounded-lg border-rose-300 dark:border-rose-700 hover:bg-rose-500/10 cursor-pointer"
                        >
                          Cambiar Modelo
                        </Button>
                      </div>
                    </div>
                  )}

                {/* Mensajes del chat scrollables */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-zinc-50/30 dark:bg-zinc-950/20"
                >
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
                        onClick={() => handleSimulateInbound("Hola, ¿qué productos tienen disponibles?")}
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
                                <span>
                                  OmniPOS Bot IA ({config.aiProvider === "openrouter" ? "OpenRouter" : "DeepSeek"})
                                </span>
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

                          {/* Globo de mensaje — Estilo WhatsApp Elegante y Confortable para la Vista */}
                          <div
                            className={cn(
                              "px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs whitespace-pre-line relative",
                              isCustomer
                                ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white border border-zinc-200/90 dark:border-zinc-700/80 rounded-tl-xs"
                                : isBot
                                ? "bg-emerald-700 text-white dark:bg-emerald-700 dark:text-white rounded-tr-xs border border-emerald-600/30"
                                : "bg-blue-600 text-white dark:bg-blue-600 dark:text-white rounded-tr-xs border border-blue-500/30"
                            )}
                          >
                            <div>{m.text}</div>
                            <div className={cn(
                              "flex items-center justify-end gap-1 mt-1 text-[9px] font-mono",
                              isCustomer ? "text-zinc-400" : isBot ? "text-emerald-200" : "text-blue-200"
                            )}>
                              <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              {!isCustomer && <IconChecks className="h-3 w-3 inline" />}
                            </div>
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

                  {/* Indicador de "Escribiendo..." con animación de 3 puntos estilo WhatsApp */}
                  {isTyping && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-300 w-fit text-xs animate-in fade-in duration-200 shadow-2xs mr-auto">
                      <div className="flex items-center gap-1 px-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
                      </div>
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {isTyping === "ia"
                          ? "OmniPOS IA generando respuesta..."
                          : isTyping === "agente"
                          ? "Enviando respuesta..."
                          : `${selectedConv.client?.name || "Cliente"} está escribiendo...`}
                      </span>
                    </div>
                  )}

                  <div ref={chatScrollRef} />
                </div>

                {/* Banner de sesión concluida / cerrada si aplica */}
                {selectedConv.session?.status === "cerrada" && (
                  <div className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/80 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                      Conversación cerrada. El próximo mensaje del cliente abrirá un ciclo nuevo en limpio.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleSession("reopen")}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer ml-2 shrink-0"
                    >
                      Reabrir ahora
                    </button>
                  </div>
                )}

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
                      placeholder={selectedPhone.startsWith("tg_") || selectedConv?.channel === "telegram" ? "Escribe una respuesta como Agente Humano (se despachará por Telegram)..." : "Escribe una respuesta como Agente Humano (se despachará por WhatsApp)..."}
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
                  onClick={openSimModal}
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
              <>
                {/* Cabecera minimalista del Panel */}
                <div className="p-3 border-b border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Ficha del Cliente
                    </span>
                    {selectedConv.channel === "telegram" || selectedConv.phone.startsWith("tg_") ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <IconBrandTelegram className="h-3 w-3" /> Telegram
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <IconBrandWhatsapp className="h-3 w-3" /> WhatsApp
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={openContactEditor}
                      className="h-7 px-2 text-[11px] rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
                    >
                      <IconPencil className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                          title="Más opciones del contacto"
                        >
                          <IconDotsVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52 text-xs rounded-xl shadow-lg">
                        <DropdownMenuItem onClick={() => setTemplateModalOpen(true)} className="cursor-pointer gap-2">
                          <IconSpeakerphone className="h-3.5 w-3.5" />
                          Enviar Plantilla
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenCustomerOrders(selectedConv.phone)} className="cursor-pointer gap-2">
                          <IconPackage className="h-3.5 w-3.5" />
                          Historial de Pedidos
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleClearChat} className="cursor-pointer gap-2 text-amber-600 focus:text-amber-700">
                          <IconTrash className="h-3.5 w-3.5" />
                          Vaciar Historial del Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDeleteContact} className="cursor-pointer gap-2 text-rose-600 focus:text-rose-700">
                          <IconUserX className="h-3.5 w-3.5" />
                          Eliminar Contacto del CRM
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                  {/* 1. Tarjeta Resumen del Cliente (Unificada y elegante) */}
                  <div className="p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-zinc-950 dark:text-white truncate">
                          {selectedConv.client?.name || `Cliente (${selectedConv.phone.slice(-4)})`}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono truncate">
                          {selectedConv.phone.startsWith("tg_")
                            ? `ID Telegram: ${selectedConv.phone.replace("tg_", "")}`
                            : selectedConv.phone}
                        </p>
                      </div>

                      {/* Chip de estado financiero */}
                      {selectedConv.client?.creditBalance && selectedConv.client.creditBalance > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                          Debe {formatCurrency(selectedConv.client.creditBalance)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] text-zinc-400 font-medium px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shrink-0">
                          Al día ($0)
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <IconMapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 leading-tight">
                          {selectedConv.client?.address || selectedConv.latestOrder?.deliveryAddress || "Sin dirección guardada"}
                        </span>
                      </div>
                      {selectedConv.client?.email && (
                        <p className="text-[10px] text-zinc-400 pl-5 truncate">{selectedConv.client.email}</p>
                      )}
                    </div>
                  </div>

                  {/* 2. Seguimiento de Pedido Activo (Compacto y funcional) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        Último Pedido a Domicilio
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenCustomerOrders(selectedConv.phone)}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer flex items-center gap-1 text-zinc-600 dark:text-zinc-400"
                        title="Ver todos los pedidos de este cliente"
                      >
                        <IconPackage className="h-3 w-3" />
                        {selectedConv.totalOrders} {selectedConv.totalOrders === 1 ? "orden" : "órdenes"}
                      </button>
                    </div>

                    {selectedConv.latestOrder ? (
                      <div className="p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
                        {/* Cabecera del pedido */}
                        <div className="flex items-center justify-between gap-1">
                          <button
                            type="button"
                            onClick={() => setOrderDetailModalOpen(true)}
                            className="font-mono font-bold text-xs text-zinc-950 dark:text-white hover:underline flex items-center gap-1 cursor-pointer bg-white dark:bg-zinc-900 px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800"
                            title="Clic para ver detalle completo"
                          >
                            #{selectedConv.latestOrder.orderNumber}
                            <IconExternalLink className="h-3 w-3 text-zinc-400" />
                          </button>
                          {/* Badge de Estado de Envío */}
                          {(() => {
                            const st = selectedConv.latestOrder.status
                            if (st === "entregado") {
                              return <Badge className="text-[9px] font-mono uppercase bg-emerald-600 text-white py-0.5 px-1.5">✅ Entregado</Badge>
                            }
                            if (st === "en_camino") {
                              return <Badge className="text-[9px] font-mono uppercase bg-purple-600 text-white py-0.5 px-1.5">🛵 En Camino</Badge>
                            }
                            if (st === "en_preparacion") {
                              return <Badge className="text-[9px] font-mono uppercase bg-indigo-600 text-white py-0.5 px-1.5">📦 Preparando</Badge>
                            }
                            if (st === "confirmado") {
                              return <Badge className="text-[9px] font-mono uppercase bg-blue-600 text-white py-0.5 px-1.5">👍 Confirmado</Badge>
                            }
                            if (st === "cancelado") {
                              return <Badge className="text-[9px] font-mono uppercase bg-rose-600 text-white py-0.5 px-1.5">❌ Cancelado</Badge>
                            }
                            return <Badge className="text-[9px] font-mono uppercase bg-amber-500 text-white py-0.5 px-1.5">🕒 Pendiente</Badge>
                          })()}
                        </div>

                        {/* Desglose de Productos y Domicilio según zona/barrio */}
                        <div className="p-2 rounded-xl bg-zinc-100/70 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between text-zinc-500">
                            <span>Productos ({selectedConv.latestOrder.itemsCount || 1}):</span>
                            <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                              {formatCurrency(selectedConv.latestOrder.subtotal || (selectedConv.latestOrder.total - (selectedConv.latestOrder.deliveryFee || 0)))}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-zinc-600 dark:text-zinc-300 font-medium flex items-center gap-1">
                              <IconTruckDelivery className="h-3.5 w-3.5 text-zinc-400" />
                              Envío (Zona / Barrio):
                            </span>
                            <span className="font-mono font-bold text-zinc-950 dark:text-white">
                              {selectedConv.latestOrder.deliveryFee && selectedConv.latestOrder.deliveryFee > 0
                                ? formatCurrency(selectedConv.latestOrder.deliveryFee)
                                : "Sin costo ($0)"}
                            </span>
                          </div>
                        </div>

                        {/* Fila Total y Estado de Pago */}
                        <div className="flex items-center justify-between text-xs pt-0.5 pb-1 border-b border-zinc-200/60 dark:border-zinc-800/60">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[10px] text-zinc-500 font-semibold">Total a Cobrar:</span>
                            <span className="font-black font-mono text-base text-zinc-950 dark:text-white">
                              {formatCurrency(selectedConv.latestOrder.total)}
                            </span>
                          </div>
                          {selectedConv.latestOrder.paymentStatus === "pagado" ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <IconCheck className="h-2.5 w-2.5" /> Pagado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              ⏳ Pendiente
                            </span>
                          )}
                        </div>

                        {/* Micro control de Pago */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            {/* Medio de pago toggle */}
                            <div className="flex items-center bg-white dark:bg-zinc-900 rounded-lg p-0.5 border border-zinc-200 dark:border-zinc-800 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleQuickUpdatePaymentMethod(selectedConv.latestOrder!.id, "efectivo")}
                                className={cn(
                                  "px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                                  selectedConv.latestOrder.paymentMethod !== "transferencia"
                                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold shadow-2xs"
                                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                )}
                              >
                                💵 Efectivo
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickUpdatePaymentMethod(selectedConv.latestOrder!.id, "transferencia")}
                                className={cn(
                                  "px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                                  selectedConv.latestOrder.paymentMethod === "transferencia"
                                    ? "bg-purple-600 text-white font-bold shadow-2xs"
                                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                )}
                              >
                                💳 Transf
                              </button>
                            </div>

                            {/* Acción rápida de pago */}
                            {selectedConv.latestOrder.paymentStatus !== "pagado" ? (
                              <button
                                type="button"
                                onClick={() => handleQuickUpdatePaymentStatus(selectedConv.latestOrder!.id, "pagado")}
                                className="h-6 px-2.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs inline-flex items-center gap-1 cursor-pointer transition-all"
                              >
                                <IconCheck className="h-3 w-3" />
                                Confirmar Pago
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleQuickUpdatePaymentStatus(selectedConv.latestOrder!.id, "pendiente")}
                                className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline cursor-pointer"
                              >
                                Revertir pago
                              </button>
                            )}
                          </div>

                          {/* Hint de cobro ultra-compacto */}
                          <div className="text-[10px] leading-tight text-zinc-600 dark:text-zinc-400">
                            {selectedConv.latestOrder.paymentStatus === "pagado" ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                ✓ Liquidado (Cobrar $0 al cliente)
                              </span>
                            ) : selectedConv.latestOrder.paymentMethod === "transferencia" ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                ⚠️ Verificar comprobante de transferencia
                              </span>
                            ) : (
                              <span className="text-blue-600 dark:text-blue-400 font-medium">
                                💵 Cobrar {formatCurrency(selectedConv.latestOrder.total)} contraentrega
                                {(selectedConv.latestOrder.deliveryFee || 0) > 0 && (
                                  <span className="text-[9px] text-zinc-500 block">
                                    ({formatCurrency(selectedConv.latestOrder.subtotal || selectedConv.latestOrder.total - (selectedConv.latestOrder.deliveryFee || 0))} productos + {formatCurrency(selectedConv.latestOrder.deliveryFee || 0)} envío)
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cambio de estado de envío */}
                        <div className="space-y-1 pt-1">
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "en_preparacion")}
                              className={cn(
                                "py-1 px-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer text-center",
                                selectedConv.latestOrder.status === "en_preparacion"
                                  ? "bg-indigo-600 text-white font-bold shadow-2xs"
                                  : "bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                              )}
                            >
                              📦 Preparar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "en_camino")}
                              className={cn(
                                "py-1 px-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer text-center",
                                selectedConv.latestOrder.status === "en_camino"
                                  ? "bg-purple-600 text-white font-bold shadow-2xs"
                                  : "bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                              )}
                            >
                              🛵 En Camino
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "entregado")}
                              className={cn(
                                "py-1 px-1 rounded-lg text-[10px] font-semibold transition-all cursor-pointer text-center",
                                selectedConv.latestOrder.status === "entregado"
                                  ? "bg-emerald-600 text-white font-bold shadow-2xs"
                                  : "bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800"
                              )}
                            >
                              ✅ Entregado
                            </button>
                          </div>

                          {/* Fila secundaria: pendiente, cancelar y ver detalle */}
                          <div className="flex items-center justify-between text-[10px] px-0.5 pt-0.5 text-zinc-500">
                            <button
                              type="button"
                              onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "pendiente")}
                              className="hover:text-zinc-900 dark:hover:text-white underline cursor-pointer"
                            >
                              🕒 Pendiente
                            </button>
                            <button
                              type="button"
                              onClick={() => setOrderDetailModalOpen(true)}
                              className="font-semibold text-zinc-700 dark:text-zinc-300 hover:underline cursor-pointer flex items-center gap-0.5"
                            >
                              <IconFileText className="h-3 w-3" />
                              {selectedConv.latestOrder.itemsCount} {selectedConv.latestOrder.itemsCount === 1 ? "prod" : "prods"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("¿Estás seguro de cancelar este pedido? Se restaurará el inventario.")) {
                                  handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, "cancelado")
                                }
                              }}
                              className="text-rose-500 hover:text-rose-700 underline cursor-pointer"
                            >
                              ❌ Cancelar
                            </button>
                          </div>
                        </div>

                        {/* Repartidor y dirección en 1 línea compacta */}
                        <div className="pt-1.5 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[10px] text-zinc-500 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <IconTruckDelivery className="h-3 w-3 text-zinc-400 shrink-0" />
                            <span className="truncate">{selectedConv.latestOrder.deliveryDriverName || "Sin repartidor asignado"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 truncate">
                            <IconMapPin className="h-3 w-3 shrink-0 text-zinc-400" />
                            <span className="truncate">{selectedConv.latestOrder.deliveryAddress || "Dirección según chat"}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 text-center text-xs text-zinc-400 border border-dashed rounded-xl bg-zinc-50/50 dark:bg-zinc-950/20">
                        Sin pedidos registrados para este contacto.
                      </div>
                    )}
                  </div>

                  {/* Tarjeta de Consumo de Tokens & Gasto IA de este Cliente */}
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <IconBolt className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        <span className="text-[11px] font-bold text-purple-950 dark:text-purple-200">
                          Consumo de Tokens & Gasto IA
                        </span>
                      </div>
                      {selectedConv.aiUsage && selectedConv.aiUsage.totalReplies > 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] px-1.5 py-0 font-mono",
                            selectedConv.aiUsage.isFreePlan
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                              : "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
                          )}
                        >
                          {selectedConv.aiUsage.isFreePlan ? "🎁 Plan Gratis ($0)" : "⚡ Modelo Pago"}
                        </Badge>
                      )}
                    </div>

                    {selectedConv.aiUsage && selectedConv.aiUsage.totalTokens > 0 ? (
                      <div className="space-y-2 text-xs">
                        {/* Métricas principales */}
                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-purple-500/10">
                            <span className="text-[9px] text-muted-foreground block">Tokens Acumulados</span>
                            <span className="font-mono font-black text-sm text-purple-950 dark:text-purple-200 block">
                              {selectedConv.aiUsage.totalTokens.toLocaleString()}
                            </span>
                            <span className="text-[9px] text-zinc-500 block">
                              {selectedConv.aiUsage.totalReplies} {selectedConv.aiUsage.totalReplies === 1 ? "respuesta" : "respuestas"}
                            </span>
                          </div>

                          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-purple-500/10">
                            <span className="text-[9px] text-muted-foreground block">Gasto Estimado IA</span>
                            <span className="font-mono font-black text-sm text-foreground block">
                              {selectedConv.aiUsage.isFreePlan ||
                              (config.aiProvider === "openrouter" && (config.openrouterModel === "openrouter/free" || config.openrouterModel?.includes("free"))) ||
                              (selectedConv.aiUsage.lastModelUsed && selectedConv.aiUsage.lastModelUsed.toLowerCase().includes("free"))
                                ? "$0 COP (Gratis)"
                                : `$${Number(selectedConv.aiUsage.estimatedCostUsd).toFixed(4)} USD`}
                            </span>
                            <span className="text-[9px] text-zinc-500 block">
                              {selectedConv.aiUsage.isFreePlan ||
                              (config.aiProvider === "openrouter" && (config.openrouterModel === "openrouter/free" || config.openrouterModel?.includes("free"))) ||
                              (selectedConv.aiUsage.lastModelUsed && selectedConv.aiUsage.lastModelUsed.toLowerCase().includes("free"))
                                ? "🎁 Plan Gratuito ($0 facturados)"
                                : `~$${Math.round((selectedConv.aiUsage.estimatedCostUsd || 0) * 4200).toLocaleString("es-CO")} COP`}
                            </span>
                          </div>
                        </div>

                        {/* Desglose Entrada vs Salida */}
                        <div className="p-2 rounded-lg bg-white/70 dark:bg-zinc-900/70 border border-purple-500/10 text-[10px] space-y-1">
                          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                            <span>Tokens Entrada (Prompt):</span>
                            <span className="font-mono font-semibold">
                              {selectedConv.aiUsage.promptTokens.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                            <span>Tokens Salida (Respuestas):</span>
                            <span className="font-mono font-semibold">
                              {selectedConv.aiUsage.completionTokens.toLocaleString()}
                            </span>
                          </div>
                          {selectedConv.aiUsage.lastModelUsed && (
                            <div className="pt-1 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-zinc-500">
                              <span>Último modelo:</span>
                              <span className="font-mono font-medium truncate max-w-[130px]" title={selectedConv.aiUsage.lastModelUsed}>
                                {selectedConv.aiUsage.lastModelUsed.split("/")[1] || selectedConv.aiUsage.lastModelUsed}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Botones de acción */}
                        <div className="flex items-center justify-between pt-0.5">
                          {selectedConv.aiUsage.history && selectedConv.aiUsage.history.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClientUsageDetail(selectedConv.aiUsage!)
                                setHistoryModalOpen(true)
                              }}
                              className="text-[10px] text-purple-700 dark:text-purple-300 hover:underline font-semibold cursor-pointer"
                            >
                              Ver historial ({selectedConv.aiUsage.history.length})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResetClientAiTokens(selectedConv.phone)}
                            className="text-[10px] text-rose-500 hover:text-rose-700 hover:underline ml-auto cursor-pointer"
                          >
                            Restablecer a 0
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 text-center text-[10px] text-zinc-500 rounded-lg bg-white/40 dark:bg-zinc-900/40 border border-dashed border-purple-500/20">
                        Este cliente aún no ha generado consumo de tokens con el bot IA.
                      </div>
                    )}
                  </div>

                  {/* 3. Botón Elegante de Promoción */}
                  <div className="pt-1">
                    <Button
                      onClick={() => setTemplateModalOpen(true)}
                      variant="outline"
                      className="w-full h-8 text-xs rounded-xl gap-1.5 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
                    >
                      <IconSpeakerphone className="h-3.5 w-3.5" />
                      Enviar Plantilla Promocional
                    </Button>
                  </div>
                </div>
              </>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">Plantillas de Difusión WhatsApp</h2>
              <p className="text-xs text-zinc-500">Envía promociones y recordatorios personalizados con un solo clic.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncTemplates}
                disabled={syncingTemplates}
                className="rounded-xl h-9 text-xs font-semibold border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 gap-1.5 cursor-pointer shadow-2xs"
                title="Sincronizar plantillas oficiales aprobadas directamente desde Meta Cloud API"
              >
                <IconRefresh className={cn("h-3.5 w-3.5", syncingTemplates && "animate-spin")} />
                {syncingTemplates ? "Sincronizando..." : "Sincronizar con Meta"}
              </Button>
              <Button
                onClick={() => handleSendBroadcast(false)}
                className="rounded-xl h-9 text-xs font-bold bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 gap-1.5 shadow-2xs"
              >
                <IconSpeakerphone className="h-4 w-4" />
                Enviar Difusión a Todos ({conversations.length})
              </Button>
            </div>
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
            {/* Tarjeta 1: Motor de Inteligencia Artificial Dual (OpenRouter & DeepSeek) */}
            <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconCpu className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                    <CardTitle className="text-sm font-bold text-zinc-950 dark:text-white">
                      Motor de IA (OpenRouter & DeepSeek)
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
                  Usa OpenRouter para seleccionar cualquier modelo (Claude 3.5, GPT-4o, Gemini 2.0, Llama 3.3) o conecta DeepSeek directo.
                </p>
              </CardHeader>

              <CardContent className="p-4 space-y-3.5">
                {/* Selector de Proveedor de IA */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Proveedor de Inteligencia Artificial
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, aiProvider: "openrouter" }))}
                      className={cn(
                        "flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                        config.aiProvider === "openrouter"
                          ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500 text-purple-950 dark:text-purple-200"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50"
                      )}
                    >
                      <div className="flex items-center gap-1.5 w-full justify-between">
                        <span className="text-xs font-bold flex items-center gap-1">
                          🟣 OpenRouter
                        </span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                          Multi-Modelo
                        </Badge>
                      </div>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                        Claude, GPT-4o, Gemini, Llama, DeepSeek
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfig((c) => ({ ...c, aiProvider: "deepseek" }))}
                      className={cn(
                        "flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                        config.aiProvider !== "openrouter"
                          ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 text-blue-950 dark:text-blue-200"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50"
                      )}
                    >
                      <div className="flex items-center gap-1.5 w-full justify-between">
                        <span className="text-xs font-bold flex items-center gap-1">
                          🔵 DeepSeek Directo
                        </span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                          Oficial
                        </Badge>
                      </div>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                        API oficial de DeepSeek (Chat V3 / Reasoner R1)
                      </span>
                    </button>
                  </div>
                </div>

                {/* BLOQUE OPENROUTER */}
                {config.aiProvider === "openrouter" && (
                  <div className="space-y-3 pt-1 border-t border-purple-500/20">
                    {/* OpenRouter API Key */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          OpenRouter API Key (Token Secreto) *
                        </Label>
                        <a
                          href="https://openrouter.ai/keys"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
                        >
                          Obtener Token en OpenRouter <IconExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                      <div className="relative">
                        <Input
                          type={showOpenRouterKey ? "text" : "password"}
                          value={config.openrouterApiKey || ""}
                          onChange={(e) => setConfig((c) => ({ ...c, openrouterApiKey: e.target.value }))}
                          placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx"
                          className="pr-10 h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          {showOpenRouterKey ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Selector de Modelo OpenRouter */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold flex items-center gap-1.5">
                          <span>Modelo de IA en OpenRouter</span>
                          {(config.openrouterModel === "openrouter/free" || config.openrouterModel?.endsWith(":free")) && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                              100% Gratis
                            </Badge>
                          )}
                        </Label>
                        <a
                          href="https://openrouter.ai/models?pricing=free"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-zinc-500 hover:text-zinc-950 dark:hover:text-white underline flex items-center gap-0.5"
                        >
                          Ver catálogo completo <IconExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>

                      <Select
                        value={isCustomModel ? "__custom__" : (config.openrouterModel || "openrouter/free")}
                        onValueChange={(val) => {
                          if (val === "__custom__") {
                            setIsCustomModel(true)
                          } else {
                            setIsCustomModel(false)
                            setConfig((c) => ({ ...c, openrouterModel: val }))
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs rounded-xl bg-zinc-50 dark:bg-zinc-950">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="text-xs rounded-xl max-h-80">
                          {/* GRUPO MODELOS 100% GRATIS */}
                          <SelectGroup>
                            <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 px-2 py-1">
                              🎁 Modelos 100% Gratuitos (0 Costo / Ahorro Tokens)
                            </SelectLabel>
                            {CURATED_OPENROUTER_MODELS.filter((m) => m.isFree).map((m) => (
                              <SelectItem key={m.id} value={m.id} className="py-1.5 cursor-pointer">
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <span className="font-semibold text-emerald-950 dark:text-emerald-200">
                                    {m.name}
                                  </span>
                                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                                    {m.badge}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          <SelectSeparator />

                          {/* GRUPO MODELOS DE PAGO */}
                          <SelectGroup>
                            <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                              ⚡ Modelos Estándar / Pago
                            </SelectLabel>
                            {CURATED_OPENROUTER_MODELS.filter((m) => !m.isFree).map((m) => (
                              <SelectItem key={m.id} value={m.id} className="py-1.5 cursor-pointer">
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <span className="font-semibold">{m.name}</span>
                                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                                    {m.badge}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>

                          <SelectSeparator />

                          <SelectItem value="__custom__" className="py-1.5 font-bold text-purple-600 dark:text-purple-400 cursor-pointer">
                            ✏️ Otro modelo (Escribir ID personalizado)
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Accesos rápidos a Modo Gratuito */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomModel(false)
                            setConfig((c) => ({ ...c, openrouterModel: "openrouter/free" }))
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border",
                            config.openrouterModel === "openrouter/free"
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/40"
                              : "bg-muted/40 hover:bg-muted border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          🎁 Activar Router Free (openrouter/free)
                        </button>

                        <a
                          href="https://openrouter.ai/openrouter/free"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-zinc-500 hover:text-foreground underline flex items-center gap-0.5"
                        >
                          Docs Free Router <IconExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>

                      {/* Notificación y Monitor de Cuota cuando un modelo gratuito está activo */}
                      {(config.openrouterModel === "openrouter/free" || config.openrouterModel?.endsWith(":free")) && (
                        <div className="space-y-2 pt-1">
                          {/* Banner informativo modo free */}
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                            <span className="text-base shrink-0">✨</span>
                            <div className="space-y-0.5">
                              <p className="font-bold">Modo 100% Gratuito Activado ({config.openrouterModel})</p>
                              <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/80">
                                OpenRouter procesará los mensajes sin consumir saldo ($0 USD). Ideal para ahorrar tokens y reducir costos a cero.
                              </p>
                            </div>
                          </div>

                          {/* Monitor en vivo de estado y cuota */}
                          <div
                            className={cn(
                              "p-3 rounded-2xl border transition-all space-y-2.5",
                              openrouterQuota?.isExhausted
                                ? "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
                                : "bg-zinc-50/80 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {openrouterQuota?.isExhausted ? (
                                  <IconAlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                                ) : (
                                  <IconSparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                )}
                                <div>
                                  <h4 className="text-xs font-bold leading-tight">
                                    {openrouterQuota?.isExhausted
                                      ? "⚠️ Cuota Free Agotada / Límite Alcanzado (429)"
                                      : "Monitor de Cuota & Peticiones Gratuitas"}
                                  </h4>
                                  <p className="text-[10px] text-muted-foreground">
                                    Estado en tiempo real para OpenRouter Free Tier
                                  </p>
                                </div>
                              </div>

                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => checkOpenRouterQuota(true)}
                                disabled={loadingQuota}
                                className={cn(
                                  "h-7 px-2.5 text-[11px] font-bold rounded-lg gap-1.5 cursor-pointer shadow-xs",
                                  openrouterQuota?.isExhausted
                                    ? "bg-rose-600 text-white hover:bg-rose-700 border-transparent hover:text-white"
                                    : "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100"
                                )}
                              >
                                <IconRefresh className={cn("h-3 w-3", loadingQuota && "animate-spin")} />
                                {loadingQuota ? "Probando..." : "Comprobar en Vivo"}
                              </Button>
                            </div>

                            {/* Detalle si está agotado o disponible */}
                            {openrouterQuota?.isExhausted ? (
                              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] space-y-1.5">
                                <p className="font-bold text-rose-950 dark:text-rose-100">
                                  La API de OpenRouter ha consumido el cupo o límite de peticiones gratuitas.
                                </p>
                                <p className="text-[10px] text-rose-900/90 dark:text-rose-300/90 leading-relaxed">
                                  {openrouterQuota.exhaustedReason ||
                                    "Error 429: Se ha superado el límite de llamadas gratuitas por minuto o por cuota diaria en OpenRouter."}
                                </p>
                                {openrouterQuota.lastExhaustedAt && (
                                  <p className="text-[9px] text-rose-700/80 dark:text-rose-400/80 font-mono">
                                    Último error registrado: {formatDateTime(openrouterQuota.lastExhaustedAt)}
                                  </p>
                                )}
                                <div className="pt-1 border-t border-rose-500/20 text-[10px] text-rose-950 dark:text-rose-200">
                                  💡 <strong>Sugerencia:</strong> Usa <strong>openrouter/free</strong> (router automático), el cual rota dinámicamente entre múltiples modelos gratuitos disponibles en la plataforma para evitar congestión en uno solo.
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                                <div className="p-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                                  <span className="text-[10px] text-muted-foreground block">Estado Peticiones</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                                    Gratis Disponibles
                                  </span>
                                </div>

                                <div className="p-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                                  <span className="text-[10px] text-muted-foreground block">Límite por Tasa</span>
                                  <span className="font-mono font-bold text-foreground">
                                    {openrouterQuota?.keyInfo?.rateLimit
                                      ? `${openrouterQuota.keyInfo.rateLimit.requests} req / ${openrouterQuota.keyInfo.rateLimit.interval}`
                                      : "20 req / min (Free)"}
                                  </span>
                                </div>

                                <div className="p-2 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 col-span-2 sm:col-span-1">
                                  <span className="text-[10px] text-muted-foreground block">Consumo Cuenta</span>
                                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {openrouterQuota?.keyInfo?.usageUsd !== undefined
                                      ? `$${Number(openrouterQuota.keyInfo.usageUsd).toFixed(4)} USD`
                                      : "$0.00 USD"}
                                  </span>
                                </div>
                              </div>
                            )}

                            {openrouterQuota?.probeLatency && (
                              <div className="text-[9px] text-muted-foreground font-mono flex items-center justify-between px-0.5">
                                <span>Verificación en vivo: Exitoso ({openrouterQuota.probeLatency}ms)</span>
                                <span>OpenRouter Free Router</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Campo de ID de modelo personalizado */}
                    {isCustomModel && (
                      <div className="space-y-1 p-2 rounded-xl bg-purple-500/5 border border-purple-500/20">
                        <Label className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                          ID Exacto del Modelo en OpenRouter
                        </Label>
                        <Input
                          type="text"
                          value={customOpenRouterModel}
                          onChange={(e) => {
                            setCustomOpenRouterModel(e.target.value)
                            setConfig((c) => ({ ...c, openrouterModel: e.target.value }))
                          }}
                          placeholder="Ej: openrouter/free o meta-llama/llama-3.2-3b-instruct:free"
                          className="h-8 text-xs font-mono bg-white dark:bg-zinc-950"
                        />
                        <span className="text-[10px] text-zinc-500">
                          Puedes usar el sufijo <code>:free</code> para cualquier modelo gratuito del catálogo.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* BLOQUE DEEPSEEK DIRECTO */}
                {config.aiProvider !== "openrouter" && (
                  <div className="space-y-3 pt-1 border-t border-blue-500/20">
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

                    {/* Modelo DeepSeek */}
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
                  </div>
                )}

                {/* Tokens Máximos & Botón de Prueba */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">Tokens Máx. por Respuesta</Label>
                    <Input
                      type="number"
                      value={config.maxTokensPerReply}
                      onChange={(e) => setConfig((c) => ({ ...c, maxTokensPerReply: parseInt(e.target.value, 10) || 250 }))}
                      className="h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                    />
                  </div>

                  <div className="space-y-1 flex flex-col justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleTestAi()}
                      disabled={testingAi}
                      className="w-full text-xs h-9 rounded-xl gap-1.5 border-zinc-300 dark:border-zinc-700 cursor-pointer"
                    >
                      <IconBolt className={cn("h-3.5 w-3.5", testingAi && "animate-spin")} />
                      {testingAi
                        ? "Probando conexión…"
                        : config.aiProvider === "openrouter"
                        ? "⚡ Probar OpenRouter"
                        : "⚡ Probar DeepSeek"}
                    </Button>
                  </div>
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

              {/* Tarjeta 3: Conexión Telegram (BotFather) */}
              <Card className="rounded-2xl border-zinc-200 dark:border-zinc-800 shadow-sm">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconBrandTelegram className="h-4 w-4 text-blue-500" />
                      <CardTitle className="text-sm font-bold text-zinc-950 dark:text-white">
                        Conexión Telegram (BotFather)
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        {config.telegramEnabled ? "Activo" : "Inactivo"}
                      </span>
                      <Switch
                        checked={Boolean(config.telegramEnabled)}
                        onCheckedChange={(checked) => setConfig((c) => ({ ...c, telegramEnabled: checked }))}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Conecta un bot oficial de Telegram creado en @BotFather para responder clientes y tomar pedidos por Telegram.
                  </p>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  {/* Token de Telegram */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold">Telegram Bot Token (HTTP API)</Label>
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        Crear Bot en @BotFather <IconExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="relative">
                      <Input
                        type={showTelegramToken ? "text" : "password"}
                        value={config.telegramBotToken || ""}
                        onChange={(e) => setConfig((c) => ({ ...c, telegramBotToken: e.target.value }))}
                        placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567"
                        className="pr-10 h-9 text-xs font-mono bg-zinc-50 dark:bg-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTelegramToken(!showTelegramToken)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showTelegramToken ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Bot Conectado Info */}
                  {config.telegramBotUsername && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-xs">
                      <div className="flex items-center gap-2">
                        <IconBrandTelegram className="h-4 w-4 text-blue-500 shrink-0" />
                        <div>
                          <p className="font-bold text-blue-950 dark:text-blue-100">
                            Bot Vinculado: <span className="font-mono text-blue-600 dark:text-blue-400">{config.telegramBotUsername}</span>
                          </p>
                          <p className="text-[11px] text-blue-800 dark:text-blue-300">
                            Atendiendo clientes de {activeBranch?.name || "esta sede"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`https://t.me/${config.telegramBotUsername.replace("@", "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline px-2 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 flex items-center gap-1"
                        >
                          Abrir Chat <IconExternalLink className="h-3 w-3" />
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleDisconnectTelegram}
                          className="h-7 text-[11px] text-rose-600 hover:text-rose-700 px-2 cursor-pointer"
                        >
                          Desvincular
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Botón de Conexión & Webhook */}
                  <div className="space-y-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestTelegram}
                      disabled={testingTelegram}
                      className="w-full text-xs h-9 rounded-xl gap-1.5 border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-blue-700 dark:text-blue-300 cursor-pointer"
                    >
                      <IconBrandTelegram className={cn("h-4 w-4 text-blue-500", testingTelegram && "animate-spin")} />
                      {testingTelegram ? "Verificando con Telegram…" : "Probar y Conectar Bot de Telegram"}
                    </Button>

                    {/* Webhook URL Helper */}
                    <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
                        URL Webhook de Telegram para esta sede
                      </span>
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-zinc-900 border text-[11px] font-mono">
                        <span className="truncate">{tgWebhookUrl}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(tgWebhookUrl, "tg_url")}
                          className="h-6 text-[10px] px-2 cursor-pointer"
                        >
                          {copiedTgWebhook ? <IconCheck className="h-3 w-3 text-emerald-600" /> : <IconCopy className="h-3 w-3" />}
                        </Button>
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Al hacer clic en &quot;Probar y Conectar&quot;, OmniPOS registra este webhook automáticamente en los servidores de Telegram.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tarjeta 4: Optimización y Ahorro de Tokens */}
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
              Prueba la respuesta autónoma de{" "}
              <strong>
                {config.aiProvider === "openrouter"
                  ? `OpenRouter (${config.openrouterModel || "deepseek/deepseek-chat"})`
                  : `DeepSeek IA (${config.deepseekModel})`}
              </strong>{" "}
              con el catálogo exclusivo de <strong>{activeBranch?.name || "esta sede"}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {/* Selector de Canal a Simular */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px] font-semibold text-zinc-500">Canal de entrada:</span>
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSimChannel("whatsapp")
                    if (simPhone.startsWith("tg_")) setSimPhone("+573105551234")
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer",
                    simChannel === "whatsapp"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  <IconBrandWhatsapp className="h-3.5 w-3.5" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSimChannel("telegram")
                    if (!simPhone.startsWith("tg_")) setSimPhone("tg_573105551234")
                  }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer",
                    simChannel === "telegram"
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                  )}
                >
                  <IconBrandTelegram className="h-3.5 w-3.5" /> Telegram
                </button>
              </div>
            </div>

            {/* Datos del Cliente simulado */}
            <div className="grid grid-cols-2 gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">
                  {simChannel === "telegram" ? "Telegram Chat ID / User" : "Teléfono / WhatsApp"}
                </Label>
                <Input
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  placeholder={simChannel === "telegram" ? "tg_573105551234" : "+573105551234"}
                  className="h-8 text-xs font-mono rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold">Nombre del Cliente</Label>
                <Input
                  value={simCustomerName}
                  onChange={(e) => setSimCustomerName(e.target.value)}
                  placeholder={simChannel === "telegram" ? "Carlos (Telegram)" : "Carlos Mendoza"}
                  className="h-8 text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Mensaje del Cliente</Label>
              <Textarea
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                placeholder="Ej: Hola, ¿cuánto vale el Alcohol? Mándame 2 a la Carrera 15 # 45-20"
                className="text-xs h-20 rounded-xl resize-none"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-zinc-400 block">Pruebas rápidas:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "/start",
                  "Hola, ¿qué productos tienen disponibles?",
                  "¿Cuánto vale el Alcohol Antiséptico y el Acetaminofén?",
                  "Envíame 1 Alcohol Antiséptico a la Carrera 15 # 45-20",
                  "¿Cuánto debo de fiado?",
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
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Seleccionar Plantilla</Label>
                <button
                  type="button"
                  onClick={handleSyncTemplates}
                  disabled={syncingTemplates}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <IconRefresh className={cn("h-3 w-3", syncingTemplates && "animate-spin")} />
                  {syncingTemplates ? "Sincronizando..." : "Sincronizar con Meta"}
                </button>
              </div>
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

      {/* Modal 4: Detalle Completo y Gestión del Pedido */}
      <Dialog open={orderDetailModalOpen} onOpenChange={setOrderDetailModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          {selectedConv?.latestOrder && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-base font-bold flex items-center gap-2">
                    <IconPackage className="h-4 w-4" /> Pedido #{selectedConv.latestOrder.orderNumber}
                  </DialogTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {new Date(selectedConv.latestOrder.createdAt).toLocaleDateString([], {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Badge>
                </div>
                <DialogDescription className="text-xs">
                  Cliente: <strong>{selectedConv.client?.name || selectedConv.phone}</strong> · Sede:{" "}
                  <strong>{activeBranch?.name || "Principal"}</strong>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5 pt-2 text-xs">
                {/* 1. Control de Pago en Modal */}
                <div
                  className={cn(
                    "p-3 rounded-xl border space-y-2",
                    selectedConv.latestOrder.paymentStatus === "pagado"
                      ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
                      : selectedConv.latestOrder.paymentMethod === "transferencia"
                      ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50"
                      : "bg-blue-50/60 dark:bg-zinc-900 border-blue-200 dark:border-zinc-800"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                      Gestión de Pago
                    </span>
                    {selectedConv.latestOrder.paymentStatus === "pagado" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                        <IconCheck className="h-3 w-3" /> Pago Confirmado / Pagado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500 text-white">
                        Pendiente de Pago
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-zinc-500">Forma de pago registrada:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickUpdatePaymentMethod(selectedConv.latestOrder!.id, "efectivo")}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer",
                          selectedConv.latestOrder.paymentMethod !== "transferencia"
                            ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold"
                            : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border"
                        )}
                      >
                        💵 Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickUpdatePaymentMethod(selectedConv.latestOrder!.id, "transferencia")}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer",
                          selectedConv.latestOrder.paymentMethod === "transferencia"
                            ? "bg-purple-600 text-white font-bold"
                            : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border"
                        )}
                      >
                        💳 Transferencia
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    {selectedConv.latestOrder.paymentStatus !== "pagado" ? (
                      <Button
                        size="sm"
                        onClick={() => handleQuickUpdatePaymentStatus(selectedConv.latestOrder!.id, "pagado")}
                        className="w-full h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <IconCheck className="h-4 w-4" />
                        Confirmar Pago Recibido (Marcar Pagado y Pasar a Ventas)
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickUpdatePaymentStatus(selectedConv.latestOrder!.id, "pendiente")}
                        className="w-full h-7 text-[11px] text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 cursor-pointer"
                      >
                        Revertir estado a Pendiente de Pago
                      </Button>
                    )}
                  </div>
                </div>

                {/* 2. Control de Estado de Envío */}
                <div className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-500">
                      Estado del Domicilio / Envío
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">
                      Actual: {selectedConv.latestOrder.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[
                      { key: "pendiente", label: "🕒 Pendiente" },
                      { key: "en_preparacion", label: "📦 Preparar" },
                      { key: "en_camino", label: "🛵 En Camino" },
                      { key: "entregado", label: "✅ Entregado" },
                    ].map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => handleQuickUpdateOrderStatus(selectedConv.latestOrder!.id, st.key)}
                        className={cn(
                          "py-1.5 px-1 rounded-lg text-[10px] font-semibold text-center transition-all cursor-pointer",
                          selectedConv.latestOrder?.status === st.key
                            ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-bold shadow-2xs"
                            : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
                        )}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Items del Pedido */}
                <div className="space-y-1.5">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-400 block">
                    Productos Solicitados ({selectedConv.latestOrder.items?.length || selectedConv.latestOrder.itemsCount})
                  </span>
                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                    {selectedConv.latestOrder.items && selectedConv.latestOrder.items.length > 0 ? (
                      selectedConv.latestOrder.items.map((it) => (
                        <div key={it.id} className="py-1.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-zinc-950 dark:text-white">
                              {it.quantity} × {it.name}
                            </span>
                            <span className="text-[10px] text-zinc-400 block font-mono">
                              Unitario: {formatCurrency(it.unitPrice)}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-zinc-950 dark:text-white">
                            {formatCurrency(it.subtotal)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-zinc-400 py-2 text-center text-xs">Desglose de productos registrado en orden</p>
                    )}
                  </div>
                </div>

                {/* 4. Datos de Entrega y Notas */}
                <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <p>
                    <strong>Dirección de Entrega:</strong>{" "}
                    {selectedConv.latestOrder.deliveryAddress || "Dirección según conversación"}
                  </p>
                  {selectedConv.latestOrder.deliveryDriverName && (
                    <p>
                      <strong>Domiciliario Asignado:</strong> {selectedConv.latestOrder.deliveryDriverName}{" "}
                      {selectedConv.latestOrder.deliveryDriverPhone ? `(${selectedConv.latestOrder.deliveryDriverPhone})` : ""}
                    </p>
                  )}
                  {selectedConv.latestOrder.deliveryNotes && (
                    <p className="text-[11px] text-zinc-500 italic">
                      <strong>Instrucciones:</strong> {selectedConv.latestOrder.deliveryNotes}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setOrderDetailModalOpen(false)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal 5: Historial de Órdenes del Cliente */}
      <Dialog open={customerOrdersModalOpen} onOpenChange={setCustomerOrdersModalOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconPackage className="h-4 w-4" /> Historial de Pedidos del Cliente
            </DialogTitle>
            <DialogDescription className="text-xs">
              Todos los pedidos registrados para <strong>{selectedConv?.client?.name || selectedConv?.phone}</strong> en esta sede.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
            {loadingCustomerOrders ? (
              <div className="py-8 text-center text-zinc-400 text-xs">
                <IconRefresh className="h-5 w-5 animate-spin mx-auto mb-2 text-zinc-400" />
                Cargando pedidos del cliente…
              </div>
            ) : customerOrdersList.length === 0 ? (
              <div className="py-8 text-center text-zinc-400 text-xs">
                No se encontraron órdenes registradas para este número.
              </div>
            ) : (
              customerOrdersList.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-zinc-950 dark:text-white">
                      #{ord.orderNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[9px] uppercase font-mono">
                        {ord.status}
                      </Badge>
                      {ord.paymentStatus === "pagado" ? (
                        <Badge className="text-[9px] bg-emerald-600 text-white font-mono">
                          Pagado
                        </Badge>
                      ) : (
                        <Badge className="text-[9px] bg-amber-500 text-white font-mono">
                          {ord.paymentMethod === "transferencia" ? "Transf. Pendiente" : "Efectivo Pendiente"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{new Date(ord.createdAt).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="font-mono font-bold text-zinc-950 dark:text-white text-xs">
                      {formatCurrency(ord.total)}
                    </span>
                  </div>

                  {/* Acciones rápidas para esta orden */}
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickUpdateOrderStatus(ord.id, "en_preparacion")}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 transition-colors"
                      >
                        Preparar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickUpdateOrderStatus(ord.id, "en_camino")}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 hover:bg-purple-200 transition-colors"
                      >
                        En Camino
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickUpdateOrderStatus(ord.id, "entregado")}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 transition-colors"
                      >
                        Entregado
                      </button>
                    </div>

                    {ord.paymentStatus !== "pagado" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          handleQuickUpdatePaymentStatus(ord.id, "pagado")
                          setCustomerOrdersList((prev) =>
                            prev.map((o) => (o.id === ord.id ? { ...o, paymentStatus: "pagado" } : o))
                          )
                        }}
                        className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                      >
                        <IconCheck className="h-3 w-3 mr-0.5" /> Confirmar Pago
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setCustomerOrdersModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL: RANKING Y REPORTE DE CONSUMO DE TOKENS POR CLIENTE */}
      {/* ========================================================= */}
      <Dialog open={aiUsageModalOpen} onOpenChange={setAiUsageModalOpen}>
        <DialogContent className="max-w-3xl rounded-2xl max-h-[90vh] flex flex-col p-4 sm:p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <IconBolt className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-black">
                  Consumo de Tokens & Gasto IA por Cliente
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Monitorea el total de tokens consumidos y el costo generado por cada cliente atendido por la IA.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Tarjetas de Resumen Global */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 shrink-0">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <span className="text-[10px] text-purple-900/80 dark:text-purple-300/80 font-medium block">
                Total Tokens Consumidos
              </span>
              <span className="font-mono font-black text-base text-purple-950 dark:text-purple-100">
                {(aiUsageReport?.summary?.totalTokens || 0).toLocaleString()}
              </span>
              <span className="text-[9px] text-muted-foreground block">
                {aiUsageReport?.summary?.promptTokens?.toLocaleString() || 0} in / {aiUsageReport?.summary?.completionTokens?.toLocaleString() || 0} out
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-900/80 dark:text-emerald-300/80 font-medium block">
                Gasto Estimado Total
              </span>
              <span className="font-mono font-black text-base text-emerald-950 dark:text-emerald-100">
                ${(aiUsageReport?.summary?.totalCostUsd || 0).toFixed(4)} USD
              </span>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400 font-semibold block">
                ~${Math.round((aiUsageReport?.summary?.totalCostUsd || 0) * 4200).toLocaleString("es-CO")} COP
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Clientes Atendidos
              </span>
              <span className="font-mono font-black text-base text-foreground">
                {aiUsageReport?.summary?.totalClients || 0}
              </span>
              <span className="text-[9px] text-muted-foreground block">
                Con interacciones IA
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-muted-foreground font-medium block">
                Respuestas Generadas
              </span>
              <span className="font-mono font-black text-base text-foreground">
                {aiUsageReport?.summary?.totalReplies || 0}
              </span>
              <span className="text-[9px] text-muted-foreground block">
                {aiUsageReport?.summary?.freeModelReplies || 0} en modo free ($0)
              </span>
            </div>
          </div>

          {/* Buscador de clientes */}
          <div className="pt-2 flex items-center gap-2 shrink-0">
            <div className="relative flex-1">
              <IconSearch className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Buscar por nombre de cliente o teléfono..."
                value={aiUsageSearch}
                onChange={(e) => setAiUsageSearch(e.target.value)}
                className="h-8 pl-8 text-xs rounded-xl"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={fetchAiUsageReport}
              disabled={loadingAiUsageReport}
              className="h-8 text-xs rounded-xl gap-1"
            >
              <IconRefresh className={cn("h-3 w-3", loadingAiUsageReport && "animate-spin")} />
              Actualizar
            </Button>
          </div>

          {/* Tabla / Lista de Clientes Ordenada */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-2">
            {loadingAiUsageReport ? (
              <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
                <IconRefresh className="h-5 w-5 animate-spin mx-auto text-zinc-400" />
                <p>Calculando métricas y consumo por cliente...</p>
              </div>
            ) : !aiUsageReport?.clients || aiUsageReport.clients.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">
                No hay consumo de tokens registrado aún. Cuando el bot atienda clientes, aparecerán aquí automáticamente.
              </div>
            ) : (
              aiUsageReport.clients
                .filter((c) => {
                  if (!aiUsageSearch.trim()) return true
                  const q = aiUsageSearch.toLowerCase()
                  return (
                    (c.clientName || "").toLowerCase().includes(q) ||
                    c.phone.toLowerCase().includes(q) ||
                    (c.lastModelUsed || "").toLowerCase().includes(q)
                  )
                })
                .map((item, idx) => {
                  const maxTokens = aiUsageReport.clients[0]?.totalTokens || 1
                  const percent = Math.min(100, Math.round((item.totalTokens / maxTokens) * 100))

                  return (
                    <div
                      key={item.phone}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn(
                            "h-6 w-6 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0",
                            idx === 0
                              ? "bg-amber-500 text-white"
                              : idx === 1
                              ? "bg-zinc-400 text-white"
                              : idx === 2
                              ? "bg-amber-700 text-white"
                              : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}>
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">
                              {item.clientName || `Cliente (${item.phone.slice(-4)})`}
                            </p>
                            <p className="text-[10px] text-zinc-500 font-mono truncate">{item.phone}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="font-mono font-bold text-xs text-foreground block">
                              {item.isFreePlan || (item.lastModelUsed && item.lastModelUsed.toLowerCase().includes("free"))
                                ? "$0 COP (Gratis)"
                                : `$${Number(item.estimatedCostUsd).toFixed(4)} USD`}
                            </span>
                            <span className="text-[9px] text-muted-foreground block font-mono">
                              {item.isFreePlan || (item.lastModelUsed && item.lastModelUsed.toLowerCase().includes("free"))
                                ? "Plan Gratuito ($0)"
                                : `~$${Math.round((item.estimatedCostUsd || 0) * 4200).toLocaleString("es-CO")} COP`}
                            </span>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedPhone(item.phone)
                              setAiUsageModalOpen(false)
                            }}
                            className="h-7 px-2 text-[10px] font-bold rounded-lg cursor-pointer"
                          >
                            Ver Chat
                          </Button>
                        </div>
                      </div>

                      {/* Barra de progreso de tokens */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                            ⚡ {item.totalTokens.toLocaleString()} tokens ({item.totalReplies} respuestas)
                          </span>
                          <span className="text-[9px] text-muted-foreground font-mono">
                            In: {item.promptTokens.toLocaleString()} | Out: {item.completionTokens.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-purple-600 dark:bg-purple-400 rounded-full transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer del card con detalles y botón reset */}
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60 text-zinc-500">
                        <span className="truncate max-w-[280px]">
                          Último modelo: <span className="font-mono font-medium">{item.lastModelUsed.split("/")[1] || item.lastModelUsed}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {item.history && item.history.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedClientUsageDetail(item)
                                setHistoryModalOpen(true)
                              }}
                              className="text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                            >
                              Historial ({item.history.length})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResetClientAiTokens(item.phone)}
                            className="text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                          >
                            Restablecer
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setAiUsageModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* MODAL: HISTORIAL DE CONSULTAS IA DE UN CLIENTE ESPECÍFICO */}
      {/* ========================================================= */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[80vh] flex flex-col p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-1.5">
              <IconBolt className="h-4 w-4 text-purple-600" />
              Historial de Consultas IA — {selectedClientUsageDetail?.clientName || selectedClientUsageDetail?.phone}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Últimas interacciones procesadas para este cliente con desglose de tokens y costo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pt-2">
            {!selectedClientUsageDetail?.history || selectedClientUsageDetail.history.length === 0 ? (
              <p className="text-xs text-zinc-400 py-6 text-center">No hay historial disponible para este contacto.</p>
            ) : (
              selectedClientUsageDetail.history.map((h, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {formatDateTime(h.at)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0 font-mono",
                        h.isFree
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-purple-500/10 text-purple-600 border-purple-500/30"
                      )}
                    >
                      {h.isFree ? "🎁 Gratis ($0)" : `$${Number(h.costUsd).toFixed(5)} USD`}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono font-bold text-foreground">
                      ⚡ {h.totalTokens.toLocaleString()} tokens
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Prompt: {h.promptTokens} | Salida: {h.completionTokens}
                    </span>
                  </div>

                  <p className="text-[10px] text-zinc-500 font-mono truncate">
                    Modelo: {h.model}
                  </p>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setHistoryModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Límites y Nueva Política Oficial de Meta WhatsApp Cloud API */}
      <Dialog open={metaQuotaModalOpen} onOpenChange={setMetaQuotaModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconBrandWhatsapp className="h-5 w-5 text-emerald-600" />
              Nueva Política de Meta: Cobro por Mensaje Entregado
            </DialogTitle>
            <DialogDescription className="text-xs">
              Monitoreo del paquete mensual de 1.000 mensajes de servicio gratuitos por línea.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 pt-2 text-xs">
            {/* Tarjeta de Contador 1.000 Mensajes Gratis */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Paquete Mensual Gratuito (Por Línea de WhatsApp)
                </span>
                <Badge variant="outline" className="text-[10px] bg-emerald-600 text-white font-bold border-none">
                  🎁 1.000 Mensajes Gratis
                </Badge>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Mensajes de servicio salientes consumidos:</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-300 font-bold">
                    {metaQuota?.usedThisMonth ?? 0} / {metaQuota?.monthlyLimit ?? 1000} msgs
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      (metaQuota?.percentUsed ?? 0) > 90
                        ? "bg-rose-500"
                        : (metaQuota?.percentUsed ?? 0) > 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.max(3, metaQuota?.percentUsed ?? 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-0.5">
                  <span>{metaQuota?.remainingFree ?? 1000} mensajes restantes sin costo</span>
                  <span>{metaQuota?.percentUsed ?? 0}% consumido</span>
                </div>
              </div>

              {/* Desglose Bot vs Agente vs Entrantes */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 text-center text-[10px]">
                <div className="p-1.5 rounded-lg bg-white/70 dark:bg-zinc-900/60">
                  <p className="text-zinc-500">🤖 Bot IA</p>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-xs">{metaQuota?.botMessagesCount ?? 0}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-white/70 dark:bg-zinc-900/60">
                  <p className="text-zinc-500">👤 Agente</p>
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-xs">{metaQuota?.agentMessagesCount ?? 0}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-emerald-100/70 dark:bg-emerald-900/40">
                  <p className="text-emerald-700 dark:text-emerald-300 font-semibold">📥 Entrantes</p>
                  <p className="font-bold text-emerald-800 dark:text-emerald-200 font-mono text-xs">{metaQuota?.customerIncomingCount ?? 0} (Gratis)</p>
                </div>
              </div>
            </div>

            {/* Explicación Detallada de la Nueva Política */}
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                <p className="font-bold text-[11px] text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <IconInfoCircle className="h-3.5 w-3.5 text-blue-500" />
                  📋 ¿Cómo funciona el nuevo esquema por mensaje individual?
                </p>
                <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 list-disc pl-4 leading-relaxed">
                  <li><strong>Los primeros 1.000 mensajes son gratis:</strong> Cada mes calendario, cada número telefónico de tu negocio recibe un paquete de 1.000 mensajes de servicio sin costo.</li>
                  <li><strong>Cobro desde el mensaje 1.001:</strong> En cuanto envíes el mensaje 1.001 del mes en esa línea, Meta cobrará una tarifa fija por cada mensaje individual entregado.</li>
                  <li><strong>No son acumulables:</strong> Los mensajes gratuitos que no utilices se pierden y no se transfieren al mes siguiente (se reinician el día 1).</li>
                  <li><strong>Aplica para humanos y bots:</strong> El consumo corre por igual si el mensaje lo redacta un agente humano o el asistente con IA.</li>
                </ul>
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                <p className="font-bold text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <IconShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  💰 Excepciones: ¿Qué sigue siendo 100% Gratis?
                </p>
                <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 list-disc pl-4 leading-relaxed">
                  <li><strong>Mensajes entrantes:</strong> Todo lo que tus clientes te escriban es 100% gratuito siempre.</li>
                  <li><strong>Anuncios Click-to-WhatsApp:</strong> Si el cliente llega desde un botón de anuncio en Facebook o Instagram, toda la conversación de las siguientes 72 horas es completamente gratis.</li>
                  <li><strong>App de WhatsApp tradicional:</strong> No afecta a la app móvil de WhatsApp Business del celular, solo a plataformas masivas conectadas por API oficial.</li>
                </ul>
              </div>
            </div>

            {/* Enlace oficial al panel de Meta */}
            <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500">
              <span>El cupo se renueva el 1º de cada mes.</span>
              <a
                href="https://business.facebook.com/wa/manage/phone-numbers/"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1"
              >
                Ver en Meta Manager <IconExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setMetaQuotaModalOpen(false)}>
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
