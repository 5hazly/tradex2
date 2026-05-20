import { NextResponse } from "next/server";
import { mockSettings } from "@/lib/mock-data";
import type { ApiResponse } from "@/lib/types/trading";

// In-memory risk state (persists between requests in dev)
let riskState = {
  killSwitchActive: false,
  killSwitchActivatedAt: null as string | null,
  killSwitchDeactivatedAt: null as string | null,
  riskScore: 38,
  lastUpdated: new Date().toISOString(),
};

// In-memory risk alerts store
let riskAlerts = [
  { id: "ra_1", type: "Drawdown Warning", severity: "MEDIUM" as const, message: "Daily drawdown approaching limit (-1.8% / -2.0%)", time: "15 min ago", timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), action: "Reduced position sizes by 20%", isResolved: false },
  { id: "ra_2", type: "Position Limit", severity: "LOW" as const, message: "Max open positions reached (10/10)", time: "1h ago", timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), action: "Blocked new order on AVAXUSDT", isResolved: true },
  { id: "ra_3", type: "Leverage Exceeded", severity: "HIGH" as const, message: "ADAUSDT leverage (25x) exceeds recommended max (20x)", time: "2h ago", timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), action: "Sent warning notification", isResolved: true },
  { id: "ra_4", type: "Spread Alert", severity: "LOW" as const, message: "DOGEUSDT spread increased to 15bps", time: "3h ago", timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), action: "Delayed order execution by 5s", isResolved: true },
  { id: "ra_5", type: "Daily Loss Limit", severity: "HIGH" as const, message: "Daily loss reached 80% of max ($1,200 / $1,500)", time: "4h ago", timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), action: "Reduced leverage across all positions", isResolved: true },
  { id: "ra_6", type: "Volatility Spike", severity: "MEDIUM" as const, message: "BTCUSDT ATR increased 3x normal - high volatility detected", time: "5h ago", timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), action: "Widened stop losses by 50%", isResolved: true },
];

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      killSwitchActive: riskState.killSwitchActive,
      killSwitchActivatedAt: riskState.killSwitchActivatedAt,
      killSwitchDeactivatedAt: riskState.killSwitchDeactivatedAt,
      riskScore: riskState.riskScore,
      alerts: riskAlerts,
    },
    message: "Risk state retrieved successfully",
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (body.action === "kill_switch") {
      const activate = body.activate;
      riskState.killSwitchActive = activate;
      if (activate) {
        riskState.killSwitchActivatedAt = new Date().toISOString();
        riskState.killSwitchDeactivatedAt = null;
        // Add new alert
        const newAlert = {
          id: `ra_${Date.now()}`,
          type: "Kill Switch",
          severity: "HIGH" as const,
          message: "Emergency kill switch activated - All trading operations halted",
          time: "Just now",
          timestamp: new Date().toISOString(),
          action: "All new orders blocked, existing positions held",
          isResolved: false,
        };
        riskAlerts.unshift(newAlert);
        if (riskAlerts.length > 50) riskAlerts = riskAlerts.slice(0, 50);
      } else {
        riskState.killSwitchDeactivatedAt = new Date().toISOString();
        // Resolve the kill switch alert
        const ksAlert = riskAlerts.find(a => a.type === "Kill Switch" && !a.isResolved);
        if (ksAlert) ksAlert.isResolved = true;
      }
      riskState.lastUpdated = new Date().toISOString();

      return NextResponse.json({
        success: true,
        data: {
          killSwitchActive: riskState.killSwitchActive,
          killSwitchActivatedAt: riskState.killSwitchActivatedAt,
          killSwitchDeactivatedAt: riskState.killSwitchDeactivatedAt,
        },
        message: activate ? "Kill switch activated" : "Kill switch deactivated - trading resumed",
      });
    }

    if (body.action === "save_settings") {
      const riskSettings = body.settings;
      if (!riskSettings) {
        return NextResponse.json(
          { success: false, error: "Missing risk settings" },
          { status: 400 }
        );
      }

      // Update in-memory mock settings
      return NextResponse.json({
        success: true,
        data: riskSettings,
        message: "Risk settings saved successfully",
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
