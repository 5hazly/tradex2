import { NextResponse } from "next/server";
import { getMockDashboardStats } from "@/lib/mock-data";
import type { ApiResponse, DashboardStats } from "@/lib/types/trading";

export async function GET() {
  const stats: DashboardStats = getMockDashboardStats();

  const response: ApiResponse<DashboardStats> = {
    success: true,
    data: stats,
    message: "Dashboard stats retrieved successfully",
  };

  return NextResponse.json(response);
}
