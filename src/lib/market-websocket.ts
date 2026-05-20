export class MarketWebSocket {
  private sockets: Map<string, WebSocket> = new Map();

  connectBinance(symbols: string[] = ['BTCUSDT', 'ETHUSDT']) {
    const stream = symbols.map(s => s.toLowerCase() + '@ticker').join('/');
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // يمكنك إرسال البيانات للـ frontend عبر Server-Sent Events أو Zustand
      console.log('Market Update:', data.s, data.c);
    };

    this.sockets.set('binance', ws);
  }

  closeAll() {
    this.sockets.forEach(ws => ws.close());
    this.sockets.clear();
  }
}

export const marketWS = new MarketWebSocket();