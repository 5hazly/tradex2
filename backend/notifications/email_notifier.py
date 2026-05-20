"""
Email notification sender.

Provides async methods to send trading notifications via SMTP
with HTML templates, retry logic, and connection checking.
"""

import asyncio
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

from config import settings

logger = logging.getLogger(__name__)


class EmailNotifier:
    """
    Async email notification sender via SMTP.

    Sends HTML-formatted trading notifications with professional templates.
    Supports TLS, authentication, and configurable SMTP settings.

    Usage:
        notifier = EmailNotifier()
        await notifier.initialize()

        # Send a simple message
        await notifier.send("Trade Alert", "BUY BTC/USDT @ $67,845.20")

        # Send a trade notification
        await notifier.notify_trade(
            symbol="BTC/USDT", side="BUY", price=67845.20,
            quantity=0.001, strategy="EMA MACD"
        )

        # Test connection
        is_ok = await notifier.test_connection()
    """

    def __init__(self) -> None:
        """Initialize the EmailNotifier."""
        self._host: str = settings.smtp_host
        self._port: int = settings.smtp_port
        self._user: str = settings.smtp_user
        self._password: str = settings.smtp_password
        self._from_email: str = settings.smtp_from_email or settings.smtp_user
        self._use_tls: bool = settings.smtp_use_tls
        self._enabled: bool = settings.email_enabled
        self._max_retries: int = 3
        self._retry_delay: float = 2.0

    async def initialize(self) -> None:
        """Initialize the email notifier."""
        if self._enabled:
            if not self._host or not self._user or not self._password:
                logger.warning("Email notifier enabled but SMTP not fully configured")
                self._enabled = False
            else:
                logger.info(f"Email notifier initialized (host={self._host}:{self._port})")

    async def _send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str = "",
    ) -> bool:
        """
        Send an email via SMTP with retry logic.

        Args:
            to_email: Recipient email address.
            subject: Email subject.
            html_body: HTML email body.
            text_body: Plain text fallback body.

        Returns:
            True if sent successfully, False otherwise.
        """
        if not self._enabled:
            logger.warning("Email notifier is not enabled")
            return False

        try:
            import aiosmtplib

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self._from_email
            msg["To"] = to_email
            msg["Date"] = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

            if text_body:
                msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            last_error: Optional[Exception] = None

            for attempt in range(1, self._max_retries + 1):
                try:
                    await aiosmtplib.send(
                        msg,
                        hostname=self._host,
                        port=self._port,
                        username=self._user,
                        password=self._password,
                        start_tls=self._use_tls,
                        timeout=10,
                    )
                    logger.info(f"Email sent to {to_email}: {subject}")
                    return True

                except Exception as e:
                    last_error = e
                    logger.warning(f"Email send attempt {attempt}/{self._max_retries} failed: {e}")

                if attempt < self._max_retries:
                    await asyncio.sleep(self._retry_delay * attempt)

            logger.error(f"Failed to send email after {self._max_retries} retries: {last_error}")
            return False

        except ImportError:
            logger.error("aiosmtplib not installed. Cannot send emails.")
            return False

    def _render_trade_html(
        self,
        title: str,
        details: Dict[str, Any],
        is_profit: Optional[bool] = None,
    ) -> str:
        """
        Render an HTML email template for a trade notification.

        Args:
            title: Email title.
            details: Trade details dictionary.
            is_profit: Whether the trade was profitable.

        Returns:
            HTML string.
        """
        status_color = "#10b981" if is_profit else "#ef4444" if is_profit is not None else "#3b82f6"
        status_bg = "#ecfdf5" if is_profit else "#fef2f2" if is_profit is not None else "#eff6ff"

        rows = ""
        for key, value in details.items():
            rows += f"""
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151;">
                    {key}
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">
                    {value}
                </td>
            </tr>"""

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }}
                .container {{ max-width: 600px; margin: 20px auto; }}
                .card {{ background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }}
                .header {{ background: {status_color}; color: white; padding: 20px 24px; }}
                .header h1 {{ margin: 0; font-size: 18px; font-weight: 600; }}
                .body {{ padding: 20px 24px; }}
                table {{ width: 100%; border-collapse: collapse; }}
                .footer {{ padding: 16px 24px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="card">
                    <div class="header">
                        <h1>{title}</h1>
                    </div>
                    <div class="body">
                        <table>
                            {rows}
                        </table>
                    </div>
                    <div class="footer">
                        TradeAI Pro Trading System &bull; {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
                    </div>
                </div>
            </div>
        </body>
        </html>"""

        return html

    async def send(
        self,
        subject: str,
        message: str,
        to_email: Optional[str] = None,
    ) -> bool:
        """
        Send a plain text email.

        Args:
            subject: Email subject.
            message: Message body.
            to_email: Recipient (uses from_email if None for testing).

        Returns:
            True if sent successfully.
        """
        recipient = to_email or self._from_email
        html = self._render_trade_html(subject, {"Message": message})
        return await self._send_email(recipient, subject, html, text_body=message)

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
        Send a formatted trade notification email.

        Args:
            symbol: Trading symbol.
            side: Trade side.
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
        is_profit = pnl >= 0 if pnl is not None else None

        subject = f"[TradeAI] {action} {side} {symbol}"
        if pnl is not None:
            pnl_sign = "+" if pnl >= 0 else ""
            subject += f" | {pnl_sign}{pnl:.2f}"

        details = {
            "Symbol": symbol,
            "Side": side,
            "Price": f"${price:,.2f}",
            "Quantity": str(quantity),
            "Leverage": f"{leverage}x",
        }

        if strategy:
            details["Strategy"] = strategy
        if pnl is not None:
            pnl_sign = "+" if pnl >= 0 else ""
            details["P&L"] = f"${pnl_sign}{pnl:.2f}"

        details["Time"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        html = self._render_trade_html(subject, details, is_profit=is_profit)
        text_body = "\n".join(f"{k}: {v}" for k, v in details.items())

        return await self._send_email(
            self._from_email,
            subject,
            html,
            text_body=text_body,
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
        Send a signal notification email.

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
        subject = f"[TradeAI Signal] {side} {symbol} ({confidence:.0%})"

        details = {
            "Symbol": symbol,
            "Signal": side,
            "Confidence": f"{confidence:.0%}",
            "Strategy": strategy,
        }

        if entry:
            details["Entry"] = f"${entry:,.2f}"
        if stop_loss:
            details["Stop Loss"] = f"${stop_loss:,.2f}"
        if take_profit:
            details["Take Profit"] = f"${take_profit:,.2f}"

        details["Time"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        html = self._render_trade_html(subject, details)
        text_body = "\n".join(f"{k}: {v}" for k, v in details.items())

        return await self._send_email(
            self._from_email,
            subject,
            html,
            text_body=text_body,
        )

    async def notify_risk_alert(
        self,
        alert_type: str,
        message: str,
        severity: str = "MEDIUM",
    ) -> bool:
        """
        Send a risk alert email.

        Args:
            alert_type: Type of alert.
            message: Alert message.
            severity: Alert severity.

        Returns:
            True if sent successfully.
        """
        subject = f"[TradeAI Alert] {severity}: {alert_type}"

        details = {
            "Alert Type": alert_type,
            "Severity": severity,
            "Message": message,
            "Time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        }

        is_profit = severity == "LOW"
        html = self._render_trade_html(subject, details, is_profit=is_profit)
        text_body = "\n".join(f"{k}: {v}" for k, v in details.items())

        return await self._send_email(
            self._from_email,
            subject,
            html,
            text_body=text_body,
        )

    async def test_connection(self) -> bool:
        """
        Test the SMTP connection.

        Returns:
            True if connection is working, False otherwise.
        """
        subject = "[TradeAI] Email Test"
        message = "TradeAI Pro email integration test successful!"

        html = self._render_trade_html(subject, {
            "Status": "✅ Connected",
            "Host": self._host,
            "Port": str(self._port),
            "User": self._user,
            "Time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        })

        return await self._send_email(
            self._from_email,
            subject,
            html,
            text_body=message,
        )


# Global notifier instance
email_notifier = EmailNotifier()
