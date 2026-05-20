import { NextResponse } from "next/server";
import { mockTrades, mockStrategies, mockExchanges } from "@/lib/mock-data";
import type { ApiResponse, Trade, TradeFilters } from "@/lib/types/trading";

function enrichTrades(trades: Trade[]): Trade[] {
  return trades.map((t) => ({
    ...t,
    exchange: mockExchanges.find((e) => e.id === t.exchangeId),
    strategy: mockStrategies.find((s) => s.id === t.strategyId),
  }));
}

function filterTrades(trades: Trade[], filters: TradeFilters): Trade[] {
  let filtered = [...trades];

  if (filters.symbol) {
    filtered = filtered.filter((t) => t.symbol === filters.symbol);
  }
  if (filters.side) {
    filtered = filtered.filter((t) => t.side === filters.side);
  }
  if (filters.status) {
    filtered = filtered.filter((t) => t.status === filters.status);
  }
  if (filters.strategyId) {
    filtered = filtered.filter((t) => t.strategyId === filters.strategyId);
  }
  if (filters.exchangeId) {
    filtered = filtered.filter((t) => t.exchangeId === filters.exchangeId);
  }
  if (filters.startDate) {
    filtered = filtered.filter((t) => t.openedAt >= filters.startDate!);
  }
  if (filters.endDate) {
    filtered = filtered.filter((t) => t.openedAt <= filters.endDate!);
  }
  if (filters.minPnl !== undefined) {
    filtered = filtered.filter((t) => (t.pnl - t.fee) >= filters.minPnl!);
  }
  if (filters.maxPnl !== undefined) {
    filtered = filtered.filter((t) => (t.pnl - t.fee) <= filters.maxPnl!);
  }

  return filtered;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const filters: TradeFilters = {
    symbol: searchParams.get("symbol") || undefined,
    side: (searchParams.get("side") as "LONG" | "SHORT") || undefined,
    status: (searchParams.get("status") as "OPEN" | "CLOSED" | "CANCELLED") || undefined,
    strategyId: searchParams.get("strategyId") || undefined,
    exchangeId: searchParams.get("exchangeId") || undefined,
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
    minPnl: searchParams.get("minPnl") ? Number(searchParams.get("minPnl")) : undefined,
    maxPnl: searchParams.get("maxPnl") ? Number(searchParams.get("maxPnl")) : undefined,
  };

  const filtered = filterTrades(mockTrades, filters);
  const enriched = enrichTrades(filtered);

  // Pagination
  const page = Number(searchParams.get("page") || 1);
  const limit = Number(searchParams.get("limit") || 20);
  const start = (page - 1) * limit;
  const paginatedData = enriched.slice(start, start + limit);

  const response = {
    success: true,
    data: paginatedData,
    pagination: {
      page,
      limit,
      total: enriched.length,
      totalPages: Math.ceil(enriched.length / limit),
    },
    message: "Trades retrieved successfully",
  };

  return NextResponse.json(response);
}
