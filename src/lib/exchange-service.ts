import ccxt from 'ccxt';

export interface ExchangeConfig {
  id: string;
  name: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  isTestnet: boolean;
  accountType: 'spot' | 'futures';
}

export class ExchangeService {
  static async createExchange(config: ExchangeConfig) {
    const exchangeClass = (ccxt as any)[config.name.toLowerCase()];
    if (!exchangeClass) throw new Error(`Exchange ${config.name} not supported`);

    const exchange = new exchangeClass({
      apiKey: config.apiKey,
      secret: config.apiSecret,
      passphrase: config.passphrase,
      enableRateLimit: true,
      options: { defaultType: config.accountType },
    });

    if (config.isTestnet) {
      exchange.setSandboxMode(true);
    }

    return exchange;
  }

  static async testConnection(config: ExchangeConfig) {
    const exchange = await this.createExchange(config);
    return await exchange.fetchBalance();
  }

  static async getTicker(config: ExchangeConfig, symbol: string) {
    const exchange = await this.createExchange(config);
    return await exchange.fetchTicker(symbol);
  }

  static async placeOrder(config: ExchangeConfig, symbol: string, side: 'buy' | 'sell', type: string, amount: number, price?: number) {
    const exchange = await this.createExchange(config);
    return await exchange.createOrder(symbol, type, side, amount, price);
  }
}