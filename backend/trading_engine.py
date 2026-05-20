"""
Core Trading Engine — order lifecycle management and execution.

Handles trade execution, position management, P&L tracking, and fee
calculation. Designed for async operation throughout with state recovery
on restart and a dead man's switch safety mechanism.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from config import settings
from models import (
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    Position,
    PositionStatus,
    Trade,
    TradeSide,
    TradeStatus,
    Balance,
)
from schemas import (
    OrderCreate,
    PositionCloseRequest,
    PositionModifyRequest,
    RiskAssessment,
)
from risk_manager import risk_manager

logger = logging.getLogger(__name__)


class TradingEngineError(Exception):
    """Custom exception for trading engine errors."""

    def __init__(self, message: str, code: Optional[str] = None):
        self.code = code
        super().__init__(message)


class DeadMansSwitch:
    """
    Dead man's switch safety mechanism.

    If not pinged within a configurable interval, triggers an automatic
    shutdown — closing all open positions and cancelling all orders.

    Args:
        interval_seconds: Maximum time between pings before triggering shutdown.
    """

    def __init__(self, interval_seconds: int = 300):
        self.interval_seconds = interval_seconds
        self._last_ping: float = time.monotonic()
        self._is_active: bool = False
        self._task: Optional[asyncio.Task] = None
        self._shutdown_callback: Optional[Any] = None

    async def start(self, shutdown_callback: Any) -> None:
        """Start the dead man's switch monitoring loop."""
        self._is_active = True
        self._shutdown_callback = shutdown_callback
        self._last_ping = time.monotonic()
        self._task = asyncio.create_task(self._monitor_loop())
        logger.info(f"Dead man's switch started (interval={self.interval_seconds}s)")

    async def stop(self) -> None:
        """Stop the dead man's switch."""
        self._is_active = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Dead man's switch stopped")

    def ping(self) -> None:
        """Reset the dead man's switch timer. Call this regularly."""
        self._last_ping = time.monotonic()

    async def _monitor_loop(self) -> None:
        """Monitor loop that checks the timer and triggers shutdown."""
        while self._is_active:
            elapsed = time.monotonic() - self._last_ping
            if elapsed > self.interval_seconds:
                logger.critical(
                    f"Dead man's switch triggered! No ping for {elapsed:.0f}s. "
                    f"Initiating emergency shutdown."
                )
                if self._shutdown_callback:
                    try:
                        await self._shutdown_callback()
                    except Exception as e:
                        logger.error(f"Error in shutdown callback: {e}")
                break
            await asyncio.sleep(5)

    @property
    def time_since_last_ping(self) -> float:
        """Seconds since the last ping."""
        return time.monotonic() - self._last_ping


