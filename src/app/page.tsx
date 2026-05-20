'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, type Page } from '@/lib/store'
import DashboardLayout from '@/components/dashboard/layout/dashboard-layout'
import DashboardPage from '@/components/dashboard/pages/dashboard-page'
import PositionsPage from '@/components/dashboard/pages/positions-page'
import OrdersPage from '@/components/dashboard/pages/orders-page'
import TradesPage from '@/components/dashboard/pages/trades-page'
import AnalyticsPage from '@/components/dashboard/pages/analytics-page'
import StrategiesPage from '@/components/dashboard/pages/strategies-page'
import SettingsPage from '@/components/dashboard/pages/settings-page'
import RiskPage from '@/components/dashboard/pages/risk-page'
import ExchangesPage from '@/components/dashboard/pages/exchanges-page'
import NotificationsPage from '@/components/dashboard/pages/notifications-page'
import BacktestingPage from '@/components/dashboard/pages/backtesting-page'
import PlaceholderPage from '@/components/dashboard/pages/placeholder-page'

const PAGES_IMPLEMENTED: Page[] = ['dashboard', 'positions', 'orders', 'trades', 'analytics', 'strategies', 'backtesting', 'risk', 'settings', 'notifications', 'exchanges']

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'positions': return <PositionsPage />
    case 'orders': return <OrdersPage />
    case 'trades': return <TradesPage />
    case 'analytics': return <AnalyticsPage />
    case 'strategies': return <StrategiesPage />
    case 'backtesting': return <BacktestingPage />
    case 'risk': return <RiskPage />
    case 'settings': return <SettingsPage />
    case 'notifications': return <NotificationsPage />
    case 'exchanges': return <ExchangesPage />
    default: return <PlaceholderPage page={page} />
  }
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' } },
}

export default function Home() {
  const currentPage = useAppStore((s) => s.currentPage)

  return (
    <DashboardLayout>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="h-full"
        >
          <PageContent page={currentPage} />
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  )
}
