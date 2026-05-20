"""
Pydantic schemas for request/response validation.

Covers all models with proper validation, examples, and serialization.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------

class PaginationParams(BaseModel):
    """Pagination parameters for list endpoints."""

    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page")

    @property
    def offset(self) -> int:
        """Calculate SQL offset from page number."""
        return (self.page - 1) * self.page_size


class PaginatedResponse(BaseModel):
    """Generic paginated response wrapper."""

    items: List[Any] = Field(default_factory=list, description="List of items")
    total: int = Field(default=0, description="Total number of items")
    page: int = Field(default=1, description="Current page number")
    page_size: int = Field(default=20, description="Items per page")
    total_pages: int = Field(default=0, description="Total number of pages")


# ---------------------------------------------------------------------------
# User Schemas
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: str = Field(
        ...,
        description="User email address",
        examples=["trader@example.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
        description="User password (min 8 characters)",
        examples=["SecurePassword123!"],
    )
    name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Display name",
        examples=["John Doe"],
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Validate email format."""
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        """Validate password strength."""
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    """Schema for user login."""

    email: str = Field(
        ...,
        description="User email address",
        examples=["trader@example.com"],
    )
    password: str = Field(
        ...,
        description="User password",
        examples=["SecurePassword123!"],
    )


class UserResponse(BaseModel):
    """Schema for user response."""

    id: str = Field(..., description="User ID")
    email: str = Field(..., description="User email")
    name: Optional[str] = Field(None, description="Display name")
    role: str = Field(..., description="User role")
    is_active: bool = Field(..., description="Whether the user is active")
    created_at: datetime = Field(..., description="Account creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Schema for updating user information."""

    name: Optional[str] = Field(default=None, max_length=255, description="Display name")
    email: Optional[str] = Field(default=None, description="Email address")
    password: Optional[str] = Field(default=None, min_length=8, max_length=128, description="New password")


class Token(BaseModel):
    """Schema for JWT token response."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration in seconds")


class TokenData(BaseModel):
    """Schema for JWT token payload data."""

    user_id: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


# ---------------------------------------------------------------------------
# Exchange Schemas
# ---------------------------------------------------------------------------

class ExchangeCreate(BaseModel):
    """Schema for creating/updating an exchange connection."""

    name: str = Field(
        ...,
        description="Exchange name",
        examples=["binance", "bybit", "okx"],
    )
    api_key: str = Field(
        ...,
        min_length=1,
        description="API key",
        examples=["abc123def456"],
    )
    api_secret: str = Field(
        ...,
        min_length=1,
        description="API secret",
        examples=["xyz789uvw012"],
    )
    passphrase: Optional[str] = Field(
        default=None,
        description="Passphrase (required for OKX, KuCoin)",
        examples=["mySecretPhrase"],
    )
    is_testnet: bool = Field(default=False, description="Use testnet mode")

    @field_validator("name")
    @classmethod
    def validate_exchange_name(cls, v: str) -> str:
        """Validate and normalize exchange name."""
        valid = {"binance", "bybit", "bingx", "okx", "kucoin"}
        v_lower = v.lower().strip()
        if v_lower not in valid:
            raise ValueError(f"Exchange must be one of: {valid}")
        return v_lower.upper()


class ExchangeResponse(BaseModel):
    """Schema for exchange response."""

    id: str
    name: str
    is_testnet: bool
    is_active: bool
    user_id: str
    created_at: datetime
    updated_at: datetime
    # Masked API key
    masked_api_key: Optional[str] = None
    # Associated balances (optional, populated when requested)
    balances: Optional[List["BalanceResponse"]] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Strategy Schemas
# ---------------------------------------------------------------------------

class StrategyCreate(BaseModel):
    """Schema for creating a new strategy."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Strategy name",
        examples=["EMA MACD Crossover"],
    )
    description: Optional[str] = Field(
        default=None,
        description="Strategy description",
        examples=["EMA crossover with MACD confirmation"],
    )
    type: str = Field(
        ...,
        description="Strategy type",
        examples=["EMA_MACD", "SCALPING", "BREAKOUT", "SMART_MONEY", "AI_ADAPTIVE"],
    )
    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Strategy parameters as JSON",
        examples=[{"fast_ema": 9, "slow_ema": 21, "macd_fast": 12, "macd_slow": 26}],
    )
    timeframe: str = Field(
        default="1h",
        description="Default candle timeframe",
        examples=["1m", "5m", "15m", "1h", "4h", "1d"],
    )
    is_active: bool = Field(default=True, description="Whether the strategy is active")

    @field_validator("type")
    @classmethod
    def validate_strategy_type(cls, v: str) -> str:
        """Validate strategy type."""
        valid = {"EMA_MACD", "SCALPING", "BREAKOUT", "SMART_MONEY", "AI_ADAPTIVE", "CUSTOM"}
        if v.upper() not in valid:
            raise ValueError(f"Strategy type must be one of: {valid}")
        return v.upper()

    @field_validator("timeframe")
    @classmethod
    def validate_timeframe(cls, v: str) -> str:
        """Validate timeframe value."""
        valid = {"1m", "5m", "15m", "1h", "4h", "1d", "1w"}
        if v.lower() not in valid:
            raise ValueError(f"Timeframe must be one of: {valid}")
        return v.lower()


