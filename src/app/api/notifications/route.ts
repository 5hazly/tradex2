import { NextResponse } from "next/server";
import { mockNotifications } from "@/lib/mock-data";
import type { ApiResponse, NotificationLog } from "@/lib/types/trading";

// In-memory notifications (mutable copy)
let notifications: NotificationLog[] = JSON.parse(JSON.stringify(mockNotifications));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const type = searchParams.get("type");

  let filtered = [...notifications];
  if (unreadOnly) {
    filtered = filtered.filter((n) => !n.isRead);
  }
  if (type) {
    filtered = filtered.filter((n) => n.type === type);
  }

  // Sort by newest first
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const response: ApiResponse<{ notifications: NotificationLog[]; unreadCount: number }> = {
    success: true,
    data: {
      notifications: filtered,
      unreadCount,
    },
    message: "Notifications retrieved successfully",
  };
  return NextResponse.json(response);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, markAll } = body;

    if (markAll) {
      notifications = notifications.map((n) => ({ ...n, isRead: true }));
      const response: ApiResponse<{ markedCount: number }> = {
        success: true,
        data: { markedCount: notifications.length },
        message: "All notifications marked as read",
      };
      return NextResponse.json(response);
    }

    if (!id) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Notification ID is required",
      };
      return NextResponse.json(response, { status: 400 });
    }

    const notification = notifications.find((n) => n.id === id);
    if (!notification) {
      const response: ApiResponse<null> = {
        success: false,
        error: "Notification not found",
      };
      return NextResponse.json(response, { status: 404 });
    }

    notification.isRead = true;
    const response: ApiResponse<NotificationLog> = {
      success: true,
      data: notification,
      message: "Notification marked as read",
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
