'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FlaskConical,
  Plus,
  Play,
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  BarChart3,
  Activity,
  CalendarDays,
  Clock,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Loader2,
  Filter,
  RotateCcw,
  Download,
  Zap,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  ComposedChart,
} from 'recharts'
import { format, subDays, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import type { StrategyType, TradeSide, BacktestResult as ApiBacktestResult } from '@/lib/types/trading'
import { mockStrategies, mockBacktestResults } from '@/lib/mock-data'
import { toast } from 'sonner'

// ============================================================
// Types
// ============================================================

interface BacktestConfig {
  strategy: string
  symbol: string
  startDate: Date
  endDate: Date
  initialCapital: number
  timeframe: string
  commission: number
  slippage: number
  positionSizing: string
  maxPositions: number
  stopLoss: number
  takeProfit: number
  walkForward: boolean
  monteCarlo: number
}

interface BacktestResult {
  totalPnl: number
  winRate: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  totalTrades: number
  equityCurve: { date: string; equity: number; benchmark: number; drawdown: number; tradeWin?: boolean }[]
  monthlyReturns: { month: string; return: number }[]
  pnlDistribution: { range: string; count: number }[]
  hourlyPnl: { hour: string; pnl: number; trades: number }[]
  recentTrades: {
    id: number
    symbol: string
    side: TradeSide
    entry: number
    exit: number
    pnl: number
    duration: string
    signal: string
  }[]
}

const SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'DOGE/USDT', 'XRP/USDT',
  'AVAX/USDT', 'LINK/USDT', 'ADA/USDT', 'MATIC/USDT', 'ARb/USDT',
]

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']

const STRATEGIES = mockStrategies.map((s) => ({
  id: s.id,
  name: s.name,
  type: s.type as StrategyType,
}))

// ============================================================
// Generate Backtest Results (mock)
// ============================================================

function generateBacktestResults(config: BacktestConfig): BacktestResult {
  const { initialCapital, symbol } = config
  const days = Math.max(1, differenceInDays(config.endDate, config.startDate))

  // Generate equity curve
  const equityCurve: BacktestResult['equityCurve'] = []
  let equity = initialCapital
  let benchmark = initialCapital
  let peak = equity
  let tradeCount = 0

  // Seeded pseudo-random based on strategy + symbol
  const seed = (config.strategy + symbol).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const rand = (i: number) => {
    const x = Math.sin(seed + i * 9301 + 49297) * 49297
    return x - Math.floor(x)
  }

  for (let i = 0; i < Math.min(days, 60); i++) {
    const date = format(subDays(new Date(), 59 - i), 'MMM dd')
    const dailyReturn = (rand(i * 3) - 0.42) * 2.5
    const benchReturn = (rand(i * 3 + 1) - 0.48) * 2.0

    equity *= (1 + dailyReturn / 100)
    benchmark *= (1 + benchReturn / 100)
    if (equity > peak) peak = equity
    const drawdown = -((peak - equity) / peak) * 100

    const isTradeDay = rand(i * 3 + 2) > 0.3
    if (isTradeDay) tradeCount++

    equityCurve.push({
      date,
      equity: Math.round(equity * 100) / 100,
      benchmark: Math.round(benchmark * 100) / 100,
      drawdown: Math.round(drawdown * 100) / 100,
      tradeWin: isTradeDay ? rand(i * 7) > 0.35 : undefined,
    })
  }

  const totalPnl = equity - initialCapital
  const wins = equityCurve.filter((d) => d.tradeWin).length
  const totalTradesWithSignal = equityCurve.filter((d) => d.tradeWin !== undefined).length
  const winRate = totalTradesWithSignal > 0 ? (wins / totalTradesWithSignal) * 100 : 0

  // Monthly returns (6 months)
  const monthlyReturns: BacktestResult['monthlyReturns'] = []
  for (let m = 0; m < 6; m++) {
    const monthDate = subDays(new Date(), (5 - m) * 30)
    const ret = (rand(m * 11 + 500) - 0.38) * 12
    monthlyReturns.push({
      month: format(monthDate, 'MMM'),
      return: Math.round(ret * 100) / 100,
    })
  }

  // P&L distribution
  const pnlDistribution: BacktestResult['pnlDistribution'] = []
  const ranges = ['<-500', '-500~-200', '-200~0', '0~200', '200~500', '500~1000', '>1000']
  ranges.forEach((range, idx) => {
    const count = idx === 3 ? Math.floor(rand(idx * 13 + 200) * 15 + 5)
      : idx === 2 ? Math.floor(rand(idx * 13 + 201) * 10 + 2)
      : Math.floor(rand(idx * 13 + 202) * 8 + 1)
    pnlDistribution.push({ range, count })
  })

  // Hourly P&L
  const hourlyPnl: BacktestResult['hourlyPnl'] = []
  for (let h = 0; h < 24; h++) {
    hourlyPnl.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      pnl: Math.round((rand(h * 17 + 300) - 0.4) * 600),
      trades: Math.floor(rand(h * 17 + 301) * 5),
    })
  }

  // Recent trades
  const recentTrades: BacktestResult['recentTrades'] = []
  for (let t = 0; t < 10; t++) {
    const side = rand(t * 23 + 400) > 0.5 ? 'LONG' as TradeSide : 'SHORT' as TradeSide
    const entry = rand(t * 23 + 401) * 50000 + 100
    const pnlVal = (rand(t * 23 + 402) - 0.35) * 800
    recentTrades.push({
      id: t + 1,
      symbol,
      side,
      entry: Math.round(entry * 100) / 100,
      exit: Math.round((entry * (1 + pnlVal / 5000)) * 100) / 100,
      pnl: Math.round(pnlVal * 100) / 100,
      duration: `${Math.floor(rand(t + 500) * 10) + 1}h ${Math.floor(rand(t + 501) * 50)}m`,
      signal: STRATEGIES[Math.floor(rand(t + 600) * STRATEGIES.length)].name,
    })
  }

  const totalTrades = Math.floor(rand(seed + 77) * 80 + 40)
  const avgWin = rand(seed + 78) * 400 + 100
  const avgLoss = rand(seed + 79) * 200 + 50
  const grossWin = avgWin * (winRate / 100) * totalTrades
  const grossLoss = avgLoss * (1 - winRate / 100) * totalTrades

  return {
    totalPnl: Math.round(totalPnl * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: Math.round((grossLoss > 0 ? grossWin / grossLoss : 2.5) * 100) / 100,
    sharpeRatio: Math.round((rand(seed + 80) * 2.5 + 0.5) * 100) / 100,
    maxDrawdown: Math.round((rand(seed + 81) * 15 + 2) * 100) / 100,
    totalTrades,
    equityCurve,
    monthlyReturns,
    pnlDistribution,
    hourlyPnl,
    recentTrades,
  }
}

