"use client"

import { useState, useEffect } from "react"
import { useAppStore } from "@/lib/store"
import { apiFetch } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  IconCpu,
  IconShieldCheck,
  IconCopy,
  IconCheck,
  IconKey,
  IconBuildingStore,
  IconSparkles,
  IconInfoCircle,
  IconRobot,
  IconCode,
} from "@tabler/icons-react"

interface McpTokenResponse {
  ok: boolean
  data: {
    token: string
    metadata: {
      agentName: string
      role: string
      branchId: string | null
      tenantId: string | null
      createdAt: string
    }
    configSnippet: string
  }
}

interface McpTokenGeneratorProps {
  initialUserName?: string
  initialRole?: "admin" | "vendedor" | "domiciliario" | "cliente"
  initialBranchId?: string
  compact?: boolean
}

export function McpTokenGenerator({
  initialUserName,
  initialRole = "admin",
  initialBranchId,
  compact = false,
}: McpTokenGeneratorProps) {
  const { userName, role: userRole, branches, activeBranch } = useAppStore()

  const [agentName, setAgentName] = useState(
    initialUserName ? `${initialUserName} (Agente MCP)` : `Agente ${userName || "OmniPOS"}`
  )
  const [targetRole, setTargetRole] = useState<string>(initialRole || userRole || "admin")
  const [targetBranchId, setTargetBranchId] = useState<string>(
    initialBranchId || activeBranch?.id || (branches.length > 0 ? branches[0].id : "sede_principal")
  )
  const [generating, setGenerating] = useState(false)
  const [generatedData, setGeneratedData] = useState<McpTokenResponse["data"] | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await apiFetch<McpTokenResponse>("/api/mcp/token", {
        method: "POST",
        body: JSON.stringify({
          name: agentName,
          role: targetRole,
          branchId: targetBranchId,
        }),
      })

      if (res.ok && res.data) {
        setGeneratedData(res.data)
        toast.success("¡Token MCP criptográfico generado exitosamente!")
      }
    } catch (err) {
      toast.error((err as Error).message || "Error al generar el token MCP")
    } finally {
      setGenerating(false)
    }
  }

  // Generar un token por defecto al cargar si es la primera vez
  useEffect(() => {
    if (!generatedData) {
      handleGenerate()
    }
  }, [])

  const copyToClipboard = (text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast.success("Copiado al portapapeles", { duration: 1500 })
      setTimeout(() => setCopiedKey(null), 1800)
    }
  }

  return (
    <div className="space-y-6">
      {/* Tarjeta de Formulario de Generación */}
      <Card className="border border-slate-200/90 dark:border-slate-800/90 shadow-sm bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl overflow-hidden">
        <CardHeader className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white flex items-center justify-center shadow-md shadow-sm">
                <IconRobot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Generador de Token para Agentes MCP & IA
                  <Badge variant="outline" className="text-[10px] bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-white border-zinc-300 dark:border-zinc-700 font-mono">
                    HMAC-SHA256
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Crea credenciales blindadas e inalterables para conectar Claude Desktop, Cursor o bots de WhatsApp a tu POS.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Nombre del Agente o Dispositivo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nombre del Agente / Bot
              </Label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Ej. Claude Desktop Tienda Norte"
                className="h-9 text-xs rounded-xl"
              />
            </div>

            {/* Rol de Permisos (RBAC) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nivel de Permisos (Rol)
              </Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (Control Total & Reportes)</SelectItem>
                  <SelectItem value="vendedor">Vendedor / Cajero (Ventas & Stock)</SelectItem>
                  <SelectItem value="domiciliario">Domiciliario (Solo Rutas & Pedidos)</SelectItem>
                  <SelectItem value="cliente">Cliente Final (Solo Consultas Propias)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sede Asignada */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sede Autorizada (Row-Level Security)
              </Label>
              <Select value={targetBranchId} onValueChange={setTargetBranchId}>
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue placeholder="Seleccionar sede" />
                </SelectTrigger>
                <SelectContent>
                  {branches.length > 0 ? (
                    branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} {b.isMain ? "(Principal)" : ""}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="sede_principal">Sede Principal</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="h-9 px-5 rounded-xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-200 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <IconSparkles className="h-4 w-4 text-zinc-200 dark:text-zinc-950 dark:text-zinc-100" />
              {generating ? "Generando Token..." : "Generar Nuevo Token Criptográfico"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados del Token Generado */}
      {generatedData && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Card con el Token */}
          <div className="p-4 sm:p-5 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 backdrop-blur-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <IconShieldCheck className="h-5 w-5 text-zinc-950 dark:text-white" />
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  Token Criptográfico Listo & Verificado
                </span>
              </div>
              <Badge className="bg-zinc-950 dark:bg-white dark:text-zinc-950 text-white text-[11px] font-semibold border-0">
                Rol: {generatedData.metadata.role.toUpperCase()}
              </Badge>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Este token contiene la firma criptográfica HMAC-SHA256 con tu <code className="text-zinc-950 dark:text-white font-bold">AUTH_SECRET</code>. Si alguien intenta alterar su rol o consultar otra sede, el servidor MCP bloqueará el acceso automáticamente.
            </p>

            <div className="relative">
              <div className="bg-[#090d16] p-3 rounded-xl border border-slate-800 font-mono text-xs text-zinc-200 break-all select-all pr-20 shadow-inner">
                {generatedData.token}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => copyToClipboard(generatedData.token, "token-copy")}
                className="absolute top-2 right-2 h-7 text-[11px] gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                {copiedKey === "token-copy" ? (
                  <>
                    <IconCheck className="h-3.5 w-3.5 text-zinc-200" /> Copiado
                  </>
                ) : (
                  <>
                    <IconCopy className="h-3.5 w-3.5" /> Copiar Token
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Configuración para Claude Desktop */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCpu className="h-4 w-4 text-zinc-900 dark:text-zinc-200" />
                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                  Configuración Directa para Claude Desktop
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(generatedData.configSnippet, "snippet-copy")}
                className="h-7 text-[11px] gap-1 cursor-pointer"
              >
                {copiedKey === "snippet-copy" ? (
                  <>
                    <IconCheck className="h-3.5 w-3.5 text-zinc-900 dark:text-zinc-200" /> Copiado
                  </>
                ) : (
                  <>
                    <IconCopy className="h-3.5 w-3.5" /> Copiar JSON
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pega este bloque en tu archivo <code className="text-zinc-950 dark:text-white font-mono">%APPDATA%\Claude\claude_desktop_config.json</code>:
            </p>

            <pre className="bg-[#090d16] p-3.5 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto">
              {generatedData.configSnippet}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
