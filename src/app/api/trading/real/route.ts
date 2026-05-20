import { NextResponse } from 'next/server';
import { ExchangeService } from '@/lib/exchange-service';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, exchange, symbol, side, type, amount, price } = body;

    if (!exchange || !exchange.apiKey) {
      return NextResponse.json({ success: false, error: "Exchange credentials required" }, { status: 400 });
    }

    switch (action) {
      case 'testConnection':
        const result = await ExchangeService.testConnection(exchange);
        return NextResponse.json({ success: true, data: result });

      case 'placeOrder':
        const order = await ExchangeService.placeOrder(exchange, symbol, side, type, amount, price);
        return NextResponse.json({ success: true, data: order });

      case 'getTicker':
        const ticker = await ExchangeService.getTicker(exchange, symbol);
        return NextResponse.json({ success: true, data: ticker });

      default:
        return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}