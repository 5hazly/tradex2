'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Power,
  Gauge,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Zap,
  Save,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import { mockPositions, mockBalances, mockSettings } from '@/lib/mock-data'
import { MOCK_EXCHANGE_OKX } from '@/lib/mock-data'
import type { RiskSettings, RiskAlert } from '@/lib/types/trading'

// ============================================================
// Types
// ============================================================
interface RiskStateData {
  killSwitchActive: boolean
  killSwitchActivatedAt: string | null
  killSwitchDeactivatedAt: string | null
  riskScore: number
  alerts: RiskAlertRecord[]
}

interface RiskAlertRecord {
  id: string
  type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  message: string
  time: string
  timestamp: string
  action: string
  isResolved: boolean
}

interface ExposureData {
  totalBalance: number
  totalMargin: number
  totalExposure: number
  todayLoss: number
  currentDrawdown: number
  maxDailyLoss: number
  marginUsagePct: number
  exposureRatio: number
  dailyLossPct: number
}

// ============================================================
// Helpers
// ============================================================
function getRiskColor(score: number) {
  if (score < 30) return { text: 'text-emerald-400', bg: 'bg-emerald-400', ring: 'stroke-emerald-400', label: 'Low' }
  if (score < 60) return { text: 'text-amber-400', bg: 'bg-amber-400', ring: 'stroke-amber-400', label: 'Medium' }
  return { text: 'text-red-400', bg: 'bg-red-400', ring: 'stroke-red-400', label: 'High' }
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'LOW': return 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30'
    case 'MEDIUM': return 'bg-amber-500/10 text-amber-400 border-amber-600/30'
    case 'HIGH': return 'bg-red-500/10 text-red-400 border-red-600/30'
    default: return 'bg-slate-500/10 text-slate-400 border-slate-600/30'
  }
}

function computeRiskScore(settings: RiskSettings, exposure: ExposureData): number {
  let score = 0

  // Margin usage contribution (0-25)
  if (exposure.marginUsagePct > 80) score += 25
  else if (exposure.marginUsagePct > 60) score += 18
  else if (exposure.marginUsagePct > 40) score += 10
  else score += 3

  // Daily loss usage (0-25)
  if (exposure.dailyLossPct > 90) score += 25
  else if (exposure.dailyLossPct > 60) score += 18
  else if (exposure.dailyLossPct > 30) score += 10
  else score += 2

  // Drawdown (0-25)
  if (Math.abs(exposure.currentDrawdown) > settings.maxDrawdownPercent * 0.9) score += 25
  else if (Math.abs(exposure.currentDrawdown) > settings.maxDrawdownPercent * 0.6) score += 15
  else if (Math.abs(exposure.currentDrawdown) > settings.maxDrawdownPercent * 0.3) score += 8
  else score += 2

  // Leverage factor (0-25)
  const maxPosLeverage = mockPositions.reduce((m, p) => Math.max(m, p.leverage), 1)
  if (maxPosLeverage > settings.maxLeverage) score += 25
  else if (maxPosLeverage > settings.maxLeverage * 0.8) score += 15
  else if (maxPosLeverage > settings.maxLeverage * 0.5) score += 8
  else score += 2

  return Math.min(100, Math.max(0, score))
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ============================================================
// Risk Gauge SVG
// ============================================================
function RiskGauge({ score }: { score: number }) {
  const colors = getRiskColor(score)
  const angle = (score / 100) * 180
  const radians = (angle - 180) * (Math.PI / 180)
  const cx = 80
  const cy = 80
  const r = 65
  const x = cx + r * Math.cos(radians)
  const y = cy + r * Math.sin(radians)

  return (
    <div className="relative">
      <svg viewBox="0 0 160 100" className="w-48 h-32">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          className="text-slate-700/50"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx - r * Math.cos(Math.PI * 0.6)} ${cy - r * Math.sin(Math.PI * 0.6)}`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-emerald-500/40"
        />
        <path
          d={`M ${cx - r * Math.cos(Math.PI * 0.6)} ${cy - r * Math.sin(Math.PI * 0.6)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(Math.PI * 0.6)} ${cy - r * Math.sin(Math.PI * 0.6)}`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-amber-500/40"
        />
        <path
          d={`M ${cx + r * Math.cos(Math.PI * 0.6)} ${cy - r * Math.sin(Math.PI * 0.6)} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className="stroke-red-500/40"
        />
        <line x1={cx} y1={cy} x2={x} y2={y} strokeWidth="2.5" className={colors.ring} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="currentColor" className={colors.bg} />
      </svg>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <span className={`text-2xl font-bold ${colors.text}`}>{score}</span>
        <p className="text-xs text-slate-500 -mt-0.5">Risk Score</p>
      </div>
    </div>
  )
}

