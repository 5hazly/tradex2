import { NextResponse } from "next/server";
import { mockSettings } from "@/lib/mock-data";
import type { ApiResponse, Settings } from "@/lib/types/trading";

// In-memory settings (mutable copy)
let currentSettings: Settings = JSON.parse(JSON.stringify(mockSettings));

export async function GET() {
  const response: ApiResponse<Settings> = {
    success: true,
    data: currentSettings,
    message: "Settings retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const section = body.section;

    if (section) {
      // Partial update for a specific section
      if (section === "risk" && body.risk) {
        currentSettings = { ...currentSettings, risk: { ...currentSettings.risk, ...body.risk } };
      } else if (section === "notifications" && body.notifications) {
        currentSettings = { ...currentSettings, notifications: { ...currentSettings.notifications, ...body.notifications } };
      } else if (section === "general" && body.general) {
        currentSettings = { ...currentSettings, general: { ...currentSettings.general, ...body.general } };
      } else {
        const response: ApiResponse<null> = {
          success: false,
          error: "Invalid section or missing data",
        };
        return NextResponse.json(response, { status: 400 });
      }
    } else {
      // Full update
      currentSettings = { ...currentSettings, ...body };
    }

    const response: ApiResponse<Settings> = {
      success: true,
      data: currentSettings,
      message: "Settings updated successfully",
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
