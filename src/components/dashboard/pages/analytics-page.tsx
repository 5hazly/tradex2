'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  Clock,
  AlertTriangle,
  Shield,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip as ShadTooltip,
  TooltipContent,
  TooltipProvider as ShadTooltipProvider,
  TooltipTrigger as ShadTooltipTrigger,
} from '@/components/ui/tooltip'

// ============================================================
// Types
// ============================================================

interface EquityPoint {
  date: string
  equity: number
  pnl: number
  drawdown: number
  trades: number
}

interface AnalyticsResponse {
  success: boolean
  data?: {
    equityCurve: EquityPoint[]
    performance: {
      totalPnl: number
      totalPnlPercent: number
      winRate: number
      profitFactor: number
      sharpeRatio: number
      sortinoRatio: number
      maxDrawdown: number
      maxDrawdownPercent: number
      avgWin: number
      avgLoss: number
      largestWin: number
      largestLoss: number
      consecutiveWins: number
      consecutiveLosses: number
      avgHoldingTime: string
      totalFees: number
      netPnl: number
    }
    symbols: Array<{
      symbol: string
      totalTrades: number
      winRate: number
      totalPnl: number
      totalVolume: number
      avgPnl: number
      bestTrade: number
      worstTrade: number
    }>
    strategies: Array<{
      strategyId: string
      strategyName: string
      strategyType: string
      isActive: boolean
      totalTrades: number
      winRate: number
      totalPnl: number
      profitFactor: number
      sharpeRatio: number
      maxDrawdown: number
      avgPnl: number
      currentPositions: number
    }>
    recentRecords: Array<{
      id: string
      date: string
      totalPnl: number
      winRate: number
      totalTrades: number
      profitFactor: number
      sharpeRatio: number
      maxDrawdown: number
      userId: string
      strategyId: string | null
    }>
  }
}

// ============================================================
// Constants
// ============================================================

const periodOptions = ['24h', '7d', '30d', '90d', '1Y', 'All'] as const
type Period = (typeof periodOptions)[number]

const timeframeOptions = ['1W', '1M', '3M', '6M', '1Y'] as const
type ChartTimeframe = (typeof timeframeOptions)[number]

function getFilteredEquity(data: EquityPoint[], tf: ChartTimeframe): EquityPoint[] {
  const days = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 }[tf] ?? 90
  return data.slice(-days)
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: 'easeOut' },
  }),
}

// ============================================================
// Custom Dark Tooltip
// ============================================================

function EquityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: EquityPoint }>; label?: string }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 shadow-xl">
      <p className="text-xs text-slate-400 mb-1.5">{label}</p>
      <p className="text-sm font-semibold text-emerald-400">
        ${d.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </p>
      <p className={`text-xs mt-0.5 ${d.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(2)} P&L
      </p>
      {d.drawdown > 0 && (
        <p className="text-xs text-red-400 mt-0.5">
          DD: -{d.drawdown.toFixed(2)}%
        </p>
      )}
      <p className="text-xs text-slate-500 mt-0.5">{d.trades} trades</p>
    </div>
  )
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {val >= 0 ? '+' : ''}${val.toFixed(2)}
      </p>
    </div>
  )
}

// ============================================================
// Main Component
// ============================================================

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('90d')
  const [chartTimeframe, setChartTimeframe] = useState<ChartTimeframe>('3M')
  const [strategySort, setStrategySort] = useState<string>('pnl')
  const [strategySortDir, setStrategySortDir] = useState<'asc' | 'desc'>('desc')
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse['data'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/analytics?section=all')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: AnalyticsResponse = await res.json()
      if (json.success && json.data) {
        setAnalyticsData(json.data)
      } else {
        toast.error('Failed to load analytics data')
      }
    } catch (err) {
      console.error('Analytics fetch error:', err)
      toast.error('Failed to load analytics data. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // Equity data from API
  const allEquity = analyticsData?.equityCurve || []
  const filteredEquity = useMemo(() => getFilteredEquity(allEquity, chartTimeframe), [allEquity, chartTimeframe])

  // Performance metrics from API
  const perf = analyticsData?.performance

  // Compute total trades from strategies
  const totalTrades = useMemo(() => {
    if (!analyticsData?.strategies) return 0
    return analyticsData.strategies.reduce((sum, s) => sum + s.totalTrades, 0)
  }, [analyticsData?.strategies])

  // Win/Loss distribution computed from performance
  const winLossData = useMemo(() => {
    if (!perf || totalTrades === 0) {
      return [
        { name: 'Wins', value: 0, color: '#10b981' },
        { name: 'Losses', value: 0, color: '#ef4444' },
      ]
    }
    const wins = Math.round(totalTrades * (perf.winRate / 100))
    const losses = totalTrades - wins
    return [
      { name: 'Wins', value: wins, color: '#10b981' },
      { name: 'Losses', value: losses, color: '#ef4444' },
    ]
  }, [perf, totalTrades])

  // P&L by day of week (kept hardcoded — API doesn't provide this)
  const dowData = useMemo(() => [
    { day: 'Mon', pnl: 485 },
    { day: 'Tue', pnl: -180 },
    { day: 'Wed', pnl: 720 },
    { day: 'Thu', pnl: 345 },
    { day: 'Fri', pnl: -95 },
    { day: 'Sat', pnl: 560 },
    { day: 'Sun', pnl: -220 },
  ], [])

  // Strategy data mapped from API
  const strategyData = useMemo(() => {
    if (!analyticsData?.strategies) return []
    return analyticsData.strategies.map(s => ({
      name: s.strategyName,
      type: s.strategyType,
      trades: s.totalTrades,
      winRate: s.winRate,
      pnl: s.totalPnl,
      profitFactor: s.profitFactor,
      sharpe: s.sharpeRatio,
    }))
  }, [analyticsData?.strategies])

  const sortedStrategyData = useMemo(() => {
    const dir = strategySortDir === 'asc' ? 1 : -1
    return [...strategyData].sort((a, b) => {
      const key = strategySort as keyof typeof a
      const av = a[key]
      const bv = b[key]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir
      return 0
    })
  }, [strategyData, strategySort, strategySortDir])

  function handleStrategySort(key: string) {
    if (strategySort === key) {
      setStrategySortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setStrategySort(key)
      setStrategySortDir('desc')
    }
  }

  // Symbol heatmap (kept hardcoded — API doesn't provide heatmap)
  const heatmapSymbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'LINK', 'ADA']
  const heatmapTimeframes = ['1H', '4H', '1D', '1W', '1M']
  const heatmapData = useMemo(() => {
    const seed: Record<string, number[]> = {
      BTC: [0.8, 1.2, 2.4, 3.8, 5.2],
      ETH: [-0.3, 0.6, 1.8, 2.9, 4.5],
      SOL: [1.5, -0.8, 3.2, 5.1, -1.2],
      DOGE: [-1.2, -2.1, -0.5, 1.8, 3.4],
      XRP: [0.5, 1.8, -0.9, 2.1, 1.5],
      AVAX: [2.1, 3.5, 5.8, 8.2, 12.4],
      LINK: [-0.5, 0.3, 1.2, -0.8, 2.1],
      ADA: [0.9, 1.5, -1.8, 0.5, 3.8],
    }
    return heatmapSymbols.map(sym => ({
      symbol: sym,
      values: heatmapTimeframes.map(tf => seed[sym][heatmapTimeframes.indexOf(tf)]),
    }))
  }, [])

  function getHeatColor(val: number): string {
    if (val >= 8) return 'bg-emerald-600/80 text-emerald-100'
    if (val >= 5) return 'bg-emerald-700/60 text-emerald-200'
    if (val >= 3) return 'bg-emerald-800/50 text-emerald-300'
    if (val >= 1) return 'bg-emerald-900/40 text-emerald-400'
    if (val >= 0) return 'bg-slate-800/40 text-slate-400'
    if (val >= -1) return 'bg-red-900/40 text-red-400'
    if (val >= -3) return 'bg-red-800/50 text-red-300'
    return 'bg-red-700/60 text-red-200'
  }

  // Risk metrics — partially from API data
  const riskMetrics = useMemo(() => {
    const avgWinLossRatio = perf && perf.avgLoss !== 0
      ? (perf.avgWin / Math.abs(perf.avgLoss)).toFixed(2)
      : '—'

    const calmarRatio = perf && perf.maxDrawdownPercent !== 0
      ? (perf.totalPnlPercent / perf.maxDrawdownPercent).toFixed(2)
      : '—'

    return [
      { label: 'Value at Risk (95%)', value: '-$423.50', icon: AlertTriangle, color: 'text-amber-400' },
      { label: 'Expected Shortfall', value: '-$678.20', icon: AlertTriangle, color: 'text-red-400' },
      { label: 'Max Consecutive Losses', value: perf ? String(perf.consecutiveLosses) : '—', icon: TrendingDown, color: 'text-red-400' },
      { label: 'Avg Win/Loss Ratio', value: avgWinLossRatio, icon: Activity, color: 'text-emerald-400' },
      { label: 'Kelly Criterion', value: '12.5%', icon: Target, color: 'text-emerald-400' },
      { label: 'Calmar Ratio', value: calmarRatio, icon: TrendingUp, color: 'text-emerald-400' },
    ]
  }, [perf])

  // Win/loss counts for subtitle
  const winCount = winLossData[0]?.value ?? 0
  const lossCount = winLossData[1]?.value ?? 0

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading analytics data...</p>
      </div>
    )
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
          <h1 className="text-2xl font-bold text-slate-100">Analytics & Performance</h1>
          <p className="text-sm text-slate-500 mt-1">Comprehensive trading performance analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-emerald-400 hover:border-slate-700 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-lg p-1">
            {periodOptions.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Performance Metric Cards — 2 rows of 3 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {[
          {
            label: 'Total P&L',
            value: perf ? `$${perf.netPnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—',
            color: perf ? (perf.netPnl >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-400',
            icon: perf ? (perf.netPnl >= 0 ? TrendingUp : TrendingDown) : Activity,
            sub: `Net of fees`,
          },
          {
            label: 'Win Rate',
            value: perf ? `${perf.winRate.toFixed(1)}%` : '—',
            color: 'text-emerald-400',
            icon: Target,
            sub: `${winCount} wins / ${lossCount} losses`,
          },
          {
            label: 'Profit Factor',
            value: perf ? perf.profitFactor.toFixed(2) : '—',
            color: perf ? (perf.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400',
            icon: Activity,
            sub: perf ? (perf.profitFactor >= 1.5 ? 'Excellent' : 'Moderate') : '—',
          },
          {
            label: 'Sharpe Ratio',
            value: perf ? perf.sharpeRatio.toFixed(2) : '—',
            color: perf ? (perf.sharpeRatio >= 2 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400',
            icon: Zap,
            sub: 'Risk-adjusted',
          },
          {
            label: 'Max Drawdown',
            value: perf ? `-${perf.maxDrawdownPercent.toFixed(1)}%` : '—',
            color: 'text-red-400',
            icon: AlertTriangle,
            sub: 'Peak-to-trough',
          },
          {
            label: 'Avg Duration',
            value: perf ? perf.avgHoldingTime : '—',
            color: 'text-slate-200',
            icon: Clock,
            sub: 'Per trade',
          },
        ].map((m, i) => (
          <motion.div
            key={m.label}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
          >
            <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl hover:border-slate-700/60 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {m.label}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center">
                    <m.icon className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>
                <p className={`text-lg md:text-xl font-bold tabular-nums ${m.color}`}>
                  {m.value}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">{m.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Equity Curve */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Equity Curve
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-slate-800 text-slate-400">
                  {allEquity.length} Days
                </Badge>
              </div>
              <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5">
                {timeframeOptions.map(tf => (
                  <button
                    key={tf}
                    onClick={() => setChartTimeframe(tf)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      chartTimeframe === tf
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-72 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredEquity} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                    tickFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getMonth() + 1}/${d.getDate()}`
                    }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip content={<EquityTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    stroke="#ef4444"
                    strokeWidth={1}
                    fill="url(#drawdownGrad)"
                    name="Drawdown"
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#equityGrad)"
                    name="Equity"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-400 rounded" /> Equity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-red-400 rounded" /> Drawdown
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Performance Breakdown: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Win/Loss Donut */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Win/Loss Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={winLossData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {winLossData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#e2e8f0',
                        fontSize: '13px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-100">{totalTrades}</span>
                  <span className="text-xs text-slate-500">Total Trades</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-6 mt-2">
                {winLossData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="text-xs text-slate-400">
                      {d.name} ({d.value})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* P&L by Day of Week */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                P&L by Day of Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dowData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={{ stroke: '#334155' }}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip content={<BarTooltip />} />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {dowData.map((entry) => (
                        <Cell
                          key={entry.day}
                          fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'}
                          fillOpacity={0.8}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500" /> Profit
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-red-500" /> Loss
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Strategy Performance Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Strategy Performance
              </CardTitle>
              <Activity className="w-4 h-4 text-slate-500" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    {[
                      { key: 'name', label: 'Strategy' },
                      { key: 'trades', label: 'Trades' },
                      { key: 'winRate', label: 'Win Rate' },
                      { key: 'pnl', label: 'P&L' },
                      { key: 'profitFactor', label: 'PF' },
                      { key: 'sharpe', label: 'Sharpe' },
                    ].map(col => (
                      <TableHead
                        key={col.key}
                        className="text-xs text-slate-500 font-medium uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors py-3 px-4"
                        onClick={() => handleStrategySort(col.key)}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {strategySort === col.key && (
                            strategySortDir === 'desc'
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronUp className="w-3 h-3" />
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStrategyData.map((s) => (
                    <TableRow key={s.name} className="border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{s.name}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-slate-800 text-slate-400">
                            {s.type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-sm text-slate-400 tabular-nums">{s.trades}</TableCell>
                      <TableCell className="py-3 px-4">
                        <span className={`text-sm font-medium tabular-nums ${s.winRate >= 60 ? 'text-emerald-400' : s.winRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {s.winRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className={`text-sm font-semibold tabular-nums ${s.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {s.pnl >= 0 ? '+' : ''}${s.pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className={`text-sm font-medium tabular-nums ${s.profitFactor >= 2 ? 'text-emerald-400' : s.profitFactor >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
                          {s.profitFactor.toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className={`text-sm font-medium tabular-nums ${s.sharpe >= 2 ? 'text-emerald-400' : s.sharpe >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
                          {s.sharpe.toFixed(2)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Symbol Performance Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Symbol Performance Heatmap
              </CardTitle>
              <ShadTooltipProvider>
                <ShadTooltip>
                  <ShadTooltipTrigger>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-slate-800 text-slate-400 cursor-help">
                      %
                    </Badge>
                  </ShadTooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Performance percentage by timeframe</p>
                  </TooltipContent>
                </ShadTooltip>
              </ShadTooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="min-w-[500px]">
                {/* Header row */}
                <div className="grid grid-cols-[100px_repeat(5,1fr)] gap-1 mb-1">
                  <div className="text-xs text-slate-500 font-medium px-2 py-1">Symbol</div>
                  {heatmapTimeframes.map(tf => (
                    <div key={tf} className="text-xs text-slate-500 font-medium text-center py-1">
                      {tf}
                    </div>
                  ))}
                </div>
                {/* Data rows */}
                {heatmapData.map(row => (
                  <div key={row.symbol} className="grid grid-cols-[100px_repeat(5,1fr)] gap-1 mb-1">
                    <div className="text-sm font-medium text-slate-300 px-2 py-1 flex items-center">
                      {row.symbol}
                    </div>
                    {row.values.map((val, idx) => (
                      <div
                        key={idx}
                        className={`text-xs font-medium text-center py-2.5 rounded-md transition-colors ${getHeatColor(val)}`}
                      >
                        {val >= 0 ? '+' : ''}{val.toFixed(1)}%
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center justify-center gap-2 mt-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-4 h-2 rounded-sm bg-red-700/60" /> Loss
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-2 rounded-sm bg-slate-800/40" /> Neutral
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-2 rounded-sm bg-emerald-700/60" /> Profit
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Risk Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Risk Metrics
              </CardTitle>
              <Shield className="w-4 h-4 text-slate-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {riskMetrics.map(m => (
                <div
                  key={m.label}
                  className="p-3 rounded-lg bg-slate-800/40 border border-slate-800/40"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <m.icon className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider leading-tight">
                      {m.label}
                    </span>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${m.color}`}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
