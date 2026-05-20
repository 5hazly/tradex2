import { Server } from "socket.io";

const PORT = 3004;

const io = new Server(PORT, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ============================================================
// State
// ============================================================

const prices: Record<string, { price: number; change24h: number; volume: number }> = {
  "BTC/USDT": { price: 67234.5, change24h: 2.34, volume: 1234567890 },
  "ETH/USDT": { price: 3521.5, change24h: 1.82, volume: 456789012 },
  "SOL/USDT": { price: 145.23, change24h: -0.68, volume: 234567890 },
};

const positions = [
  { positionId: 1, symbol: "BTC/USDT", unrealizedPnl: 234.5, markPrice: 67250.0 },
  { positionId: 2, symbol: "ETH/USDT", unrealizedPnl: -85.3, markPrice: 3515.2 },
  { positionId: 3, symbol: "SOL/USDT", unrealizedPnl: 112.8, markPrice: 146.1 },
  { positionId: 4, symbol: "BTC/USDT", unrealizedPnl: -45.2, markPrice: 67180.0 },
];

const balances = {
  totalBalance: 25432.5,
  availableBalance: 18432.5,
  unrealizedPnl: 7000.0,
};

const strategies = ["EMA_MACD", "SCALPING", "BREAKOUT", "SMART_MONEY", "AI"];
const symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
const signals = ["BUY", "SELL"] as const;
const riskTypes = [
  { type: "DRAWDOWN", severity: "warning", message: "Current drawdown at -8.5%", value: -8.5 },
  { type: "EXPOSURE", severity: "info", message: "Portfolio exposure exceeds 80%", value: 82 },
  { type: "VOLATILITY", severity: "warning", message: "Market volatility spike detected", value: 45 },
  { type: "MARGIN", severity: "critical", message: "Margin utilization above 90%", value: 92 },
];

// ============================================================
// Helper Functions
// ============================================================

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// Emit Functions
// ============================================================

function emitPriceUpdate() {
  for (const [symbol, data] of Object.entries(prices)) {
    const fluctuation = randomBetween(-0.15, 0.15);
    data.price = Math.round(data.price * (1 + fluctuation / 100) * 100) / 100;
    data.change24h = Math.round((data.change24h + randomBetween(-0.05, 0.05)) * 100) / 100;
    data.volume = Math.round(data.volume * (1 + randomBetween(-0.001, 0.001)));

    io.emit("price:update", {
      symbol,
      price: data.price,
      change24h: data.change24h,
      volume: data.volume,
    });
  }
}

function emitPositionUpdate() {
  const pos = randomPick(positions);
  const pnlChange = randomBetween(-20, 25);
  pos.unrealizedPnl = Math.round((pos.unrealizedPnl + pnlChange) * 100) / 100;
  pos.markPrice = Math.round(pos.markPrice * (1 + randomBetween(-0.05, 0.05)) * 100) / 100;

  io.emit("position:update", {
    positionId: pos.positionId,
    symbol: pos.symbol,
    unrealizedPnl: pos.unrealizedPnl,
    markPrice: pos.markPrice,
  });
}

function emitTradeExecuted() {
  const symbol = randomPick(symbols);
  const side = randomPick(["LONG", "SHORT"]);
  const basePrices: Record<string, number> = {
    "BTC/USDT": prices["BTC/USDT"].price,
    "ETH/USDT": prices["ETH/USDT"].price,
    "SOL/USDT": prices["SOL/USDT"].price,
  };

  io.emit("trade:executed", {
    symbol,
    side,
    price: Math.round(basePrices[symbol] * (1 + randomBetween(-0.02, 0.02)) * 100) / 100,
    quantity: Math.round(randomBetween(0.01, 2) * 1000) / 1000,
    pnl: null,
  });
}

function emitBalanceUpdate() {
  balances.totalBalance = Math.round((balances.totalBalance + randomBetween(-50, 80)) * 100) / 100;
  balances.unrealizedPnl = Math.round((balances.unrealizedPnl + randomBetween(-30, 40)) * 100) / 100;
  balances.availableBalance = Math.round((balances.totalBalance - balances.unrealizedPnl) * 100) / 100;

  io.emit("balance:update", {
    totalBalance: balances.totalBalance,
    availableBalance: balances.availableBalance,
    unrealizedPnl: balances.unrealizedPnl,
  });
}

function emitSignal() {
  const symbol = randomPick(symbols);
  const strategy = randomPick(strategies);
  const signal = randomPick(signals);
  const confidence = Math.round(randomBetween(0.5, 0.98) * 100) / 100;

  const basePrices: Record<string, number> = {
    "BTC/USDT": prices["BTC/USDT"].price,
    "ETH/USDT": prices["ETH/USDT"].price,
    "SOL/USDT": prices["SOL/USDT"].price,
  };

  io.emit("signal:new", {
    strategy,
    symbol,
    signal,
    confidence,
    price: Math.round(basePrices[symbol] * 100) / 100,
  });
}

function emitRiskAlert() {
  const alert = randomPick(riskTypes);

  io.emit("risk:alert", {
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    value: alert.value,
  });
}

function sendWelcomeState(socket: ReturnType<typeof io.on extends (ev: string, fn: (...a: never) => unknown) => unknown ? never : Parameters<Parameters<typeof io.on>[1]>[0]>) {
  // Send current prices
  for (const [symbol, data] of Object.entries(prices)) {
    socket.emit("price:update", {
      symbol,
      price: data.price,
      change24h: data.change24h,
      volume: data.volume,
    });
  }

  // Send current positions
  for (const pos of positions) {
    socket.emit("position:update", {
      positionId: pos.positionId,
      symbol: pos.symbol,
      unrealizedPnl: pos.unrealizedPnl,
      markPrice: pos.markPrice,
    });
  }

  // Send current balance
  socket.emit("balance:update", {
    totalBalance: balances.totalBalance,
    availableBalance: balances.availableBalance,
    unrealizedPnl: balances.unrealizedPnl,
  });
}

// ============================================================
// Connection Handling
// ============================================================

io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Send current state on connect
  sendWelcomeState(socket);

  socket.emit("connected", {
    message: "Connected to trading WebSocket",
    timestamp: new Date().toISOString(),
  });

  socket.on("disconnect", (reason) => {
    console.log(`[WS] Client disconnected: ${socket.id} (${reason})`);
  });
});

