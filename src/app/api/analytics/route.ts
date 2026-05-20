import { NextResponse } from "next/server";
import {
  generateEquityCurve,
  getMockPerformanceMetrics,
  getMockSymbolPerformance,
  getMockStrategyPerformance,
  generateAnalyticsRecords,
} from "@/lib/mock-data";
import type {
  ApiResponse,
  EquityCurvePoint,
  PerformanceMetrics,
  SymbolPerformance,
  StrategyPerformance,
  AnalyticsRecord,
  AnalyticsFilters,
} from "@/lib/types/trading";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section") || "all";

  const response: Record<string, unknown> = {
    success: true,
    message: "Analytics data retrieved successfully",
  };

  switch (section) {
    case "equity-curve":
      response.data = generateEquityCurve() as EquityCurvePoint[];
      break;

    case "performance":
      response.data = getMockPerformanceMetrics() as PerformanceMetrics;
      break;

    case "symbols":
      response.data = getMockSymbolPerformance() as SymbolPerformance[];
      break;

    case "strategies":
      response.data = getMockStrategyPerformance() as StrategyPerformance[];
      break;

    case "records": {
      const records = generateAnalyticsRecords();
      const period = searchParams.get("period") as AnalyticsFilters["period"] || "30D";
      const daysMap: Record<string, number> = { "1D": 1, "7D": 7, "30D": 30, "90D": 90, "1Y": 365, ALL: 999 };
      const days = daysMap[period] || 30;
      response.data = records.slice(-days) as AnalyticsRecord[];
      break;
    }

    case "all":
    default:
      response.data = {
        equityCurve: generateEquityCurve(),
        performance: getMockPerformanceMetrics(),
        symbols: getMockSymbolPerformance(),
        strategies: getMockStrategyPerformance(),
        recentRecords: generateAnalyticsRecords().slice(-7),
      };
      break;
  }

  return NextResponse.json(response as ApiResponse);
}
