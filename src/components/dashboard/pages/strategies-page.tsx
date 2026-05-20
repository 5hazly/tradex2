'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  Zap,
  BarChart3,
  Brain,
  Target,
  Plus,
  Edit3,
  Trash2,
  Play,
  GitBranch,
  Activity,
  Clock,
  ToggleLeft,
  ToggleRight,
  X,
  Check,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Eye,
  Copy,
  Loader2,
  RefreshCw,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StrategyType, Timeframe, Strategy, ApiResponse } from '@/lib/types/trading'

// ============================================================
// Types
// ============================================================

interface StrategyCard {
  id: string
  name: string
  description: string
  type: StrategyType
  isActive: boolean
  winRate: number
  pnl: number
  totalTrades: number
  timeframe: Timeframe
  lastTradeTime: string
  sparkline: number[]
  profitFactor: number
  sharpe: number
}

type SortKey = 'winRate' | 'pnl' | 'totalTrades'
type SortDir = 'asc' | 'desc'

// ============================================================
// Helpers
// ============================================================

function generateSparkline(trend: 'up' | 'down' | 'volatile'): number[] {
  const pts: number[] = []
  let val = 100
  for (let i = 0; i < 20; i++) {
    if (trend === 'up') val += (Math.random() * 4 - 1)
    else if (trend === 'down') val += (Math.random() * 4 - 3)
    else val += (Math.random() * 8 - 4)
    pts.push(Math.round(val * 100) / 100)
  }
  return pts
}

function apiToCard(s: Strategy): StrategyCard {
  return {
    id: s.id,
    name: s.name,
    description: s.description || '',
    type: s.type,
    isActive: s.isActive,
    winRate: 0,
    pnl: 0,
    totalTrades: 0,
    timeframe: s.timeframe,
    lastTradeTime: '—',
    sparkline: generateSparkline('volatile'),
    profitFactor: 0,
    sharpe: 0,
  }
}

const strategyTypeConfig: Record<StrategyType, { label: string; color: string; icon: React.ElementType; desc: string }> = {
  EMA_MACD: { label: 'EMA MACD', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: TrendingUp, desc: 'Uses exponential moving average and MACD for trend following' },
  SCALPING: { label: 'Scalping', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Zap, desc: 'Quick in-and-out trades with tight stop losses' },
  BREAKOUT: { label: 'Breakout', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30', icon: BarChart3, desc: 'Identifies breakout patterns from consolidation zones' },
  SMART_MONEY: { label: 'Smart Money', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', icon: Target, desc: 'Follows institutional order flow and liquidity zones' },
  AI: { label: 'AI Enhanced', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: Brain, desc: 'Machine learning powered signal generation and filtering' },
  CONFLUENCE: { label: 'MA+Momentum+RSI+MACD', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30', icon: Layers, desc: 'Multi-indicator confluence: EMA Cross + Momentum + RSI + MACD for high-probability entries with R:R based exits' },
}

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d']

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.08, duration: 0.4, ease: 'easeOut' },
  }),
}

// ============================================================
// Sparkline Component
// ============================================================

function SparklineChart({ data, positive }: { data: number[]; positive: boolean }) {
  const color = positive ? '#10b981' : '#ef4444'
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data.map((v, i) => ({ i, v }))}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ============================================================
// Strategy Form Dialog
// ============================================================

interface StrategyForm {
  name: string
  description: string
  type: StrategyType
  timeframe: Timeframe
  riskPerTrade: number
  maxPositions: number
  indicators: {
    rsi: boolean
    macd: boolean
    ema: boolean
    bb: boolean
    volume: boolean
  }
  signalConfirmation: number
}

const defaultForm: StrategyForm = {
  name: '',
  description: '',
  type: 'EMA_MACD',
  timeframe: '1h',
  riskPerTrade: 2,
  maxPositions: 3,
  indicators: { rsi: true, macd: true, ema: true, bb: false, volume: false },
  signalConfirmation: 2,
}

