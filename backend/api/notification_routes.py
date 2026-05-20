"""
Notification API Routes
Notification history and management.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, update
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from auth import get_current_active_user
from models import User, NotificationLog

router = APIRouter()


class MarkReadRequest(BaseModel):
    notification_ids: Optional[List[str]] = None
    mark_all: bool = False


@router.get("/notifications")
async def get_notifications(
    unread_only: bool = False,
    notification_type: Optional[str] = None,
    platform: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get notifications with optional filters."""
    query = select(NotificationLog).where(NotificationLog.user_id == current_user.id)

    if unread_only:
        query = query.where(NotificationLog.is_read == False)
    if notification_type:
        query = query.where(NotificationLog.type == notification_type.upper())
    if platform:
        query = query.where(NotificationLog.platform == platform.upper())

    # Get unread count
    unread_count_result = await db.execute(
        select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == current_user.id,
            NotificationLog.is_read == False,
        )
    )
    unread_count = unread_count_result.scalar() or 0

    # Get paginated results
    query = query.order_by(desc(NotificationLog.created_at))
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    notifications = result.scalars().all()

    return {
        "notifications": [
            {
                "id": str(n.id),
                "type": n.type,
                "platform": n.platform,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifications
        ],
        "unread_count": unread_count,
        "total": len(notifications),
    }


@router.put("/notifications/mark-read")
async def mark_notifications_read(
    request: MarkReadRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark notifications as read."""
    if request.mark_all:
        await db.execute(
            update(NotificationLog)
            .where(
                NotificationLog.user_id == current_user.id,
                NotificationLog.is_read == False,
            )
            .values(is_read=True)
        )
        await db.commit()
        return {"status": "success", "message": "All notifications marked as read"}

    if request.notification_ids:
        from sqlalchemy import or_
        conditions = or_(
            NotificationLog.id == nid for nid in request.notification_ids
        )
        await db.execute(
            update(NotificationLog)
            .where(conditions, NotificationLog.user_id == current_user.id)
            .values(is_read=True)
        )
        await db.commit()
        return {"status": "success", "message": f"{len(request.notification_ids)} notifications marked as read"}

    return {"status": "no_action", "message": "Provide notification_ids or mark_all=true"}
