'use client'

import { useEffect, useState } from 'react'
import { Bell, Menu, Search, User, ChevronDown, Bot, Play, Square, Activity, Loader2 } from 'lucide-react'
import { useAppStore, PAGE_LIST } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'

function LiveClock() {
  const [time, setTime] = useState<string>('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="font-mono text-sm text-slate-400 tabular-nums">
      {time}
    </span>
  )
}

function BotStatusIndicator() {
  const { botActive, toggleBotActive } = useAppStore()

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={toggleBotActive}>
            <div className="relative flex items-center justify-center">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  botActive ? 'bg-emerald-500 animate-pulse-green' : 'bg-red-500'
                }`}
              />
            </div>
            <span
              className={`text-sm font-medium ${
                botActive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {botActive ? 'Bot Active' : 'Bot Stopped'}
            </span>
            <Switch
              checked={botActive}
              onCheckedChange={toggleBotActive}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Click to {botActive ? 'stop' : 'start'} the trading bot</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function DashboardHeader() {
  const { currentPage, toggleSidebar } = useAppStore()
  const [botRunning, setBotRunning] = useState(false)
  const [botLoading, setBotLoading] = useState(false)
  const [showBotPanel, setShowBotPanel] = useState(false)

  const toggleBot = async () => {
    setBotLoading(true)
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: botRunning ? 'stop' : 'start', intervalMs: 60000 }),
      })
      const json = await res.json()
      if (json.success) {
        setBotRunning(!botRunning)
        toast.success(json.data.isRunning ? 'Bot started! Auto-trading active' : 'Bot stopped')
      }
    } catch {
      toast.error('Failed to control bot')
    } finally {
      setBotLoading(false)
    }
  }

  const pageTitle = PAGE_LIST.find((p) => p.key === currentPage)?.label ?? 'Dashboard'

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b border-slate-800/60 bg-slate-900/70 backdrop-blur-xl">
      {/* Left section */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          onClick={toggleSidebar}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-slate-100">{pageTitle}</h1>
      </div>

      {/* Center section — Bot status (hidden on small screens) */}
      <div className="hidden md:flex items-center absolute left-1/2 -translate-x-1/2">
        <BotStatusIndicator />
        {/* Auto Trading Bot Control */}
        <div className="flex items-center gap-2 ml-4">
          <Button
            onClick={toggleBot}
            disabled={botLoading}
            size="sm"
            className={`gap-2 text-xs font-medium transition-all ${
              botRunning
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {botLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : botRunning ? (
              <Square className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {botRunning ? 'Stop Bot' : 'Start Bot'}
          </Button>
          {botRunning && (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] animate-pulse">
              <Activity className="size-3 mr-1" />
              LIVE
            </Badge>
          )}
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Search button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 hidden sm:flex"
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Live clock */}
        <div className="hidden sm:block px-2">
          <LiveClock />
        </div>

        {/* Notification bell */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                onClick={() => useAppStore.getState().setCurrentPage('notifications')}
              >
                <Bell className="h-4 w-4" />
                <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center p-0 text-[10px] bg-red-500 text-white border-0 rounded-full">
                  3
                </Badge>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2 hover:bg-slate-800"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-emerald-600 text-white text-xs font-semibold">
                  AI
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block text-sm text-slate-300">TradeAI</span>
              <ChevronDown className="h-3 w-3 text-slate-500 hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48 bg-slate-900 border-slate-700"
          >
            <DropdownMenuItem className="text-slate-300 focus:bg-slate-800 focus:text-slate-100">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem
              className="text-slate-300 focus:bg-slate-800 focus:text-slate-100"
              onClick={() => useAppStore.getState().setCurrentPage('settings')}
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-400 focus:bg-slate-800 focus:text-red-300">
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
