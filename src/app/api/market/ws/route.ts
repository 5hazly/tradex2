import { NextRequest, NextResponse } from 'next/server'

// Market data cache
interface MarketData {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  high24h: number
  low24h: number
  timestamp: number
}

const marketDataCache: Map<string, MarketData> = new Map()

// Initial mock data for popular pairs
const INITIAL_PAIRS: { symbol: string; basePrice: number }[] = [
  { symbol: 'BTC/USDT', basePrice: 67500 },
  { symbol: 'ETH/USDT', basePrice: 3450 },
  { symbol: 'SOL/USDT', basePrice: 172 },
  { symbol: 'BNB/USDT', basePrice: 598 },
  { symbol: 'XRP/USDT', basePrice: 0.535 },
  { symbol: 'DOGE/USDT', basePrice: 0.158 },
  { symbol: 'ADA/USDT', basePrice: 0.455 },
  { symbol: 'AVAX/USDT', basePrice: 38.5 },
  { symbol: 'DOT/USDT', basePrice: 7.2 },
  { symbol: 'LINK/USDT', basePrice: 14.8 },
  { symbol: 'MATIC/USDT', basePrice: 0.72 },
  { symbol: 'SHIB/USDT', basePrice: 0.0000245 },
  { symbol: 'LTC/USDT', basePrice: 82.5 },
  { symbol: 'ATOM/USDT', basePrice: 8.9 },
  { symbol: 'UNI/USDT', basePrice: 7.8 },
]

// Initialize cache
INITIAL_PAIRS.forEach(({ symbol, basePrice }) => {
  const change = (Math.random() - 0.5) * 6
  marketDataCache.set(symbol, {
    symbol,
    price: basePrice * (1 + change / 100),
    change24h: parseFloat(change.toFixed(2)),
    volume24h: Math.random() * 50000000000,
    high24h: basePrice * 1.03,
    low24h: basePrice * 0.97,
    timestamp: Date.now(),
  })
})

// Simulate price movement
function simulatePriceUpdate() {
  marketDataCache.forEach((data) => {
    const volatility = data.symbol === 'BTC/USDT' ? 0.0003 : 0.001
    const change = (Math.random() - 0.48) * volatility
    data.price = data.price * (1 + change)
    data.change24h = parseFloat((data.change24h + change * 100).toFixed(2))
    data.timestamp = Date.now()
    data.high24h = Math.max(data.high24h, data.price)
    data.low24h = Math.min(data.low24h, data.price)
  })
}

// REST endpoint for market data
export async function GET() {
  simulatePriceUpdate()
  const data = Array.from(marketDataCache.values())
  return NextResponse.json({
    success: true,
    data,
    message: 'Market data retrieved',
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, symbols } = body

  switch (action) {
    case 'prices': {
      const requested: string[] = symbols || INITIAL_PAIRS.map(p => p.symbol)
      const data = requested.map(s => marketDataCache.get(s)).filter(Boolean)
      return NextResponse.json({ success: true, data })
    }
    case 'tick': {
      simulatePriceUpdate()
      const data = Array.from(marketDataCache.values())
      return NextResponse.json({ success: true, data })
    }
    default:
      simulatePriceUpdate()
      return NextResponse.json({ success: true, data: Array.from(marketDataCache.values()) })
  }
}
