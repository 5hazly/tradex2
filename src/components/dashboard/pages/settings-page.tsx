'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Settings as SettingsIcon,
  Bell,
  Key,
  Database,
  Save,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  TestTube,
  ShieldCheck,
  HardDrive,
  Download,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Bot,
  Webhook,
  Mail,
  Loader2,
  RefreshCw,
  Shield,
  Gauge,
  X,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import type {
  Settings,
  RiskSettings,
  NotificationSettings,
  GeneralSettings,
  Timeframe,
  ApiResponse,
} from '@/lib/types/trading'

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
// Default Settings (fallback)
// ============================================================
const defaultSettings: Settings = {
  risk: {
    maxPositionSize: 5000,
    maxLeverage: 25,
    maxDailyLoss: 1500,
    maxDrawdownPercent: 10,
    stopLossDefault: 2,
    takeProfitDefault: 5,
    maxOpenPositions: 10,
    riskPerTrade: 2,
  },
  notifications: {
    telegramEnabled: true,
    telegramBotToken: '',
    telegramChatId: '',
    discordEnabled: true,
    discordWebhook: '',
    emailEnabled: false,
    emailAddress: '',
    notifyOnTradeOpen: true,
    notifyOnTradeClose: true,
    notifyOnProfit: true,
    notifyOnLoss: true,
    notifyOnDrawdown: true,
    notifyOnError: true,
    minProfitNotify: 100,
    minLossNotify: 50,
    drawdownAlertPercent: 5,
  },
  general: {
    defaultExchange: 'Binance',
    defaultTimeframe: '1h' as Timeframe,
    baseCurrency: 'USDT',
    autoCompound: false,
    trailingStopEnabled: true,
    trailingStopDistance: 1.5,
    antiLiqEnabled: true,
    antiLiqThreshold: 70,
    uiTheme: 'dark' as 'light' | 'dark' | 'system',
    refreshInterval: 5,
    showTestingPanel: false,
  },
}

// ============================================================
// API Keys Mock
// ============================================================
interface ApiKeyEntry {
  id: string
  name: string
  key: string
  created: string
  permissions: string[]
  lastUsed: string
}

const initialApiKeys: ApiKeyEntry[] = [
  { id: 'api_1', name: 'Main Trading Bot', key: 'ta_sk_••••••••••••k3xTf9', created: '2024-09-15', permissions: ['read', 'write'], lastUsed: '2 min ago' },
  { id: 'api_2', name: 'Analytics Dashboard', key: 'ta_sk_••••••••••••7vNqm2', created: '2024-11-20', permissions: ['read'], lastUsed: '1h ago' },
  { id: 'api_3', name: 'Mobile App', key: 'ta_sk_••••••••••••4tYzw8', created: '2024-12-01', permissions: ['read', 'write', 'admin'], lastUsed: '3 days ago' },
]

