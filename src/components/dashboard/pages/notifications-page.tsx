'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  BellOff,
  CheckCheck,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Zap,
  Settings,
  ChevronDown,
  ChevronUp,
  Filter,
  Circle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import type { NotificationType, NotificationLog } from '@/lib/types/trading'

// ============================================================
// Helpers
// ============================================================
function getRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function getNotificationTitle(type: NotificationType): string {
  switch (type) {
    case 'TRADE_OPEN': return 'Position Opened'
    case 'TRADE_CLOSE': return 'Position Closed'
    case 'PROFIT': return 'Profitable Trade'
    case 'LOSS': return 'Trade Closed in Loss'
    case 'ERROR': return 'Error'
    case 'DRAWDOWN': return 'Drawdown Alert'
    case 'ALERT': return 'Alert'
    default: return 'System'
  }
}

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'TRADE_OPEN': return <BookOpen className="size-4" />
    case 'TRADE_CLOSE': return <CheckCircle2 className="size-4" />
    case 'PROFIT': return <TrendingUp className="size-4" />
    case 'LOSS': return <TrendingDown className="size-4" />
    case 'ERROR': return <XCircle className="size-4" />
    case 'DRAWDOWN': return <AlertTriangle className="size-4" />
    case 'ALERT': return <Zap className="size-4" />
    default: return <Circle className="size-4" />
  }
}

