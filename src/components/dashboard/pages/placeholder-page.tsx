'use client'

import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  History,
  TrendingUp,
  Brain,
  FlaskConical,
  Shield,
  Settings,
  Bell,
  Building2,
} from 'lucide-react'
import type { Page } from '@/lib/store'

const PAGE_ICONS: Record<Page, React.ElementType> = {
  dashboard: LayoutDashboard,
  positions: BarChart3,
  orders: ShoppingCart,
  trades: History,
  analytics: TrendingUp,
  strategies: Brain,
  backtesting: FlaskConical,
  risk: Shield,
  settings: Settings,
  notifications: Bell,
  exchanges: Building2,
}

const PAGE_LABELS: Record<Page, string> = {
  dashboard: 'Dashboard',
  positions: 'Positions',
  orders: 'Orders',
  trades: 'Trades',
  analytics: 'Analytics',
  strategies: 'Strategies',
  backtesting: 'Backtesting',
  risk: 'Risk Management',
  settings: 'Settings',
  notifications: 'Notifications',
  exchanges: 'Exchanges',
}

export default function PlaceholderPage({ page }: { page: Page }) {
  const Icon = PAGE_ICONS[page]
  const label = PAGE_LABELS[page]

  return (
    <div className="flex items-center justify-center h-full min-h-[60vh] p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50">
          <Icon className="w-7 h-7 text-slate-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-300">{label}</h2>
          <p className="text-sm text-slate-500 mt-1">
            This module is coming soon. Stay tuned for updates.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-slate-500">Under Development</span>
        </div>
      </div>
    </div>
  )
}
