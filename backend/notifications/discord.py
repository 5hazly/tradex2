"""
Discord notification sender.

Sends trading notifications via Discord webhook with embed formatting,
retry logic, and connection checking.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


class DiscordNotifier:
    """
    Async Discord notification sender via webhook.

    Sends formatted trading notifications to a Discord channel using
    webhook URLs. Supports rich embeds with colors, fields, and footers.

    Usage:
        notifier = DiscordNotifier()
        await notifier.initialize()

        # Send a message
        await notifier.send("🟢 BUY BTC/USDT @ $67,845.20")

        # Send a trade notification with embed
        await notifier.notify_trade(
            symbol="BTC/USDT", side="BUY", price=67845.20,
            quantity=0.001, leverage=10, strategy="EMA MACD"
        )
    """

    def __init__(self) -> None:
        """Initialize the DiscordNotifier."""
        self._webhook_url: str = settings.discord_webhook_url
        self._enabled: bool = settings.discord_enabled
        self._max_retries: int = 3
        self._retry_delay: float = 1.0
        self._client: Optional[httpx.AsyncClient] = None

        # Color constants
        self._COLORS = {
            "buy": 0x00FF00,       # Green
            "sell": 0xFF0000,      # Red
            "profit": 0x00FF00,    # Green
            "loss": 0xFF0000,      # Red
            "signal": 0x3498DB,    # Blue
            "alert_low": 0xF39C12, # Orange
            "alert_medium": 0xFF8C00, # Dark orange
            "alert_high": 0xFF0000, # Red
            "info": 0x3498DB,      # Blue
            "default": 0x5865F2,   # Discord blurple
        }

    async def initialize(self) -> None:
        """Initialize the HTTP client."""
        self._client = httpx.AsyncClient(timeout=10.0)
        if self._enabled:
            logger.info("Discord notifier initialized")

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def _send_webhook(
        self,
        payload: Dict[str, Any],
    ) -> bool:
        """
        Send a payload to the Discord webhook with retry logic.

        Args:
            payload: Webhook payload (content, embeds, username, etc.).

        Returns:
            True if sent successfully, False otherwise.
        """
        if not self._enabled or not self._webhook_url:
            logger.warning("Discord notifier is not configured")
            return False

        last_error: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                if self._client is None:
                    self._client = httpx.AsyncClient(timeout=10.0)

                response = await self._client.post(
                    self._webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code == 204:
                    return True
                else:
                    last_error = Exception(f"Status {response.status_code}: {response.text}")
                    logger.warning(f"Discord webhook error: {response.status_code}")

            except httpx.TimeoutException:
                last_error = Exception("Request timed out")
                logger.warning(f"Discord request timeout, attempt {attempt}/{self._max_retries}")
            except Exception as e:
                last_error = e
                logger.warning(f"Discord request error: {e}")

            if attempt < self._max_retries:
                await asyncio.sleep(self._retry_delay * attempt)

        logger.error(f"Failed to send Discord webhook: {last_error}")
        return False

    def _build_embed(
        self,
        title: str,
        description: str = "",
        color: int = 0x5865F2,
        fields: Optional[List[Dict[str, Any]]] = None,
        footer: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Build a Discord embed object.

        Args:
            title: Embed title.
            description: Embed description.
            color: Embed color (integer).
            fields: List of field dicts (name, value, inline).
            footer: Footer text.
            timestamp: ISO format timestamp.

        Returns:
            Embed dictionary for Discord webhook payload.
        """
        embed: Dict[str, Any] = {
            "title": title,
            "description": description,
            "color": color,
        }

        if fields:
            embed["fields"] = fields

        if footer:
            embed["footer"] = {"text": footer}

        if timestamp:
            embed["timestamp"] = timestamp
        else:
            embed["timestamp"] = datetime.now(timezone.utc).isoformat()

        return embed

    async def send(
        self,
        message: str,
        username: str = "TradeAI Pro",
    ) -> bool:
        """
        Send a plain text message to Discord.

        Args:
            message: Message text.
            username: Bot username override.

        Returns:
            True if sent successfully.
        """
        payload = {
            "content": message,
            "username": username,
        }
        return await self._send_webhook(payload)

    async def send_embed(
        self,
        title: str,
        description: str = "",
        color: str = "default",
        fields: Optional[List[Dict[str, Any]]] = None,
        username: str = "TradeAI Pro",
    ) -> bool:
        """
        Send a rich embed message to Discord.

        Args:
            title: Embed title.
            description: Embed description.
            color: Color key from COLORS dict.
            fields: Embed fields.
            username: Bot username override.

        Returns:
            True if sent successfully.
        """
        color_int = self._COLORS.get(color, self._COLORS["default"])
        embed = self._build_embed(
            title=title,
            description=description,
            color=color_int,
            fields=fields,
            footer="TradeAI Pro Trading System",
        )

        payload = {
            "embeds": [embed],
            "username": username,
        }
        return await self._send_webhook(payload)

    async def notify_trade(
        self,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        leverage: int = 1,
        strategy: str = "",
        pnl: Optional[float] = None,
        is_close: bool = False,
    ) -> bool:
        """
        Send a formatted trade notification with embed.

        Args:
            symbol: Trading symbol.
            side: Trade side (BUY/SELL).
            price: Trade price.
            quantity: Trade quantity.
            leverage: Leverage used.
            strategy: Strategy name.
            pnl: P&L (for close notifications).
            is_close: Whether this is a close notification.

        Returns:
            True if sent successfully.
        """
        action = "Closed" if is_close else "Opened"
        color_key = "sell" if side == "SELL" else "buy"

        if is_close and pnl is not None:
            title = f"{action} {side} {symbol} | {'+'if pnl >= 0 else ''}{pnl:.2f}"
            color_key = "profit" if pnl >= 0 else "loss"
        else:
            title = f"{action} {side} {symbol}"

        fields = [
            {"name": "Price", "value": f"${price:,.2f}", "inline": True},
            {"name": "Quantity", "value": str(quantity), "inline": True},
            {"name": "Leverage", "value": f"{leverage}x", "inline": True},
        ]

        if strategy:
            fields.append({"name": "Strategy", "value": strategy, "inline": True})
        if pnl is not None:
            pnl_sign = "+" if pnl >= 0 else ""
            fields.append({"name": "P&L", "value": f"${pnl_sign}{pnl:.2f}", "inline": True})

        return await self.send_embed(
            title=title,
            color=color_key,
            fields=fields,
        )

    async def notify_signal(
        self,
        symbol: str,
        side: str,
        confidence: float,
        strategy: str,
        entry: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> bool:
        """
        Send a signal notification.

        Args:
            symbol: Trading symbol.
            side: Signal direction.
            confidence: Signal confidence.
            strategy: Strategy name.
            entry: Entry price.
            stop_loss: Stop loss price.
            take_profit: Take profit price.

        Returns:
            True if sent successfully.
        """
        title = f"📊 Signal: {side} {symbol}"

        fields = [
            {"name": "Strategy", "value": strategy, "inline": True},
            {"name": "Confidence", "value": f"{confidence:.0%}", "inline": True},
        ]

        if entry:
            fields.append({"name": "Entry", "value": f"${entry:,.2f}", "inline": True})
        if stop_loss:
            fields.append({"name": "Stop Loss", "value": f"${stop_loss:,.2f}", "inline": True})
        if take_profit:
            fields.append({"name": "Take Profit", "value": f"${take_profit:,.2f}", "inline": True})

        return await self.send_embed(
            title=title,
            description=f"New trading signal from {strategy}",
            color="signal",
            fields=fields,
        )

    async def notify_risk_alert(
        self,
        alert_type: str,
        message: str,
        severity: str = "MEDIUM",
    ) -> bool:
        """
        Send a risk alert notification.

        Args:
            alert_type: Type of alert.
            message: Alert message.
            severity: Alert severity (LOW, MEDIUM, HIGH).

        Returns:
            True if sent successfully.
        """
        color_key = f"alert_{severity.lower()}"
        title = f"⚠️ Risk Alert: {alert_type}"

        fields = [
            {"name": "Severity", "value": severity, "inline": True},
            {"name": "Type", "value": alert_type, "inline": True},
            {"name": "Details", "value": message, "inline": False},
        ]

        return await self.send_embed(
            title=title,
            description=message,
            color=color_key,
            fields=fields,
            username="TradeAI Risk Monitor",
        )

    async def test_connection(self) -> bool:
        """
        Test the Discord webhook connection.

        Returns:
            True if connection is working, False otherwise.
        """
        return await self.send(
            message="✅ TradeAI Pro Discord integration test successful!",
            username="TradeAI Pro",
        )


# Global notifier instance
discord_notifier = DiscordNotifier()
