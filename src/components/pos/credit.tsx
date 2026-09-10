"use client"

import { useEffect, useState, useCallback } from "react"
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
import { toast } from "sonner"
import { CreditCard, Plus, Wallet, TrendingDown, Search, Users } from "lucide-react"

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

export default function CreditView() {
  const refreshKey = useAppStore((s) => s.refreshKey)
  const triggerRefresh = useAppStore((s) => s.triggerRefresh)
  const [accounts, setAccounts] = useState<CreditAccount[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [grantOpen, setGrantOpen] = useState(false)
  const [abonoOpen, setAbonoOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<CreditAccount | null>(null)
  // form otorgar
  const [clientId, setClientId] = useState("")
  const [creditLimit, setCreditLimit] = useState("")
  // form abono
  const [abonoAmount, setAbonoAmount] = useState("")
  const [abonoConcept, setAbonoConcept] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch<CreditAccount[]>("/api/credit").catch(() => []),
      apiFetch<Client[]>("/api/clients").catch(() => []),
    ]).then(([a, c]) => {
      setAccounts(a)
      setClients(c.filter((cl) => !cl.isGeneric))
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

  const registerAbono = async () => {
    if (!selectedAccount) return
    if (!abonoAmount || Number(abonoAmount) <= 0) return toast.error("Ingresa un monto válido")
    setSaving(true)
    try {
      const res = await apiFetch<{ ok: boolean; newBalance: number }>("/api/credit/abono", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedAccount.clientId,
          amount: Number(abonoAmount),
          concept: abonoConcept || undefined,
        }),
      })
      toast.success(`Abono registrado. Nuevo saldo: ${formatCurrency(res.newBalance)}`)
      setAbonoOpen(false)
      setAbonoAmount("")
      setAbonoConcept("")
      setSelectedAccount(null)
      load()
      triggerRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" /> Cuentas por cobrar</h2>
          <p className="text-sm text-muted-foreground">Gestiona el crédito de tus clientes y registra abonos</p>
        </div>
        <Button size="sm" onClick={() => setGrantOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Otorgar crédito
        </Button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><TrendingDown className="h-4 w-4 text-red-500" /> Total adeudado</div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalDebt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><CreditCard className="h-4 w-4 text-primary" /> Límite total</div>
            <p className="text-xl font-bold">{formatCurrency(totalLimit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Wallet className="h-4 w-4 text-emerald-500" /> Disponible</div>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalLimit - totalDebt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Users className="h-4 w-4 text-primary" /> Clientes con crédito</div>
            <p className="text-xl font-bold">{accounts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o documento…" className="pl-9 h-10" />
      </div>

      {/* Lista de cuentas */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CreditCard className="h-10 w-10 mx-auto text-muted-foreground mb-2 opacity-40" />
            <p className="text-sm font-medium">No hay cuentas de crédito</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Otorga crédito a tus clientes para que puedan comprar a crédito</p>
            <Button size="sm" onClick={() => setGrantOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Otorgar crédito</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => (
            <Card key={a.id} className={!a.active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{a.clientName}</p>
                      <Badge variant={a.active ? "default" : "secondary"} className="text-[10px]">
                        {a.active ? "Activa" : "Inactiva"}
                      </Badge>
                      {a.balance > 0 && (
                        <Badge variant="destructive" className="text-[10px]">Debe {formatCurrency(a.balance)}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.clientDocument ?? "Sin doc"} · {a.clientPhone ?? "Sin tel"} · {a.movementsCount} movimientos
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Límite</p>
                      <p className="text-sm font-semibold">{formatCurrency(a.creditLimit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
                      <p className={`text-sm font-bold ${a.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>{formatCurrency(a.balance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Disponible</p>
                      <p className="text-sm font-semibold text-primary">{formatCurrency(a.available)}</p>
                    </div>
                    {a.balance > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Registrar abono"
                        onClick={() => { setSelectedAccount(a); setAbonoOpen(true) }}
                      >
                        <Wallet className="h-3.5 w-3.5 mr-1" /> Abonar
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal otorgar crédito */}
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Otorgar crédito a cliente</DialogTitle>
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

      {/* Modal registrar abono */}
      <Dialog open={abonoOpen} onOpenChange={setAbonoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" /> Registrar abono</DialogTitle>
            <DialogDescription>
              {selectedAccount && `${selectedAccount.clientName} debe ${formatCurrency(selectedAccount.balance)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div>
              <Label>Monto del abono *</Label>
              <Input type="number" inputMode="decimal" value={abonoAmount} onChange={(e) => setAbonoAmount(e.target.value)} placeholder="Ej: 50000" className="h-10" autoFocus />
              {selectedAccount && abonoAmount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Nuevo saldo: {formatCurrency(Math.max(0, selectedAccount.balance - (Number(abonoAmount) || 0)))}
                </p>
              )}
            </div>
            <div>
              <Label>Concepto (opcional)</Label>
              <Input value={abonoConcept} onChange={(e) => setAbonoConcept(e.target.value)} placeholder="Ej: Pago parcial factura" className="h-10" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbonoOpen(false)}>Cancelar</Button>
            <Button onClick={registerAbono} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              <Wallet className="h-4 w-4 mr-1.5" /> Registrar abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