// ============================================================
// Custom Chart Tooltip
// ============================================================

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function BacktestingPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [results, setResults] = useState<BacktestResult | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [tradeSortField, setTradeSortField] = useState<string>('id')
  const [tradeSortDir, setTradeSortDir] = useState<'asc' | 'desc'>('desc')
  const [tradeFilter, setTradeFilter] = useState('all')
  const [selectedPrevBacktest, setSelectedPrevBacktest] = useState<number | null>(null)

  const defaultConfig: BacktestConfig = {
    strategy: STRATEGIES[0].id,
    symbol: 'BTC/USDT',
    startDate: subDays(new Date(), 60),
    endDate: new Date(),
    initialCapital: 10000,
    timeframe: '1h',
    commission: 0.1,
    slippage: 0.05,
    positionSizing: 'fixed',
    maxPositions: 5,
    stopLoss: 2,
    takeProfit: 4,
    walkForward: false,
    monteCarlo: 100,
  }

  const [config, setConfig] = useState<BacktestConfig>(defaultConfig)

  const updateConfig = useCallback(<K extends keyof BacktestConfig>(key: K, value: BacktestConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [])

  const runBacktest = useCallback(() => {
    setIsRunning(true)
    setShowResults(false)
    setTimeout(() => {
      const result = generateBacktestResults(config)
      setResults(result)
      setIsRunning(false)
      setShowResults(true)
      setDialogOpen(false)
    }, 3000)
  }, [config])

  const loadPreviousBacktest = useCallback((idx: number) => {
    const bt = mockBacktestResults[idx]
    if (!bt) return
    setSelectedPrevBacktest(idx)
    const strat = STRATEGIES.find((s) => s.id === bt.strategyId)
    const tempConfig = { ...defaultConfig, strategy: bt.strategyId }
    setIsRunning(true)
    setShowResults(false)
    setTimeout(() => {
      const result = generateBacktestResults(tempConfig)
      // Override some values with the stored backtest
      result.totalPnl = bt.totalPnl
      result.winRate = bt.winRate
      result.profitFactor = bt.profitFactor
      result.sharpeRatio = bt.sharpeRatio
      result.maxDrawdown = bt.maxDrawdown
      result.totalTrades = bt.totalTrades
      setResults(result)
      setIsRunning(false)
      setShowResults(true)
    }, 2000)
  }, [])

  const sortedTrades = useMemo(() => {
    if (!results) return []
    let filtered = [...results.recentTrades]
    if (tradeFilter === 'win') filtered = filtered.filter((t) => t.pnl > 0)
    if (tradeFilter === 'loss') filtered = filtered.filter((t) => t.pnl <= 0)

    return filtered.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[tradeSortField]
      const bVal = (b as Record<string, unknown>)[tradeSortField]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return tradeSortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return tradeSortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [results, tradeSortField, tradeSortDir, tradeFilter])

  const handleSortClick = useCallback((field: string) => {
    if (tradeSortField === field) {
      setTradeSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setTradeSortField(field)
      setTradeSortDir('desc')
    }
  }, [tradeSortField])

  const pnlColor = (v: number) => v >= 0 ? 'text-emerald-400' : 'text-red-400'
  const pnlBg = (v: number) => v >= 0 ? 'bg-emerald-400' : 'bg-red-400'

  const renderSortIcon = (field: string) => (
    <ArrowUpDown className={`size-3 ml-1 ${tradeSortField === field ? 'text-emerald-400' : 'text-slate-500'}`} />
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <FlaskConical className="size-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Backtesting</h1>
            <p className="text-sm text-slate-400">Simulate strategies on historical data</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2">
              <Plus className="size-4" />
              New Backtest
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <FlaskConical className="size-5 text-emerald-400" />
                New Backtest
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Configure and run a backtest simulation
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Strategy */}
              <div className="grid gap-2">
                <Label className="text-slate-300">Strategy</Label>
                <Select value={config.strategy} onValueChange={(v) => updateConfig('strategy', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-slate-200 focus:bg-slate-700 focus:text-white">
                        {s.name} <span className="text-slate-500">({s.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Symbol + Timeframe */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-slate-300">Symbol</Label>
                  <Select value={config.symbol} onValueChange={(v) => updateConfig('symbol', v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {SYMBOLS.map((s) => (
                        <SelectItem key={s} value={s} className="text-slate-200 focus:bg-slate-700 focus:text-white">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-slate-300">Timeframe</Label>
                  <Select value={config.timeframe} onValueChange={(v) => updateConfig('timeframe', v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {TIMEFRAMES.map((tf) => (
                        <SelectItem key={tf} value={tf} className="text-slate-200 focus:bg-slate-700 focus:text-white">
                          {tf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-slate-300">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="bg-slate-800 border-slate-700 text-white justify-start text-left font-normal">
                        <CalendarDays className="mr-2 h-4 w-4 text-slate-400" />
                        {format(config.startDate, 'MMM dd, yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-800 border-slate-700 w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={config.startDate}
                        onSelect={(d) => d && updateConfig('startDate', d)}
                        className="bg-slate-800"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label className="text-slate-300">End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="bg-slate-800 border-slate-700 text-white justify-start text-left font-normal">
                        <CalendarDays className="mr-2 h-4 w-4 text-slate-400" />
                        {format(config.endDate, 'MMM dd, yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-800 border-slate-700 w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={config.endDate}
                        onSelect={(d) => d && updateConfig('endDate', d)}
                        className="bg-slate-800"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Initial Capital */}
              <div className="grid gap-2">
                <Label className="text-slate-300">Initial Capital ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input
                    type="number"
                    min={1000}
                    max={1000000}
                    step={1000}
                    value={config.initialCapital}
                    onChange={(e) => updateConfig('initialCapital', Math.max(1000, Math.min(1000000, Number(e.target.value))))}
                    className="pl-7 bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <p className="text-xs text-slate-500">Range: $1,000 - $1,000,000</p>
              </div>

              {/* Commission + Slippage */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-slate-300">Commission (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={config.commission}
                    onChange={(e) => updateConfig('commission', Number(e.target.value))}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-slate-300">Slippage (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={config.slippage}
                    onChange={(e) => updateConfig('slippage', Number(e.target.value))}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>

              {/* Advanced Options */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 py-1">
                  {advancedOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  Advanced Options
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-slate-300">Position Sizing</Label>
                      <Select value={config.positionSizing} onValueChange={(v) => updateConfig('positionSizing', v)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="fixed" className="text-slate-200">Fixed</SelectItem>
                          <SelectItem value="percent" className="text-slate-200">% of Equity</SelectItem>
                          <SelectItem value="kelly" className="text-slate-200">Kelly Criterion</SelectItem>
                          <SelectItem value="risk" className="text-slate-200">Risk-Based</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-slate-300">Max Positions</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={config.maxPositions}
                        onChange={(e) => updateConfig('maxPositions', Number(e.target.value))}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-slate-300">Stop Loss (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        value={config.stopLoss}
                        onChange={(e) => updateConfig('stopLoss', Number(e.target.value))}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-slate-300">Take Profit (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={config.takeProfit}
                        onChange={(e) => updateConfig('takeProfit', Number(e.target.value))}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-slate-300">Walk-Forward Analysis</Label>
                      <p className="text-xs text-slate-500">Run optimized window analysis</p>
                    </div>
                    <Switch
                      checked={config.walkForward}
                      onCheckedChange={(v) => updateConfig('walkForward', v)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-slate-300">Monte Carlo Simulations</Label>
                    <Select value={String(config.monteCarlo)} onValueChange={(v) => updateConfig('monteCarlo', Number(v))}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="0" className="text-slate-200">Disabled</SelectItem>
                        <SelectItem value="100" className="text-slate-200">100</SelectItem>
                        <SelectItem value="500" className="text-slate-200">500</SelectItem>
                        <SelectItem value="1000" className="text-slate-200">1,000</SelectItem>
                        <SelectItem value="5000" className="text-slate-200">5,000</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                Cancel
              </Button>
              <Button
                onClick={runBacktest}
                disabled={isRunning}
                className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
                    Run Backtest
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading State */}
      <AnimatePresence>
        {isRunning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <Card className="bg-slate-900/80 border-slate-800">
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <div className="relative">
                    <div className="size-16 rounded-full border-4 border-slate-700" />
                    <div className="size-16 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin absolute top-0 left-0" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium text-lg">Running Backtest...</p>
                    <p className="text-slate-400 text-sm">
                      {STRATEGIES.find((s) => s.id === config.strategy)?.name} on {config.symbol}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      {format(config.startDate, 'MMM dd, yyyy')} → {format(config.endDate, 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-6 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="size-3" />
                      <span>Analyzing {Math.min(60, differenceInDays(config.endDate, config.startDate))} days</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Activity className="size-3" />
                      <span>{config.timeframe} timeframe</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="size-3" />
                      <span>${config.initialCapital.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {showResults && results && !isRunning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Performance Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Total P&L', value: `$${Math.abs(results.totalPnl).toLocaleString()}`, sub: results.totalPnl >= 0 ? 'Profit' : 'Loss', color: results.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400', icon: results.totalPnl >= 0 ? TrendingUp : TrendingDown, prefix: results.totalPnl >= 0 ? '+' : '-' },
                { label: 'Win Rate', value: `${results.winRate}%`, sub: `${Math.round(results.totalTrades * results.winRate / 100)}W / ${Math.round(results.totalTrades * (100 - results.winRate) / 100)}L`, color: results.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400', icon: Trophy },
                { label: 'Profit Factor', value: results.profitFactor.toFixed(2), sub: results.profitFactor > 1.5 ? 'Strong' : 'Moderate', color: results.profitFactor > 1 ? 'text-emerald-400' : 'text-red-400', icon: Target },
                { label: 'Sharpe Ratio', value: results.sharpeRatio.toFixed(2), sub: results.sharpeRatio > 2 ? 'Excellent' : 'Good', color: results.sharpeRatio > 1 ? 'text-emerald-400' : 'text-amber-400', icon: BarChart3 },
                { label: 'Max Drawdown', value: `-${results.maxDrawdown}%`, sub: 'Peak to trough', color: 'text-red-400', icon: AlertTriangle },
                { label: 'Total Trades', value: results.totalTrades.toString(), sub: `${differenceInDays(config.endDate, config.startDate)} days`, color: 'text-slate-200', icon: Activity },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card className="bg-slate-900/80 border-slate-800 hover:border-slate-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-slate-400">{card.label}</span>
                        <card.icon className={`size-3.5 ${card.color}`} />
                      </div>
                      <p className={`text-xl font-bold ${card.color}`}>
                        {card.prefix || ''}{card.value}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Equity Curve Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="bg-slate-900/80 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="size-4 text-emerald-400" />
                    Equity Curve
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={results.equityCurve} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.2} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval={4} />
                        <YAxis
                          yAxisId="equity"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                          orientation="left"
                        />
                        <YAxis
                          yAxisId="drawdown"
                          tick={{ fontSize: 10, fill: '#ef4444' }}
                          tickFormatter={(v: number) => `${v}%`}
                          orientation="right"
                          domain={['auto', 0]}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          yAxisId="equity"
                          type="monotone"
                          dataKey="equity"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#equityGrad)"
                          name="Equity"
                        />
                        <Area
                          yAxisId="drawdown"
                          type="monotone"
                          dataKey="drawdown"
                          stroke="#ef4444"
                          strokeWidth={1}
                          fill="url(#drawdownGrad)"
                          fillOpacity={1}
                          name="Drawdown"
                        />
                        <line
                          yAxisId="equity"
                          type="monotone"
                          dataKey="benchmark"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                          name="Buy & Hold"
                        />
                        <Bar
                          yAxisId="equity"
                          dataKey="tradeWin"
                          fill="#10b981"
                          opacity={0}
                          name="Trades"
                          shape={(props: Record<string, unknown>) => {
                            const { cx, cy, tradeWin } = props as { cx: number; cy: number; tradeWin?: boolean }
                            if (tradeWin === undefined) return <g key="none" />
                            return (
                              <circle
                                key={`trade-${cx}`}
                                cx={cx}
                                cy={cy}
                                r={3}
                                fill={tradeWin ? '#10b981' : '#ef4444'}
                                stroke={tradeWin ? '#059669' : '#dc2626'}
                                strokeWidth={1}
                              />
                            )
                          }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-emerald-500 rounded" /> Strategy
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-0.5 bg-amber-500 rounded" style={{ borderTop: '1px dashed #f59e0b' }} /> Buy & Hold
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 bg-red-500/20 rounded" /> Drawdown
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" /> Win
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" /> Loss
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Monthly Returns Heatmap */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Card className="bg-slate-900/80 border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white flex items-center gap-2">
                    <CalendarDays className="size-4 text-emerald-400" />
                    Monthly Returns
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {results.monthlyReturns.map((m) => {
                      const intensity = Math.min(Math.abs(m.return) / 10, 1)
                      const isPositive = m.return >= 0
                      const bgColor = isPositive
                        ? `rgba(16, 185, 129, ${0.1 + intensity * 0.5})`
                        : `rgba(239, 68, 68, ${0.1 + intensity * 0.5})`
                      return (
                        <div
                          key={m.month}
                          className="rounded-lg p-3 text-center transition-colors hover:scale-105 cursor-default"
                          style={{ backgroundColor: bgColor, border: `1px solid ${isPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}
                        >
                          <p className="text-xs text-slate-400 mb-1">{m.month}</p>
                          <p className={`text-lg font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {m.return >= 0 ? '+' : ''}{m.return.toFixed(1)}%
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Distribution Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* P&L Distribution */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.55 }}
              >
                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <BarChart3 className="size-4 text-emerald-400" />
                      P&L Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={results.pnlDistribution} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="range" tick={{ fontSize: 9, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar dataKey="count" name="Trades" radius={[4, 4, 0, 0]}>
                            {results.pnlDistribution.map((entry, index) => {
                              const rangeVal = entry.range
                              const isPositive = !rangeVal.startsWith('-') && !rangeVal.startsWith('<-')
                              return <Cell key={index} fill={isPositive ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Win/Loss by Hour */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Card className="bg-slate-900/80 border-slate-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <Clock className="size-4 text-emerald-400" />
                      Win/Loss by Hour (UTC)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={results.hourlyPnl} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="hour" tick={{ fontSize: 8, fill: '#64748b' }} interval={2} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v: number) => `$${v}`} />
                          <Tooltip content={<ChartTooltip />} />
                          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                          <Bar dataKey="pnl" name="P&L" radius={[3, 3, 0, 0]}>
                            {results.hourlyPnl.map((entry, index) => (
                              <Cell key={index} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Trade Log Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 }}
            >
              <Card className="bg-slate-900/80 border-slate-800">
                <CardHeader className="pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle className="text-white flex items-center gap-2">
                      <Activity className="size-4 text-emerald-400" />
                      Trade Log
                      <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs">
                        {sortedTrades.length} trades
                      </Badge>
                    </CardTitle>
                    <div className="flex gap-2">
                      {['all', 'win', 'loss'].map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant={tradeFilter === f ? 'default' : 'outline'}
                          className={
                            tradeFilter === f
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                              : 'border-slate-700 text-slate-400 hover:bg-slate-800 text-xs'
                          }
                          onClick={() => setTradeFilter(f)}
                        >
                          {f === 'all' ? 'All' : f === 'win' ? 'Wins' : 'Losses'}
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          <TableHead className="text-slate-400 text-xs cursor-pointer hover:text-white" onClick={() => handleSortClick('id')}>
                            <span className="flex items-center"># {renderSortIcon('id')}</span>
                          </TableHead>
                          <TableHead className="text-slate-400 text-xs cursor-pointer hover:text-white" onClick={() => handleSortClick('symbol')}>
                            <span className="flex items-center">Symbol {renderSortIcon('symbol')}</span>
                          </TableHead>
                          <TableHead className="text-slate-400 text-xs cursor-pointer hover:text-white" onClick={() => handleSortClick('side')}>
                            <span className="flex items-center">Side {renderSortIcon('side')}</span>
                          </TableHead>
                          <TableHead className="text-slate-400 text-xs cursor-pointer hover:text-white" onClick={() => handleSortClick('entry')}>
                            <span className="flex items-center">Entry {renderSortIcon('entry')}</span>
                          </TableHead>
                          <TableHead className="text-slate-400 text-xs cursor-pointer hover:text-white" onClick={() => handleSortClick('exit')}>
                            <span className="flex items-center">Exit {renderSortIcon('exit')}</span>
                          </TableHead>
                          <TableHead className="text-slate-400 text-xs cursor-pointer hover:text-white" onClick={() => handleSortClick('pnl')}>
                            <span className="flex items-center">P&L {renderSortIcon('pnl')}</span>
                          </TableHead>
                          <TableHead className="text-slate-400 text-xs">Duration</TableHead>
                          <TableHead className="text-slate-400 text-xs">Signal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedTrades.slice(0, 10).map((trade) => (
                          <TableRow key={trade.id} className="border-slate-800 hover:bg-slate-800/50">
                            <TableCell className="text-slate-300 text-xs font-mono">{trade.id}</TableCell>
                            <TableCell className="text-white text-xs font-medium">{trade.symbol}</TableCell>
                            <TableCell>
                              <Badge
                                className={`text-[10px] px-2 py-0 ${
                                  trade.side === 'LONG'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {trade.side}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-slate-300 text-xs">${trade.entry.toLocaleString()}</TableCell>
                            <TableCell className="text-slate-300 text-xs">${trade.exit.toLocaleString()}</TableCell>
                            <TableCell className={`text-xs font-bold ${pnlColor(trade.pnl)}`}>
                              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-slate-400 text-xs">{trade.duration}</TableCell>
                            <TableCell>
                              <Badge className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                {trade.signal}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Previous Backtests (shown when no results) */}
      {!showResults && !isRunning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Card className="bg-slate-900/80 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <RotateCcw className="size-4 text-emerald-400" />
                Previous Backtests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
                {mockBacktestResults.map((bt, i) => {
                  const strat = mockStrategies.find((s) => s.id === bt.strategyId)
                  return (
                    <motion.button
                      key={bt.id}
                      onClick={() => loadPreviousBacktest(i)}
                      className={`w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-lg border transition-all text-left ${
                        selectedPrevBacktest === i
                          ? 'border-emerald-500/50 bg-emerald-500/5'
                          : 'border-slate-800 bg-slate-800/30 hover:border-slate-700 hover:bg-slate-800/50'
                      }`}
                      whileHover={{ scale: 1.005 }}
                      whileTap={{ scale: 0.995 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${bt.totalPnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          {bt.totalPnl >= 0 ? (
                            <TrendingUp className="size-4 text-emerald-400" />
                          ) : (
                            <TrendingDown className="size-4 text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium">{strat?.name || 'Unknown Strategy'}</p>
                          <p className="text-xs text-slate-500">
                            {format(new Date(bt.createdAt), 'MMM dd, yyyy')} &bull; {format(new Date(bt.startDate), 'MMM dd')} → {format(new Date(bt.endDate), 'MMM dd, yyyy')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${bt.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {bt.totalPnl >= 0 ? '+' : ''}${bt.totalPnl.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">
                            {bt.totalTrades} trades
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-white">{bt.winRate}%</p>
                          <p className="text-xs text-slate-500">Win Rate</p>
                        </div>
                        <div className="text-right hidden md:block">
                          <p className="text-sm font-medium text-white">{bt.sharpeRatio.toFixed(2)}</p>
                          <p className="text-xs text-slate-500">Sharpe</p>
                        </div>
                        <ChevronRight className="size-4 text-slate-500 hidden sm:block" />
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  )
}
