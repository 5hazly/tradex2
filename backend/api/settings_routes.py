"""
Settings API Routes
System settings management.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from loguru import logger

from auth import get_current_active_user
from models import User

router = APIRouter()


# ============ Schemas ============

class RiskSettingsUpdate(BaseModel):
    max_position_size: Optional[float] = None
    max_leverage: Optional[int] = None
    max_positions: Optional[int] = None
    risk_per_trade: Optional[float] = None
    max_daily_loss: Optional[float] = None
    max_drawdown: Optional[float] = None
    kill_switch: Optional[bool] = None


class NotificationSettingsUpdate(BaseModel):
    telegram_enabled: Optional[bool] = None
    discord_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    notify_trade_open: Optional[bool] = None
    notify_trade_close: Optional[bool] = None
    notify_profit: Optional[bool] = None
    notify_loss: Optional[bool] = None
    notify_error: Optional[bool] = None
    notify_drawdown: Optional[bool] = None


class GeneralSettingsUpdate(BaseModel):
    bot_name: Optional[str] = None
    default_exchange: Optional[str] = None
    default_timeframe: Optional[str] = None
    timezone: Optional[str] = None
    auto_start: Optional[bool] = None


# Settings storage (in production, use database)
_settings_store: Dict[str, Dict[str, Any]] = {
    "risk": {
        "max_position_size": 5000.0,
        "max_leverage": 20,
        "max_positions": 10,
        "risk_per_trade": 2.0,
        "max_daily_loss": 1000.0,
        "max_drawdown": 15.0,
        "kill_switch": False,
    },
    "notifications": {
        "telegram_enabled": True,
        "discord_enabled": False,
        "email_enabled": False,
        "notify_trade_open": True,
        "notify_trade_close": True,
        "notify_profit": True,
        "notify_loss": True,
        "notify_error": True,
        "notify_drawdown": True,
    },
    "general": {
        "bot_name": "TradeAI Pro",
        "default_exchange": "BingX",
        "default_timeframe": "15m",
        "timezone": "UTC",
        "auto_start": True,
    },
}


@router.get("/settings")
async def get_settings(
    section: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
):
    """Get system settings. Optionally filter by section."""
    if section and section in _settings_store:
        return {"section": section, "settings": _settings_store[section]}
    return {"settings": _settings_store}


@router.put("/settings")
async def update_settings(
    section: str,
    settings_data: Dict[str, Any],
    current_user: User = Depends(get_current_active_user),
):
    """Update settings for a specific section."""
    if section not in _settings_store:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Unknown section: {section}")

    # Update only provided fields
    for key, value in settings_data.items():
        if key in _settings_store[section]:
            _settings_store[section][key] = value

    logger.info(f"Settings updated: {section}")
    return {"status": "success", "section": section, "settings": _settings_store[section]}


@router.get("/settings/risk")
async def get_risk_settings(
    current_user: User = Depends(get_current_active_user),
):
    """Get risk management settings."""
    return {"settings": _settings_store["risk"]}


@router.put("/settings/risk")
async def update_risk_settings(
    data: RiskSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
):
    """Update risk management settings."""
    update_dict = data.model_dump(exclude_unset=True)
    _settings_store["risk"].update(update_dict)
    logger.info(f"Risk settings updated: {update_dict}")
    return {"status": "success", "settings": _settings_store["risk"]}


@router.get("/settings/notifications")
async def get_notification_settings(
    current_user: User = Depends(get_current_active_user),
):
    """Get notification settings."""
    return {"settings": _settings_store["notifications"]}


@router.put("/settings/notifications")
async def update_notification_settings(
    data: NotificationSettingsUpdate,
    current_user: User = Depends(get_current_active_user),
):
    """Update notification settings."""
    update_dict = data.model_dump(exclude_unset=True)
    _settings_store["notifications"].update(update_dict)
    logger.info(f"Notification settings updated: {update_dict}")
    return {"status": "success", "settings": _settings_store["notifications"]}


@router.post("/settings/notifications/test")
async def test_notification(
    platform: str,
    current_user: User = Depends(get_current_active_user),
):
    """Send a test notification to the specified platform."""
    try:
        if platform == "telegram":
            from notifications.telegram import TelegramNotifier
            notifier = TelegramNotifier()
            await notifier.send("TradeAI Pro Test", "This is a test notification from TradeAI Pro.")
        elif platform == "discord":
            from notifications.discord import DiscordNotifier
            notifier = DiscordNotifier()
            await notifier.send("TradeAI Pro Test", "This is a test notification from TradeAI Pro.")
        elif platform == "email":
            from notifications.email_notifier import EmailNotifier
            notifier = EmailNotifier()
            await notifier.send("TradeAI Pro Test", "This is a test notification from TradeAI Pro.")
        else:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Unknown platform: {platform}")

        return {"status": "success", "message": f"Test notification sent to {platform}"}
    except Exception as e:
        logger.error(f"Test notification failed: {e}")
        return {"status": "failed", "error": str(e)}
