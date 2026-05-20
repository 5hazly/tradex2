import { NextResponse } from "next/server";
import { mockBacktestResults, mockStrategies } from "@/lib/mock-data";
import type { ApiResponse, BacktestResult } from "@/lib/types/trading";

function enrichBacktests(backtests: BacktestResult[]): BacktestResult[] {
  return backtests.map((b) => ({
    ...b,
    strategy: mockStrategies.find((s) => s.id === b.strategyId),
  }));
}

export async function GET() {
  const enriched = enrichBacktests(mockBacktestResults);
  const response: ApiResponse<BacktestResult[]> = {
    success: true,
    data: enriched,
    message: "Backtest results retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Simulate a running backtest — return with "pending" status indication
    const newBacktest: BacktestResult = {
      id: `bt_${Date.now()}`,
      strategyId: body.strategyId || mockStrategies[0].id,
      startDate: body.startDate || "2024-06-01T00:00:00Z",
      endDate: body.endDate || "2025-01-01T00:00:00Z",
      totalPnl: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      totalTrades: 0,
      parameters: body.parameters || {},
      createdAt: new Date().toISOString(),
      userId: "user_demo_001",
    };

    // Simulate delay and return mock results after "processing"
    const result = { ...newBacktest };
    // In a real system this would be async processing, here we return a mock completed result
    result.totalPnl = Math.round((Math.random() * 8000 - 1000) * 100) / 100;
    result.winRate = Math.round((45 + Math.random() * 25) * 100) / 100;
    result.profitFactor = Math.round((1.0 + Math.random() * 2.0) * 100) / 100;
    result.sharpeRatio = Math.round((0.5 + Math.random() * 2.5) * 100) / 100;
    result.maxDrawdown = Math.round(Math.random() * 15 * 100) / 100;
    result.totalTrades = Math.floor(Math.random() * 200) + 50;

    const enriched: BacktestResult = {
      ...result,
      strategy: mockStrategies.find((s) => s.id === result.strategyId),
    };

    const response: ApiResponse<BacktestResult> = {
      success: true,
      data: enriched,
      message: "Backtest completed successfully",
    };
    return NextResponse.json(response, { status: 201 });
  } catch {
    const response: ApiResponse<null> = {
      success: false,
      error: "Invalid request body",
    };
    return NextResponse.json(response, { status: 400 });
  }
}
