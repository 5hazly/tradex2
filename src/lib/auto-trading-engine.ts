import { ExchangeService } from './exchange-service';
import { marketWS } from './market-websocket';

class AutoTradingEngine {
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs = 60000) {
    if (this.isRunning) return;
    this.isRunning = true;

    this.interval = setInterval(async () => {
      await this.runOnce();
    }, intervalMs);

    console.log("🤖 Auto Trading Engine Started");
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.isRunning = false;
    console.log("⛔ Auto Trading Engine Stopped");
  }

  async runOnce() {
    try {
      // هنا يتم تنفيذ الاستراتيجيات
      console.log("🔄 Running trading cycle...");
      // مثال: جلب بيانات + تنفيذ استراتيجية
    } catch (error) {
      console.error("Trading Engine Error:", error);
    }
  }
}

export const autoTradingEngine = new AutoTradingEngine();