// ============================================================
// Timers
// ============================================================

// Price updates every 1-3 seconds
function schedulePriceUpdate() {
  const delay = randomBetween(1000, 3000);
  setTimeout(() => {
    emitPriceUpdate();
    schedulePriceUpdate();
  }, delay);
}

// Position updates every 2-4 seconds
function schedulePositionUpdate() {
  const delay = randomBetween(2000, 4000);
  setTimeout(() => {
    emitPositionUpdate();
    schedulePositionUpdate();
  }, delay);
}

// Trade executions every 30-60 seconds
function scheduleTradeExecution() {
  const delay = randomBetween(30000, 60000);
  setTimeout(() => {
    emitTradeExecuted();
    scheduleTradeExecution();
  }, delay);
}

// Balance updates every 5-10 seconds
function scheduleBalanceUpdate() {
  const delay = randomBetween(5000, 10000);
  setTimeout(() => {
    emitBalanceUpdate();
    scheduleBalanceUpdate();
  }, delay);
}

// Signals every 15-30 seconds
function scheduleSignal() {
  const delay = randomBetween(15000, 30000);
  setTimeout(() => {
    emitSignal();
    scheduleSignal();
  }, delay);
}

// Risk alerts every 20-45 seconds
function scheduleRiskAlert() {
  const delay = randomBetween(20000, 45000);
  setTimeout(() => {
    emitRiskAlert();
    scheduleRiskAlert();
  }, delay);
}

// Start all timers
schedulePriceUpdate();
schedulePositionUpdate();
scheduleTradeExecution();
scheduleBalanceUpdate();
scheduleSignal();
scheduleRiskAlert();

console.log(`[Trading WS] Socket.IO server running on port ${PORT}`);
