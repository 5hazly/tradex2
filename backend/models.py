"""
SQLAlchemy ORM models for the AI Trading System.

All models mirror the Prisma schema defined in prisma/schema.prisma.
"""

import enum
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    """User role enumeration."""
    ADMIN = "ADMIN"
    TRADER = "TRADER"
    VIEWER = "VIEWER"


class TradeSide(str, enum.Enum):
    """Trade side enumeration."""
    LONG = "LONG"
    SHORT = "SHORT"


class TradeStatus(str, enum.Enum):
    """Trade status enumeration."""
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    LIQUIDATED = "LIQUIDATED"


class OrderSide(str, enum.Enum):
    """Order side enumeration."""
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, enum.Enum):
    """Order type enumeration."""
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP = "STOP"
    STOP_LIMIT = "STOP_LIMIT"
    TRAILING_STOP = "TRAILING_STOP"


class OrderStatus(str, enum.Enum):
    """Order status enumeration."""
    PENDING = "PENDING"
    FILLED = "FILLED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class PositionStatus(str, enum.Enum):
    """Position status enumeration."""
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    LIQUIDATED = "LIQUIDATED"


class NotificationType(str, enum.Enum):
    """Notification type enumeration."""
    TRADE_OPEN = "TRADE_OPEN"
    TRADE_CLOSE = "TRADE_CLOSE"
    PROFIT = "PROFIT"
    LOSS = "LOSS"
    DRAWDOWN = "DRAWDOWN"
    ERROR = "ERROR"
    ALERT = "ALERT"
    SYSTEM = "SYSTEM"
    SIGNAL = "SIGNAL"


class NotificationPlatform(str, enum.Enum):
    """Notification platform enumeration."""
    TELEGRAM = "TELEGRAM"
    DISCORD = "DISCORD"
    EMAIL = "EMAIL"
    WEB = "WEB"


