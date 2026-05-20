"""
WebSocket Connection Manager.

Manages WebSocket connections for real-time data streaming to clients.
Supports broadcasting events like price updates, position changes,
trade executions, signals, and risk alerts.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect

from config import settings

logger = logging.getLogger(__name__)


class WebSocketEvent:
    """
    Represents a WebSocket event to be broadcast to clients.

    Attributes:
        event_type: Type of event (e.g., "price_update", "trade_executed").
        data: Event payload data.
        timestamp: Event creation time.
    """

    def __init__(
        self,
        event_type: str,
        data: Dict[str, Any],
        timestamp: Optional[datetime] = None,
    ) -> None:
        self.event_type = event_type
        self.data = data
        self.timestamp = timestamp or datetime.now(timezone.utc)

    def to_json(self) -> str:
        """Serialize the event to JSON string."""
        return json.dumps({
            "type": self.event_type,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
        })


class ConnectionManager:
    """
    WebSocket connection manager for real-time data broadcasting.

    Manages client connections, handles connect/disconnect lifecycle,
    and broadcasts events to all connected clients.

    Supported event types:
        - price_update: Real-time price changes
        - position_update: Position P&L changes
        - trade_executed: New trade notifications
        - signal: Trading signals
        - alert: Risk alerts
        - order_update: Order status changes
        - balance_update: Balance changes
        - notification: General notifications

    Usage:
        manager = ConnectionManager()

        # In a WebSocket endpoint:
        @app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            await manager.connect(websocket)
            try:
                while True:
                    data = await websocket.receive_text()
                    await manager.handle_message(websocket, data)
            finally:
                manager.disconnect(websocket)

        # Broadcast events:
        await manager.broadcast_price_update("BTC/USDT", 67845.20, 2.45)
        await manager.broadcast_trade_executed(trade_data)
    """

    def __init__(self) -> None:
        """Initialize the ConnectionManager."""
        self._active_connections: Set[WebSocket] = set()
        self._max_connections: int = settings.ws_max_connections
        self._heartbeat_interval: int = settings.ws_heartbeat_interval
        self._heartbeat_tasks: Dict[WebSocket, asyncio.Task] = {}

    @property
    def connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self._active_connections)

    async def connect(self, websocket: WebSocket) -> bool:
        """
        Accept and register a new WebSocket connection.

        Args:
            websocket: The WebSocket connection to accept.

        Returns:
            True if connected successfully, False if max connections reached.
        """
        if len(self._active_connections) >= self._max_connections:
            logger.warning(
                f"Max WebSocket connections ({self._max_connections}) reached. "
                f"Rejecting new connection."
            )
            await websocket.close(code=1013, reason="Max connections reached")
            return False

        await websocket.accept()
        self._active_connections.add(websocket)

        # Start heartbeat task for this connection
        self._heartbeat_tasks[websocket] = asyncio.create_task(
            self._send_heartbeat(websocket)
        )

        logger.info(f"WebSocket connected. Total connections: {len(self._active_connections)}")

        # Send welcome message
        await self._send_to_connection(websocket, WebSocketEvent(
            event_type="connected",
            data={
                "message": "Connected to TradeAI Pro WebSocket",
                "connection_count": len(self._active_connections),
            },
        ))

        return True

    def disconnect(self, websocket: WebSocket) -> None:
        """
        Unregister and clean up a WebSocket connection.

        Args:
            websocket: The WebSocket connection to disconnect.
        """
        self._active_connections.discard(websocket)

        # Cancel heartbeat task
        task = self._heartbeat_tasks.pop(websocket, None)
        if task and not task.done():
            task.cancel()

        logger.info(
            f"WebSocket disconnected. Total connections: {len(self._active_connections)}"
        )

    async def _send_to_connection(
        self,
        websocket: WebSocket,
        event: WebSocketEvent,
    ) -> bool:
        """
        Send an event to a specific connection.

        Args:
            websocket: Target WebSocket connection.
            event: Event to send.

        Returns:
            True if sent successfully, False otherwise.
        """
        try:
            await websocket.send_text(event.to_json())
            return True
        except Exception as e:
            logger.debug(f"Failed to send to WebSocket: {e}")
            self.disconnect(websocket)
            return False

    async def broadcast(self, event: WebSocketEvent) -> int:
        """
        Broadcast an event to all connected clients.

        Args:
            event: Event to broadcast.

        Returns:
            Number of clients that received the event.
        """
        if not self._active_connections:
            return 0

        message = event.to_json()
        sent_count = 0
        disconnected: List[WebSocket] = []

        for websocket in self._active_connections:
            try:
                await websocket.send_text(message)
                sent_count += 1
            except Exception:
                disconnected.append(websocket)

        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)

        if sent_count > 0:
            logger.debug(
                f"Broadcast '{event.event_type}' to {sent_count} clients"
            )

        return sent_count

    async def _send_heartbeat(self, websocket: WebSocket) -> None:
        """Send periodic heartbeat pings to keep connection alive."""
        try:
            while websocket in self._active_connections:
                await asyncio.sleep(self._heartbeat_interval)
                if websocket in self._active_connections:
                    try:
                        await websocket.send_text(json.dumps({
                            "type": "ping",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }))
                    except Exception:
                        self.disconnect(websocket)
                        break
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    async def handle_message(
        self,
        websocket: WebSocket,
        raw_message: str,
    ) -> None:
        """
        Handle an incoming WebSocket message from a client.

        Args:
            websocket: Source WebSocket connection.
            raw_message: Raw message string.
        """
        try:
            data = json.loads(raw_message)
            msg_type = data.get("type", "")

            if msg_type == "pong":
                return  # Heartbeat response

            elif msg_type == "subscribe":
                channels = data.get("channels", [])
                logger.info(f"Client subscribed to channels: {channels}")
                await self._send_to_connection(websocket, WebSocketEvent(
                    event_type="subscribed",
                    data={"channels": channels},
                ))

            elif msg_type == "unsubscribe":
                channels = data.get("channels", [])
                logger.info(f"Client unsubscribed from channels: {channels}")

            else:
                logger.debug(f"Unknown WebSocket message type: {msg_type}")

        except json.JSONDecodeError:
            logger.warning(f"Invalid WebSocket message: {raw_message}")
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")

    # -----------------------------------------------------------------------
    # Broadcast Helpers
    # -----------------------------------------------------------------------

    async def broadcast_price_update(
        self,
        symbol: str,
        price: float,
        change_24h: float,
        volume_24h: float = 0,
        high_24h: float = 0,
        low_24h: float = 0,
    ) -> int:
        """
        Broadcast a price update event.

        Args:
            symbol: Trading symbol.
            price: Current price.
            change_24h: 24-hour price change percentage.
            volume_24h: 24-hour volume.
            high_24h: 24-hour high.
            low_24h: 24-hour low.

        Returns:
            Number of clients that received the event.
        """
        return await self.broadcast(WebSocketEvent(
            event_type="price_update",
            data={
                "symbol": symbol,
                "price": price,
                "change_24h": change_24h,
                "volume_24h": volume_24h,
                "high_24h": high_24h,
                "low_24h": low_24h,
            },
        ))

    async def broadcast_position_update(
        self,
        position_id: str,
        symbol: str,
        side: str,
        unrealized_pnl: float,
        mark_price: float,
        leverage: int = 1,
    ) -> int:
        """
        Broadcast a position update event.

        Args:
            position_id: Position ID.
            symbol: Trading symbol.
            side: Position side.
            unrealized_pnl: Current unrealized P&L.
            mark_price: Current mark price.
            leverage: Leverage used.

        Returns:
            Number of clients that received the event.
        """
        return await self.broadcast(WebSocketEvent(
            event_type="position_update",
            data={
                "position_id": position_id,
                "symbol": symbol,
                "side": side,
                "unrealized_pnl": unrealized_pnl,
                "mark_price": mark_price,
                "leverage": leverage,
            },
        ))

    async def broadcast_trade_executed(
        self,
        trade_id: str,
        symbol: str,
        side: str,
        price: float,
        quantity: float,
        strategy: str = "",
        pnl: Optional[float] = None,
    ) -> int:
        """
        Broadcast a trade execution event.

        Args:
            trade_id: Trade ID.
            symbol: Trading symbol.
            side: Trade side.
            price: Execution price.
            quantity: Trade quantity.
            strategy: Strategy name.
            pnl: P&L (if trade closed).

        Returns:
            Number of clients that received the event.
        """
        data: Dict[str, Any] = {
            "trade_id": trade_id,
            "symbol": symbol,
            "side": side,
            "price": price,
            "quantity": quantity,
            "strategy": strategy,
        }
        if pnl is not None:
            data["pnl"] = pnl

        return await self.broadcast(WebSocketEvent(
            event_type="trade_executed",
            data=data,
        ))

    async def broadcast_signal(
        self,
        symbol: str,
        side: str,
        strategy: str,
        confidence: float,
        entry_price: Optional[float] = None,
    ) -> int:
        """
        Broadcast a new trading signal event.

        Args:
            symbol: Trading symbol.
            side: Signal direction.
            strategy: Strategy name.
            confidence: Signal confidence.
            entry_price: Suggested entry price.

        Returns:
            Number of clients that received the event.
        """
        return await self.broadcast(WebSocketEvent(
            event_type="signal",
            data={
                "symbol": symbol,
                "side": side,
                "strategy": strategy,
                "confidence": confidence,
                "entry_price": entry_price,
            },
        ))

    async def broadcast_alert(
        self,
        alert_type: str,
        message: str,
        severity: str = "MEDIUM",
    ) -> int:
        """
        Broadcast a risk alert event.

        Args:
            alert_type: Type of alert.
            message: Alert message.
            severity: Alert severity.

        Returns:
            Number of clients that received the event.
        """
        return await self.broadcast(WebSocketEvent(
            event_type="alert",
            data={
                "alert_type": alert_type,
                "message": message,
                "severity": severity,
            },
        ))

    async def broadcast_order_update(
        self,
        order_id: str,
        symbol: str,
        side: str,
        status: str,
        price: Optional[float] = None,
        filled_qty: Optional[float] = None,
    ) -> int:
        """
        Broadcast an order status update event.

        Args:
            order_id: Order ID.
            symbol: Trading symbol.
            side: Order side.
            status: New order status.
            price: Fill price.
            filled_qty: Filled quantity.

        Returns:
            Number of clients that received the event.
        """
        return await self.broadcast(WebSocketEvent(
            event_type="order_update",
            data={
                "order_id": order_id,
                "symbol": symbol,
                "side": side,
                "status": status,
                "price": price,
                "filled_qty": filled_qty,
            },
        ))

    async def broadcast_balance_update(
        self,
        total_balance: float,
        available_balance: float,
        unrealized_pnl: float,
        currency: str = "USDT",
    ) -> int:
        """
        Broadcast a balance update event.

        Args:
            total_balance: Total account balance.
            available_balance: Available balance.
            unrealized_pnl: Unrealized P&L.
            currency: Currency denomination.

        Returns:
            Number of clients that received the event.
        """
        return await self.broadcast(WebSocketEvent(
            event_type="balance_update",
            data={
                "total_balance": total_balance,
                "available_balance": available_balance,
                "unrealized_pnl": unrealized_pnl,
                "currency": currency,
            },
        ))


# Global connection manager instance
ws_manager = ConnectionManager()
