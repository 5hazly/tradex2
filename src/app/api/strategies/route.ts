import { NextResponse } from "next/server";
import { mockStrategies } from "@/lib/mock-data";
import type { ApiResponse, Strategy } from "@/lib/types/trading";

export async function GET() {
  const response: ApiResponse<Strategy[]> = {
    success: true,
    data: mockStrategies,
    message: "Strategies retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newStrategy: Strategy = {
      id: `strat_${Date.now()}`,
      name: body.name || "New Strategy",
      description: body.description || null,
      type: body.type || "AI",
      parameters: body.parameters || {},
      isActive: body.isActive ?? true,
      timeframe: body.timeframe || "1h",
      userId: "user_demo_001",
      createdAt: new Date().toISOString(),
    };
    const response: ApiResponse<Strategy> = {
      success: true,
      data: newStrategy,
      message: "Strategy created successfully",
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

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, isActive } = body;

    if (!id) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Strategy ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const strategy = mockStrategies.find((s) => s.id === id);
    if (!strategy) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Strategy not found",
      };
      return NextResponse.json(response, { status: 404 });
    }

    const updated: Strategy = { ...strategy, isActive: isActive ?? !strategy.isActive };
    const response: ApiResponse<Strategy> = {
      success: true,
      data: updated,
      message: `Strategy ${isActive ? "activated" : "deactivated"} successfully`,
    };
    return NextResponse.json(response);
  } catch {
    const response: ApiResponse<null> = {
      success: false,
      error: "Invalid request body",
    };
    return NextResponse.json(response, { status: 400 });
  }
}
