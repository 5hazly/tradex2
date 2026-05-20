'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Target,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface DashboardStats {
  totalBalance: number
  totalPnl: number
  totalPnlPercent: number
  todayPnl: number
  todayPnlPercent: number
  winRate: number
  totalTrades: number
  openPositions: number
  activeStrategies: number
}

interface RecentActivity {
  id: string
  type: 'trade' | 'order' | 'strategy' | 'alert'
  message: string
  time: string
  profit?: number
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: 'easeOut' },
  }),
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  index,
  prefix = '',
  suffix = '',
}: {
  title: string
  value: string
  change?: { value: number; percent: number }
  icon: React.ElementType
  index: number
  prefix?: string
  suffix?: string
}) {
  const isPositive = change && change.value >= 0

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
    >
      <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl hover:border-slate-700/60 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {title}
            </span>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/80">
              <Icon className="w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-slate-100 tabular-nums">
              {prefix}{value}{suffix}
            </span>
            {change && (
              <div
                className={`flex items-center gap-0.5 text-xs font-medium mb-1 ${
                  isPositive ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                <span>{isPositive ? '+' : ''}{change.percent.toFixed(2)}%</span>
              </div>
            )}
          </div>
          {change && (
            <p className="text-xs text-slate-500 mt-2">
              {isPositive ? '+' : ''}${Math.abs(change.value).toFixed(2)} today
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="bg-slate-900/80 border-slate-800/60 rounded-xl">
          <CardContent className="p-5">
            <Skeleton className="h-3 w-24 mb-3 bg-slate-800" />
            <Skeleton className="h-8 w-32 mb-2 bg-slate-800" />
            <Skeleton className="h-3 w-20 bg-slate-800" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const MOCK_ACTIVITIES: RecentActivity[] = [
  {
    id: '1',
    type: 'trade',
    message: 'Closed BTC/USDT Long with +$342.50 profit',
    time: '2 min ago',
    profit: 342.5,
  },
  {
    id: '2',
    type: 'trade',
    message: 'Opened ETH/USDT Short position at $3,512.30',
    time: '8 min ago',
  },
  {
    id: '3',
    type: 'alert',
    message: 'SOL/USDT hit stop loss — closed at -$128.75',
    time: '15 min ago',
    profit: -128.75,
  },
  {
    id: '4',
    type: 'strategy',
    message: 'Momentum Strategy #3 activated on 15m timeframe',
    time: '23 min ago',
  },
  {
    id: '5',
    type: 'order',
    message: 'Limit buy order filled: 0.5 ETH at $3,498.20',
    time: '45 min ago',
  },
  {
    id: '6',
    type: 'trade',
    message: 'Closed AVAX/USDT Long with +$87.20 profit',
    time: '1h ago',
    profit: 87.2,
  },
  {
    id: '7',
    type: 'alert',
    message: 'Risk limit warning: Daily drawdown approaching 5%',
    time: '1h ago',
  },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats')
        if (res.ok) {
          const json = await res.json()
          const data = json.data ?? json
          setStats(data as DashboardStats)
        }
      } catch {
        // Use fallback data — set inline defaults so the UI still renders
        setStats({
          totalBalance: 25432.50,
          availableBalance: 18432.50,
          unrealizedPnl: 7000.00,
          todayPnl: 1245.80,
          todayPnlPercent: 4.9,
          totalPnl: 12580.35,
          totalPnlPercent: 97.8,
          winRate: 64.2,
          totalTrades: 248,
          openPositions: 8,
          activeOrders: 5,
          activeStrategies: 4,
          bestStrategy: 'EMA MACD',
          bestStrategyPnl: 4230.10,
          dailyPnl: [],
        })
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Stats cards */}
      {!stats ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="Total Balance"
            value={stats.totalBalance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            change={{
              value: stats.todayPnl,
              percent: stats.todayPnlPercent,
            }}
            icon={Wallet}
            index={0}
            prefix="$"
          />
          <StatCard
            title="Total P&L"
            value={stats.totalPnl.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            change={{
              value: stats.totalPnl,
              percent: stats.totalPnlPercent,
            }}
            icon={stats.totalPnl >= 0 ? TrendingUp : TrendingDown}
            index={1}
            prefix={stats.totalPnl < 0 ? '-' : '+'}
          />
          <StatCard
            title="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            icon={Target}
            index={2}
          />
          <StatCard
            title="Open Positions"
            value={stats.openPositions.toString()}
            icon={BarChart3}
            index={3}
          />
        </div>
      )}

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Active strategies card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Active Strategies
                </CardTitle>
                <Activity className="w-4 h-4 text-slate-500" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: 'Momentum Scalper', pair: 'BTC/USDT', pnl: 1243.5, winRate: 72 },
                { name: 'Mean Reversion', pair: 'ETH/USDT', pnl: 867.2, winRate: 68 },
                { name: 'Breakout Hunter', pair: 'SOL/USDT', pnl: -234.1, winRate: 54 },
                { name: 'Grid Trading', pair: 'AVAX/USDT', pnl: 456.8, winRate: 61 },
              ].map((strategy, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-800/40 hover:border-slate-700/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {strategy.name}
                    </p>
                    <p className="text-xs text-slate-500">{strategy.pair}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-5 bg-slate-800 text-slate-400"
                    >
                      {strategy.winRate}% WR
                    </Badge>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        strategy.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {strategy.pnl >= 0 ? '+' : ''}${strategy.pnl.toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent activity card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="lg:col-span-2"
        >
          <Card className="bg-slate-900/80 border-slate-800/60 rounded-xl h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                  Recent Activity
                </CardTitle>
                <DollarSign className="w-4 h-4 text-slate-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {MOCK_ACTIVITIES.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          activity.type === 'trade'
                            ? activity.profit != null && activity.profit >= 0
                              ? 'bg-emerald-500'
                              : activity.profit != null && activity.profit < 0
                                ? 'bg-red-500'
                                : 'bg-blue-500'
                            : activity.type === 'alert'
                              ? 'bg-amber-500'
                              : activity.type === 'strategy'
                                ? 'bg-violet-500'
                                : 'bg-slate-500'
                        }`}
                      />
                      <p className="text-sm text-slate-300 truncate">{activity.message}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      {activity.profit != null && (
                        <span
                          className={`text-sm font-medium tabular-nums ${
                            activity.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {activity.profit >= 0 ? '+' : ''}${activity.profit.toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs text-slate-600 w-16 text-right">
                        {activity.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
