import { NextResponse } from "next/server";
import { mockPositions, mockStrategies, mockExchanges } from "@/lib/mock-data";
import type { ApiResponse, Position, Trade } from "@/lib/types/trading";

// In-memory mutable positions
let positions: Position[] = JSON.parse(JSON.stringify(mockPositions)).filter((p: Position) => p.status === "OPEN");

// In-memory trade history
const trades: Trade[] = [];

function enrichPositions(posList: Position[]): Position[] {
  return posList.map((p) => ({
    ...p,
    exchange: mockExchanges.find((e) => e.id === p.exchangeId),
    strategy: mockStrategies.find((s) => s.id === p.strategyId),
  }));
}

export async function GET() {
  const enriched = enrichPositions(positions);
  const response: ApiResponse<Position[]> = {
    success: true,
    data: enriched,
    message: "Positions retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newPosition: Position = {
      id: `pos_${Date.now()}`,
      symbol: body.symbol || "BTCUSDT",
      side: body.side || "LONG",
      entryPrice: body.entryPrice || 0,
      quantity: body.quantity || 0,
      leverage: body.leverage || 1,
      unrealizedPnl: 0,
      stopLoss: body.stopLoss || null,
      takeProfit: body.takeProfit || null,
      liquidationPrice: body.liquidationPrice || null,
      margin: body.margin || 0,
      status: "OPEN",
      exchangeId: body.exchangeId || null,
      strategyId: body.strategyId || null,
      userId: "user_demo_001",
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    positions.unshift(newPosition);
    const response: ApiResponse<Position> = {
      success: true,
      data: newPosition,
      message: "Position opened successfully",
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

// Update position (edit SL/TP)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const idx = positions.findIndex((p) => p.id === body.id);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    if (body.stopLoss !== undefined) positions[idx].stopLoss = body.stopLoss;
    if (body.takeProfit !== undefined) positions[idx].takeProfit = body.takeProfit;
    positions[idx].updatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data: positions[idx],
      message: "Position updated successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// Close position(s)
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { ids, closeAll } = body as { ids?: string[]; closeAll?: boolean };

    let positionsToClose: Position[];

    if (closeAll) {
      positionsToClose = [...positions];
      positions = [];
    } else if (ids && ids.length > 0) {
      positionsToClose = positions.filter((p) => ids.includes(p.id));
      positions = positions.filter((p) => !ids.includes(p.id));
    } else {
      return NextResponse.json(
        { success: false, error: "Provide ids or closeAll" },
        { status: 400 }
      );
    }

    // Create trade records for closed positions
    const newTrades: Trade[] = positionsToClose.map((p) => ({
      id: `trd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      symbol: p.symbol,
      side: p.side,
      entryPrice: p.entryPrice,
      exitPrice: p.entryPrice * (p.side === "LONG" ? 1 + (p.unrealizedPnl / (p.entryPrice * p.quantity)) : 1 - (p.unrealizedPnl / (p.entryPrice * p.quantity))),
      quantity: body.partialQuantity && body.positionId === p.id ? body.partialQuantity : p.quantity,
      leverage: p.leverage,
      pnl: body.partialQuantity && body.positionId === p.id
        ? p.unrealizedPnl * (body.partialQuantity / p.quantity)
        : p.unrealizedPnl,
      fee: Math.abs(p.margin) * 0.001,
      status: "CLOSED" as const,
      strategyId: p.strategyId,
      exchangeId: p.exchangeId,
      userId: p.userId,
      openedAt: p.openedAt,
      closedAt: new Date().toISOString(),
    }));
    trades.unshift(...newTrades);

    return NextResponse.json({
      success: true,
      data: {
        closedCount: positionsToClose.length,
        remainingCount: positions.length,
        trades: newTrades,
      },
      message: `${positionsToClose.length} position(s) closed successfully`,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