function StrategyDialog({
  open,
  onOpenChange,
  editingStrategy,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editingStrategy: StrategyCard | null
  onSave: (form: StrategyForm) => void
}) {
  const [form, setForm] = useState<StrategyForm>(defaultForm)

  const isEditing = !!editingStrategy

  const handleOpen = (v: boolean) => {
    if (v && editingStrategy) {
      setForm({
        name: editingStrategy.name,
        description: editingStrategy.description,
        type: editingStrategy.type,
        timeframe: editingStrategy.timeframe,
        riskPerTrade: 2,
        maxPositions: 3,
        indicators: { rsi: true, macd: true, ema: true, bb: false, volume: false },
        signalConfirmation: 2,
      })
    } else if (v) {
      setForm(defaultForm)
    }
    onOpenChange(v)
  }

  const indicatorList = [
    { key: 'rsi' as const, label: 'RSI' },
    { key: 'macd' as const, label: 'MACD' },
    { key: 'ema' as const, label: 'EMA' },
    { key: 'bb' as const, label: 'Bollinger Bands' },
    { key: 'volume' as const, label: 'Volume Profile' },
  ]

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100">
            {isEditing ? 'Edit Strategy' : 'Create Strategy'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400">Strategy Name</Label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="My Strategy"
              className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400">Description</Label>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe your strategy..."
              rows={3}
              className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 resize-none"
            />
          </div>

          {/* Strategy Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400">Strategy Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as StrategyType }))}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {Object.entries(strategyTypeConfig).map(([key, cfg]) => (
                  <SelectItem key={key} value={key} className="text-slate-200 focus:bg-slate-700 focus:text-slate-100">
                    <div className="flex items-center gap-2">
                      <cfg.icon className="w-4 h-4 text-slate-400" />
                      {cfg.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400">Timeframe</Label>
            <div className="flex flex-wrap gap-1.5">
              {timeframes.map(tf => (
                <button
                  key={tf}
                  onClick={() => setForm(f => ({ ...f, timeframe: tf }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    form.timeframe === tf
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800 hover:text-slate-300'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Per Trade */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-400">Risk Per Trade</Label>
              <span className="text-sm font-semibold text-emerald-400">{form.riskPerTrade}%</span>
            </div>
            <Slider
              value={[form.riskPerTrade]}
              onValueChange={([v]) => setForm(f => ({ ...f, riskPerTrade: v }))}
              min={0.5}
              max={10}
              step={0.5}
              className="[&_[role=slider]]:bg-emerald-400 [&_[role=slider]]:border-emerald-400"
            />
          </div>

          {/* Max Positions */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-400">Max Concurrent Positions</Label>
            <Input
              type="number"
              value={form.maxPositions}
              onChange={e => setForm(f => ({ ...f, maxPositions: parseInt(e.target.value) || 1 }))}
              min={1}
              max={20}
              className="bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>

          {/* Indicators */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-slate-400">Indicators</Label>
            <div className="grid grid-cols-2 gap-2">
              {indicatorList.map(ind => (
                <div
                  key={ind.key}
                  className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/40 border border-slate-800/40 cursor-pointer"
                  onClick={() => setForm(f => ({
                    ...f,
                    indicators: { ...f.indicators, [ind.key]: !f.indicators[ind.key] },
                  }))}
                >
                  <Checkbox
                    checked={form.indicators[ind.key]}
                    onCheckedChange={() => {}}
                    className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                  />
                  <span className="text-xs text-slate-300">{ind.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Signal Confirmation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-400">Signal Confirmations Required</Label>
              <span className="text-sm font-semibold text-slate-300">{form.signalConfirmation}</span>
            </div>
            <Slider
              value={[form.signalConfirmation]}
              onValueChange={([v]) => setForm(f => ({ ...f, signalConfirmation: v }))}
              min={1}
              max={5}
              step={1}
              className="[&_[role=slider]]:bg-slate-300 [&_[role=slider]]:border-slate-300"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <DialogClose asChild>
            <Button variant="ghost" className="text-slate-400 hover:text-slate-300">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={() => { onSave(form); onOpenChange(false) }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
            disabled={!form.name.trim()}
          >
            {isEditing ? 'Save Changes' : 'Create Strategy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Strategy Comparison Dialog
// ============================================================

function ComparisonDialog({
  open,
  onOpenChange,
  strategies,
  selected,
  setSelected,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  strategies: StrategyCard[]
  selected: string[]
  setSelected: (ids: string[]) => void
}) {
  const toggleSelect = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id))
    } else if (selected.length < 2) {
      setSelected([...selected, id])
    }
  }

  const compStrats = strategies.filter(s => selected.includes(s.id))

  // Generate overlay equity curves
  const compData = useMemo(() => {
    if (compStrats.length < 2) return []
    const pts: Record<string, number>[] = []
    const curves: Record<string, number[]> = {
      [compStrats[0].id]: compStrats[0].sparkline,
      [compStrats[1].id]: compStrats[1].sparkline,
    }
    const len = Math.max(curves[compStrats[0].id].length, curves[compStrats[1].id].length)
    for (let i = 0; i < len; i++) {
      pts.push({
        idx: i,
        [compStrats[0].id]: curves[compStrats[0].id][i] ?? null,
        [compStrats[1].id]: curves[compStrats[1].id][i] ?? null,
      })
    }
    return pts
  }, [compStrats])

  const colors = ['#10b981', '#8b5cf6']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            Strategy Comparison
          </DialogTitle>
        </DialogHeader>

        {/* Strategy selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {strategies.map(s => (
            <button
              key={s.id}
              onClick={() => toggleSelect(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                selected.includes(s.id)
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800 hover:text-slate-300'
              }`}
            >
              {selected.includes(s.id) && <Check className="w-3 h-3" />}
              {s.name}
            </button>
          ))}
          <span className="text-[10px] text-slate-500 flex items-center ml-1">Select 2 to compare</span>
        </div>

        {compStrats.length === 2 ? (
          <div className="space-y-4">
            {/* Overlay chart */}
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={compData}>
                  <defs>
                    {compStrats.map((s, i) => (
                      <linearGradient key={s.id} id={`comp-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors[i]} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={colors[i]} stopOpacity={0.02} />
                      </linearGradient>
                    ))}
                  </defs>
                  <XAxis dataKey="idx" hide />
                  <YAxis hide />
                  {compStrats.map((s, i) => (
                    <Area
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      stroke={colors[i]}
                      strokeWidth={2}
                      fill={`url(#comp-${i})`}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#e2e8f0',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      const s = compStrats.find(cs => cs.id === name)
                      return [value?.toFixed(2), s?.name ?? name]
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-1">
                {compStrats.map((s, i) => (
                  <span key={s.id} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="w-3 h-0.5 rounded" style={{ backgroundColor: colors[i] }} />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Metrics comparison table */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-xs text-slate-500 font-medium p-2" />
              {compStrats.map(s => (
                <div key={s.id} className="text-xs font-medium text-slate-300 p-2 text-center">{s.name}</div>
              ))}
              {[
                { label: 'Win Rate', fn: (s: StrategyCard) => `${s.winRate.toFixed(1)}%`, better: 'higher' },
                { label: 'Total P&L', fn: (s: StrategyCard) => `$${s.pnl.toLocaleString()}`, better: 'higher' },
                { label: 'Total Trades', fn: (s: StrategyCard) => s.totalTrades.toString(), better: 'neutral' },
                { label: 'Profit Factor', fn: (s: StrategyCard) => s.profitFactor.toFixed(2), better: 'higher' },
                { label: 'Sharpe Ratio', fn: (s: StrategyCard) => s.sharpe.toFixed(2), better: 'higher' },
                { label: 'Status', fn: (s: StrategyCard) => s.isActive ? 'Active' : 'Inactive', better: 'neutral' },
              ].map(row => (
                <div key={row.label} className="contents">
                  <div className="text-[11px] text-slate-500 p-2 flex items-center">{row.label}</div>
                  {compStrats.map(s => {
                    const val = row.fn(s)
                    let colorClass = 'text-slate-300'
                    if (row.better === 'higher' && compStrats.length === 2) {
                      const numVal = parseFloat(val.replace(/[^0-9.-]/g, ''))
                      const otherVal = parseFloat(row.fn(compStrats[0].id === s.id ? compStrats[1] : compStrats[0]).replace(/[^0-9.-]/g, ''))
                      if (numVal > otherVal) colorClass = 'text-emerald-400 font-semibold'
                    }
                    if (row.label === 'Status') {
                      colorClass = s.isActive ? 'text-emerald-400' : 'text-slate-500'
                    }
                    return (
                      <div key={s.id} className={`text-xs p-2 text-center ${colorClass}`}>
                        {val}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            Select two strategies to compare
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState<StrategyCard | null>(null)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('pnl')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const loadStrategies = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/strategies')
      const json: ApiResponse<Strategy[]> = await res.json()
      if (json.success && json.data) {
        setStrategies(json.data.map(apiToCard))
        toast.success('Strategies loaded')
      } else {
        toast.error(json.error || 'Failed to load strategies')
      }
    } catch {
      toast.error('Failed to load strategies')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStrategies()
  }, [loadStrategies])

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? -1 : 1
    return [...strategies].sort((a, b) => (a[sortKey] - b[sortKey]) * dir)
  }, [strategies, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  async function toggleActive(id: string) {
    const current = strategies.find(s => s.id === id)
    if (!current) return
    const newValue = !current.isActive

    // Optimistic update
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, isActive: newValue } : s))

    try {
      const res = await fetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: newValue }),
      })
      const json: ApiResponse<Strategy> = await res.json()
      if (!json.success) {
        // Revert on failure
        setStrategies(prev => prev.map(s => s.id === id ? { ...s, isActive: current.isActive } : s))
        toast.error(json.error || 'Failed to toggle strategy')
      } else {
        toast.success(`Strategy ${newValue ? 'activated' : 'deactivated'}`)
      }
    } catch {
      // Revert on failure
      setStrategies(prev => prev.map(s => s.id === id ? { ...s, isActive: current.isActive } : s))
      toast.error('Failed to toggle strategy')
    }
  }

  function deleteStrategy(id: string) {
    setStrategies(prev => prev.filter(s => s.id !== id))
    toast.success('Strategy deleted')
  }

  async function handleSave(form: StrategyForm) {
    if (editingStrategy) {
      // Edit locally (no PATCH endpoint for full update)
      setStrategies(prev => prev.map(s =>
        s.id === editingStrategy.id
          ? { ...s, name: form.name, description: form.description, type: form.type, timeframe: form.timeframe }
          : s
      ))
      toast.success('Strategy updated')
    } else {
      try {
        const res = await fetch('/api/strategies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            type: form.type,
            isActive: false,
            timeframe: form.timeframe,
            parameters: {},
          }),
        })
        const json: ApiResponse<Strategy> = await res.json()
        if (json.success && json.data) {
          setStrategies(prev => [...prev, apiToCard(json.data!)])
          toast.success('Strategy created')
        } else {
          toast.error(json.error || 'Failed to create strategy')
        }
      } catch {
        toast.error('Failed to create strategy')
      }
    }
    setEditingStrategy(null)
  }

  function openEdit(strat: StrategyCard) {
    setEditingStrategy(strat)
    setDialogOpen(true)
  }

  function openCreate() {
    setEditingStrategy(null)
    setDialogOpen(true)
  }

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <ArrowUpDown className="w-3 h-3 opacity-40" />
    return dir === 'desc' ? <ChevronDown className="w-3 h-3 text-emerald-400" /> : <ChevronUp className="w-3 h-3 text-emerald-400" />
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Strategy Management</h1>
          <p className="text-sm text-slate-500 mt-1">Configure and monitor your trading strategies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStrategies}
            disabled={isLoading}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-200"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1.5" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setComparisonOpen(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-200"
          >
            <GitBranch className="w-4 h-4 mr-1.5" />
            Compare
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" />
                Create Strategy
              </Button>
            </DialogTrigger>
          </Dialog>
        </div>
      </motion.div>

      {/* Loading State */}
      {isLoading && strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-emerald-400" />
          <p className="text-sm font-medium">Loading strategies...</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Strategies', value: strategies.length.toString(), icon: Activity, color: 'text-slate-200' },
              { label: 'Active', value: strategies.filter(s => s.isActive).length.toString(), icon: ToggleRight, color: 'text-emerald-400' },
              { label: 'Total P&L', value: `$${strategies.reduce((s, st) => s + st.pnl, 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`, icon: TrendingUp, color: 'text-emerald-400' },
              { label: 'Avg Win Rate', value: strategies.length > 0 ? `${(strategies.reduce((s, st) => s + st.winRate, 0) / strategies.length).toFixed(1)}%` : '—', icon: Target, color: 'text-amber-400' },
            ].map((m, i) => (
              <motion.div
                key={m.label}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
              >
                <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0">
                      <m.icon className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wider">{m.label}</p>
                      <p className={`text-base md:text-lg font-bold tabular-nums ${m.color}`}>{m.value}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by:</span>
            {([
              { key: 'pnl' as SortKey, label: 'P&L' },
              { key: 'winRate' as SortKey, label: 'Win Rate' },
              { key: 'totalTrades' as SortKey, label: 'Trades' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => handleSort(s.key)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  sortKey === s.key
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                {s.label}
                <SortIcon active={sortKey === s.key} dir={sortDir} />
              </button>
            ))}
          </div>

          {/* Strategy Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map((strat, i) => {
              const cfg = strategyTypeConfig[strat.type]
              return (
                <motion.div
                  key={strat.id}
                  custom={i}
                  initial="hidden"
                  animate="visible"
                  variants={cardVariants}
                >
                  <Card className={`bg-slate-900/80 rounded-xl overflow-hidden transition-all hover:border-slate-700/60 ${
                    strat.isActive ? 'border-emerald-500/20' : 'border-slate-800/60'
                  }`}>
                    {/* Status bar */}
                    <div className={`h-1 ${strat.isActive ? 'bg-emerald-500' : 'bg-slate-700'}`} />

                    <CardContent className="p-5">
                      {/* Top row: icon, name, status */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cfg.color.split(' ').slice(0, 2).join(' ')}`}>
                            <cfg.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-100">{strat.name}</h3>
                            <p className="text-[10px] text-slate-500 mt-0.5 max-w-[180px] truncate">
                              {strat.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => toggleActive(strat.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              strat.isActive ? 'bg-emerald-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                                strat.isActive ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 h-5 border ${cfg.color}`}>
                          {cfg.label}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-2 py-0.5 h-5 bg-slate-800 text-slate-400">
                          {strat.timeframe}
                        </Badge>
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 h-5 ${strat.isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          {strat.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      {/* Key metrics */}
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className="p-2 rounded-lg bg-slate-800/40 text-center">
                          <p className="text-[10px] text-slate-500 mb-0.5">Win Rate</p>
                          <p className={`text-sm font-bold tabular-nums ${strat.winRate >= 60 ? 'text-emerald-400' : strat.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                            {strat.winRate.toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-800/40 text-center">
                          <p className="text-[10px] text-slate-500 mb-0.5">P&L</p>
                          <p className={`text-sm font-bold tabular-nums ${strat.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {strat.pnl >= 0 ? '+' : ''}${strat.pnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-800/40 text-center">
                          <p className="text-[10px] text-slate-500 mb-0.5">Trades</p>
                          <p className="text-sm font-bold tabular-nums text-slate-200">{strat.totalTrades}</p>
                        </div>
                      </div>

                      {/* Sparkline */}
                      <div className="mb-3 -mx-1">
                        <SparklineChart data={strat.sparkline} positive={strat.pnl >= 0} />
                      </div>

                      {/* Last trade */}
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-4">
                        <Clock className="w-3 h-3" />
                        Last trade: {strat.lastTradeTime}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(strat)}
                          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        >
                          <Edit3 className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Backtest
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteStrategy(strat.id)}
                          className="h-7 px-2 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          {/* Strategy Templates */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                    Strategy Templates
                  </CardTitle>
                  <Copy className="w-4 h-4 text-slate-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {Object.entries(strategyTypeConfig).map(([type, cfg], i) => (
                    <motion.button
                      key={type}
                      custom={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 + i * 0.05 }}
                      onClick={() => {
                        const form: StrategyForm = {
                          ...defaultForm,
                          name: cfg.label + ' Strategy',
                          description: cfg.desc,
                          type: type as StrategyType,
                        }
                        handleSave(form)
                      }}
                      className="text-left p-4 rounded-xl bg-slate-800/40 border border-slate-800/40 hover:border-slate-700/60 hover:bg-slate-800/60 transition-all group"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${cfg.color.split(' ').slice(0, 2).join(' ')}`}>
                        <cfg.icon className="w-4 h-4" />
                      </div>
                      <h4 className="text-sm font-medium text-slate-200 group-hover:text-slate-100 mb-1">{cfg.label}</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">{cfg.desc}</p>
                      <div className="mt-3 flex items-center gap-1 text-[10px] text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-3 h-3" />
                        Use Template
                      </div>
                    </motion.button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}

      {/* Dialogs */}
      <StrategyDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v)
          if (!v) setEditingStrategy(null)
        }}
        editingStrategy={editingStrategy}
        onSave={handleSave}
      />

      <ComparisonDialog
        open={comparisonOpen}
        onOpenChange={setComparisonOpen}
        strategies={strategies}
        selected={selectedForCompare}
        setSelected={setSelectedForCompare}
      />
    </div>
  )
}