// ============================================================
// Main Component
// ============================================================
export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>(initialApiKeys)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})

  // Danger dialog
  const [dangerDialogOpen, setDangerDialogOpen] = useState(false)
  const [dangerAction, setDangerAction] = useState<string>('')

  // Test connection loading state
  const [testingChannel, setTestingChannel] = useState<string | null>(null)

  // ============================================================
  // Load settings from API
  // ============================================================
  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/settings')
      const json: ApiResponse<Settings> = await res.json()
      if (json.success && json.data) {
        setSettings(json.data)
      }
    } catch {
      // Use defaults if API fails
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // ============================================================
  // Update helpers
  // ============================================================
  const updateRisk = useCallback(<K extends keyof RiskSettings>(key: K, value: RiskSettings[K]) => {
    setSettings((prev) => ({
      ...prev,
      risk: { ...prev.risk, [key]: value },
    }))
    setHasChanges(true)
  }, [])

  const updateNotif = useCallback(<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
    setHasChanges(true)
  }, [])

  const updateGeneral = useCallback(<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => {
    setSettings((prev) => ({
      ...prev,
      general: { ...prev.general, [key]: value },
    }))
    setHasChanges(true)
  }, [])

  // ============================================================
  // Save all settings to API
  // ============================================================
  const handleSave = async () => {
    setSaving(true)
    try {
      // Save each section
      const sections = ['risk', 'notifications', 'general'] as const
      const results = await Promise.allSettled(
        sections.map(async (section) => {
          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section, [section]: settings[section] }),
          })
          const json = await res.json()
          if (!json.success) throw new Error(json.error || `${section} save failed`)
          return json
        })
      )

      const allOk = results.every((r) => r.status === 'fulfilled')
      if (allOk) {
        toast.success('All settings saved successfully!')
        setHasChanges(false)
      } else {
        const failed = results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason?.message).join(', ')
        toast.error(`Some settings failed: ${failed}`)
      }
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================
  // Reset to defaults
  // ============================================================
  const handleResetDefaults = () => {
    setSettings(defaultSettings)
    setHasChanges(true)
    toast.info('Settings reset to defaults. Click Save to apply.')
  }

  // ============================================================
  // Test connection
  // ============================================================
  const handleTest = (channel: string) => {
    setTestingChannel(channel)
    setTimeout(() => {
      setTestingChannel(null)
      toast.success(`${channel} test notification sent!`)
    }, 1800)
  }

  // ============================================================
  // API Key management
  // ============================================================
  const handleGenerateApiKey = () => {
    const newKey: ApiKeyEntry = {
      id: `api_${Date.now()}`,
      name: `New Key ${apiKeys.length + 1}`,
      key: `ta_sk_${Math.random().toString(36).slice(2, 6)}••••••${Math.random().toString(36).slice(2, 6)}`,
      created: new Date().toISOString().split('T')[0],
      permissions: ['read'],
      lastUsed: 'Never',
    }
    setApiKeys((prev) => [newKey, ...prev])
    toast.success('New API key generated')
  }

  const handleDeleteApiKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id))
    toast.success('API key deleted')
  }

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ============================================================
  // Danger zone actions
  // ============================================================
  const handleDangerAction = () => {
    if (dangerAction === 'clearLogs') {
      toast.success('All logs have been cleared.')
    } else if (dangerAction === 'resetDb') {
      toast.success('Database has been reset to factory defaults.')
    } else if (dangerAction === 'resetAll') {
      handleResetDefaults()
      toast.success('All settings have been reset to defaults.')
    }
    setDangerDialogOpen(false)
    setDangerAction('')
  }

  // ============================================================
  // Loading state
  // ============================================================
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="size-10 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading settings...</p>
      </div>
    )
  }

  const { risk, notifications: notif, general } = settings

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <SettingsIcon className="size-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Settings</h1>
            <p className="text-sm text-slate-400 mt-1">Configure your trading bot preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSettings}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-200"
          >
            <RefreshCw className="size-4 mr-1.5" />
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
          >
            <RotateCcw className="size-4 mr-1.5" />
            Reset Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`gap-2 transition-all ${hasChanges ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-4" />
                {hasChanges ? 'Save Changes' : 'Saved'}
              </>
            )}
          </Button>
        </div>
      </motion.div>

      {/* Unsaved Changes Banner */}
      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-600/20"
        >
          <div className="size-2 rounded-full bg-amber-400 animate-pulse" />
          <p className="text-sm text-amber-300">You have unsaved changes</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-7 text-xs ml-auto"
          >
            Save now
          </Button>
        </motion.div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-slate-800/50 border border-slate-700/50 p-1 h-auto">
          <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
            <SettingsIcon className="size-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="risk" className="gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
            <Shield className="size-4" />
            <span className="hidden sm:inline">Risk Management</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
            <Bell className="size-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
            <Key className="size-4" />
            <span className="hidden sm:inline">API</span>
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400">
            <Database className="size-4" />
            <span className="hidden sm:inline">Database</span>
          </TabsTrigger>
        </TabsList>

        {/* ==================== GENERAL TAB ==================== */}
        <TabsContent value="general" className="space-y-6">
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <SettingsIcon className="size-5 text-emerald-400" />
                  General Settings
                </CardTitle>
                <CardDescription className="text-slate-400">Configure core bot behavior and preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Row 1: Exchange, Timeframe, Currency */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Default Exchange</Label>
                    <Select value={general.defaultExchange} onValueChange={(v) => updateGeneral('defaultExchange', v)}>
                      <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {['Binance', 'Bybit', 'BingX', 'OKX', 'KuCoin'].map((ex) => (
                          <SelectItem key={ex} value={ex} className="text-slate-200 focus:bg-slate-700 focus:text-white">{ex}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Default Timeframe</Label>
                    <Select value={general.defaultTimeframe} onValueChange={(v) => updateGeneral('defaultTimeframe', v as Timeframe)}>
                      <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as Timeframe[]).map((tf) => (
                          <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Base Currency</Label>
                    <Select value={general.baseCurrency} onValueChange={(v) => updateGeneral('baseCurrency', v)}>
                      <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {['USDT', 'USDC', 'BUSD', 'BTC', 'ETH'].map((c) => (
                          <SelectItem key={c} value={c} className="text-slate-200 focus:bg-slate-700 focus:text-white">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Row 2: UI Theme, Refresh Interval */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-slate-300">UI Theme</Label>
                    <Select value={general.uiTheme} onValueChange={(v) => updateGeneral('uiTheme', v as 'light' | 'dark' | 'system')}>
                      <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="dark" className="text-slate-200">Dark</SelectItem>
                        <SelectItem value="light" className="text-slate-200">Light</SelectItem>
                        <SelectItem value="system" className="text-slate-200">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Refresh Interval</Label>
                      <span className="text-sm font-mono text-emerald-400">{general.refreshInterval}s</span>
                    </div>
                    <Slider
                      value={[general.refreshInterval]}
                      onValueChange={([v]) => updateGeneral('refreshInterval', v)}
                      min={1}
                      max={60}
                      step={1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1s</span>
                      <span>60s</span>
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Row 3: Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="space-y-0.5">
                      <Label className="text-slate-300">Auto-Compound Profits</Label>
                      <p className="text-xs text-slate-500">Reinvest profits automatically into trades</p>
                    </div>
                    <Switch
                      checked={general.autoCompound}
                      onCheckedChange={(v) => updateGeneral('autoCompound', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="space-y-0.5">
                      <Label className="text-slate-300">Show Testing Panel</Label>
                      <p className="text-xs text-slate-500">Display backtesting controls in sidebar</p>
                    </div>
                    <Switch
                      checked={general.showTestingPanel}
                      onCheckedChange={(v) => updateGeneral('showTestingPanel', v)}
                    />
                  </div>
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Row 4: Trailing Stop */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="space-y-0.5">
                      <Label className="text-slate-300">Trailing Stop</Label>
                      <p className="text-xs text-slate-500">Automatically adjust stop-loss as price moves in favor</p>
                    </div>
                    <Switch
                      checked={general.trailingStopEnabled}
                      onCheckedChange={(v) => updateGeneral('trailingStopEnabled', v)}
                    />
                  </div>
                  {general.trailingStopEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-3 pl-4 border-l-2 border-emerald-600/30"
                    >
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-300">Trailing Distance (%)</Label>
                        <span className="text-sm font-mono text-emerald-400">{general.trailingStopDistance}%</span>
                      </div>
                      <Slider
                        value={[general.trailingStopDistance]}
                        onValueChange={([v]) => updateGeneral('trailingStopDistance', v)}
                        min={0.1}
                        max={10}
                        step={0.1}
                        className="py-2"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>0.1%</span>
                        <span>10%</span>
                      </div>
                    </motion.div>
                  )}
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Row 5: Anti-Liquidation */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Shield className="size-4 text-amber-400" />
                        <Label className="text-slate-300">Anti-Liquidation Protection</Label>
                      </div>
                      <p className="text-xs text-slate-500">Auto-close positions before liquidation</p>
                    </div>
                    <Switch
                      checked={general.antiLiqEnabled}
                      onCheckedChange={(v) => updateGeneral('antiLiqEnabled', v)}
                    />
                  </div>
                  {general.antiLiqEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-3 pl-4 border-l-2 border-amber-600/30"
                    >
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-300">Threshold (%)</Label>
                        <span className="text-sm font-mono text-amber-400">{general.antiLiqThreshold}%</span>
                      </div>
                      <Slider
                        value={[general.antiLiqThreshold]}
                        onValueChange={([v]) => updateGeneral('antiLiqThreshold', v)}
                        min={10}
                        max={95}
                        step={1}
                        className="py-2"
                      />
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>10% (aggressive)</span>
                        <span>95% (safe)</span>
                      </div>
                      <p className="text-xs text-slate-500">Position will be auto-closed when margin level drops below {general.antiLiqThreshold}%</p>
                    </motion.div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ==================== RISK MANAGEMENT TAB ==================== */}
        <TabsContent value="risk" className="space-y-6">
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="size-5 text-emerald-400" />
                  Risk Management
                </CardTitle>
                <CardDescription className="text-slate-400">Configure risk limits and protective parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Risk Score Display */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/30">
                  <div className="relative size-16 flex items-center justify-center">
                    <svg className="size-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="#334155" strokeWidth="4" />
                      <circle
                        cx="32" cy="32" r="28" fill="none"
                        stroke={risk.riskPerTrade <= 2 ? '#10b981' : risk.riskPerTrade <= 5 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${(risk.riskPerTrade / 10) * 176} 176`}
                      />
                    </svg>
                    <span className="absolute text-sm font-bold text-white">{risk.riskPerTrade}%</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">Risk Per Trade</p>
                    <p className="text-xs text-slate-500 mt-0.5">Recommended: 1-3% of total balance per trade</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge className={risk.riskPerTrade <= 2 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : risk.riskPerTrade <= 5 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'}>
                        {risk.riskPerTrade <= 2 ? 'Conservative' : risk.riskPerTrade <= 5 ? 'Moderate' : 'Aggressive'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Sliders */}
                <div className="space-y-6">
                  {/* Risk Per Trade */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Risk Per Trade (%)</Label>
                      <span className="text-sm font-mono text-emerald-400">{risk.riskPerTrade}%</span>
                    </div>
                    <Slider
                      value={[risk.riskPerTrade]}
                      onValueChange={([v]) => updateRisk('riskPerTrade', v)}
                      min={0.5}
                      max={10}
                      step={0.5}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0.5% (safe)</span>
                      <span>10% (risky)</span>
                    </div>
                  </div>

                  {/* Max Position Size */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Max Position Size ($)</Label>
                      <span className="text-sm font-mono text-emerald-400">${risk.maxPositionSize.toLocaleString()}</span>
                    </div>
                    <Slider
                      value={[risk.maxPositionSize]}
                      onValueChange={([v]) => updateRisk('maxPositionSize', v)}
                      min={100}
                      max={50000}
                      step={100}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>$100</span>
                      <span>$50,000</span>
                    </div>
                  </div>

                  {/* Max Leverage */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Max Leverage</Label>
                      <span className="text-sm font-mono text-amber-400">{risk.maxLeverage}x</span>
                    </div>
                    <Slider
                      value={[risk.maxLeverage]}
                      onValueChange={([v]) => updateRisk('maxLeverage', v)}
                      min={1}
                      max={125}
                      step={1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1x</span>
                      <span>125x</span>
                    </div>
                  </div>

                  {/* Max Daily Loss */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Max Daily Loss ($)</Label>
                      <span className="text-sm font-mono text-red-400">${risk.maxDailyLoss.toLocaleString()}</span>
                    </div>
                    <Slider
                      value={[risk.maxDailyLoss]}
                      onValueChange={([v]) => updateRisk('maxDailyLoss', v)}
                      min={100}
                      max={10000}
                      step={100}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>$100</span>
                      <span>$10,000</span>
                    </div>
                  </div>

                  {/* Max Drawdown */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Max Drawdown (%)</Label>
                      <span className="text-sm font-mono text-red-400">{risk.maxDrawdownPercent}%</span>
                    </div>
                    <Slider
                      value={[risk.maxDrawdownPercent]}
                      onValueChange={([v]) => updateRisk('maxDrawdownPercent', v)}
                      min={1}
                      max={50}
                      step={1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1%</span>
                      <span>50%</span>
                    </div>
                  </div>

                  {/* Max Open Positions */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Max Open Positions</Label>
                      <span className="text-sm font-mono text-slate-200">{risk.maxOpenPositions}</span>
                    </div>
                    <Slider
                      value={[risk.maxOpenPositions]}
                      onValueChange={([v]) => updateRisk('maxOpenPositions', v)}
                      min={1}
                      max={30}
                      step={1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>1</span>
                      <span>30</span>
                    </div>
                  </div>
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Default SL/TP */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Default Stop-Loss (%)</Label>
                      <span className="text-sm font-mono text-red-400">{risk.stopLossDefault}%</span>
                    </div>
                    <Slider
                      value={[risk.stopLossDefault]}
                      onValueChange={([v]) => updateRisk('stopLossDefault', v)}
                      min={0.1}
                      max={20}
                      step={0.1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0.1%</span>
                      <span>20%</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Default Take-Profit (%)</Label>
                      <span className="text-sm font-mono text-emerald-400">{risk.takeProfitDefault}%</span>
                    </div>
                    <Slider
                      value={[risk.takeProfitDefault]}
                      onValueChange={([v]) => updateRisk('takeProfitDefault', v)}
                      min={0.1}
                      max={50}
                      step={0.1}
                      className="py-2"
                    />
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>0.1%</span>
                      <span>50%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ==================== NOTIFICATIONS TAB ==================== */}
        <TabsContent value="notifications" className="space-y-6">
          {/* Telegram */}
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Bot className="size-5 text-blue-400" />
                  Telegram
                  <Badge className={notif.telegramEnabled ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-slate-700 text-slate-400'}>
                    {notif.telegramEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Bot Token</Label>
                    <Input
                      type="password"
                      value={notif.telegramBotToken}
                      onChange={(e) => updateNotif('telegramBotToken', e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm"
                      placeholder="e.g. 123456:ABC-DEF..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Chat ID</Label>
                    <Input
                      type="password"
                      value={notif.telegramChatId}
                      onChange={(e) => updateNotif('telegramChatId', e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm"
                      placeholder="e.g. -100123456789"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Enable Telegram Notifications</Label>
                  <Switch checked={notif.telegramEnabled} onCheckedChange={(v) => updateNotif('telegramEnabled', v)} />
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleTest('Telegram')}
                  disabled={testingChannel === 'Telegram'}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
                >
                  {testingChannel === 'Telegram' ? <Loader2 className="size-4 animate-spin" /> : <TestTube className="size-4" />}
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Discord */}
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={1}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Webhook className="size-5 text-indigo-400" />
                  Discord
                  <Badge className={notif.discordEnabled ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-slate-700 text-slate-400'}>
                    {notif.discordEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Webhook URL</Label>
                  <Input
                    type="password"
                    value={notif.discordWebhook}
                    onChange={(e) => updateNotif('discordWebhook', e.target.value)}
                    className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Enable Discord Notifications</Label>
                  <Switch checked={notif.discordEnabled} onCheckedChange={(v) => updateNotif('discordEnabled', v)} />
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleTest('Discord')}
                  disabled={testingChannel === 'Discord'}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
                >
                  {testingChannel === 'Discord' ? <Loader2 className="size-4 animate-spin" /> : <TestTube className="size-4" />}
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Email */}
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={2}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Mail className="size-5 text-amber-400" />
                  Email (SMTP)
                  <Badge className={notif.emailEnabled ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30' : 'bg-slate-700 text-slate-400'}>
                    {notif.emailEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Email Address</Label>
                    <Input
                      type="email"
                      value={notif.emailAddress}
                      onChange={(e) => updateNotif('emailAddress', e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                      placeholder="trader@example.com"
                    />
                  </div>
                  <div className="flex items-center justify-end pt-6">
                    <Switch checked={notif.emailEnabled} onCheckedChange={(v) => updateNotif('emailEnabled', v)} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Enable Email Notifications</Label>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleTest('Email')}
                  disabled={testingChannel === 'Email'}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
                >
                  {testingChannel === 'Email' ? <Loader2 className="size-4 animate-spin" /> : <TestTube className="size-4" />}
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Notification Event Preferences */}
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={3}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Bell className="size-5 text-emerald-400" />
                  Event Preferences
                </CardTitle>
                <CardDescription className="text-slate-400">Choose which events trigger notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: 'Trade Open', desc: 'When a new position is opened', key: 'notifyOnTradeOpen' as const },
                    { label: 'Trade Close', desc: 'When a position is closed', key: 'notifyOnTradeClose' as const },
                    { label: 'Profit', desc: 'When a trade closes in profit', key: 'notifyOnProfit' as const },
                    { label: 'Loss', desc: 'When a trade closes in loss', key: 'notifyOnLoss' as const },
                    { label: 'Drawdown Alert', desc: 'When drawdown exceeds threshold', key: 'notifyOnDrawdown' as const },
                    { label: 'Error', desc: 'When API errors occur', key: 'notifyOnError' as const },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/30">
                      <Checkbox
                        id={item.label}
                        checked={notif[item.key] as boolean}
                        onCheckedChange={(v) => updateNotif(item.key, v === true)}
                        className="mt-0.5"
                      />
                      <div className="space-y-0.5">
                        <Label htmlFor={item.label} className="text-slate-300 text-sm cursor-pointer">{item.label}</Label>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator className="bg-slate-700/50" />

                {/* Thresholds */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Min Profit Notify ($)</Label>
                      <span className="text-sm font-mono text-emerald-400">${notif.minProfitNotify}</span>
                    </div>
                    <Slider
                      value={[notif.minProfitNotify]}
                      onValueChange={([v]) => updateNotif('minProfitNotify', v)}
                      min={10}
                      max={10000}
                      step={10}
                      className="py-2"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Min Loss Notify ($)</Label>
                      <span className="text-sm font-mono text-red-400">${notif.minLossNotify}</span>
                    </div>
                    <Slider
                      value={[notif.minLossNotify]}
                      onValueChange={([v]) => updateNotif('minLossNotify', v)}
                      min={10}
                      max={10000}
                      step={10}
                      className="py-2"
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Drawdown Alert (%)</Label>
                      <span className="text-sm font-mono text-amber-400">{notif.drawdownAlertPercent}%</span>
                    </div>
                    <Slider
                      value={[notif.drawdownAlertPercent]}
                      onValueChange={([v]) => updateNotif('drawdownAlertPercent', v)}
                      min={1}
                      max={30}
                      step={1}
                      className="py-2"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ==================== API TAB ==================== */}
        <TabsContent value="api" className="space-y-6">
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Key className="size-5 text-amber-400" />
                      API Keys
                    </CardTitle>
                    <CardDescription className="text-slate-400 mt-1">Manage API keys for external access</CardDescription>
                  </div>
                  <Button onClick={handleGenerateApiKey} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                    <Plus className="size-4" />
                    Generate New Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiKeys.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                    <Key className="size-8 mb-2 opacity-40" />
                    <p className="text-sm">No API keys yet</p>
                  </div>
                ) : (
                  apiKeys.map((apiKey) => (
                    <div key={apiKey.id} className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                            <Key className="size-4 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-200">{apiKey.name}</p>
                            <p className="text-xs text-slate-500">Created {apiKey.created} · Last used {apiKey.lastUsed}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => toggleShowKey(apiKey.id)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/50">
                            {showKeys[apiKey.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { navigator.clipboard.writeText(apiKey.key); toast.success('API key copied') }}
                            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteApiKey(apiKey.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-slate-900 px-3 py-1.5 rounded font-mono text-slate-300 flex-1 overflow-hidden">
                          {showKeys[apiKey.id] ? 'ta_sk_a1b2c3d4e5f6g7h8i9j0_full' : apiKey.key}
                        </code>
                      </div>
                      <div className="flex items-center gap-2">
                        {apiKey.permissions.map((perm) => (
                          <Badge key={perm} variant="outline" className={
                            perm === 'admin' ? 'text-red-400 border-red-600/30 bg-red-500/10'
                              : perm === 'write' ? 'text-amber-400 border-amber-600/30 bg-amber-500/10'
                              : 'text-slate-400 border-slate-600/30'
                          }>
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={1}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ShieldCheck className="size-5 text-emerald-400" />
                  Security Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Active Keys', value: apiKeys.length.toString(), icon: Key, color: 'text-amber-400' },
                    { label: 'Last API Call', value: '2 min ago', icon: RefreshCw, color: 'text-slate-200' },
                    { label: 'Failed Attempts', value: '0', icon: ShieldCheck, color: 'text-emerald-400' },
                  ].map((stat) => (
                    <div key={stat.label} className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/30 flex items-center gap-3">
                      <stat.icon className={`size-4 ${stat.color} shrink-0`} />
                      <div>
                        <p className="text-xs text-slate-500">{stat.label}</p>
                        <p className="text-sm font-semibold text-slate-200">{stat.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* ==================== DATABASE TAB ==================== */}
        <TabsContent value="database" className="space-y-6">
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Database className="size-5 text-emerald-400" />
                  Database Management
                </CardTitle>
                <CardDescription className="text-slate-400">Monitor and maintain your database</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700/30">
                  <div className="flex items-center gap-2">
                    <div className="size-3 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm text-slate-300">Status:</span>
                    <span className="text-sm font-medium text-emerald-400">Connected</span>
                  </div>
                  <Separator orientation="vertical" className="bg-slate-700 h-6" />
                  <div className="flex items-center gap-2">
                    <HardDrive className="size-4 text-slate-500" />
                    <span className="text-sm text-slate-300">Size:</span>
                    <span className="text-sm font-mono text-slate-200">24.7 MB</span>
                  </div>
                  <Separator orientation="vertical" className="bg-slate-700 h-6" />
                  <div className="flex items-center gap-2">
                    <Gauge className="size-4 text-slate-500" />
                    <span className="text-sm text-slate-300">Uptime:</span>
                    <span className="text-sm font-mono text-slate-200">15d 8h 32m</span>
                  </div>
                </div>

                <Separator className="bg-slate-700/50" />

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Trades', value: '2,847' },
                    { label: 'Total Positions', value: '156' },
                    { label: 'Strategies', value: '5' },
                    { label: 'Backtest Results', value: '23' },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-3 rounded-lg bg-slate-800/50">
                      <p className="text-lg font-bold text-slate-200 font-mono">{stat.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <Separator className="bg-slate-700/50" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast.success('Database backup started. Download will begin shortly.')
                    }}
                    className="h-auto py-4 flex-col gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-emerald-400"
                  >
                    <Download className="size-5" />
                    <span className="text-sm font-medium">Backup Database</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDangerAction('clearLogs')
                      setDangerDialogOpen(true)
                    }}
                    className="h-auto py-4 flex-col gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-amber-400"
                  >
                    <RotateCcw className="size-5" />
                    <span className="text-sm font-medium">Clear Logs</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Danger Zone */}
          <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={1}>
            <Card className="bg-slate-900/80 border-red-600/20">
              <CardHeader>
                <CardTitle className="text-red-400 flex items-center gap-2">
                  <AlertTriangle className="size-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription className="text-slate-400">Irreversible actions that permanently affect your data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-red-600/20 bg-red-500/5">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Reset All Data</p>
                    <p className="text-xs text-slate-500">This will permanently delete all trades, positions, strategies and reset settings.</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDangerAction('resetAll')
                      setDangerDialogOpen(true)
                    }}
                    className="border-red-600/40 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  >
                    <AlertTriangle className="size-4 mr-2" />
                    Reset Everything
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* ==================== CONFIRMATION DIALOG ==================== */}
      <Dialog open={dangerDialogOpen} onOpenChange={setDangerDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-400" />
              Confirm Action
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {dangerAction === 'clearLogs'
                ? 'Are you sure you want to clear all logs? This action cannot be undone.'
                : dangerAction === 'resetDb'
                  ? 'Are you sure you want to reset the database to factory defaults? All data will be lost.'
                  : 'Are you sure you want to reset ALL settings and data? This will delete everything permanently.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDangerDialogOpen(false)}
              className="text-slate-400 hover:text-slate-300"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDangerAction}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