// ============================================================
// Confirm Dialog
// ============================================================
function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel,
  variant = 'danger',
}: {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  description: string
  confirmLabel: string
  variant?: 'danger' | 'success'
}) {
  if (!open) return null
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-full ${variant === 'danger' ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
            {variant === 'danger' ? (
              <AlertTriangle className="size-5 text-red-400" />
            ) : (
              <ShieldCheck className="size-5 text-emerald-400" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        </div>
        <p className="text-sm text-slate-400 mb-6">{description}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel} className="border-slate-600 text-slate-300 hover:bg-slate-800">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className={
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }
          >
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ============================================================
// Main Component
// ============================================================
const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: 'easeOut' },
  }),
}

export default function RiskPage() {
  // Loading states
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isKillSwitchLoading, setIsKillSwitchLoading] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Risk state from API
  const [killSwitchActive, setKillSwitchActive] = useState(false)
  const [riskAlerts, setRiskAlerts] = useState<RiskAlertRecord[]>([])
  const [riskScore, setRiskScore] = useState(38)

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: 'activate' | 'deactivate' | null
  }>({ open: false, action: null })

  // Position risk settings
  const [maxPositionSize, setMaxPositionSize] = useState(5000)
  const [maxLeverage, setMaxLeverage] = useState(25)
  const [maxPositions, setMaxPositions] = useState(10)
  const [riskPerTrade, setRiskPerTrade] = useState(2)
  const [sizingMethod, setSizingMethod] = useState('fixed')

  // Account protection
  const [maxDailyLoss, setMaxDailyLoss] = useState(1500)
  const [dailyLossEnabled, setDailyLossEnabled] = useState(true)
  const [maxDrawdown, setMaxDrawdown] = useState(10)
  const [drawdownEnabled, setDrawdownEnabled] = useState(true)
  const [equityProtection, setEquityProtection] = useState(85)
  const [autoShutdown, setAutoShutdown] = useState(true)
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(false)

  // Market protection
  const [maxSpread, setMaxSpread] = useState(10)
  const [slippageEnabled, setSlippageEnabled] = useState(true)
  const [maxSlippage, setMaxSlippage] = useState(0.5)
  const [volatilityEnabled, setVolatilityEnabled] = useState(false)
  const [atrThreshold, setAtrThreshold] = useState(2.0)
  const [newsFilter, setNewsFilter] = useState(true)
  const [tradingStart, setTradingStart] = useState('00:00')
  const [tradingEnd, setTradingEnd] = useState('23:59')

  // Alert filters
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ALL')
  const [alertsExpanded, setAlertsExpanded] = useState(true)

  // Computed exposure
  const activeBalances = mockBalances.filter((b) => b.exchangeId !== MOCK_EXCHANGE_OKX)
  const totalBalance = activeBalances.reduce((s, b) => s + b.totalBalance, 0)
  const totalMargin = mockPositions.reduce((s, p) => s + p.margin, 0)
  const totalExposure = mockPositions.reduce((s, p) => s + p.entryPrice * p.quantity * p.leverage, 0)
  const todayLoss = -185
  const currentDrawdown = -2.1
  const marginUsagePct = totalBalance > 0 ? (totalMargin / totalBalance) * 100 : 0
  const exposureRatio = totalBalance > 0 ? (totalExposure / (totalBalance * 10)) * 100 : 0
  const dailyLossPct = maxDailyLoss > 0 ? (Math.abs(todayLoss) / maxDailyLoss) * 100 : 0

  const riskColors = getRiskColor(riskScore)

  // ============================================================
  // Load data on mount
  // ============================================================
  useEffect(() => {
    async function loadRiskData() {
      try {
        const res = await fetch('/api/risk')
        const json = await res.json()
        if (json.success && json.data) {
          const data = json.data as RiskStateData
          setKillSwitchActive(data.killSwitchActive)
          setRiskAlerts(data.alerts || [])
          setRiskScore(data.riskScore || 38)
        }
      } catch {
        console.warn('Failed to load risk state, using defaults')
      }

      try {
        const res = await fetch('/api/settings')
        const json = await res.json()
        if (json.success && json.data?.risk) {
          const r = json.data.risk
          setMaxPositionSize(r.maxPositionSize)
          setMaxLeverage(r.maxLeverage)
          setMaxPositions(r.maxOpenPositions)
          setRiskPerTrade(r.riskPerTrade)
          setMaxDailyLoss(r.maxDailyLoss)
          setMaxDrawdown(r.maxDrawdownPercent)
        }
      } catch {
        console.warn('Failed to load settings, using defaults')
      }

      setIsLoading(false)
    }
    loadRiskData()
  }, [])

  // Recalculate risk score when settings or data change
  useEffect(() => {
    const exposure: ExposureData = {
      totalBalance,
      totalMargin,
      totalExposure,
      todayLoss,
      currentDrawdown,
      maxDailyLoss,
      marginUsagePct,
      exposureRatio,
      dailyLossPct,
    }
    const settings: RiskSettings = {
      maxPositionSize,
      maxLeverage,
      maxDailyLoss,
      maxDrawdownPercent: maxDrawdown,
      stopLossDefault: 2,
      takeProfitDefault: 5,
      maxOpenPositions: maxPositions,
      riskPerTrade,
    }
    const score = computeRiskScore(settings, exposure)
    setRiskScore(score)
  }, [maxPositionSize, maxLeverage, maxDailyLoss, maxDrawdown, maxPositions, riskPerTrade, totalBalance, totalMargin, totalExposure, todayLoss, currentDrawdown])

  // Track changes
  useEffect(() => {
    setHasChanges(true)
  }, [maxPositionSize, maxLeverage, maxPositions, riskPerTrade, sizingMethod, maxDailyLoss, dailyLossEnabled, maxDrawdown, drawdownEnabled, equityProtection, autoShutdown, killSwitchEnabled, maxSpread, slippageEnabled, maxSlippage, volatilityEnabled, atrThreshold, newsFilter, tradingStart, tradingEnd])

  // ============================================================
  // Kill Switch with confirmation
  // ============================================================
  const requestKillSwitch = (action: 'activate' | 'deactivate') => {
    setConfirmDialog({ open: true, action })
  }

  const confirmKillSwitch = async () => {
    const activate = confirmDialog.action === 'activate'
    setConfirmDialog({ open: false, action: null })
    setIsKillSwitchLoading(true)

    try {
      const res = await fetch('/api/risk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill_switch', activate }),
      })
      const json = await res.json()

      if (json.success) {
        setKillSwitchActive(activate)
        if (activate) {
          toast.error('EMERGENCY STOP - All trading has been halted!', {
            description: 'Kill switch activated. No new orders will be placed.',
            duration: 5000,
          })
        } else {
          toast.success('Trading resumed - Kill switch deactivated', {
            description: 'All trading operations have been restored.',
            duration: 3000,
          })
        }

        // Refresh alerts
        const riskRes = await fetch('/api/risk')
        const riskJson = await riskRes.json()
        if (riskJson.success && riskJson.data?.alerts) {
          setRiskAlerts(riskJson.data.alerts)
        }
      } else {
        toast.error(json.error || 'Failed to toggle kill switch')
      }
    } catch {
      toast.error('Network error - could not toggle kill switch')
    } finally {
      setIsKillSwitchLoading(false)
    }
  }

  // ============================================================
  // Save Settings
  // ============================================================
  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const riskSettings = {
        maxPositionSize,
        maxLeverage,
        maxDailyLoss: dailyLossEnabled ? maxDailyLoss : 999999,
        maxDrawdownPercent: drawdownEnabled ? maxDrawdown : 100,
        stopLossDefault: 2,
        takeProfitDefault: 5,
        maxOpenPositions: maxPositions,
        riskPerTrade: riskPerTrade / 100,
      }

      // Save to settings API
      const settingsRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'risk', risk: riskSettings }),
      })

      const settingsJson = await settingsRes.json()

      // Also save extended risk settings
      const riskRes = await fetch('/api/risk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_settings',
          settings: {
            ...riskSettings,
            sizingMethod,
            dailyLossEnabled,
            drawdownEnabled,
            equityProtection,
            autoShutdown,
            killSwitchEnabled,
            maxSpread,
            slippageEnabled,
            maxSlippage,
            volatilityEnabled,
            atrThreshold,
            newsFilter,
            tradingStart,
            tradingEnd,
          },
        }),
      })

      const riskJson = await riskRes.json()

      if (settingsJson.success || riskJson.success) {
        setHasChanges(false)
        toast.success('Risk settings saved successfully', {
          description: 'All risk parameters have been updated and applied.',
        })
      } else {
        toast.error('Failed to save settings')
      }
    } catch {
      toast.error('Network error - settings not saved')
    } finally {
      setIsSaving(false)
    }
  }, [maxPositionSize, maxLeverage, maxPositions, riskPerTrade, sizingMethod, maxDailyLoss, dailyLossEnabled, maxDrawdown, drawdownEnabled, equityProtection, autoShutdown, killSwitchEnabled, maxSpread, slippageEnabled, maxSlippage, volatilityEnabled, atrThreshold, newsFilter, tradingStart, tradingEnd])

  // ============================================================
  // Refresh data
  // ============================================================
  const refreshData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/risk')
      const json = await res.json()
      if (json.success && json.data) {
        setKillSwitchActive(json.data.killSwitchActive)
        setRiskAlerts(json.data.alerts || [])
        setRiskScore(json.data.riskScore || 38)
      }
    } catch {
      // silent fail
    }
    setIsLoading(false)
  }

  // Filtered alerts
  const filteredAlerts = riskAlerts.filter((a) => {
    if (alertFilter === 'ACTIVE') return !a.isResolved
    if (alertFilter === 'RESOLVED') return a.isResolved
    return true
  })

  // ============================================================
  // Render
  // ============================================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-3">
          <Loader2 className="size-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Loading risk management...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onConfirm={confirmKillSwitch}
        onCancel={() => setConfirmDialog({ open: false, action: null })}
        title={confirmDialog.action === 'activate' ? 'Activate Kill Switch?' : 'Resume Trading?'}
        description={
          confirmDialog.action === 'activate'
            ? 'This will immediately halt ALL trading operations. No new orders will be placed. Existing positions will remain open but no new trades will execute.'
            : 'This will resume all trading operations. The system will begin processing signals and placing orders again according to your risk parameters.'
        }
        confirmLabel={confirmDialog.action === 'activate' ? 'ACTIVATE KILL SWITCH' : 'RESUME TRADING'}
        variant={confirmDialog.action === 'activate' ? 'danger' : 'success'}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Risk Management</h1>
            <p className="text-sm text-slate-400 mt-1">Monitor and control your trading risk parameters</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={refreshData}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className={`gap-2 transition-all ${hasChanges ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`}
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : hasChanges ? (
              <Save className="size-4" />
            ) : (
              <Check className="size-4" />
            )}
            {isSaving ? 'Saving...' : hasChanges ? 'Save Settings' : 'Saved'}
          </Button>
          <Button
            onClick={() => requestKillSwitch(killSwitchActive ? 'deactivate' : 'activate')}
            disabled={isKillSwitchLoading}
            className={
              killSwitchActive
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white gap-2'
                : 'bg-red-600 hover:bg-red-700 text-white gap-2 animate-pulse'
            }
          >
            {isKillSwitchLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Power className="size-4" />
            )}
            {killSwitchActive ? 'Resume Trading' : 'KILL SWITCH'}
          </Button>
        </div>
      </motion.div>

      {/* Unsaved changes banner */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 rounded-xl bg-amber-500/10 border border-amber-600/30 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Info className="size-4 text-amber-400" />
              <p className="text-sm text-amber-300">You have unsaved changes to your risk settings.</p>
            </div>
            <Button size="sm" onClick={handleSave} className="bg-amber-600 hover:bg-amber-700 text-white gap-1">
              <Save className="size-3" />
              Save Now
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kill Switch Banner */}
      {killSwitchActive && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 rounded-xl bg-red-500/10 border border-red-600/30 flex items-center gap-3"
        >
          <ShieldX className="size-6 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">Emergency Kill Switch Active</p>
            <p className="text-xs text-red-400/70 mt-0.5">All trading operations have been halted. No new orders will be placed.</p>
          </div>
          <Button
            size="sm"
            onClick={() => requestKillSwitch('deactivate')}
            variant="outline"
            className="border-red-600/40 text-red-400 hover:bg-red-500/20"
            disabled={isKillSwitchLoading}
          >
            Resume
          </Button>
        </motion.div>
      )}

      {/* Risk Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk Gauge */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={0}>
          <Card className="bg-slate-900/80 border-slate-800/60">
            <CardContent className="p-6 flex flex-col items-center">
              <RiskGauge score={riskScore} />
              <Badge className={`mt-2 ${riskScore < 30 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30' : riskScore < 60 ? 'bg-amber-500/10 text-amber-400 border-amber-600/30' : 'bg-red-500/10 text-red-400 border-red-600/30'}`}>
                {riskColors.label} Risk
              </Badge>
              <p className="text-xs text-slate-500 mt-2 text-center">
                Auto-calculated from margin usage, daily loss, drawdown, and leverage
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Current Exposure */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={1}>
          <Card className="bg-slate-900/80 border-slate-800/60 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                <Activity className="size-4 text-emerald-400" />
                Current Exposure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Margin Used</span>
                  <span className="text-slate-200 font-mono">${totalMargin.toLocaleString()} / ${totalBalance.toLocaleString()}</span>
                </div>
                <Progress value={marginUsagePct} className="h-2" />
                <p className="text-xs text-slate-500">{marginUsagePct.toFixed(1)}% of total balance</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total Exposure</span>
                  <span className="text-slate-200 font-mono">${totalExposure.toLocaleString()}</span>
                </div>
                <Progress value={Math.min(exposureRatio, 100)} className="h-2" />
                <p className="text-xs text-slate-500">{exposureRatio.toFixed(1)}% of 10x buffer</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Today&apos;s Loss</span>
                  <span className="text-red-400 font-mono">${Math.abs(todayLoss)} / ${maxDailyLoss.toLocaleString()}</span>
                </div>
                <Progress value={dailyLossPct} className={`h-2 ${dailyLossPct > 80 ? '[&>div]:bg-red-500' : dailyLossPct > 50 ? '[&>div]:bg-amber-500' : ''}`} />
                <p className="text-xs text-slate-500">{dailyLossPct.toFixed(1)}% of daily loss limit</p>
              </div>
              <Separator className="bg-slate-700/50" />
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Current Drawdown</span>
                <span className={`font-mono ${Math.abs(currentDrawdown) > maxDrawdown * 0.8 ? 'text-red-400' : 'text-amber-400'}`}>
                  {currentDrawdown}%
                </span>
              </div>
              <p className="text-xs text-slate-500">Max allowed: {maxDrawdown}%</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Positions by Symbol */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={2}>
          <Card className="bg-slate-900/80 border-slate-800/60 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                <Gauge className="size-4 text-amber-400" />
                Positions ({mockPositions.length}/{maxPositions})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {mockPositions.map((pos) => {
                  const leverageExceeded = pos.leverage > maxLeverage
                  return (
                    <div
                      key={pos.id}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-800/50 ${leverageExceeded ? 'bg-red-500/5 border border-red-500/20' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{pos.symbol.replace('USDT', '')}</span>
                        <Badge
                          variant="outline"
                          className={
                            pos.side === 'LONG'
                              ? 'text-emerald-400 border-emerald-600/30 text-[10px] px-1.5 py-0'
                              : 'text-red-400 border-red-600/30 text-[10px] px-1.5 py-0'
                          }
                        >
                          {pos.side}
                        </Badge>
                        <span className="text-[10px] text-slate-500 font-mono">{pos.leverage}x</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {leverageExceeded && (
                          <Badge variant="outline" className="text-red-400 border-red-600/30 text-[9px] px-1 py-0">
                            OVER
                          </Badge>
                        )}
                        <span className={`text-sm font-mono ${pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Risk Settings */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={3}>
          <Card className="bg-slate-900/80 border-slate-800/60">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <TrendingUp className="size-5 text-emerald-400" />
                Position Risk Settings
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">Control position sizing, leverage limits, and risk per trade</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Max Position Size */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Max Position Size</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={maxPositionSize}
                      onChange={(e) => setMaxPositionSize(Number(e.target.value))}
                      className="w-28 bg-slate-800 border-slate-700 text-slate-100 text-sm text-right font-mono h-8"
                    />
                    <span className="text-xs text-slate-500">$100 - $50,000</span>
                  </div>
                </div>
                <Slider
                  value={[maxPositionSize]}
                  onValueChange={(v) => setMaxPositionSize(v[0])}
                  min={100}
                  max={50000}
                  step={100}
                />
              </div>

              {/* Max Leverage */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Max Leverage</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={maxLeverage}
                      onChange={(e) => setMaxLeverage(Number(e.target.value))}
                      className="w-28 bg-slate-800 border-slate-700 text-slate-100 text-sm text-right font-mono h-8"
                    />
                    <span className="text-xs text-slate-500">1x - 100x</span>
                  </div>
                </div>
                <Slider
                  value={[maxLeverage]}
                  onValueChange={(v) => setMaxLeverage(v[0])}
                  min={1}
                  max={100}
                  step={1}
                />
                {mockPositions.some((p) => p.leverage > maxLeverage) && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-600/20">
                    <AlertTriangle className="size-3 text-red-400" />
                    <p className="text-xs text-red-400">
                      {mockPositions.filter((p) => p.leverage > maxLeverage).length} position(s) exceed new leverage limit
                    </p>
                  </div>
                )}
              </div>

              {/* Max Positions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Max Open Positions</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={maxPositions}
                      onChange={(e) => setMaxPositions(Number(e.target.value))}
                      className="w-24 bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono h-8"
                      min={1}
                      max={50}
                    />
                    <span className="text-xs text-slate-500">Current: {mockPositions.length}</span>
                  </div>
                </div>
                {mockPositions.length >= maxPositions && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-600/20">
                    <AlertTriangle className="size-3 text-amber-400" />
                    <p className="text-xs text-amber-400">Position limit reached - new orders will be blocked</p>
                  </div>
                )}
              </div>

              {/* Risk Per Trade */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Risk Per Trade</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step={0.1}
                      value={riskPerTrade}
                      onChange={(e) => setRiskPerTrade(Number(e.target.value))}
                      className="w-28 bg-slate-800 border-slate-700 text-slate-100 text-sm text-right font-mono h-8"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </div>
                <Slider
                  value={[riskPerTrade]}
                  onValueChange={(v) => setRiskPerTrade(v[0])}
                  min={0.5}
                  max={5}
                  step={0.1}
                />
                <p className="text-xs text-slate-500">
                  Max loss per trade: ~${((riskPerTrade / 100) * totalBalance).toFixed(2)} of ${totalBalance.toLocaleString()}
                </p>
              </div>

              <Separator className="bg-slate-700/50" />

              {/* Position Sizing */}
              <div className="space-y-3">
                <Label className="text-slate-300">Position Sizing Method</Label>
                <RadioGroup value={sizingMethod} onValueChange={setSizingMethod} className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'fixed', label: 'Fixed', desc: 'Constant size' },
                    { value: 'kelly', label: 'Kelly', desc: 'Optimal %' },
                    { value: 'dynamic', label: 'Dynamic', desc: 'Risk-adjusted' },
                  ].map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`sizing-${opt.value}`}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                        sizingMethod === opt.value
                          ? 'border-emerald-600/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <RadioGroupItem value={opt.value} id={`sizing-${opt.value}`} className="sr-only" />
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-[10px] opacity-70">{opt.desc}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Account Protection Settings */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={4}>
          <Card className="bg-slate-900/80 border-slate-800/60">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Shield className="size-5 text-amber-400" />
                Account Protection
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">Set loss limits, drawdown protection, and emergency controls</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Max Daily Loss */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={dailyLossEnabled} onCheckedChange={setDailyLossEnabled} />
                    <Label className="text-slate-300">Max Daily Loss</Label>
                  </div>
                  <span className="text-sm font-mono text-slate-200">${maxDailyLoss.toLocaleString()}</span>
                </div>
                <Slider
                  value={[maxDailyLoss]}
                  onValueChange={(v) => setMaxDailyLoss(v[0])}
                  min={100}
                  max={10000}
                  step={100}
                  disabled={!dailyLossEnabled}
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>$100</span>
                  <span>$10,000</span>
                </div>
                {dailyLossEnabled && dailyLossPct > 80 && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-600/20">
                    <AlertTriangle className="size-3 text-red-400" />
                    <p className="text-xs text-red-400">
                      Today&apos;s loss ({dailyLossPct.toFixed(0)}%) is near the daily limit!
                    </p>
                  </div>
                )}
              </div>

              {/* Max Drawdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={drawdownEnabled} onCheckedChange={setDrawdownEnabled} />
                    <Label className="text-slate-300">Max Drawdown</Label>
                  </div>
                  <span className="text-sm font-mono text-slate-200">{maxDrawdown}%</span>
                </div>
                <Slider
                  value={[maxDrawdown]}
                  onValueChange={(v) => setMaxDrawdown(v[0])}
                  min={5}
                  max={50}
                  step={1}
                  disabled={!drawdownEnabled}
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>5%</span>
                  <span>50%</span>
                </div>
                {drawdownEnabled && Math.abs(currentDrawdown) > maxDrawdown * 0.8 && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-600/20">
                    <AlertTriangle className="size-3 text-red-400" />
                    <p className="text-xs text-red-400">
                      Current drawdown ({currentDrawdown}%) is approaching the limit ({maxDrawdown}%)
                    </p>
                  </div>
                )}
              </div>

              {/* Equity Protection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300">Equity Protection Level</Label>
                  <span className="text-sm font-mono text-slate-200">{equityProtection}%</span>
                </div>
                <Slider
                  value={[equityProtection]}
                  onValueChange={(v) => setEquityProtection(v[0])}
                  min={50}
                  max={100}
                  step={1}
                />
                <p className="text-xs text-slate-500">Stop all trading when equity drops below this % of peak</p>
              </div>

              <Separator className="bg-slate-700/50" />

              {/* Auto Shutdown & Kill Switch */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-slate-300">Auto Shutdown on Breach</Label>
                    <p className="text-xs text-slate-500">Close all positions when limits are exceeded</p>
                  </div>
                  <Switch checked={autoShutdown} onCheckedChange={setAutoShutdown} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border border-red-600/20 bg-red-500/5">
                  <div className="space-y-0.5">
                    <Label className="text-slate-300 flex items-center gap-2">
                      <AlertTriangle className="size-4 text-red-400" />
                      Kill Switch
                    </Label>
                    <p className="text-xs text-slate-500">Instantly halt all trading operations</p>
                  </div>
                  <Switch checked={killSwitchEnabled} onCheckedChange={setKillSwitchEnabled} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Market Protection Settings */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={5}>
          <Card className="bg-slate-900/80 border-slate-800/60">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Zap className="size-5 text-purple-400" />
                Market Protection
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs">Filters for spread, slippage, volatility, and trading hours</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Max Spread */}
              <div className="space-y-2">
                <Label className="text-slate-300">Max Spread Filter</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={maxSpread}
                    onChange={(e) => setMaxSpread(Number(e.target.value))}
                    className="w-32 bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono h-8"
                  />
                  <span className="text-xs text-slate-500">basis points (bps)</span>
                </div>
                <p className="text-xs text-slate-500">Orders will be delayed or blocked when spread exceeds this threshold</p>
              </div>

              <Separator className="bg-slate-700/50" />

              {/* Slippage Protection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={slippageEnabled} onCheckedChange={setSlippageEnabled} />
                  <Label className="text-slate-300">Slippage Protection</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-slate-400 text-sm">Max Slippage</Label>
                  <Input
                    type="number"
                    step={0.1}
                    value={maxSlippage}
                    onChange={(e) => setMaxSlippage(Number(e.target.value))}
                    className="w-24 bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono h-8"
                    disabled={!slippageEnabled}
                  />
                  <span className="text-xs text-slate-500">%</span>
                </div>
              </div>

              <Separator className="bg-slate-700/50" />

              {/* Volatility Filter */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Switch checked={volatilityEnabled} onCheckedChange={setVolatilityEnabled} />
                  <Label className="text-slate-300">Volatility Filter</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-slate-400 text-sm">ATR Threshold</Label>
                  <Input
                    type="number"
                    step={0.1}
                    value={atrThreshold}
                    onChange={(e) => setAtrThreshold(Number(e.target.value))}
                    className="w-24 bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono h-8"
                    disabled={!volatilityEnabled}
                  />
                  <span className="text-xs text-slate-500">x normal</span>
                </div>
              </div>

              <Separator className="bg-slate-700/50" />

              {/* News Filter */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-slate-300">News Filter</Label>
                  <p className="text-xs text-slate-500">Block trading during high-impact news events</p>
                </div>
                <Switch checked={newsFilter} onCheckedChange={setNewsFilter} />
              </div>

              <Separator className="bg-slate-700/50" />

              {/* Trading Hours */}
              <div className="space-y-3">
                <Label className="text-slate-300 flex items-center gap-2">
                  <Clock className="size-4" />
                  Trading Hours
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="time"
                    value={tradingStart}
                    onChange={(e) => setTradingStart(e.target.value)}
                    className="w-32 bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono h-8"
                  />
                  <span className="text-slate-500">to</span>
                  <Input
                    type="time"
                    value={tradingEnd}
                    onChange={(e) => setTradingEnd(e.target.value)}
                    className="w-32 bg-slate-800 border-slate-700 text-slate-100 text-sm font-mono h-8"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {tradingStart === '00:00' && tradingEnd === '23:59'
                    ? 'Trading allowed 24/7'
                    : `Trading window: ${tradingStart} - ${tradingEnd} (server time)`}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Risk Alerts History */}
        <motion.div variants={cardVariants} initial="hidden" animate="visible" custom={6}>
          <Card className="bg-slate-900/80 border-slate-800/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="size-5 text-red-400" />
                  Risk Alerts
                  {riskAlerts.filter((a) => !a.isResolved).length > 0 && (
                    <Badge variant="outline" className="text-red-400 border-red-600/30 text-[10px] px-1.5 py-0 ml-1">
                      {riskAlerts.filter((a) => !a.isResolved).length} active
                    </Badge>
                  )}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAlertsExpanded(!alertsExpanded)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  {alertsExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </Button>
              </div>
              {/* Filters */}
              <div className="flex gap-1.5 mt-2">
                {(['ALL', 'ACTIVE', 'RESOLVED'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={alertFilter === f ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAlertFilter(f)}
                    className={
                      alertFilter === f
                        ? 'bg-slate-700 text-slate-100 text-xs h-6 px-2'
                        : 'border-slate-700 text-slate-400 text-xs h-6 px-2 hover:bg-slate-800'
                    }
                  >
                    {f}
                    <span className="ml-1 text-[10px] opacity-60">
                      ({f === 'ALL' ? riskAlerts.length : f === 'ACTIVE' ? riskAlerts.filter((a) => !a.isResolved).length : riskAlerts.filter((a) => a.isResolved).length})
                    </span>
                  </Button>
                ))}
              </div>
            </CardHeader>
            {alertsExpanded && (
              <CardContent>
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {filteredAlerts.length === 0 ? (
                    <div className="text-center py-8">
                      <ShieldCheck className="size-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No alerts in this category</p>
                    </div>
                  ) : (
                    filteredAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3 rounded-lg border space-y-2 transition-colors ${
                          alert.isResolved
                            ? 'bg-slate-800/30 border-slate-700/20 opacity-70'
                            : 'bg-slate-800/50 border-slate-700/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                              {alert.severity}
                            </Badge>
                            <span className="text-sm font-medium text-slate-200">{alert.type}</span>
                            {!alert.isResolved && (
                              <span className="size-2 rounded-full bg-red-400 animate-pulse" />
                            )}
                          </div>
                          <span className="text-xs text-slate-500">{formatTimeAgo(alert.timestamp)}</span>
                        </div>
                        <p className="text-xs text-slate-400">{alert.message}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <TrendingDown className="size-3 text-slate-500" />
                            <span className="text-[11px] text-slate-500">Action: {alert.action}</span>
                          </div>
                          {alert.isResolved && (
                            <Badge variant="outline" className="text-emerald-400 border-emerald-600/30 text-[9px] px-1 py-0">
                              RESOLVED
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
