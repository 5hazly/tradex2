// ============================================================
// AI Trading System - TypeScript Types
// ============================================================

// --- Enums / Union Types ---

export type UserRole = "ADMIN" | "TRADER";

export type ExchangeName = "Binance" | "Bybit" | "BingX" | "OKX" | "KuCoin";

export type StrategyType =
  | "EMA_MACD"
  | "SCALPING"
  | "BREAKOUT"
  | "SMART_MONEY"
  | "AI"
  | "CONFLUENCE";

export type TradeSide = "LONG" | "SHORT";

export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";

export type OrderType = "MARKET" | "LIMIT" | "STOP";

export type OrderStatus = "PENDING" | "FILLED" | "CANCELLED" | "REJECTED";

export type PositionStatus = "OPEN" | "CLOSED" | "LIQUIDATED";

export type NotificationType =
  | "TRADE_OPEN"
  | "TRADE_CLOSE"
  | "PROFIT"
  | "LOSS"
  | "ERROR"
  | "DRAWDOWN"
  | "ALERT";

export type NotificationPlatform = "TELEGRAM" | "DISCORD" | "EMAIL";

export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1w";

// --- Database Models ---

export interface User {
  id: string;
  email: string;
  password: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Exchange {
  id: string;
  name: ExchangeName;
  apiKey: string;
  apiSecret: string;
  isTestnet: boolean;
  isActive: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string | null;
  type: StrategyType;
  parameters: Record<string, unknown>;
  isActive: boolean;
  timeframe: Timeframe;
  userId: string;
  createdAt: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  leverage: number;
  pnl: number;
  fee: number;
  status: TradeStatus;
  strategyId: string | null;
  exchangeId: string | null;
  userId: string;
  openedAt: string;
  closedAt: string | null;
  // Joined relations (optional)
  strategy?: Strategy;
  exchange?: Exchange;
}

export interface Position {
  id: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  quantity: number;
  leverage: number;
  unrealizedPnl: number;
  stopLoss: number | null;
  takeProfit: number | null;
  liquidationPrice: number | null;
  margin: number;
  status: PositionStatus;
  exchangeId: string | null;
  strategyId: string | null;
  userId: string;
  openedAt: string;
  updatedAt: string;
  // Joined relations (optional)
  exchange?: Exchange;
  strategy?: Strategy;
}

export interface Order {
  id: string;
  symbol: string;
  side: TradeSide;
  type: OrderType;
  price: number | null;
  quantity: number;
  leverage: number;
  status: OrderStatus;
  reduceOnly: boolean;
  exchangeId: string | null;
  strategyId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  // Joined relations (optional)
  exchange?: Exchange;
  strategy?: Strategy;
}

export interface Balance {
  id: string;
  exchangeId: string;
  totalBalance: number;
  availableBalance: number;
  unrealizedPnl: number;
  currency: string;
  userId: string;
  updatedAt: string;
  // Joined relations (optional)
  exchange?: Exchange;
}

export interface NotificationLog {
  id: string;
  type: NotificationType;
  platform: NotificationPlatform;
  message: string;
  isRead: boolean;
  userId: string;
  createdAt: string;
}

export interface AnalyticsRecord {
  id: string;
  date: string;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  userId: string;
  strategyId: string | null;
  // Joined relations (optional)
  strategy?: Strategy;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  startDate: string;
  endDate: string;
  totalPnl: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  parameters: Record<string, unknown>;
  createdAt: string;
  userId: string;
  // Joined relations (optional)
  strategy?: Strategy;
}

// --- Dashboard & Stats ---

export interface DashboardStats {
  totalBalance: number;
  availableBalance: number;
  unrealizedPnl: number;
  todayPnl: number;
  todayPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  totalTrades: number;
  openPositions: number;
  activeOrders: number;
  activeStrategies: number;
  bestStrategy: string;
  bestStrategyPnl: number;
  dailyPnl: number[];
  weeklyPnl: number[];
  topSymbols: { symbol: string; pnl: number; volume: number }[];
  recentTrades: Trade[];
}

export interface EquityCurvePoint {
  date: string;
  equity: number;
  pnl: number;
  drawdown: number;
  trades: number;
}

// --- WebSocket Event Types ---

export type WSEventType =
  | "position_update"
  | "order_update"
  | "trade_update"
  | "price_update"
  | "balance_update"
  | "notification"
  | "strategy_signal"
  | "risk_alert"
  | "connected"
  | "disconnected";

export interface WSEvent<T = unknown> {
  type: WSEventType;
  data: T;
  timestamp: string;
}

export interface WSPriceUpdate {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
}

export interface WSPositionUpdate {
  positionId: string;
  symbol: string;
  unrealizedPnl: number;
  currentPrice: number;
  liquidationPrice: number | null;
}

export interface WSOrderUpdate {
  orderId: string;
  symbol: string;
  status: OrderStatus;
  filledPrice: number | null;
  filledQuantity: number | null;
}

export interface WSBalanceUpdate {
  exchangeId: string;
  totalBalance: number;
  availableBalance: number;
  unrealizedPnl: number;
}

export interface WSRiskAlert {
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

// --- Trading Signal Types ---

export type SignalAction = "BUY" | "SELL" | "CLOSE_LONG" | "CLOSE_SHORT" | "HOLD";

export type SignalStrength = "WEAK" | "MODERATE" | "STRONG" | "VERY_STRONG";

export type SignalTimeframe = Timeframe;

export interface TradingSignal {
  id: string;
  symbol: string;
  action: SignalAction;
  strength: SignalStrength;
  timeframe: SignalTimeframe;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  confidence: number; // 0-100
  strategy: string;
  reasoning: string;
  indicators: Record<string, number>;
  timestamp: string;
  expiresAt: string;
}

export interface SignalBatch {
  signals: TradingSignal[];
  generatedAt: string;
  strategyName: string;
}

// --- Risk Management Types ---

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

export interface RiskParameters {
  maxPositionSize: number;
  maxLeverage: number;
  maxDailyLoss: number;
  maxDrawdownPercent: number;
  stopLossDefault: number;
  takeProfitDefault: number;
  maxOpenPositions: number;
  maxCorrelatedPositions: number;
  riskPerTrade: number;
}

export interface RiskAssessment {
  overallRisk: RiskLevel;
  score: number; // 0-100
  exposure: number;
  usedMargin: number;
  freeMargin: number;
  marginLevel: number;
  dailyLoss: number;
  maxDrawdown: number;
  warnings: string[];
  alerts: RiskAlert[];
}

export interface RiskAlert {
  id: string;
  level: RiskLevel;
  type: string;
  message: string;
  value: number;
  threshold: number;
  createdAt: string;
  isResolved: boolean;
}

// --- Settings Types ---

export interface RiskSettings {
  maxPositionSize: number;
  maxLeverage: number;
  maxDailyLoss: number;
  maxDrawdownPercent: number;
  stopLossDefault: number;
  takeProfitDefault: number;
  maxOpenPositions: number;
  riskPerTrade: number;
}

export interface NotificationSettings {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  discordEnabled: boolean;
  discordWebhook: string;
  emailEnabled: boolean;
  emailAddress: string;
  notifyOnTradeOpen: boolean;
  notifyOnTradeClose: boolean;
  notifyOnProfit: boolean;
  notifyOnLoss: boolean;
  notifyOnDrawdown: boolean;
  notifyOnError: boolean;
  minProfitNotify: number;
  minLossNotify: number;
  drawdownAlertPercent: number;
}

export interface GeneralSettings {
  defaultExchange: string;
  defaultTimeframe: Timeframe;
  baseCurrency: string;
  autoCompound: boolean;
  trailingStopEnabled: boolean;
  trailingStopDistance: number;
  antiLiqEnabled: boolean;
  antiLiqThreshold: number;
  uiTheme: "light" | "dark" | "system";
  refreshInterval: number;
  showTestingPanel: boolean;
}

export interface Settings {
  risk: RiskSettings;
  notifications: NotificationSettings;
  general: GeneralSettings;
}

// --- API Response Types ---

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// --- Chart & Analytics Types ---

export interface PerformanceMetrics {
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  avgHoldingTime: string;
  totalFees: number;
  netPnl: number;
}

export interface SymbolPerformance {
  symbol: string;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  totalVolume: number;
  avgPnl: number;
  bestTrade: number;
  worstTrade: number;
}

export interface StrategyPerformance {
  strategyId: string;
  strategyName: string;
  strategyType: StrategyType;
  isActive: boolean;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgPnl: number;
  currentPositions: number;
}

// --- Filter Types ---

export interface TradeFilters {
  symbol?: string;
  side?: TradeSide;
  status?: TradeStatus;
  strategyId?: string;
  exchangeId?: string;
  startDate?: string;
  endDate?: string;
  minPnl?: number;
  maxPnl?: number;
}

export interface OrderFilters {
  symbol?: string;
  side?: TradeSide;
  type?: OrderType;
  status?: OrderStatus;
  strategyId?: string;
  exchangeId?: string;
}

export interface AnalyticsFilters {
  period: "1D" | "7D" | "30D" | "90D" | "1Y" | "ALL";
  strategyId?: string;
  exchangeId?: string;
  symbol?: string;
}
