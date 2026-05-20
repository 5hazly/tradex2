import { NextResponse } from "next/server";
import { mockExchanges, mockBalances } from "@/lib/mock-data";
import type { ApiResponse, Exchange, Balance } from "@/lib/types/trading";

function enrichExchanges(exchanges: Exchange[]): (Exchange & { balance?: Balance })[] {
  return exchanges.map((e) => ({
    ...e,
    balance: mockBalances.find((b) => b.exchangeId === e.id),
  }));
}

export async function GET() {
  const enriched = enrichExchanges(mockExchanges);
  const response: ApiResponse<(Exchange & { balance?: Balance })[]> = {
    success: true,
    data: enriched,
    message: "Exchanges retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newExchange: Exchange = {
      id: `ex_${Date.now()}`,
      name: body.name || "Binance",
      apiKey: body.apiKey || "",
      apiSecret: body.apiSecret || "",
      isTestnet: body.isTestnet ?? false,
      isActive: body.isActive ?? true,
      userId: "user_demo_001",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const response: ApiResponse<Exchange> = {
      success: true,
      data: newExchange,
      message: "Exchange added successfully",
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

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const exchangeId = searchParams.get("id");

  if (!exchangeId) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Exchange ID is required",
    };
    return NextResponse.json(response, { status: 400 });
  }

  const removed = mockExchanges.find((e) => e.id === exchangeId);
  if (!removed) {
    const response: ApiResponse<null> = {
      success: false,
      error: "Exchange not found",
    };
    return NextResponse.json(response, { status: 404 });
  }

  const response: ApiResponse<{ id: string }> = {
    success: true,
    data: { id: exchangeId },
    message: "Exchange removed successfully",
  };
  return NextResponse.json(response);
}
