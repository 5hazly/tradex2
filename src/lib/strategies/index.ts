// src/lib/strategies/index.ts
export * from './ai-strategy';
export * from './grid-strategy';
export * from './dca-strategy';
export * from './breakout-strategy';

export interface Strategy {
  id: string;
  name: string;
  type: string;
  execute: (marketData: any, params: any) => Promise<any>;
}

// مثال على استراتيجية AI بسيطة
export const strategies: Strategy[] = [
  {
    id: "ai-1",
    name: "AI Momentum",
    type: "AI",
    execute: async (data, params) => {
      const { price, volume } = data;
      if (price > params.ma && volume > params.volumeThreshold) {
        return { action: "BUY", confidence: 0.85 };
      }
      return { action: "HOLD", confidence: 0.6 };
    }
  }
];