class StrategyType(str, enum.Enum):
    """Strategy type enumeration."""
    EMA_MACD = "EMA_MACD"
    SCALPING = "SCALPING"
    BREAKOUT = "BREAKOUT"
    SMART_MONEY = "SMART_MONEY"
    AI_ADAPTIVE = "AI_ADAPTIVE"
    CUSTOM = "CUSTOM"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    """
    User model representing a trading system user.

    Attributes:
        id: Unique user identifier (UUID).
        email: User email address (unique).
        password: Hashed password string.
        name: Optional display name.
        role: User role (ADMIN, TRADER, VIEWER).
        is_active: Whether the user account is active.
        created_at: Account creation timestamp.
        updated_at: Last update timestamp.
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        default=UserRole.TRADER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    exchanges: Mapped[List["Exchange"]] = relationship(
        "Exchange", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    strategies: Mapped[List["Strategy"]] = relationship(
        "Strategy", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    trades: Mapped[List["Trade"]] = relationship(
        "Trade", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    positions: Mapped[List["Position"]] = relationship(
        "Position", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    orders: Mapped[List["Order"]] = relationship(
        "Order", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    balances: Mapped[List["Balance"]] = relationship(
        "Balance", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    notification_logs: Mapped[List["NotificationLog"]] = relationship(
        "NotificationLog", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    analytics_records: Mapped[List["AnalyticsRecord"]] = relationship(
        "AnalyticsRecord", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    backtest_results: Mapped[List["BacktestResult"]] = relationship(
        "BacktestResult", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role.value}>"


class Exchange(Base):
    """
    Exchange model representing a connected crypto exchange.

    Attributes:
        id: Unique exchange record identifier.
        name: Exchange name (e.g., Binance, Bybit).
        api_key: API key for the exchange.
        api_secret: API secret for the exchange.
        passphrase: Optional passphrase (required for OKX, KuCoin).
        is_testnet: Whether testnet mode is enabled.
        is_active: Whether the exchange connection is active.
        user_id: Reference to the owning user.
        created_at: Record creation timestamp.
        updated_at: Last update timestamp.
    """

    __tablename__ = "exchanges"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    api_secret: Mapped[str] = mapped_column(Text, nullable=False)
    passphrase: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_testnet: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="exchanges")
    trades: Mapped[List["Trade"]] = relationship("Trade", back_populates="exchange", lazy="selectin")
    positions: Mapped[List["Position"]] = relationship("Position", back_populates="exchange", lazy="selectin")
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="exchange", lazy="selectin")
    balances: Mapped[List["Balance"]] = relationship("Balance", back_populates="exchange", lazy="selectin")

    def __repr__(self) -> str:
        return f"<Exchange id={self.id} name={self.name} active={self.is_active}>"


class Strategy(Base):
    """
    Strategy model representing a trading strategy configuration.

    Attributes:
        id: Unique strategy identifier.
        name: Human-readable strategy name.
        description: Optional strategy description.
        type: Strategy type enum.
        parameters: JSON string of strategy parameters.
        is_active: Whether the strategy is currently active.
        timeframe: Default candle timeframe for the strategy.
        user_id: Reference to the owning user.
        created_at: Record creation timestamp.
    """

    __tablename__ = "strategies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[StrategyType] = mapped_column(
        Enum(StrategyType, name="strategy_type", native_enum=False),
        nullable=False,
    )
    parameters: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    timeframe: Mapped[str] = mapped_column(String(10), default="1h", nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="strategies")
    trades: Mapped[List["Trade"]] = relationship("Trade", back_populates="strategy", lazy="selectin")
    positions: Mapped[List["Position"]] = relationship("Position", back_populates="strategy", lazy="selectin")
    orders: Mapped[List["Order"]] = relationship("Order", back_populates="strategy", lazy="selectin")
    analytics_records: Mapped[List["AnalyticsRecord"]] = relationship(
        "AnalyticsRecord", back_populates="strategy", lazy="selectin"
    )
    backtest_results: Mapped[List["BacktestResult"]] = relationship(
        "BacktestResult", back_populates="strategy", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Strategy id={self.id} name={self.name} type={self.type.value} active={self.is_active}>"


class Trade(Base):
    """
    Trade model representing a completed or open trade.

    Attributes:
        id: Unique trade identifier.
        symbol: Trading pair (e.g., BTC/USDT).
        side: Trade direction (LONG or SHORT).
        entry_price: Price at which the trade was entered.
        exit_price: Price at which the trade was exited (None if open).
        quantity: Trade quantity in base currency.
        leverage: Leverage multiplier used.
        pnl: Realized profit/loss.
        fee: Total trading fees paid.
        status: Current trade status.
        strategy_id: Optional reference to the strategy that generated this trade.
        exchange_id: Optional reference to the exchange where the trade was executed.
        user_id: Reference to the owning user.
        opened_at: Trade open timestamp.
        closed_at: Trade close timestamp (None if still open).
    """

    __tablename__ = "trades"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    side: Mapped[TradeSide] = mapped_column(
        Enum(TradeSide, name="trade_side", native_enum=False), nullable=False
    )
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    leverage: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fee: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[TradeStatus] = mapped_column(
        Enum(TradeStatus, name="trade_status", native_enum=False),
        default=TradeStatus.OPEN,
        nullable=False,
    )
    strategy_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("strategies.id"), nullable=True, index=True
    )
    exchange_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("exchanges.id"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    strategy: Mapped[Optional["Strategy"]] = relationship("Strategy", back_populates="trades")
    exchange: Mapped[Optional["Exchange"]] = relationship("Exchange", back_populates="trades")
    user: Mapped["User"] = relationship("User", back_populates="trades")

    def __repr__(self) -> str:
        return (
            f"<Trade id={self.id} symbol={self.symbol} side={self.side.value} "
            f"status={self.status.value} pnl={self.pnl}>"
        )


class Position(Base):
    """
    Position model representing an open or closed trading position.

    Attributes:
        id: Unique position identifier.
        symbol: Trading pair.
        side: Position direction.
        entry_price: Entry price of the position.
        quantity: Position size.
        leverage: Leverage used.
        unrealized_pnl: Current unrealized profit/loss.
        stop_loss: Stop loss price level.
        take_profit: Take profit price level.
        liquidation_price: Liquidation price (for leveraged positions).
        margin: Margin used for this position.
        status: Current position status.
        exchange_id: Reference to the exchange.
        strategy_id: Optional reference to the strategy.
        user_id: Reference to the owning user.
        opened_at: Position open timestamp.
        updated_at: Last update timestamp.
    """

    __tablename__ = "positions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    side: Mapped[TradeSide] = mapped_column(
        Enum(TradeSide, name="position_side", native_enum=False), nullable=False
    )
    entry_price: Mapped[float] = mapped_column(Float, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    leverage: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    stop_loss: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    take_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    liquidation_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    margin: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[PositionStatus] = mapped_column(
        Enum(PositionStatus, name="position_status", native_enum=False),
        default=PositionStatus.OPEN,
        nullable=False,
    )
    exchange_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("exchanges.id"), nullable=True, index=True
    )
    strategy_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("strategies.id"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    exchange: Mapped[Optional["Exchange"]] = relationship("Exchange", back_populates="positions")
    strategy: Mapped[Optional["Strategy"]] = relationship("Strategy", back_populates="positions")
    user: Mapped["User"] = relationship("User", back_populates="positions")

    def __repr__(self) -> str:
        return (
            f"<Position id={self.id} symbol={self.symbol} side={self.side.value} "
            f"status={self.status.value} pnl={self.unrealized_pnl}>"
        )


class Order(Base):
    """
    Order model representing a pending or filled order.

    Attributes:
        id: Unique order identifier.
        symbol: Trading pair.
        side: Order direction (BUY or SELL).
        type: Order type (MARKET, LIMIT, STOP, etc.).
        price: Order price (None for market orders).
        quantity: Order quantity.
        leverage: Leverage to apply.
        status: Current order status.
        reduce_only: Whether this is a reduce-only order.
        stop_price: Stop price for stop orders.
        exchange_id: Reference to the exchange.
        strategy_id: Optional reference to the strategy.
        user_id: Reference to the owning user.
        created_at: Order creation timestamp.
        updated_at: Last update timestamp.
    """

    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    side: Mapped[OrderSide] = mapped_column(
        Enum(OrderSide, name="order_side", native_enum=False), nullable=False
    )
    type: Mapped[OrderType] = mapped_column(
        Enum(OrderType, name="order_type", native_enum=False), nullable=False
    )
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    leverage: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status", native_enum=False),
        default=OrderStatus.PENDING,
        nullable=False,
    )
    reduce_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stop_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exchange_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("exchanges.id"), nullable=True, index=True
    )
    strategy_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("strategies.id"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    exchange: Mapped[Optional["Exchange"]] = relationship("Exchange", back_populates="orders")
    strategy: Mapped[Optional["Strategy"]] = relationship("Strategy", back_populates="orders")
    user: Mapped["User"] = relationship("User", back_populates="orders")

    def __repr__(self) -> str:
        return (
            f"<Order id={self.id} symbol={self.symbol} side={self.side.value} "
            f"type={self.type.value} status={self.status.value}>"
        )


class Balance(Base):
    """
    Balance model representing account balances across exchanges.

    Attributes:
        id: Unique balance identifier.
        exchange_id: Reference to the exchange.
        total_balance: Total account balance.
        available_balance: Available balance for trading.
        unrealized_pnl: Unrealized profit/loss from open positions.
        currency: Currency denomination (default USDT).
        user_id: Reference to the owning user.
        updated_at: Last update timestamp.
    """

    __tablename__ = "balances"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    exchange_id: Mapped[str] = mapped_column(
        String, ForeignKey("exchanges.id"), nullable=False, index=True
    )
    total_balance: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    available_balance: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USDT", nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    exchange: Mapped["Exchange"] = relationship("Exchange", back_populates="balances")
    user: Mapped["User"] = relationship("User", back_populates="balances")

    def __repr__(self) -> str:
        return (
            f"<Balance id={self.id} exchange_id={self.exchange_id} "
            f"total={self.total_balance} currency={self.currency}>"
        )


class NotificationLog(Base):
    """
    NotificationLog model for tracking sent notifications.

    Attributes:
        id: Unique notification identifier.
        type: Notification type.
        platform: Delivery platform (Telegram, Discord, Email, Web).
        message: Notification message content.
        is_read: Whether the user has read this notification.
        user_id: Reference to the owning user.
        created_at: Notification creation timestamp.
    """

    __tablename__ = "notification_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type", native_enum=False), nullable=False
    )
    platform: Mapped[NotificationPlatform] = mapped_column(
        Enum(NotificationPlatform, name="notification_platform", native_enum=False),
        default=NotificationPlatform.WEB,
        nullable=False,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notification_logs")

    def __repr__(self) -> str:
        return (
            f"<NotificationLog id={self.id} type={self.type.value} "
            f"platform={self.platform.value} read={self.is_read}>"
        )


class AnalyticsRecord(Base):
    """
    AnalyticsRecord model for storing daily analytics snapshots.

    Attributes:
        id: Unique record identifier.
        date: The date this record covers.
        total_pnl: Total profit/loss for the period.
        win_rate: Win rate percentage (0-100).
        total_trades: Number of trades executed.
        profit_factor: Profit factor ratio.
        sharpe_ratio: Sharpe ratio for the period.
        max_drawdown: Maximum drawdown percentage.
        user_id: Reference to the owning user.
        strategy_id: Optional reference to the strategy.
    """

    __tablename__ = "analytics_records"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    total_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    win_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    profit_factor: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    sharpe_ratio: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_drawdown: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    strategy_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("strategies.id"), nullable=True, index=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="analytics_records")
    strategy: Mapped[Optional["Strategy"]] = relationship(
        "Strategy", back_populates="analytics_records"
    )

    def __repr__(self) -> str:
        return (
            f"<AnalyticsRecord id={self.id} date={self.date} "
            f"pnl={self.total_pnl} win_rate={self.win_rate}>"
        )


class BacktestResult(Base):
    """
    BacktestResult model for storing backtesting results.

    Attributes:
        id: Unique result identifier.
        strategy_id: Reference to the strategy that was backtested.
        start_date: Backtest period start date.
        end_date: Backtest period end date.
        total_pnl: Total profit/loss from the backtest.
        win_rate: Win rate percentage.
        profit_factor: Profit factor ratio.
        sharpe_ratio: Sharpe ratio.
        max_drawdown: Maximum drawdown percentage.
        total_trades: Number of simulated trades.
        parameters: JSON string of the parameters used.
        created_at: Result creation timestamp.
        user_id: Reference to the owning user.
    """

    __tablename__ = "backtest_results"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: _generate_cuid())
    strategy_id: Mapped[str] = mapped_column(
        String, ForeignKey("strategies.id"), nullable=False, index=True
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    win_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    profit_factor: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    sharpe_ratio: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    max_drawdown: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    parameters: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)

    # Relationships
    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="backtest_results")
    user: Mapped["User"] = relationship("User", back_populates="backtest_results")

    def __repr__(self) -> str:
        return (
            f"<BacktestResult id={self.id} strategy_id={self.strategy_id} "
            f"pnl={self.total_pnl} win_rate={self.win_rate}>"
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_cuid() -> str:
    """
    Generate a CUID-like unique identifier.

    This is a simplified version. In production, consider using the
    `cuid2` or `python-cuid` package for proper CUID generation.
    """
    import hashlib
    import os
    import time

    timestamp = str(int(time.time() * 1000))
    random_bytes = os.urandom(8).hex()
    pid = str(os.getpid())
    counter = str(int(time.time() * 1000000) % 1000000)

    raw = f"{timestamp}{random_bytes}{pid}{counter}"
    hash_hex = hashlib.md5(raw.encode()).hexdigest()[:24]

    # Ensure first character is a letter
    first_char = chr(ord('a') + (hash_hex[0] if hash_hex[0].isdigit() else int(hash_hex[0], 16) % 26))
    return first_char + hash_hex[1:]
