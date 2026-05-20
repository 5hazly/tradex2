'use client'

import { useState, useCallback, useEffect, useReducer } from 'react'
import { motion } from 'framer-motion'
import {
  Building2,
  Plus,
  Unlink,
  Trash2,
  Eye,
  EyeOff,
  Edit3,
  TestTube,
  Wallet,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Shield,
  KeyRound,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import type { ExchangeName } from '@/lib/types/trading'

// ============================================================
// Types
// ============================================================
interface ExchangeConfig {
  id: string
  name: ExchangeName
  apiKey: string
  apiSecret: string
  passphrase: string
  testnet: boolean
  accountType: 'spot' | 'futures' | 'both'
  isActive: boolean
  connectedAt?: string
}

// ============================================================
// Storage helpers
// ============================================================
const STORAGE_KEY = 'tradeai_exchanges'

function loadExchanges(): ExchangeConfig[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : getDefaultExchanges()
  } catch {
    return getDefaultExchanges()
  }
}

function saveExchanges(exchanges: ExchangeConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exchanges))
}

function getDefaultExchanges(): ExchangeConfig[] {
  return [
    {
      id: 'ex_binance_001',
      name: 'Binance',
      apiKey: '',
      apiSecret: '',
      passphrase: '',
      testnet: false,
      accountType: 'futures',
      isActive: false,
    },
  ]
}

// ============================================================
// Exchange colors
// ============================================================
const exchangeColors: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  Binance: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-600/30', ring: 'ring-yellow-500/20' },
  Bybit: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-600/30', ring: 'ring-orange-500/20' },
  BingX: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-600/30', ring: 'ring-blue-500/20' },
  OKX: { bg: 'bg-slate-500/10', text: 'text-white', border: 'border-slate-600/30', ring: 'ring-slate-500/20' },
  KuCoin: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-600/30', ring: 'ring-emerald-500/20' },
}

// ============================================================
// Animation
// ============================================================
const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: 'easeOut' },
  }),
}

