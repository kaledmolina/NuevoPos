"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { apiFetch } from "@/lib/api"
import { useAppStore } from "@/lib/store"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  IconCreditCard, IconPlus, IconWallet, IconTrendingDown, IconSearch, IconUsers, IconHistory,
  IconPrinter, IconDownload, IconCircleCheck, IconUser, IconReceipt2, IconArrowDownRight, IconArrowUpRight,
} from "@tabler/icons-react"

interface CreditAccount {
  id: string
  clientId: string
  clientName: string
  clientDocument: string | null
  clientPhone: string | null
  creditLimit: number
  balance: number
  available: number
  active: boolean
  movementsCount: number
}

interface Client { id: string; name: string; isGeneric?: boolean }

interface AbonoReceipt {
  id: string
  voucherNumber: string
  clientName: string
  clientDocument?: string | null
  clientPhone?: string | null
  amount: number
  previousBalance: number
  remainingBalance: number
  concept: string
  method: string
  reportedBy: string
  createdAt: string
}

interface CreditMovementItem {
  id: string
  voucherNumber: string
  type: string
  amount: number
  concept: string
  method: string
  reportedBy: string
  previousBalance?: number | null
  remainingBalance?: number | null
  saleId?: string | null
  createdAt: string
}

export default function CreditView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const loggedUserName = useAppStore((s) => s.userName)

  const [accounts, setAccounts] = useState<CreditAccount[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [grantOpen, setGrantOpen] = useState(false)
  const [abonoOpen, setAbonoOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<CreditAccount | null>(null)

  // Form otorgar crédito
  const [clientId, setClientId] = useState("")
  const [creditLimit, setCreditLimit] = useState("")

  // Form registrar abono
  const [abonoAmount, setAbonoAmount] = useState("")
  const [abonoConcept, setAbonoConcept] = useState("")
  const [abonoReportedBy, setAbonoReportedBy] = useState("")
  const [abonoMethod, setAbonoMethod] = useState("efectivo")
  const [saving, setSaving] = useState(false)

  // Comprobante de abono generado
  const [receipt, setReceipt] = useState<AbonoReceipt | null>(null)

  // Historial de movimientos de un cliente
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyAccount, setHistoryAccount] = useState<CreditAccount | null>(null)
  const [historyMovements, setHistoryMovements] = useState<CreditMovementItem[]>([])

  // Datos de la tienda para comprobantes
  const [storeInfo, setStoreInfo] = useState({
    name: "Sistema POS",
    nit: "",
    phone: "",
    address: "",
    message: "¡Gracias por su pago! Conserve este comprobante.",
  })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<CreditAccount[]>("/api/credit").catch(() => []),
      apiFetch<Client[]>("/api/clients").catch(() => []),
      apiFetch<Record<string, string>>("/api/settings").catch(() => ({} as Record<string, string>)),
    ]).then(([a, c, settings]) => {
      setAccounts(a)
      setClients(c.filter((cl) => !cl.isGeneric))
      if (settings) {
        setStoreInfo({
          name: settings.store_name || "Sistema POS",
          nit: settings.store_nit || "",
          phone: settings.store_phone || "",
          address: settings.store_address || "",
          message: settings.receipt_message || "¡Gracias por su pago! Conserve este comprobante.",
        })
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const filtered = accounts.filter((a) =>
    !query || a.clientName.toLowerCase().includes(query.toLowerCase()) ||
    a.clientDocument?.includes(query)
  )

  const totalDebt = accounts.reduce((s, a) => s + a.balance, 0)
  const totalLimit = accounts.reduce((s, a) => s + a.creditLimit, 0)

  const grantCredit = async () => {
    if (!clientId) return toast.error("Selecciona un cliente")
    setSaving(true)
    try {
      await apiFetch("/api/credit", {
        method: "POST",
        body: JSON.stringify({ clientId, creditLimit: Number(creditLimit) || 0 }),
      })
      toast.success("Crédito otorgado/actualizado")
      setGrantOpen(false)
      setClientId("")
      setCreditLimit("")
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openAbonoModal = (a: CreditAccount) => {
    setSelectedAccount(a)
    setAbonoAmount("")
    setAbonoConcept("")
    setAbonoReportedBy(loggedUserName || "Administrador")
    setAbonoMethod("efectivo")
    setAbonoOpen(true)
  }

  const registerAbono = async () => {
    if (!selectedAccount) return
    const amt = Number(abonoAmount)
    if (!amt || amt <= 0) return toast.error("Ingresa un monto válido mayor a 0")
    if (amt > selectedAccount.balance) {
      return toast.error(`El monto ($${amt.toLocaleString("es-CO")}) no puede superar el saldo adeudado ($${selectedAccount.balance.toLocaleString("es-CO")}).`)
    }
    setSaving(true)
    try {
      const res = await apiFetch<{
        ok: boolean
        newBalance: number
        receipt: AbonoReceipt
      }>("/api/credit/abono", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedAccount.clientId,
          amount: amt,
          concept: abonoConcept || undefined,
          reportedBy: abonoReportedBy.trim() || loggedUserName || "Administrador",
          method: abonoMethod,
        }),
      })

      toast.success(`Abono registrado. Saldo pendiente: ${formatCurrency(res.newBalance)}`)
      setAbonoOpen(false)
      setReceipt(res.receipt)
      setSelectedAccount(null)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const openHistoryModal = async (a: CreditAccount) => {
    setHistoryAccount(a)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const data = await apiFetch<{
        account: CreditAccount
        movements: CreditMovementItem[]
      }>(`/api/credit/movements?accountId=${a.id}`)
      setHistoryMovements(data.movements || [])
    } catch (e) {
      toast.error((e as Error).message)
      setHistoryMovements([])
    } finally {
      setHistoryLoading(false)
    }
  }

  // Generar HTML del Comprobante de Abono Térmico
  const buildAbonoReceiptHTML = (r: AbonoReceipt): string => {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Comprobante ${r.voucherNumber}</title>
    <style>
      *{box-sizing:border-box;font-family:monospace,'Courier New',Courier,sans-serif;font-size:12px;margin:0;padding:0}
      body{max-width:300px;margin:0 auto;padding:12px;color:#000;background:#fff}
      h1{font-size:15px;text-align:center;font-weight:bold;margin-bottom:4px}
      .center{text-align:center}
      .muted{color:#555;font-size:11px;line-height:1.3}
      table{width:100%;border-collapse:collapse;margin:6px 0}
      .tot{font-weight:bold;font-size:14px}
      .line{border-top:1px dashed #000;margin:6px 0}
      .row{display:flex;justify-content:space-between;margin:3px 0}
      @media print {
        body{width:100%;max-width:100%;padding:0}
        @page{margin:0;size:80mm auto}
      }
    </style></head><body>
      <h1>${storeInfo.name}</h1>
      <p class="center muted">${storeInfo.nit ? `NIT/Doc: ${storeInfo.nit}<br>` : ""}${storeInfo.phone ? `Tel: ${storeInfo.phone} · ` : ""}${storeInfo.address}</p>
      <div class="line"></div>
      <p class="center" style="font-weight:bold;margin-bottom:4px">COMPROBANTE DE ABONO A CRÉDITO</p>
      <div class="row"><span>Recibo:</span><strong>${r.voucherNumber}</strong></div>
      <div class="row"><span>Fecha:</span><span>${formatDateTime(r.createdAt)}</span></div>
      <div class="row"><span>Cliente:</span><strong>${r.clientName}</strong></div>
      ${r.clientDocument ? `<div class="row"><span>Doc/NIT:</span><span>${r.clientDocument}</span></div>` : ""}
      ${r.clientPhone ? `<div class="row"><span>Teléfono:</span><span>${r.clientPhone}</span></div>` : ""}
      <div class="row"><span>Reportado por:</span><strong>${r.reportedBy}</strong></div>
      <div class="row"><span>Medio de pago:</span><span style="text-transform:capitalize">${r.method}</span></div>
      ${r.concept ? `<div class="row"><span>Concepto:</span><span>${r.concept}</span></div>` : ""}
      <div class="line"></div>
      <div class="row"><span>Saldo anterior:</span><span>${formatCurrency(r.previousBalance)}</span></div>
      <div class="row tot" style="font-size:13px;color:#047857"><span>VALOR ABONADO:</span><span>${formatCurrency(r.amount)}</span></div>
      <div class="line"></div>
      <div class="row tot" style="font-size:13px;color:#b91c1c"><span>SALDO PENDIENTE:</span><span>${formatCurrency(r.remainingBalance)}</span></div>
      <div class="line"></div>
      <p class="center muted" style="margin-top:6px">${storeInfo.message}</p>
    </body></html>`
  }

  const printAbonoReceipt = (r: AbonoReceipt) => {
    const html = buildAbonoReceiptHTML(r)
    const printFrame = document.createElement("iframe")
    printFrame.style.position = "fixed"
    printFrame.style.right = "0"
    printFrame.style.bottom = "0"
    printFrame.style.width = "0"
    printFrame.style.height = "0"
    printFrame.style.border = "0"
    document.body.appendChild(printFrame)

    const frameDoc = printFrame.contentWindow?.document
    if (frameDoc) {
      frameDoc.open()
      frameDoc.write(html)
      frameDoc.close()
      setTimeout(() => {
        try {
          printFrame.contentWindow?.focus()
          printFrame.contentWindow?.print()
        } catch {
          const w = window.open("", "_blank", "width=380,height=600")
          if (w) {
            w.document.write(html)
            w.document.close()
            w.focus()
            setTimeout(() => w.print(), 250)
          }
        } finally {
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame)
            }
          }, 1500)
        }
      }, 250)
    } else {
      const w = window.open("", "_blank", "width=380,height=600")
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => w.print(), 250)
      } else {
        toast.error("Permite las ventanas emergentes para imprimir")
      }
    }
  }

  const downloadAbonoReceipt = (r: AbonoReceipt) => {
    const html = buildAbonoReceiptHTML(r)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `comprobante-abono-${r.voucherNumber}.html`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Comprobante de abono descargado")
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><IconCreditCard className="h-5 w-5 text-primary" /> Cuentas por cobrar</h2>
          <p className="text-sm text-muted-foreground">Gestiona el crédito de tus clientes, registra abonos y genera comprobantes</p>
        </div>
        <Button size="sm" onClick={() => setGrantOpen(true)} data-tour="credit-grant-btn">
          <IconPlus className="h-4 w-4 mr-1" /> Otorgar crédito
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-tour="credit-summary-cards">
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><IconTrendingDown className="h-4 w-4 text-rose-500" /> Total adeudado</div>
            <p className="text-xl font-bold text-rose-600">{formatCurrency(totalDebt)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><IconCreditCard className="h-4 w-4 text-primary" /> Límite total</div>
            <p className="text-xl font-bold">{formatCurrency(totalLimit)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><IconWallet className="h-4 w-4 text-primary" /> Disponible</div>
            <p className="text-xl font-bold text-primary">{formatCurrency(totalLimit - totalDebt)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><IconUsers className="h-4 w-4 text-primary" /> Clientes con crédito</div>
            <p className="text-xl font-bold">{accounts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <div className="relative max-w-md">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o documento…" className="pl-9 h-10 rounded-xl" />
      </div>

      {/* Lista de cuentas */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl shadow-xs border-border/80">
          <CardContent className="p-8 text-center">
            <IconCreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-2 opacity-40" />
            <p className="text-sm font-medium">No hay cuentas de crédito</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Otorga crédito a tus clientes para que puedan comprar a crédito</p>
            <Button size="sm" className="rounded-xl" onClick={() => setGrantOpen(true)}><IconPlus className="h-4 w-4 mr-1.5" /> Otorgar crédito</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((a) => (
            <Card key={a.id} className={`rounded-2xl shadow-xs border-border/80 hover:border-primary/40 transition-colors ${!a.active ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{a.clientName}</p>
                      <Badge variant={a.active ? "default" : "secondary"} className="text-[10px] rounded-full">
                        {a.active ? "Activa" : "Inactiva"}
                      </Badge>
                      {a.balance > 0 ? (
                        <Badge variant="destructive" className="text-[10px] rounded-full">Debe {formatCurrency(a.balance)}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/10 rounded-full font-semibold">Al día</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.clientDocument ?? "Sin doc"} · {a.clientPhone ?? "Sin tel"} · {a.movementsCount} movimientos
                    </p>
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Límite</p>
                      <p className="text-sm font-semibold">{formatCurrency(a.creditLimit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Saldo</p>
                      <p className={`text-sm font-bold ${a.balance > 0 ? "text-rose-600" : "text-primary"}`}>{formatCurrency(a.balance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-medium">Disponible</p>
                      <p className="text-sm font-semibold text-primary">{formatCurrency(a.available)}</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 sm:flex-none text-xs rounded-xl"
                        title="Ver historial de movimientos"
                        onClick={() => openHistoryModal(a)}
                      >
                        <IconHistory className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> Movimientos
                      </Button>
                      {a.balance > 0 && (
                        <Button
                          size="sm"
                          variant="default"
                          className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-xl shadow-xs"
                          title="Registrar abono"
                          onClick={() => openAbonoModal(a)}
                        >
                          <IconWallet className="h-3.5 w-3.5 mr-1" /> Abonar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ================= MODAL: OTORGAR CRÉDITO ================= */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconCreditCard className="h-4 w-4 text-primary" /> Otorgar crédito a cliente</DialogTitle>
            <DialogDescription>Define el límite de crédito que el cliente puede usar para comprar a crédito.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label>Cliente *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona un cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {clients.length === 0 && <p className="text-xs text-muted-foreground mt-1">No hay clientes registrados (o todos son genéricos). Registra clientes primero.</p>}
            </div>
            <div>
              <Label>Límite de crédito (COP) *</Label>
              <Input type="number" inputMode="decimal" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="Ej: 100000" className="h-10" />
              <p className="text-xs text-muted-foreground mt-1">Monto máximo que el cliente puede deber en cualquier momento.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancelar</Button>
            <Button onClick={grantCredit} disabled={saving || !clientId}>{saving ? "Guardando…" : "Otorgar crédito"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL: REGISTRAR ABONO ================= */}
      <Dialog open={abonoOpen} onOpenChange={setAbonoOpen}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><IconWallet className="h-5 w-5 text-primary" /> Registrar abono a crédito</DialogTitle>
            <DialogDescription>
              {selectedAccount && `Cliente: ${selectedAccount.clientName} · Deuda actual: ${formatCurrency(selectedAccount.balance)}`}
            </DialogDescription>
          </DialogHeader>
          {selectedAccount && (
            <div className="py-2 space-y-3.5">
              {/* Saldo actual info */}
              <div className="bg-muted/40 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Deuda actual:</p>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(selectedAccount.balance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Límite otorgado:</p>
                  <p className="text-sm font-semibold">{formatCurrency(selectedAccount.creditLimit)}</p>
                </div>
              </div>

              {/* Monto del abono */}
              <div>
                <Label>Monto a abonar (COP) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={abonoAmount}
                  onChange={(e) => setAbonoAmount(e.target.value)}
                  placeholder="0"
                  className="h-11 text-lg font-bold"
                  autoFocus
                />
                {/* Botones de atajo rápido */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs flex-1 bg-muted hover:bg-muted/80 text-foreground"
                    onClick={() => setAbonoAmount(String(selectedAccount.balance))}
                  >
                    Pagar todo ({formatCurrency(selectedAccount.balance)})
                  </Button>
                  {selectedAccount.balance > 10000 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setAbonoAmount(String(Math.round(selectedAccount.balance / 2)))}
                    >
                      50% ({formatCurrency(Math.round(selectedAccount.balance / 2))})
                    </Button>
                  )}
                </div>
              </div>

              {/* Responsable que reporta */}
              <div>
                <Label className="flex items-center gap-1.5"><IconUser className="h-3.5 w-3.5 text-primary" /> Quién reportó el abono *</Label>
                <Input
                  value={abonoReportedBy}
                  onChange={(e) => setAbonoReportedBy(e.target.value)}
                  placeholder="Nombre del cajero o responsable…"
                  className="h-10"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Nombre del usuario o cajero que recibe y registra el dinero.</p>
              </div>

              {/* Medio de pago */}
              <div>
                <Label>Medio de pago</Label>
                <Select value={abonoMethod} onValueChange={setAbonoMethod}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="credito">Crédito (Ajuste)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Concepto / Notas */}
              <div>
                <Label>Concepto / Observaciones (opcional)</Label>
                <Input
                  value={abonoConcept}
                  onChange={(e) => setAbonoConcept(e.target.value)}
                  placeholder="Ej: Pago cuota semanal / Abono parcial"
                  className="h-10"
                />
              </div>

              {/* Desglose previo en vivo */}
              {Number(abonoAmount) > 0 && (
                <div className="border bg-muted/30 p-3 rounded-lg space-y-1 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Saldo anterior:</span>
                    <span>{formatCurrency(selectedAccount.balance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-primary font-medium">
                    <span>Valor a abonar:</span>
                    <span>-{formatCurrency(Number(abonoAmount) || 0)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex justify-between font-bold text-base">
                    <span>Saldo pendiente resultante:</span>
                    <span className={Math.max(0, selectedAccount.balance - (Number(abonoAmount) || 0)) === 0 ? "text-emerald-600" : "text-red-600"}>
                      {formatCurrency(Math.max(0, selectedAccount.balance - (Number(abonoAmount) || 0)))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setAbonoOpen(false)}>Cancelar</Button>
            <Button onClick={registerAbono} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
              <IconCircleCheck className="h-4 w-4 mr-1.5" /> {saving ? "Registrando…" : "Confirmar y emitir comprobante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL: COMPROBANTE DE ABONO ================= */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-col items-center text-center gap-2">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <IconCircleCheck className="h-8 w-8" />
              </motion.div>
              <DialogTitle className="text-xl">¡Abono registrado con éxito!</DialogTitle>
              <DialogDescription className="sr-only">Comprobante del abono realizado</DialogDescription>
            </div>
          </DialogHeader>

          {receipt && (
            <div className="space-y-3.5">
              <div className="text-center text-sm text-muted-foreground">
                <p className="font-mono font-bold text-foreground text-base">{receipt.voucherNumber}</p>
                <p>{formatDateTime(receipt.createdAt)}</p>
              </div>

              <div className="bg-muted/40 p-3 rounded-lg space-y-1.5 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-semibold text-foreground">{receipt.clientName}</span>
                </div>
                {receipt.clientDocument && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Doc/NIT:</span>
                    <span>{receipt.clientDocument}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reportado por:</span>
                  <span className="font-semibold text-primary">{receipt.reportedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Medio de pago:</span>
                  <span className="capitalize">{receipt.method}</span>
                </div>
                {receipt.concept && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Concepto:</span>
                    <span className="truncate max-w-[200px]">{receipt.concept}</span>
                  </div>
                )}
              </div>

              {/* Desglose de saldos */}
              <div className="border border-border/80 rounded-lg p-3 space-y-2 text-sm bg-card">
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Saldo anterior:</span>
                  <span>{formatCurrency(receipt.previousBalance)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-primary bg-primary/10 p-2 rounded">
                  <span>Monto abonado:</span>
                  <span>{formatCurrency(receipt.amount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Saldo pendiente:</span>
                  <span className={receipt.remainingBalance === 0 ? "text-emerald-600" : "text-red-600"}>
                    {formatCurrency(receipt.remainingBalance)}
                  </span>
                </div>
                {receipt.remainingBalance === 0 && (
                  <p className="text-center text-xs text-primary font-semibold pt-1">
                    🎉 ¡Cuenta saldada en su totalidad!
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => receipt && downloadAbonoReceipt(receipt)}>
              <IconDownload className="h-4 w-4 mr-1.5" /> Descargar
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => receipt && printAbonoReceipt(receipt)}
            >
              <IconPrinter className="h-4 w-4 mr-1.5" /> Imprimir
            </Button>
            <Button className="flex-1" onClick={() => setReceipt(null)}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL: HISTORIAL DE MOVIMIENTOS ================= */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconHistory className="h-5 w-5 text-primary" /> Historial de cuenta · {historyAccount?.clientName}
            </DialogTitle>
            <DialogDescription>
              {historyAccount && `Límite: ${formatCurrency(historyAccount.creditLimit)} · Saldo adeudado actual: ${formatCurrency(historyAccount.balance)}`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {historyLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : historyMovements.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <IconReceipt2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay movimientos registrados para este cliente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Concepto / Quién reportó</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="text-right">Saldo restante</TableHead>
                      <TableHead className="text-center">Comprobante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyMovements.map((m) => {
                      const isAbono = m.type === "abono"
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(m.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isAbono ? "outline" : "secondary"} className="text-[10px]">
                              {isAbono ? "Abono (Pago)" : "Cargo (Compra)"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <p className="font-medium text-foreground">{m.concept}</p>
                            <p className="text-muted-foreground text-[11px]">
                              Resp: <span className="font-semibold text-primary">{m.reportedBy}</span> · {m.method}
                            </p>
                          </TableCell>
                          <TableCell className={`text-right font-bold text-xs whitespace-nowrap ${isAbono ? "text-primary" : "text-foreground"}`}>
                            {isAbono ? "-" : "+"}{formatCurrency(m.amount)}
                          </TableCell>
                          <TableCell className="text-right text-xs whitespace-nowrap">
                            {m.remainingBalance != null ? formatCurrency(m.remainingBalance) : "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            {isAbono && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-primary hover:bg-primary/10"
                                title="Reimprimir comprobante de abono"
                                onClick={() => {
                                  const rec: AbonoReceipt = {
                                    id: m.id,
                                    voucherNumber: m.voucherNumber,
                                    clientName: historyAccount?.clientName || "Cliente",
                                    clientDocument: historyAccount?.clientDocument,
                                    clientPhone: historyAccount?.clientPhone,
                                    amount: m.amount,
                                    previousBalance: m.previousBalance ?? ((m.remainingBalance ?? 0) + m.amount),
                                    remainingBalance: m.remainingBalance ?? 0,
                                    concept: m.concept,
                                    method: m.method,
                                    reportedBy: m.reportedBy,
                                    createdAt: m.createdAt,
                                  }
                                  setReceipt(rec)
                                }}
                              >
                                <IconPrinter className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
