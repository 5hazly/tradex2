import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types/trading'

// We need to lazily import the engine since ccxt may not work in all environments
let engineModule: any = null

async function getEngine() {
  if (!engineModule) {
    engineModule = await import('@/lib/auto-trading-engine')
  }
  return engineModule.autoTradingEngine
}

export async function GET() {
  try {
    const engine = await getEngine()
    const state = engine.getState()
    return NextResponse.json({ success: true, data: state, message: 'Bot state retrieved' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const engine = await getEngine()
    const { action, intervalMs, exchangeConfig, strategy } = body

    switch (action) {
      case 'start':
        engine.start(intervalMs || 60000)
        return NextResponse.json({ success: true, data: engine.getState(), message: 'Bot started' })
      case 'stop':
        engine.stop()
        return NextResponse.json({ success: true, data: engine.getState(), message: 'Bot stopped' })
      case 'runOnce':
        await engine.runOnce()
        return NextResponse.json({ success: true, data: engine.getState(), message: 'Bot cycle executed' })
      case 'registerExchange':
        if (exchangeConfig) engine.registerExchange(exchangeConfig)
        return NextResponse.json({ success: true, data: engine.getState(), message: 'Exchange registered' })
      case 'registerStrategy':
        if (strategy) engine.registerStrategy(strategy)
        return NextResponse.json({ success: true, data: engine.getState(), message: 'Strategy registered' })
      case 'clearErrors':
        engine.getState().errors = []
        return NextResponse.json({ success: true, data: engine.getState(), message: 'Errors cleared' })
      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