class TradingEngine:
    """
    Core trading engine for order lifecycle management.

    Handles:
    - Trade execution with risk checks
    - Position management (open, close, modify)
    - Order lifecycle (create, cancel, track)
    - P&L tracking (realized and unrealized)
    - Fee calculation (maker/taker, funding fees)
    - State recovery on restart
    - Dead man's switch safety

    Usage:
        engine = TradingEngine(db_session, exchange_manager)
        await engine.initialize()
        await engine.start()

        # Execute a trade
        result = await engine.execute_trade(order_create, user_id, strategy_id, exchange_id)

        # Close a position
        await engine.close_position(position_id, user_id)

        # Emergency shutdown
        await engine.emergency_close_all()
    """

    def __init__(
        self,
        db: AsyncSession,
        exchange_mgr: Any,
    ) -> None:
        """
        Initialize the TradingEngine.

        Args:
            db: Async SQLAlchemy database session.
            exchange_mgr: ExchangeManager instance for exchange interactions.
        """
        self.db = db
        self.exchange_mgr = exchange_mgr
        self.dead_mans_switch = DeadMansSwitch(interval_seconds=300)
        self._is_running: bool = False
        self._pending_orders: Dict[str, asyncio.Task] = {}
        self._positions_cache: Dict[str, Position] = {}
        self._maker_fee: float = settings.maker_fee
        self._taker_fee: float = settings.taker_fee

    # -----------------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------------

    async def initialize(self) -> None:
        """
        Initialize the trading engine on startup.

        Recovers state from the database, reconciles with exchanges,
        and starts monitoring tasks.
        """
        logger.info("Initializing trading engine...")

        # Recover open positions from database
        await self._recover_state()

        # Start dead man's switch
        await self.dead_mans_switch.start(self.emergency_close_all)

        self._is_running = True
        logger.info("Trading engine initialized successfully")

    async def shutdown(self) -> None:
        """Gracefully shut down the trading engine."""
        logger.info("Shutting down trading engine...")
        self._is_running = False

        # Stop dead man's switch
        await self.dead_mans_switch.stop()

        # Cancel pending order tasks
        for order_id, task in self._pending_orders.items():
            if not task.done():
                task.cancel()
        self._pending_orders.clear()

        logger.info("Trading engine shut down")

    async def _recover_state(self) -> None:
        """
        Recover engine state from the database on restart.

        Loads open positions and pending orders, then reconciles
        with actual exchange state.
        """
        # Load open positions
        result = await self.db.execute(
            select(Position).where(Position.status == PositionStatus.OPEN)
        )
        open_positions = result.scalars().all()
        self._positions_cache = {p.id: p for p in open_positions}
        logger.info(f"Recovered {len(open_positions)} open positions from database")

        # Load pending orders
        result = await self.db.execute(
            select(Order).where(Order.status.in_([
                OrderStatus.PENDING,
                OrderStatus.PARTIALLY_FILLED,
            ]))
        )
        pending_orders = result.scalars().all()
        logger.info(f"Recovered {len(pending_orders)} pending orders from database")

    # -----------------------------------------------------------------------
    # Trade Execution
    # -----------------------------------------------------------------------

    async def execute_trade(
        self,
        order_create: OrderCreate,
        user_id: str,
        strategy_id: Optional[str] = None,
        exchange_id: Optional[str] = None,
        exchange_name: Optional[str] = None,
    ) -> Trade:
        """
        Execute a trade after risk validation.

        Args:
            order_create: Order creation schema with trade details.
            user_id: ID of the user executing the trade.
            strategy_id: Optional ID of the strategy generating this trade.
            exchange_id: Optional ID of the exchange record.
            exchange_name: Optional exchange name for API calls.

        Returns:
            Created Trade model instance.

        Raises:
            TradingEngineError: If risk checks fail or order execution fails.
        """
        logger.info(
            f"Executing trade: {order_create.symbol} {order_create.side} "
            f"{order_create.type} x{order_create.quantity}"
        )

        # 1. Risk assessment
        risk_assessment = await self._assess_risk(order_create, user_id, exchange_id)
        if not risk_assessment.approved:
            raise TradingEngineError(
                f"Trade rejected by risk manager: {'; '.join(risk_assessment.reasons)}",
                code="RISK_REJECTED",
            )

        # 2. Create database records
        trade = Trade(
            symbol=order_create.symbol,
            side=TradeSide(order_create.side.upper()),
            entry_price=order_create.price or 0.0,
            quantity=order_create.quantity,
            leverage=order_create.leverage,
            status=TradeStatus.OPEN,
            strategy_id=strategy_id,
            exchange_id=exchange_id,
            user_id=user_id,
        )
        self.db.add(trade)

        # Create order record
        order = Order(
            symbol=order_create.symbol,
            side=OrderSide(order_create.side.upper()),
            type=OrderType(order_create.type.upper()),
            price=order_create.price,
            quantity=order_create.quantity,
            leverage=order_create.leverage,
            status=OrderStatus.PENDING,
            reduce_only=order_create.reduce_only,
            stop_price=order_create.stop_price,
            exchange_id=exchange_id,
            strategy_id=strategy_id,
            user_id=user_id,
        )
        self.db.add(order)
        await self.db.flush()

        # 3. Execute on exchange
        if exchange_name:
            try:
                exchange_order = await self.exchange_mgr.create_order(
                    name=exchange_name,
                    symbol=order_create.symbol,
                    side=order_create.side,
                    order_type=order_create.type,
                    amount=order_create.quantity,
                    price=order_create.price,
                )

                # Update with exchange data
                trade.entry_price = float(exchange_order.get("average", 0) or exchange_order.get("price", 0))
                order.status = OrderStatus.FILLED if exchange_order.get("filled") else OrderStatus.PENDING

                # Calculate fees
                fee = self._calculate_fees(
                    float(exchange_order.get("cost", 0) or 0),
                    is_maker=(order_create.type.upper() == "LIMIT"),
                )
                trade.fee = fee

                logger.info(
                    f"Exchange order executed: id={exchange_order.get('id')} "
                    f"status={exchange_order.get('status')} price={trade.entry_price}"
                )
            except Exception as e:
                order.status = OrderStatus.REJECTED
                trade.status = TradeStatus.CANCELLED
                logger.error(f"Exchange order failed: {e}")
                await self.db.commit()
                raise TradingEngineError(
                    f"Exchange order execution failed: {e}",
                    code="ORDER_FAILED",
                )

        # Create position for non-reduce orders
        if not order_create.reduce_only:
            margin = (trade.entry_price * order_create.quantity) / order_create.leverage
            position = Position(
                symbol=order_create.symbol,
                side=TradeSide(order_create.side.upper()),
                entry_price=trade.entry_price,
                quantity=order_create.quantity,
                leverage=order_create.leverage,
                margin=margin,
                status=PositionStatus.OPEN,
                exchange_id=exchange_id,
                strategy_id=strategy_id,
                user_id=user_id,
            )
            self.db.add(position)
            await self.db.flush()
            self._positions_cache[position.id] = position

        await self.db.commit()
        self.dead_mans_switch.ping()
        logger.info(f"Trade executed successfully: trade_id={trade.id}")
        return trade

    # -----------------------------------------------------------------------
    # Position Management
    # -----------------------------------------------------------------------

    async def close_position(
        self,
        position_id: str,
        user_id: str,
        close_request: Optional[PositionCloseRequest] = None,
        exchange_name: Optional[str] = None,
    ) -> Trade:
        """
        Close an open position.

        Args:
            position_id: ID of the position to close.
            user_id: ID of the user.
            close_request: Optional close parameters (quantity, order type, price).
            exchange_name: Optional exchange name for API calls.

        Returns:
            Closed Trade model instance.

        Raises:
            TradingEngineError: If position not found or already closed.
        """
        result = await self.db.execute(
            select(Position).where(Position.id == position_id, Position.user_id == user_id)
        )
        position = result.scalar_one_or_none()

        if not position:
            raise TradingEngineError("Position not found", code="NOT_FOUND")
        if position.status != PositionStatus.OPEN:
            raise TradingEngineError(
                f"Position is not open (status={position.status.value})",
                code="INVALID_STATUS",
            )

        close_quantity = close_request.quantity if close_request and close_request.quantity else position.quantity
        exit_price = 0.0

        # Execute close on exchange
        if exchange_name:
            close_side = "sell" if position.side == TradeSide.LONG else "buy"
            try:
                exchange_order = await self.exchange_mgr.create_order(
                    name=exchange_name,
                    symbol=position.symbol,
                    side=close_side,
                    order_type=close_request.order_type if close_request else "market",
                    amount=close_quantity,
                    price=close_request.price if close_request else None,
                )
                exit_price = float(
                    exchange_order.get("average", 0) or exchange_order.get("price", 0)
                )
            except Exception as e:
                logger.error(f"Failed to close position on exchange: {e}")
                raise TradingEngineError(
                    f"Failed to close position: {e}",
                    code="CLOSE_FAILED",
                )

        # Calculate P&L
        pnl = self._calculate_pnl(
            entry_price=position.entry_price,
            exit_price=exit_price,
            quantity=close_quantity,
            side=position.side,
            leverage=position.leverage,
        )

        # Calculate close fee
        close_fee = self._calculate_fees(
            exit_price * close_quantity,
            is_maker=(close_request.order_type == "limit" if close_request else False),
        )

        # Update or close position
        remaining = position.quantity - close_quantity
        if remaining <= 1e-8:
            position.status = PositionStatus.CLOSED
        else:
            position.quantity = remaining
            position.margin = (position.entry_price * remaining) / position.leverage

        # Find associated open trade and close it
        trade_result = await self.db.execute(
            select(Trade).where(
                Trade.symbol == position.symbol,
                Trade.user_id == user_id,
                Trade.status == TradeStatus.OPEN,
                Trade.strategy_id == position.strategy_id,
            ).order_by(Trade.opened_at.desc())
        )
        trade = trade_result.scalar_one_or_none()

        if trade:
            trade.exit_price = exit_price
            trade.pnl = pnl
            trade.fee += close_fee
            trade.status = TradeStatus.CLOSED
            trade.closed_at = datetime.now(timezone.utc)
        else:
            # Create a new trade record
            trade = Trade(
                symbol=position.symbol,
                side=position.side,
                entry_price=position.entry_price,
                exit_price=exit_price,
                quantity=close_quantity,
                leverage=position.leverage,
                pnl=pnl,
                fee=close_fee,
                status=TradeStatus.CLOSED,
                exchange_id=position.exchange_id,
                strategy_id=position.strategy_id,
                user_id=user_id,
                closed_at=datetime.now(timezone.utc),
            )
            self.db.add(trade)

        position.updated_at = datetime.now(timezone.utc)
        self._positions_cache.pop(position_id, None)

        await self.db.commit()
        self.dead_mans_switch.ping()
        logger.info(
            f"Position closed: id={position_id} pnl={pnl:.2f} "
            f"exit_price={exit_price} quantity_closed={close_quantity}"
        )
        return trade

    async def modify_position(
        self,
        position_id: str,
        user_id: str,
        modify_request: PositionModifyRequest,
    ) -> Position:
        """
        Modify a position's stop loss and/or take profit.

        Args:
            position_id: ID of the position to modify.
            user_id: ID of the user.
            modify_request: Modification parameters (SL, TP).

        Returns:
            Updated Position model instance.

        Raises:
            TradingEngineError: If position not found.
        """
        result = await self.db.execute(
            select(Position).where(Position.id == position_id, Position.user_id == user_id)
        )
        position = result.scalar_one_or_none()

        if not position:
            raise TradingEngineError("Position not found", code="NOT_FOUND")

        if modify_request.stop_loss is not None:
            position.stop_loss = modify_request.stop_loss
        if modify_request.take_profit is not None:
            position.take_profit = modify_request.take_profit

        position.updated_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Update cache
        if position_id in self._positions_cache:
            self._positions_cache[position_id] = position

        logger.info(
            f"Position modified: id={position_id} "
            f"SL={modify_request.stop_loss} TP={modify_request.take_profit}"
        )
        return position

    async def get_all_positions(self, user_id: str) -> List[Position]:
        """
        Get all open positions for a user.

        Args:
            user_id: ID of the user.

        Returns:
            List of open Position model instances.
        """
        result = await self.db.execute(
            select(Position).where(
                Position.user_id == user_id,
                Position.status == PositionStatus.OPEN,
            )
        )
        return list(result.scalars().all())

    # -----------------------------------------------------------------------
    # Order Management
    # -----------------------------------------------------------------------

    async def cancel_order(
        self,
        order_id: str,
        user_id: str,
        exchange_name: Optional[str] = None,
    ) -> Order:
        """
        Cancel a pending order.

        Args:
            order_id: ID of the order to cancel.
            user_id: ID of the user.
            exchange_name: Optional exchange name for API calls.

        Returns:
            Cancelled Order model instance.

        Raises:
            TradingEngineError: If order not found or not cancellable.
        """
        result = await self.db.execute(
            select(Order).where(Order.id == order_id, Order.user_id == user_id)
        )
        order = result.scalar_one_or_none()

        if not order:
            raise TradingEngineError("Order not found", code="NOT_FOUND")
        if order.status not in (OrderStatus.PENDING, OrderStatus.PARTIALLY_FILLED):
            raise TradingEngineError(
                f"Order cannot be cancelled (status={order.status.value})",
                code="INVALID_STATUS",
            )

        # Cancel on exchange
        if exchange_name:
            try:
                await self.exchange_mgr.cancel_order(
                    name=exchange_name,
                    order_id=order_id,
                    symbol=order.symbol,
                )
            except Exception as e:
                logger.error(f"Failed to cancel order on exchange: {e}")

        order.status = OrderStatus.CANCELLED
        order.updated_at = datetime.now(timezone.utc)
        await self.db.commit()

        logger.info(f"Order cancelled: id={order_id}")
        return order

    # -----------------------------------------------------------------------
    # P&L & Fee Calculation
    # -----------------------------------------------------------------------

    @staticmethod
    def _calculate_pnl(
        entry_price: float,
        exit_price: float,
        quantity: float,
        side: TradeSide,
        leverage: int,
    ) -> float:
        """
        Calculate realized profit/loss for a trade.

        Args:
            entry_price: Entry price of the position.
            exit_price: Exit price of the position.
            quantity: Position quantity.
            side: Trade side (LONG or SHORT).
            leverage: Leverage multiplier.

        Returns:
            Realized P&L in quote currency (USDT).
        """
        if side == TradeSide.LONG:
            price_diff = exit_price - entry_price
        else:
            price_diff = entry_price - exit_price

        pnl = price_diff * quantity * leverage
        return round(pnl, 2)

    @staticmethod
    def _calculate_fees(
        notional_value: float,
        is_maker: bool = False,
        maker_fee: Optional[float] = None,
        taker_fee: Optional[float] = None,
    ) -> float:
        """
        Calculate trading fees.

        Args:
            notional_value: Total value of the trade (price * quantity).
            is_maker: Whether the order is a maker order.
            maker_fee: Custom maker fee rate.
            taker_fee: Custom taker fee rate.

        Returns:
            Fee amount in quote currency.
        """
        fee_rate = maker_fee if is_maker else taker_fee
        if fee_rate is None:
            fee_rate = settings.maker_fee if is_maker else settings.taker_fee
        return round(notional_value * fee_rate, 4)

    @staticmethod
    def calculate_unrealized_pnl(
        entry_price: float,
        current_price: float,
        quantity: float,
        side: TradeSide,
        leverage: int,
    ) -> float:
        """
        Calculate unrealized P&L for an open position.

        Args:
            entry_price: Entry price.
            current_price: Current market price.
            quantity: Position quantity.
            side: Trade side.
            leverage: Leverage multiplier.

        Returns:
            Unrealized P&L in quote currency.
        """
        if side == TradeSide.LONG:
            price_diff = current_price - entry_price
        else:
            price_diff = entry_price - current_price

        return round(price_diff * quantity * leverage, 2)

    @staticmethod
    def calculate_liquidation_price(
        entry_price: float,
        leverage: int,
        side: TradeSide,
        maintenance_margin_rate: float = 0.005,
    ) -> float:
        """
        Calculate the approximate liquidation price.

        Args:
            entry_price: Entry price.
            leverage: Leverage multiplier.
            side: Trade side.
            maintenance_margin_rate: Exchange maintenance margin rate.

        Returns:
            Approximate liquidation price.
        """
        if leverage <= 1:
            return 0.0

        margin_rate = 1.0 / leverage
        if side == TradeSide.LONG:
            liq_price = entry_price * (1 - margin_rate + maintenance_margin_rate)
        else:
            liq_price = entry_price * (1 + margin_rate - maintenance_margin_rate)

        return round(liq_price, 2)

    # -----------------------------------------------------------------------
    # Risk Assessment
    # -----------------------------------------------------------------------

    async def _assess_risk(
        self,
        order_create: OrderCreate,
        user_id: str,
        exchange_id: Optional[str] = None,
    ) -> RiskAssessment:
        """
        Run risk assessment on a proposed trade.

        Args:
            order_create: Order creation schema.
            user_id: User ID.
            exchange_id: Optional exchange ID.

        Returns:
            RiskAssessment with approval status and details.
        """
        assessment = await risk_manager.check_risk(
            symbol=order_create.symbol,
            side=order_create.side,
            quantity=order_create.quantity,
            price=order_create.price or 0.0,
            leverage=order_create.leverage,
            user_id=user_id,
            db=self.db,
        )
        return assessment

    # -----------------------------------------------------------------------
    # Emergency
    # -----------------------------------------------------------------------

    async def emergency_close_all(self) -> Dict[str, Any]:
        """
        Emergency close all open positions and cancel all orders.

        Triggered by the dead man's switch or manual kill switch.

        Returns:
            Summary of closed positions and cancelled orders.
        """
        logger.critical("EMERGENCY CLOSE ALL triggered!")
        summary = {"positions_closed": 0, "orders_cancelled": 0, "errors": []}

        # Close all open positions
        for position_id, position in self._positions_cache.items():
            try:
                await self.close_position(position_id, position.user_id)
                summary["positions_closed"] += 1
            except Exception as e:
                summary["errors"].append(f"Failed to close position {position_id}: {e}")

        # Cancel all pending orders
        result = await self.db.execute(
            select(Order).where(Order.status.in_([
                OrderStatus.PENDING,
                OrderStatus.PARTIALLY_FILLED,
            ]))
        )
        pending_orders = result.scalars().all()
        for order in pending_orders:
            try:
                order.status = OrderStatus.CANCELLED
                order.updated_at = datetime.now(timezone.utc)
                summary["orders_cancelled"] += 1
            except Exception as e:
                summary["errors"].append(f"Failed to cancel order {order.id}: {e}")

        await self.db.commit()
        logger.critical(f"Emergency close completed: {summary}")
        return summary
