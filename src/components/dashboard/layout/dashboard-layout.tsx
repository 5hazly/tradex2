'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from 'lucide-react'
import { useAppStore, type Page, PAGE_LIST } from '@/lib/store'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import DashboardHeader from './dashboard-header'

const NAV_ICONS: Record<Page, React.ElementType> = {
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

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { currentPage, setCurrentPage } = useAppStore()

  const handleNav = useCallback(
    (page: Page) => {
      setCurrentPage(page)
      onNavigate?.()
    },
    [setCurrentPage, onNavigate]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Logo area */}
      <div className="flex items-center h-14 px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600/20 shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <span className="text-base font-bold text-slate-100 tracking-tight">
                  TradeAI<span className="text-emerald-400">Pro</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Separator className="bg-slate-800/60" />

      {/* Navigation items */}
      <ScrollArea className="flex-1 py-3 scrollbar-thin">
        <nav className="flex flex-col gap-1 px-3">
          {PAGE_LIST.map((page) => {
            const Icon = NAV_ICONS[page.key]
            const isActive = currentPage === page.key

            if (collapsed) {
              return (
                <TooltipProvider key={page.key} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleNav(page.key)}
                        className={`w-10 h-10 rounded-lg mb-0.5 relative transition-colors ${
                          isActive
                            ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-400 rounded-r-full" />
                        )}
                        <Icon className="w-4.5 h-4.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="bg-slate-800 border-slate-700 text-slate-200 text-xs">
                      {page.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            }

            return (
              <Button
                key={page.key}
                variant="ghost"
                onClick={() => handleNav(page.key)}
                className={`h-9 px-3 rounded-lg justify-start gap-3 text-sm font-medium transition-all relative ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-400 rounded-r-full" />
                )}
                <Icon className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{page.label}</span>
              </Button>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Bottom section */}
      <Separator className="bg-slate-800/60" />
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-600/20 shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="text-xs font-semibold text-emerald-400 whitespace-nowrap">Pro Plan</p>
                <p className="text-[10px] text-emerald-400/60 whitespace-nowrap">Unlimited trades</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const {
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useAppStore()

  // Close mobile sidebar on route change
  const currentPage = useAppStore((s) => s.currentPage)
  useEffect(() => {
    setSidebarOpen(false)
  }, [currentPage, setSidebarOpen])

  // Close mobile sidebar on window resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarOpen])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-800/60 bg-slate-900 shrink-0 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 z-50 h-full w-[260px] border-r border-slate-800/60 bg-slate-900 lg:hidden"
            >
              <SidebarContent
                collapsed={false}
                onNavigate={() => setSidebarOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0">
        <DashboardHeader />
        <main className="flex-1 overflow-auto scrollbar-thin">
          {children}
        </main>
      </div>

      {/* Desktop sidebar toggle button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="hidden lg:flex fixed bottom-4 z-30 h-8 w-8 rounded-full border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 shadow-lg transition-all"
        style={{ left: sidebarCollapsed ? 'calc(72px + 0.5rem)' : 'calc(260px - 1.25rem)' }}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  )
}
