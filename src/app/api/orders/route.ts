import { NextResponse } from "next/server";
import { mockOrders, mockStrategies, mockExchanges } from "@/lib/mock-data";
import type { ApiResponse, Order } from "@/lib/types/trading";

// In-memory mutable orders
let orders: Order[] = JSON.parse(JSON.stringify(mockOrders));

function enrichOrders(orderList: Order[]): Order[] {
  return orderList.map((o) => ({
    ...o,
    exchange: mockExchanges.find((e) => e.id === o.exchangeId),
    strategy: mockStrategies.find((s) => s.id === o.strategyId),
  }));
}

export async function GET() {
  const enriched = enrichOrders(orders);
  const response: ApiResponse<Order[]> = {
    success: true,
    data: enriched,
    message: "Orders retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newOrder: Order = {
      id: `ord_${Date.now()}`,
      symbol: body.symbol || "BTCUSDT",
      side: body.side || "LONG",
      type: body.type || "LIMIT",
      price: body.price ?? null,
      quantity: body.quantity || 0,
      leverage: body.leverage || 1,
      status: "PENDING",
      reduceOnly: body.reduceOnly || false,
      exchangeId: body.exchangeId || null,
      strategyId: body.strategyId || null,
      userId: "user_demo_001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    orders.unshift(newOrder);
    const enriched = enrichOrders([newOrder])[0];
    const response: ApiResponse<Order> = {
      success: true,
      data: enriched,
      message: "Order created successfully",
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

// Cancel one or all pending orders
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id, cancelAll } = body as { id?: string; cancelAll?: boolean };

    if (cancelAll) {
      const pendingOrders = orders.filter((o) => o.status === "PENDING");
      const cancelledCount = pendingOrders.length;
      orders = orders.map((o) =>
        o.status === "PENDING"
          ? { ...o, status: "CANCELLED" as const, updatedAt: new Date().toISOString() }
          : o
      );
      return NextResponse.json({
        success: true,
        data: { cancelledCount, remainingPending: 0 },
        message: `${cancelledCount} pending order(s) cancelled`,
      });
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Order ID is required" },
        { status: 400 }
      );
    }

    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      return NextResponse.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    if (orders[idx].status !== "PENDING") {
      return NextResponse.json(
        { success: false, error: `Cannot cancel order with status: ${orders[idx].status}` },
        { status: 400 }
      );
    }

    orders[idx] = { ...orders[idx], status: "CANCELLED", updatedAt: new Date().toISOString() };

    return NextResponse.json({
      success: true,
      data: orders[idx],
      message: "Order cancelled successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