function getNotificationColor(type: NotificationType) {
  switch (type) {
    case 'TRADE_OPEN': return { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-600/20', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30' }
    case 'TRADE_CLOSE': return { icon: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-600/20', dot: 'bg-blue-400', badge: 'bg-blue-500/10 text-blue-400 border-blue-600/30' }
    case 'PROFIT': return { icon: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-600/20', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-600/30' }
    case 'LOSS': return { icon: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-600/20', dot: 'bg-red-400', badge: 'bg-red-500/10 text-red-400 border-red-600/30' }
    case 'ERROR': return { icon: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-600/20', dot: 'bg-red-400', badge: 'bg-red-500/10 text-red-400 border-red-600/30' }
    case 'DRAWDOWN': return { icon: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-600/20', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-600/30' }
    case 'ALERT': return { icon: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-600/20', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-600/30' }
    default: return { icon: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-600/20', dot: 'bg-slate-400', badge: 'bg-slate-500/10 text-slate-400 border-slate-600/30' }
  }
}

function getTypeLabel(type: NotificationType): string {
  switch (type) {
    case 'TRADE_OPEN': return 'Trade'
    case 'TRADE_CLOSE': return 'Trade'
    case 'PROFIT': return 'Profit'
    case 'LOSS': return 'Loss'
    case 'ERROR': return 'Error'
    case 'DRAWDOWN': return 'Alert'
    case 'ALERT': return 'Alert'
    default: return 'System'
  }
}

type FilterType = 'all' | 'trades' | 'errors' | 'alerts' | 'system'

const filterMap: Record<FilterType, NotificationType[]> = {
  all: [],
  trades: ['TRADE_OPEN', 'TRADE_CLOSE'],
  errors: ['ERROR', 'LOSS'],
  alerts: ['DRAWDOWN', 'ALERT', 'PROFIT'],
  system: ['TRADE_OPEN', 'TRADE_CLOSE', 'ERROR'],
}

// ============================================================
// Component
// ============================================================
const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25 } },
}

export default function NotificationsPage() {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const [notifications, setNotifications] = useState<NotificationLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to fetch notifications')

      setNotifications(json.data.notifications)
      setUnreadCount(json.data.unreadCount)
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
      toast.error('Failed to load notifications')
    } finally {
      if (isRefresh) setIsRefreshing(false)
      else setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const filteredNotifications = useMemo(() => {
    if (filter === 'all') return notifications
    const types = filterMap[filter]
    return notifications.filter((n) => types.includes(n.type))
  }, [notifications, filter])

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to mark all as read')

      toast.success('All notifications marked as read')
      fetchNotifications(true)
    } catch (err) {
      console.error('Failed to mark all as read:', err)
      toast.error('Failed to mark all as read')
    }
  }

  const handleMarkRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))

    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to mark as read')
    } catch (err) {
      console.error('Failed to mark as read:', err)
      toast.error('Failed to mark notification as read')
      // Revert optimistic update
      fetchNotifications(true)
    }
  }

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
    handleMarkRead(id)
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Notifications</h1>
            <p className="text-sm text-slate-400 mt-1">Stay updated on your trading activity</p>
          </div>
          {unreadCount > 0 && (
            <Badge className="bg-red-500/20 text-red-400 border-red-600/30">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2">
                <Filter className="size-4" />
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-800 border-slate-700">
              {([
                { value: 'all', label: 'All Notifications' },
                { value: 'trades', label: 'Trades' },
                { value: 'errors', label: 'Errors & Losses' },
                { value: 'alerts', label: 'Alerts & Profits' },
                { value: 'system', label: 'System' },
              ] as { value: FilterType; label: string }[]).map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={filter === opt.value ? 'bg-emerald-600/20 text-emerald-400' : 'text-slate-300'}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh Button */}
          <Button
            variant="outline"
            onClick={() => fetchNotifications(true)}
            disabled={isRefreshing}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
          >
            <Loader2 className={`size-4 ${isRefreshing ? 'animate-spin' : 'hidden'}`} />
            <RefreshCw className={`size-4 ${isRefreshing ? 'hidden' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-2"
          >
            <CheckCheck className="size-4" />
            Mark All Read
          </Button>
        </div>
      </motion.div>

      {/* Notification List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 text-emerald-400 animate-spin" />
        </div>
      ) : (
        <motion.div variants={listVariants} initial="hidden" animate="visible" className="space-y-2">
          {filteredNotifications.length === 0 ? (
            <Card className="bg-slate-900/80 border-slate-800/60">
              <CardContent className="py-12 flex flex-col items-center gap-3">
                <BellOff className="size-10 text-slate-600" />
                <p className="text-sm text-slate-500">No notifications in this category</p>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notif) => {
              const colors = getNotificationColor(notif.type)
              const isExpanded = expandedId === notif.id
              const createdAt = new Date(notif.createdAt)

              return (
                <motion.div key={notif.id} variants={itemVariants}>
                  <Card
                    className={`bg-slate-900/80 cursor-pointer transition-all hover:bg-slate-900/95 ${
                      notif.isRead ? 'border-slate-800/40' : `${colors.border} border`
                    } ${isExpanded ? 'ring-1 ring-slate-700/50' : ''}`}
                    onClick={() => handleToggleExpand(notif.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`size-9 rounded-lg ${colors.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                          <span className={colors.icon}>{getNotificationIcon(notif.type)}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-200">{getNotificationTitle(notif.type)}</span>
                              <Badge variant="outline" className={`${colors.badge} text-[10px] px-1.5 py-0`}>
                                {getTypeLabel(notif.type)}
                              </Badge>
                              {!notif.isRead && (
                                <span className={`size-2 rounded-full ${colors.dot}`} />
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-slate-500">{getRelativeTime(createdAt)}</span>
                              {isExpanded ? (
                                <ChevronUp className="size-4 text-slate-500" />
                              ) : (
                                <ChevronDown className="size-4 text-slate-500" />
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">{notif.message}</p>

                          {/* Expanded Details */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-3 pt-3 border-t border-slate-700/30 space-y-2">
                                  <p className="text-sm text-slate-300 leading-relaxed">{notif.message}</p>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500">via {notif.platform}</span>
                                    <span className="text-xs text-slate-600">
                                      {createdAt.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })
          )}
        </motion.div>
      )}

      {/* Notification Settings Quick Access */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex justify-center"
      >
        <Button
          variant="outline"
          onClick={() => setCurrentPage('settings')}
          className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-emerald-400 gap-2"
        >
          <Settings className="size-4" />
          Configure Notification Settings
        </Button>
      </motion.div>
    </div>
  )
}
