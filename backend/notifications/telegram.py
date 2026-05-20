"""
Telegram notification sender.

Provides async methods to send trading notifications via Telegram bot API
with message formatting, retry logic, and connection checking.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


class TelegramNotifier:
    """
    Async Telegram notification sender.

    Sends formatted trading notifications through the Telegram Bot API.
    Supports markdown formatting, retry logic, and connection testing.

    Usage:
        notifier = TelegramNotifier()
        await notifier.initialize()

        # Send a message
        await notifier.send("🟢 BUY BTC/USDT @ $67,845.20")

        # Send a trade notification
        await notifier.notify_trade(
            symbol="BTC/USDT", side="BUY", price=67845.20,
            quantity=0.001, leverage=10, strategy="EMA MACD"
        )

        # Test connection
        is_ok = await notifier.test_connection()
    """

    BASE_URL = "https://api.telegram.org/bot{token}"

    def __init__(self) -> None:
        """Initialize the TelegramNotifier."""
        self._token: str = settings.telegram_bot_token
        self._chat_id: str = settings.telegram_chat_id
        self._enabled: bool = settings.telegram_enabled
        self._max_retries: int = 3
        self._retry_delay: float = 1.0
        self._client: Optional[httpx.AsyncClient] = None

    async def initialize(self) -> None:
        """Initialize the HTTP client."""
        self._client = httpx.AsyncClient(timeout=10.0)
        if self._enabled:
            logger.info("Telegram notifier initialized")

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    def _get_url(self, method: str) -> str:
        """Build the Telegram API URL."""
        return self.BASE_URL.format(token=self._token) + f"/{method}"

    async def _send_request(
        self,
        method: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Send a request to the Telegram API with retry logic.

        Args:
            method: API method name (e.g., "sendMessage").
            payload: Request payload.

        Returns:
            Response JSON dictionary.

        Raises:
            Exception: If all retries fail.
        """
        if not self._enabled or not self._token or not self._chat_id:
            logger.warning("Telegram notifier is not configured")
            return {"ok": False, "description": "Not configured"}

        url = self._get_url(method)
        last_error: Optional[Exception] = None

        for attempt in range(1, self._max_retries + 1):
            try:
                if self._client is None:
                    self._client = httpx.AsyncClient(timeout=10.0)

                response = await self._client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()

                if data.get("ok"):
                    return data
                else:
                    logger.warning(f"Telegram API error: {data.get('description')}")
                    last_error = Exception(data.get("description", "Unknown error"))

            except httpx.TimeoutException:
                last_error = Exception("Request timed out")
                logger.warning(f"Telegram request timeout, attempt {attempt}/{self._max_retries}")
            except httpx.HTTPStatusError as e:
                last_error = e
                logger.warning(f"Telegram HTTP error: {e.response.status_code}")
            except Exception as e:
                last_error = e
                logger.warning(f"Telegram request error: {e}")

            if attempt < self._max_retries:
                await asyncio.sleep(self._retry_delay * attempt)

        raise last_error or Exception("Unknown error")

    async def send(
        self,
        message: str,
        parse_mode: str = "Markdown",
        disable_notification: bool = False,
    ) -> bool:
        """
        Send a text message to the configured Telegram chat.

        Args:
            message: Message text (supports Markdown formatting).
            parse_mode: Message parsing mode ("Markdown" or "HTML").
            disable_notification: Send silently.

        Returns:
            True if sent successfully, False otherwise.
        """
        try:
            payload = {
                "chat_id": self._chat_id,
                "text": message,
                "parse_mode": parse_mode,
                "disable_notification": disable_notification,
            }
            result = await self._send_request("sendMessage", payload)
            return result.get("ok", False)
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            return False

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
        Send a formatted trade notification.

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
        emoji = "🔴" if side == "SELL" else "🟢"

        if is_close and pnl is not None:
            pnl_emoji = "💰" if pnl >= 0 else "📉"
            pnl_text = f"{pnl_emoji} *P&L: ${pnl:+.2f}"
        else:
            pnl_text = ""

        message = (
            f"{emoji} *{action} {side} {symbol}*\n\n"
            f"📊 *Price:* ${price:,.2f}\n"
            f"📏 *Quantity:* {quantity}\n"
            f"⚡ *Leverage:* {leverage}x\n"
            f"🧠 *Strategy:* {strategy}\n"
        )

        if pnl_text:
            message += f"{pnl_text}\n"

        message += f"\n⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"

        return await self.send(message)

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
        emoji = "📈" if side == "BUY" else "📉"
        conf_bar = "█" * int(confidence * 10) + "░" * (10 - int(confidence * 10))

        message = (
            f"🎯 *New Signal: {side} {symbol}*\n\n"
            f"🧠 *Strategy:* {strategy}\n"
            f"📊 *Confidence:* [{conf_bar}] {confidence:.0%}\n"
        )

        if entry:
            message += f"💵 *Entry:* ${entry:,.2f}\n"
        if stop_loss:
            message += f"🛑 *Stop Loss:* ${stop_loss:,.2f}\n"
        if take_profit:
            message += f"🎯 *Take Profit:* ${take_profit:,.2f}\n"

        message += f"\n⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"

        return await self.send(message)

    async def notify_risk_alert(
        self,
        alert_type: str,
        message: str,
        severity: str = "MEDIUM",
    ) -> bool:
        """
        Send a risk alert notification.

        Args:
            alert_type: Type of alert (drawdown, exposure, etc.).
            message: Alert message.
            severity: Alert severity (LOW, MEDIUM, HIGH).

        Returns:
            True if sent successfully.
        """
        severity_emoji = {"LOW": "ℹ️", "MEDIUM": "⚠️", "HIGH": "🚨"}.get(severity, "📢")

        text = (
            f"{severity_emoji} *Risk Alert: {alert_type}*\n\n"
            f"*Severity:* {severity}\n"
            f"*Message:* {message}\n\n"
            f"⏰ {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
        )

        return await self.send(text)

    async def test_connection(self) -> bool:
        """
        Test the Telegram bot connection.

        Returns:
            True if connection is working, False otherwise.
        """
        try:
            payload = {"chat_id": self._chat_id, "text": "✅ TradeAI Pro bot connection test successful!"}
            result = await self._send_request("sendMessage", payload)
            return result.get("ok", False)
        except Exception as e:
            logger.error(f"Telegram connection test failed: {e}")
            return False


# Global notifier instance
telegram_notifier = TelegramNotifier()
