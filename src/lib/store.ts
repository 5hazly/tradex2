import { create } from 'zustand'

export type Page =
  | 'dashboard'
  | 'positions'
  | 'orders'
  | 'trades'
  | 'analytics'
  | 'strategies'
  | 'backtesting'
  | 'risk'
  | 'settings'
  | 'notifications'
  | 'exchanges'

export interface PageMeta {
  key: Page
  label: string
}

export const PAGE_LIST: PageMeta[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Orders' },
  { key: 'trades', label: 'Trades' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'strategies', label: 'Strategies' },
  { key: 'backtesting', label: 'Backtesting' },
  { key: 'risk', label: 'Risk Management' },
  { key: 'settings', label: 'Settings' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'exchanges', label: 'Exchanges' },
]

interface AppState {
  currentPage: Page
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  botActive: boolean
  setCurrentPage: (page: Page) => void
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleBotActive: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  sidebarOpen: false,
  sidebarCollapsed: false,
  botActive: true,
  setCurrentPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleBotActive: () => set((state) => ({ botActive: !state.botActive })),
}))