class StrategyUpdate(BaseModel):
    """Schema for updating an existing strategy."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None)
    parameters: Optional[Dict[str, Any]] = Field(default=None)
    timeframe: Optional[str] = Field(default=None)
    is_active: Optional[bool] = Field(default=None)
    type: Optional[str] = Field(default=None)


class StrategyResponse(BaseModel):
    """Schema for strategy response."""

    id: str
    name: str
    description: Optional[str]
    type: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    timeframe: str
    user_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Position Schemas
# ---------------------------------------------------------------------------

class PositionResponse(BaseModel):
    """Schema for position response."""

    id: str
    symbol: str
    side: str
    entry_price: float
    quantity: float
    leverage: int
    unrealized_pnl: float
    stop_loss: Optional[float]
    take_profit: Optional[float]
    liquidation_price: Optional[float]
    margin: float
    status: str
    exchange_id: Optional[str]
    strategy_id: Optional[str]
    user_id: str
    opened_at: datetime
    updated_at: datetime
    # Enriched fields
    exchange_name: Optional[str] = None
    strategy_name: Optional[str] = None

    model_config = {"from_attributes": True}


class PositionCloseRequest(BaseModel):
    """Schema for closing a position."""

    quantity: Optional[float] = Field(
        default=None,
        description="Quantity to close (None = close entire position)",
        ge=0,
    )
    order_type: str = Field(
        default="market",
        description="Order type for closing (market or limit)",
        examples=["market", "limit"],
    )
    price: Optional[float] = Field(
        default=None,
        description="Limit price (required if order_type is limit)",
    )


class PositionModifyRequest(BaseModel):
    """Schema for modifying position SL/TP."""

    stop_loss: Optional[float] = Field(default=None, description="New stop loss price", gt=0)
    take_profit: Optional[float] = Field(default=None, description="New take profit price", gt=0)


# ---------------------------------------------------------------------------
# Order Schemas
# ---------------------------------------------------------------------------

class OrderCreate(BaseModel):
    """Schema for creating a new order."""

    symbol: str = Field(
        ...,
        description="Trading pair",
        examples=["BTC/USDT"],
    )
    side: str = Field(
        ...,
        description="Order side",
        examples=["buy", "sell"],
    )
    type: str = Field(
        ...,
        description="Order type",
        examples=["market", "limit", "stop", "stop_limit"],
    )
    price: Optional[float] = Field(
        default=None,
        description="Order price (required for limit/stop orders)",
        gt=0,
    )
    quantity: float = Field(
        ...,
        description="Order quantity",
        gt=0,
        examples=[0.001],
    )
    leverage: int = Field(default=1, ge=1, le=125, description="Leverage multiplier")
    reduce_only: bool = Field(default=False, description="Reduce-only order")
    stop_price: Optional[float] = Field(default=None, description="Stop price for stop orders", gt=0)

    @field_validator("side")
    @classmethod
    def validate_side(cls, v: str) -> str:
        """Validate order side."""
        v_upper = v.upper()
        if v_upper not in {"BUY", "SELL"}:
            raise ValueError("Side must be 'buy' or 'sell'")
        return v_upper

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        """Validate order type."""
        v_upper = v.upper()
        if v_upper not in {"MARKET", "LIMIT", "STOP", "STOP_LIMIT", "TRAILING_STOP"}:
            raise ValueError("Invalid order type")
        return v_upper


class OrderResponse(BaseModel):
    """Schema for order response."""

    id: str
    symbol: str
    side: str
    type: str
    price: Optional[float]
    quantity: float
    leverage: int
    status: str
    reduce_only: bool
    stop_price: Optional[float]
    exchange_id: Optional[str]
    strategy_id: Optional[str]
    user_id: str
    created_at: datetime
    updated_at: datetime
    # Enriched fields
    exchange_name: Optional[str] = None
    strategy_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Trade Schemas
# ---------------------------------------------------------------------------

class TradeResponse(BaseModel):
    """Schema for trade response."""

    id: str
    symbol: str
    side: str
    entry_price: float
    exit_price: Optional[float]
    quantity: float
    leverage: int
    pnl: float
    fee: float
    status: str
    strategy_id: Optional[str]
    exchange_id: Optional[str]
    user_id: str
    opened_at: datetime
    closed_at: Optional[datetime]
    # Enriched fields
    strategy_name: Optional[str] = None
    exchange_name: Optional[str] = None
    duration: Optional[str] = None

    model_config = {"from_attributes": True}


class TradeFilters(BaseModel):
    """Schema for filtering trades."""

    symbol: Optional[str] = Field(default=None, description="Filter by symbol")
    side: Optional[str] = Field(default=None, description="Filter by side (LONG/SHORT)")
    status: Optional[str] = Field(default=None, description="Filter by status (OPEN/CLOSED)")
    strategy_id: Optional[str] = Field(default=None, description="Filter by strategy")
    exchange_id: Optional[str] = Field(default=None, description="Filter by exchange")
    pnl_min: Optional[float] = Field(default=None, description="Minimum P&L")
    pnl_max: Optional[float] = Field(default=None, description="Maximum P&L")
    date_from: Optional[datetime] = Field(default=None, description="Filter from date")
    date_to: Optional[datetime] = Field(default=None, description="Filter to date")


# ---------------------------------------------------------------------------
# Balance Schemas
# ---------------------------------------------------------------------------

class BalanceResponse(BaseModel):
    """Schema for balance response."""

    id: str
    exchange_id: str
    total_balance: float
    available_balance: float
    unrealized_pnl: float
    currency: str
    user_id: str
    updated_at: datetime
    # Enriched
    exchange_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Analytics Schemas
# ---------------------------------------------------------------------------

class AnalyticsResponse(BaseModel):
    """Schema for analytics data response."""

    total_pnl: float = Field(default=0.0, description="Total profit/loss")
    win_rate: float = Field(default=0.0, description="Win rate percentage")
    total_trades: int = Field(default=0, description="Total number of trades")
    profit_factor: float = Field(default=0.0, description="Profit factor")
    sharpe_ratio: float = Field(default=0.0, description="Sharpe ratio")
    max_drawdown: float = Field(default=0.0, description="Maximum drawdown percentage")
    avg_win: float = Field(default=0.0, description="Average winning trade P&L")
    avg_loss: float = Field(default=0.0, description="Average losing trade P&L")
    avg_trade_duration: float = Field(default=0.0, description="Average trade duration in minutes")
    best_trade: Optional[float] = Field(default=None, description="Best trade P&L")
    worst_trade: Optional[float] = Field(default=None, description="Worst trade P&L")
    consecutive_wins: int = Field(default=0, description="Maximum consecutive wins")
    consecutive_losses: int = Field(default=0, description="Maximum consecutive losses")
    records: List[Dict[str, Any]] = Field(default_factory=list, description="Analytics time series records")


class PerformanceMetrics(BaseModel):
    """Schema for detailed performance metrics."""

    period: str = Field(default="30d", description="Analysis period")
    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_duration_days: int = 0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    avg_win_loss_ratio: float = 0.0
    expectancy: float = 0.0
    calmar_ratio: float = 0.0
    kelly_criterion: float = 0.0
    value_at_risk_95: float = 0.0
    expected_shortfall: float = 0.0


# ---------------------------------------------------------------------------
# Notification Schemas
# ---------------------------------------------------------------------------

class NotificationSettings(BaseModel):
    """Schema for notification settings."""

    telegram_enabled: bool = Field(default=False, description="Enable Telegram notifications")
    discord_enabled: bool = Field(default=False, description="Enable Discord notifications")
    email_enabled: bool = Field(default=False, description="Enable email notifications")
    notify_trade_open: bool = Field(default=True, description="Notify on trade open")
    notify_trade_close: bool = Field(default=True, description="Notify on trade close")
    notify_profit: bool = Field(default=True, description="Notify on profit")
    notify_loss: bool = Field(default=True, description="Notify on loss")
    notify_drawdown: bool = Field(default=True, description="Notify on drawdown")
    notify_error: bool = Field(default=True, description="Notify on errors")
    notify_signal: bool = Field(default=False, description="Notify on new signals")


class NotificationResponse(BaseModel):
    """Schema for notification response."""

    id: str
    type: str
    platform: str
    message: str
    is_read: bool
    user_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationMarkRead(BaseModel):
    """Schema for marking notifications as read."""

    notification_ids: Optional[List[str]] = Field(
        default=None,
        description="Specific notification IDs to mark as read (None = mark all)",
    )


# ---------------------------------------------------------------------------
# Risk Schemas
# ---------------------------------------------------------------------------

class RiskSettingsSchema(BaseModel):
    """Schema for risk management settings."""

    max_position_size: float = Field(default=10000.0, ge=100, description="Max position size in USD")
    max_leverage: int = Field(default=20, ge=1, le=125, description="Maximum leverage")
    max_positions: int = Field(default=10, ge=1, le=100, description="Maximum concurrent positions")
    risk_per_trade: float = Field(default=0.02, ge=0.001, le=0.10, description="Risk per trade (fraction)")
    max_daily_loss: float = Field(default=5000.0, ge=0, description="Max daily loss in USD")
    max_drawdown: float = Field(default=0.10, ge=0.01, le=0.50, description="Max drawdown (fraction)")
    kill_switch_enabled: bool = Field(default=True, description="Enable kill switch")
    max_spread_bps: float = Field(default=10.0, ge=0, description="Max spread in basis points")
    slippage_protection: bool = Field(default=True, description="Enable slippage protection")
    max_slippage_pct: float = Field(default=0.5, ge=0, description="Max slippage percentage")
    volatility_filter: bool = Field(default=True, description="Enable volatility filter")
    atr_threshold: float = Field(default=2.0, ge=0, description="ATR threshold for volatility filter")


class RiskAssessment(BaseModel):
    """Schema for risk assessment result."""

    approved: bool = Field(..., description="Whether the trade passes risk checks")
    risk_score: float = Field(default=0.0, ge=0, le=100, description="Risk score (0=low, 100=high)")
    position_size: float = Field(default=0.0, description="Calculated position size")
    margin_required: float = Field(default=0.0, description="Required margin")
    max_loss: float = Field(default=0.0, description="Maximum potential loss")
    warnings: List[str] = Field(default_factory=list, description="Risk warnings")
    reasons: List[str] = Field(default_factory=list, description="Rejection reasons (if not approved)")


# ---------------------------------------------------------------------------
# Backtest Schemas
# ---------------------------------------------------------------------------

class BacktestConfig(BaseModel):
    """Schema for backtest configuration."""

    strategy_id: str = Field(..., description="Strategy ID to backtest")
    symbol: str = Field(
        ...,
        description="Trading symbol",
        examples=["BTC/USDT"],
    )
    timeframe: str = Field(
        default="1h",
        description="Candle timeframe",
        examples=["1m", "5m", "15m", "1h", "4h", "1d"],
    )
    start_date: datetime = Field(..., description="Backtest start date")
    end_date: datetime = Field(..., description="Backtest end date")
    initial_capital: float = Field(
        default=10000.0,
        ge=100,
        description="Initial capital in USD",
    )
    commission_rate: float = Field(
        default=0.001,
        ge=0,
        le=0.01,
        description="Commission rate per trade",
    )
    slippage: float = Field(
        default=0.0005,
        ge=0,
        le=0.01,
        description="Slippage per trade",
    )
    max_positions: int = Field(default=5, ge=1, description="Maximum concurrent positions")
    stop_loss_pct: Optional[float] = Field(default=None, description="Default stop loss percentage")
    take_profit_pct: Optional[float] = Field(default=None, description="Default take profit percentage")


class BacktestResultResponse(BaseModel):
    """Schema for backtest result response."""

    id: str
    strategy_id: str
    strategy_name: Optional[str] = None
    start_date: datetime
    end_date: datetime
    total_pnl: float
    win_rate: float
    profit_factor: float
    sharpe_ratio: float
    max_drawdown: float
    total_trades: int
    parameters: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    user_id: str
    # Extra computed fields
    total_pnl_pct: Optional[float] = None
    avg_trade_duration: Optional[float] = None
    expectancy: Optional[float] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Dashboard Schemas
# ---------------------------------------------------------------------------

class DashboardStats(BaseModel):
    """Schema for dashboard statistics."""

    total_balance: float = Field(default=0.0, description="Total account balance")
    today_pnl: float = Field(default=0.0, description="Today's profit/loss")
    today_pnl_pct: float = Field(default=0.0, description="Today's P&L percentage")
    win_rate: float = Field(default=0.0, description="Overall win rate percentage")
    total_trades: int = Field(default=0, description="Total number of trades")
    open_positions: int = Field(default=0, description="Number of open positions")
    pending_orders: int = Field(default=0, description="Number of pending orders")
    total_exposure: float = Field(default=0.0, description="Total market exposure")
    unrealized_pnl: float = Field(default=0.0, description="Total unrealized P&L")
    daily_pnl_series: List[Dict[str, Any]] = Field(
        default_factory=list, description="Daily P&L time series"
    )
    top_symbols: List[Dict[str, Any]] = Field(
        default_factory=list, description="Top performing symbols"
    )
    active_strategies: int = Field(default=0, description="Number of active strategies")
    active_exchanges: int = Field(default=0, description="Number of active exchanges")


# ---------------------------------------------------------------------------
# Settings Schemas
# ---------------------------------------------------------------------------

class GeneralSettings(BaseModel):
    """Schema for general application settings."""

    bot_name: str = Field(default="TradeAI Pro", description="Bot display name")
    default_exchange: Optional[str] = Field(default=None, description="Default exchange name")
    default_timeframe: str = Field(default="1h", description="Default timeframe")
    default_leverage: int = Field(default=10, ge=1, le=125, description="Default leverage")
    auto_start: bool = Field(default=False, description="Auto-start trading on boot")
    dark_mode: bool = Field(default=True, description="Enable dark mode")


class AllSettings(BaseModel):
    """Schema for all settings combined."""

    general: GeneralSettings = Field(default_factory=GeneralSettings)
    risk: RiskSettingsSchema = Field(default_factory=RiskSettingsSchema)
    notifications: NotificationSettings = Field(default_factory=NotificationSettings)


# ---------------------------------------------------------------------------
# Signal Schemas
# ---------------------------------------------------------------------------

class Signal(BaseModel):
    """Schema for a trading signal."""

    id: Optional[str] = None
    symbol: str = Field(..., description="Trading symbol")
    side: str = Field(..., description="Signal direction (BUY/SELL)")
    strategy_name: str = Field(..., description="Strategy that generated the signal")
    confidence: float = Field(default=0.5, ge=0, le=1, description="Signal confidence (0-1)")
    entry_price: Optional[float] = Field(default=None, description="Suggested entry price")
    stop_loss: Optional[float] = Field(default=None, description="Suggested stop loss")
    take_profit: Optional[float] = Field(default=None, description="Suggested take profit")
    timeframe: str = Field(default="1h", description="Signal timeframe")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Signal timestamp")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional signal metadata")


class FilteredSignal(BaseModel):
    """Schema for an AI-filtered trading signal."""

    original_signal: Signal = Field(..., description="Original unfiltered signal")
    is_approved: bool = Field(..., description="Whether the signal was approved")
    confidence: float = Field(..., description="Filtered confidence score")
    market_regime: str = Field(default="unknown", description="Detected market regime")
    trend_prediction: Optional[str] = Field(default=None, description="Predicted trend direction")
    reasons: List[str] = Field(default_factory=list, description="Approval/rejection reasons")