// ============================================================
// Exchange Form Component (reusable for Add & Edit)
// ============================================================
function ExchangeForm({
  initial,
  onSave,
  onCancel,
  saveLabel,
}: {
  initial: Partial<ExchangeConfig>
  onSave: (data: ExchangeConfig) => void
  onCancel: () => void
  saveLabel: string
}) {
  const [name, setName] = useState<ExchangeName | ''>(initial.name || '')
  const [apiKey, setApiKey] = useState(initial.apiKey || '')
  const [apiSecret, setApiSecret] = useState(initial.apiSecret || '')
  const [passphrase, setPassphrase] = useState(initial.passphrase || '')
  const [testnet, setTestnet] = useState(initial.testnet || false)
  const [accountType, setAccountType] = useState<string>(initial.accountType || 'futures')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle')
  const [showSecret, setShowSecret] = useState(false)

  const needsPassphrase = name === 'OKX' || name === 'KuCoin'
  const isValid = name && apiKey && apiSecret

  const handleTest = async () => {
    setTesting(true)
    setTestResult('idle')
    try {
      const res = await fetch('/api/trading/real', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'testConnection',
          exchange: {
            id: initial.id || `ex_${name.toLowerCase()}_${Date.now()}`,
            name,
            apiKey,
            apiSecret,
            passphrase,
            testnet,
            accountType,
          },
        }),
      })
      const json = await res.json()
      setTesting(false)
      if (json.success) {
        setTestResult('success')
        toast.success(`Connected to ${name}! Balance: $${Object.entries(json.data?.balance?.total || {}).filter(([k, v]: any) => v > 0).map(([k, v]: any) => `${k}: ${v}`).join(', ') || 'No balance'}`)
      } else {
        setTestResult('fail')
        toast.error(`Connection failed: ${json.error}`)
      }
    } catch (err: any) {
      setTesting(false)
      setTestResult('fail')
      toast.error(`Connection error: ${err.message}`)
    }
  }

  const handleSave = () => {
    if (!isValid) {
      toast.error('Please fill in Exchange, API Key, and API Secret')
      return
    }
    onSave({
      id: initial.id || `ex_${name.toLowerCase()}_${Date.now()}`,
      name: name as ExchangeName,
      apiKey,
      apiSecret,
      passphrase,
      testnet,
      accountType: accountType as ExchangeConfig['accountType'],
      isActive: true,
      connectedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="space-y-4 py-2">
      {/* Exchange Selector */}
      <div className="space-y-2">
        <Label className="text-slate-300">
          Exchange <span className="text-red-400">*</span>
        </Label>
        <Select value={name} onValueChange={(v) => { setName(v as ExchangeName); setTestResult('idle') }}>
          <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100 w-full">
            <SelectValue placeholder="Select exchange" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {(['Binance', 'Bybit', 'BingX', 'OKX', 'KuCoin'] as ExchangeName[]).map((ex) => (
              <SelectItem key={ex} value={ex}>{ex}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Security Notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-600/20">
        <Shield className="size-4 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-300/80">
          API keys are stored locally in your browser. They are never sent to our servers. Use IP restrictions on your exchange for extra security.
        </p>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <Label className="text-slate-300">
          API Key <span className="text-red-400">*</span>
        </Label>
        <div className="relative">
          <Input
            type="text"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setTestResult('idle') }}
            className="bg-slate-800 border-slate-700 text-slate-100 pr-10 font-mono text-sm"
            placeholder="e.g. abc123def456ghi789"
          />
          <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
        </div>
      </div>

      {/* API Secret */}
      <div className="space-y-2">
        <Label className="text-slate-300">
          API Secret <span className="text-red-400">*</span>
        </Label>
        <div className="relative">
          <Input
            type={showSecret ? 'text' : 'password'}
            value={apiSecret}
            onChange={(e) => { setApiSecret(e.target.value); setTestResult('idle') }}
            className="bg-slate-800 border-slate-700 text-slate-100 pr-20 font-mono text-sm"
            placeholder="Enter your API secret"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 h-7 px-2"
          >
            {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Passphrase (conditional) */}
      {needsPassphrase && (
        <div className="space-y-2">
          <Label className="text-slate-300">Passphrase <span className="text-red-400">*</span></Label>
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm"
            placeholder="Enter passphrase"
          />
          <p className="text-xs text-slate-500">Required for {name} accounts</p>
        </div>
      )}

      {/* Testnet Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-slate-300">Testnet Mode</Label>
          <p className="text-xs text-slate-500">Use test network for paper trading</p>
        </div>
        <Switch checked={testnet} onCheckedChange={setTestnet} />
      </div>

      {/* Account Type */}
      <div className="space-y-2">
        <Label className="text-slate-300">Account Type</Label>
        <RadioGroup value={accountType} onValueChange={setAccountType} className="grid grid-cols-3 gap-2">
          {[
            { value: 'spot', label: 'Spot' },
            { value: 'futures', label: 'Futures' },
            { value: 'both', label: 'Both' },
          ].map((opt) => (
            <Label
              key={opt.value}
              htmlFor={`acc-${opt.value}`}
              className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                accountType === opt.value
                  ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
              }`}
            >
              <RadioGroupItem value={opt.value} id={`acc-${opt.value}`} className="sr-only" />
              {opt.label}
            </Label>
          ))}
        </RadioGroup>
      </div>

      {/* Connection Test */}
      {isValid && (
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing}
            className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Testing Connection...
              </>
            ) : testResult === 'success' ? (
              <>
                <CheckCircle2 className="size-4 text-emerald-400" />
                Connected Successfully
              </>
            ) : testResult === 'fail' ? (
              <>
                <XCircle className="size-4 text-red-400" />
                Connection Failed
              </>
            ) : (
              <>
                <TestTube className="size-4" />
                Test Connection
              </>
            )}
          </Button>
        </div>
      )}

      {/* Actions */}
      <DialogFooter className="pt-2">
        <Button variant="outline" onClick={onCancel} className="border-slate-700 text-slate-300">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!isValid}
          className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
        >
          {saveLabel}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ============================================================
// Balance Display Component
// ============================================================
function BalanceDisplay({ exchange }: { exchange: ExchangeConfig | undefined }) {
  type BalanceEntry = { asset: string; free: number; used: number; total: number }
  type State = { loading: boolean; balances: BalanceEntry[]; error: string }
  type Action =
    | { type: 'fetch_start' }
    | { type: 'fetch_success'; balances: BalanceEntry[] }
    | { type: 'fetch_error'; error: string }

  const initialState: State = { loading: false, balances: [], error: '' }
  function reducer(state: State, action: Action): State {
    switch (action.type) {
      case 'fetch_start': return { loading: true, balances: [], error: '' }
      case 'fetch_success': return { loading: false, balances: action.balances, error: '' }
      case 'fetch_error': return { loading: false, balances: [], error: action.error }
    }
  }

  const [state, dispatch] = useReducer(reducer, initialState)
  const { loading, balances, error } = state

  useEffect(() => {
    if (!exchange?.isActive || !exchange.apiKey) return
    dispatch({ type: 'fetch_start' })
    fetch('/api/trading/real', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getBalance',
        exchange: {
          id: exchange.id,
          name: exchange.name,
          apiKey: exchange.apiKey,
          apiSecret: exchange.apiSecret,
          passphrase: exchange.passphrase,
          testnet: exchange.testnet,
          accountType: exchange.accountType,
        },
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          const b = json.data
          const list: BalanceEntry[] = []
          for (const [asset, data] of Object.entries(b.total || {})) {
            const val = data as number
            if (val > 0) {
              list.push({
                asset,
                free: (b.free?.[asset] as number) || 0,
                used: (b.used?.[asset] as number) || 0,
                total: val,
              })
            }
          }
          list.sort((a, c) => c.total - a.total)
          dispatch({ type: 'fetch_success', balances: list.slice(0, 20) })
        } else {
          dispatch({ type: 'fetch_error', error: json.error || 'Failed to fetch balances' })
        }
      })
      .catch((err) => {
        dispatch({ type: 'fetch_error', error: err.message })
      })
  }, [exchange])

  if (!exchange?.isActive) {
    return (
      <div className="bg-slate-800/50 p-6 text-center">
        <Wallet className="size-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Connect your exchange to view balances</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-slate-800/50 p-8 text-center">
        <Loader2 className="size-8 text-emerald-400 mx-auto mb-2 animate-spin" />
        <p className="text-sm text-slate-400">Fetching balances from {exchange.name}...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-500/5 border border-red-500/20 p-6 text-center rounded-lg">
        <XCircle className="size-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">{error}</p>
      </div>
    )
  }

  if (balances.length === 0) {
    return (
      <div className="bg-slate-800/50 p-6 text-center">
        <Wallet className="size-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No balance found</p>
      </div>
    )
  }

  const totalValue = balances.reduce((s, b) => s + b.total, 0)

  return (
    <div>
      <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-3">
        <p className="text-xs text-emerald-400/70">Estimated Total Value</p>
        <p className="text-2xl font-bold text-emerald-400">${totalValue.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-slate-700/50 overflow-hidden max-h-64 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/80 sticky top-0">
            <tr>
              <th className="text-left p-2.5 text-slate-400 font-medium">Asset</th>
              <th className="text-right p-2.5 text-slate-400 font-medium">Free</th>
              <th className="text-right p-2.5 text-slate-400 font-medium">Used</th>
              <th className="text-right p-2.5 text-slate-400 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {balances.map((b) => (
              <tr key={b.asset} className="hover:bg-slate-800/30">
                <td className="p-2.5 text-slate-200 font-medium">{b.asset}</td>
                <td className="p-2.5 text-right text-slate-400 font-mono text-xs">{b.free.toFixed(4)}</td>
                <td className="p-2.5 text-right text-slate-400 font-mono text-xs">{b.used.toFixed(4)}</td>
                <td className="p-2.5 text-right text-emerald-400 font-mono text-xs">{b.total.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Main Page Component
// ============================================================
export default function ExchangesPage() {
  const [exchanges, setExchanges] = useState<ExchangeConfig[]>(() => loadExchanges())
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [editExchange, setEditExchange] = useState<ExchangeConfig | null>(null)
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | null>(null)
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})

  // Persist to localStorage whenever exchanges change
  const updateExchanges = useCallback((newExchanges: ExchangeConfig[]) => {
    setExchanges(newExchanges)
    saveExchanges(newExchanges)
  }, [])

  const toggleShowKey = (id: string) => {
    setShowApiKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleAddExchange = (data: ExchangeConfig) => {
    updateExchanges([...exchanges, data])
    toast.success(`${data.name} exchange added successfully!`)
    setAddDialogOpen(false)
  }

  const handleEditExchange = (data: ExchangeConfig) => {
    updateExchanges(exchanges.map((ex) => (ex.id === data.id ? data : ex)))
    toast.success(`${data.name} exchange updated successfully!`)
    setEditDialogOpen(false)
    setEditExchange(null)
  }

  const openEditDialog = (exchange: ExchangeConfig) => {
    setEditExchange(exchange)
    setEditDialogOpen(true)
  }

  const handleRemoveExchange = (id: string, name: string) => {
    updateExchanges(exchanges.filter((ex) => ex.id !== id))
    toast.success(`${name} exchange removed`)
  }

  const handleToggleActive = (id: string) => {
    updateExchanges(
      exchanges.map((ex) => {
        if (ex.id === id) {
          const next = { ...ex, isActive: !ex.isActive }
          if (next.isActive && !next.apiKey) {
            toast.error('Please set API keys first before activating')
            return ex
          }
          toast.success(`${ex.name} ${next.isActive ? 'activated' : 'deactivated'}`)
          return next
        }
        return ex
      }),
    )
  }

  const maskKey = (key: string) => {
    if (!key) return 'Not set'
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 6) + '••••' + key.slice(-4)
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Exchange Management</h1>
          <p className="text-sm text-slate-400 mt-1">Connect and manage your exchange accounts</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          <Plus className="size-4" />
          Add Exchange
        </Button>
      </motion.div>

      {/* Info Banner */}
      {exchanges.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20"
        >
          <p className="text-sm text-blue-300">
            <strong>No exchanges connected yet.</strong> Click &quot;Add Exchange&quot; to connect your first exchange. 
            Your API keys are stored securely in your browser&apos;s local storage.
          </p>
        </motion.div>
      )}

      {/* Exchange Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {exchanges.map((exchange, idx) => {
          const colors = exchangeColors[exchange.name] || exchangeColors.Binance
          const isConnected = exchange.isActive
          const hasKeys = !!exchange.apiKey

          return (
            <motion.div key={exchange.id} variants={cardVariants} initial="hidden" animate="visible" custom={idx}>
              <Card className={`bg-slate-900/80 ${isConnected ? 'border-slate-800/60' : 'border-slate-700/30'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`size-12 rounded-xl ${colors.bg} ${colors.ring} ring-1 flex items-center justify-center`}>
                        <span className={`text-lg font-bold ${colors.text}`}>{exchange.name[0]}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-slate-100 text-base">{exchange.name}</CardTitle>
                          {exchange.testnet && (
                            <Badge variant="outline" className="text-amber-400 border-amber-600/30 bg-amber-500/10 text-[10px]">
                              Testnet
                            </Badge>
                          )}
                          {!hasKeys && (
                            <Badge variant="outline" className="text-slate-500 border-slate-600/30 bg-slate-800 text-[10px]">
                              No Keys
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-slate-500 text-xs mt-0.5">
                          {isConnected ? 'Connected' : 'Disconnected'} · {exchange.accountType}
                        </CardDescription>
                      </div>
                    </div>
                    <div className={`size-3 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500'}`} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* API Key */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">API Key</span>
                    <div className="flex items-center gap-1">
                      <code className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-1 rounded">
                        {showApiKeys[exchange.id] ? exchange.apiKey : maskKey(exchange.apiKey)}
                      </code>
                      {hasKeys && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleShowKey(exchange.id)}
                          className="text-slate-500 hover:text-slate-300 h-6 w-6 p-0"
                        >
                          {showApiKeys[exchange.id] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Account Type */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Account Type</span>
                    <Badge variant="outline" className="text-slate-300 border-slate-600/30 text-xs">
                      {exchange.accountType}
                    </Badge>
                  </div>

                  {/* Activate Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Active</span>
                    <Switch
                      checked={isConnected}
                      onCheckedChange={() => handleToggleActive(exchange.id)}
                      disabled={!hasKeys}
                    />
                  </div>

                  <Separator className="bg-slate-700/50" />

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(exchange)}
                      className="flex-1 h-8 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 text-xs gap-1"
                    >
                      <Edit3 className="size-3" />
                      {hasKeys ? 'Edit Keys' : 'Set Keys'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedExchangeId(exchange.id)
                        setBalanceDialogOpen(true)
                      }}
                      className="flex-1 h-8 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-amber-400 text-xs gap-1"
                    >
                      <Wallet className="size-3" />
                      Balances
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveExchange(exchange.id, exchange.name)}
                      className="h-8 w-8 p-0 border-red-600/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}

        {/* Add Exchange Placeholder Card */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={Math.max(exchanges.length, 0)}>
          <Card
            className="bg-slate-900/40 border-dashed border-2 border-slate-700/50 cursor-pointer hover:border-emerald-600/50 hover:bg-slate-900/60 transition-colors"
            onClick={() => setAddDialogOpen(true)}
          >
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="size-14 rounded-xl bg-slate-800/50 flex items-center justify-center">
                <Plus className="size-7 text-slate-500" />
              </div>
              <p className="text-sm font-medium text-slate-500">Add Exchange</p>
              <p className="text-xs text-slate-600">Connect a new exchange account</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ========== Add Exchange Dialog ========== */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open) }}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Building2 className="size-5 text-emerald-400" />
              Add New Exchange
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter your exchange API credentials to connect
            </DialogDescription>
          </DialogHeader>
          <ExchangeForm
            initial={{}}
            onSave={handleAddExchange}
            onCancel={() => setAddDialogOpen(false)}
            saveLabel="Add Exchange"
          />
        </DialogContent>
      </Dialog>

      {/* ========== Edit Exchange Dialog ========== */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) setEditExchange(null) }}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Edit3 className="size-5 text-amber-400" />
              Edit {editExchange?.name} Credentials
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Update your API keys and settings
            </DialogDescription>
          </DialogHeader>
          {editExchange && (
            <ExchangeForm
              initial={editExchange}
              onSave={handleEditExchange}
              onCancel={() => { setEditDialogOpen(false); setEditExchange(null) }}
              saveLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ========== Balance Dialog ========== */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Wallet className="size-5 text-amber-400" />
              Exchange Balances
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {exchanges.find((e) => e.id === selectedExchangeId)?.name || ''} — Asset Overview
            </DialogDescription>
          </DialogHeader>

          <BalanceDisplay exchange={exchanges.find((e) => e.id === selectedExchangeId)} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(false)} className="border-slate-700 text-slate-300 gap-2">
              <ExternalLink className="size-4" />
              Open on Exchange
            </Button>
            <Button onClick={() => setBalanceDialogOpen(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
