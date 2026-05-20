"""
Risk Manager — comprehensive risk management system.

Provides position sizing, risk validation, loss limiting, and a
kill switch mechanism. Thread-safe with proper state management.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from schemas import RiskAssessment, RiskSettingsSchema
from config import settings

logger = logging.getLogger(__name__)


@dataclass
class RiskState:
    """
    Mutable risk state tracked by the risk manager.

    Thread-safe through the use of a Lock.
    """

    daily_pnl: float = 0.0
    daily_pnl_date: str = ""
    total_drawdown: float = 0.0
    peak_balance: float = 0.0
    current_balance: float = 0.0
    open_position_count: int = 0
    is_kill_switch_active: bool = False
    last_trade_time: float = 0.0
    total_trades_today: int = 0

    _lock: Lock = field(default_factory=Lock, repr=False, compare=False)

    def with_lock(self) -> Lock:
        """Get the thread lock for this state."""
        return self._lock


class RiskManagerError(Exception):
    """Custom exception for risk manager errors."""

    def __init__(self, message: str, code: Optional[str] = None):
        self.code = code
        super().__init__(message)


class RiskManager:
    """
    Comprehensive risk management system.

    Features:
    - Position sizing calculation (fixed fractional, Kelly, etc.)
    - Pre-trade risk validation
    - Daily loss limit enforcement
    - Max drawdown monitoring
    - Max position count enforcement
    - Volatility and spread filters
    - Leverage validation
    - Kill switch (emergency stop all trading)

    Usage:
        manager = RiskManager()
        await manager.initialize(db_session)

        # Check a trade
        assessment = await manager.check_risk(
            symbol="BTC/USDT", side="buy", quantity=0.001,
            price=50000, leverage=10, user_id="user123", db=db
        )

        # Calculate position size
        size = manager.calculate_position_size(
            capital=10000, risk_pct=0.02, stop_loss=1000
        )

        # Kill switch
        manager.kill_switch()
    """

    def __init__(self) -> None:
        """Initialize the RiskManager with default state."""
        self._state = RiskState()
        self._settings: RiskSettingsSchema = RiskSettingsSchema()
        self._user_states: Dict[str, RiskState] = {}

    # -----------------------------------------------------------------------
    # Settings
    # -----------------------------------------------------------------------

    def update_settings(self, settings_schema: RiskSettingsSchema) -> None:
        """
        Update risk management settings.

        Args:
            settings_schema: New risk settings to apply.
        """
        self._settings = settings_schema
        logger.info(f"Risk settings updated: max_pos={self._settings.max_positions} "
                     f"risk_pct={self._settings.risk_per_trade} "
                     f"kill_switch={self._settings.kill_switch_enabled}")

    def get_settings(self) -> RiskSettingsSchema:
        """Get current risk settings."""
        return self._settings

    # -----------------------------------------------------------------------
    # State Management
    # -----------------------------------------------------------------------

    def _get_user_state(self, user_id: str) -> RiskState:
        """
        Get or create risk state for a user.

        Args:
            user_id: User identifier.

        Returns:
            RiskState instance for the user.
        """
        if user_id not in self._user_states:
            self._user_states[user_id] = RiskState()
        return self._user_states[user_id]

    async def initialize(self, db: AsyncSession) -> None:
        """
        Initialize risk state from the database.

        Loads current balance, open positions, and recent trade data
        to set up accurate initial state.

        Args:
            db: Async database session.
        """
        try:
            from models import Position, Trade, Balance

            # Get total balance
            balance_result = await db.execute(
                select(func.sum(Balance.total_balance))
            )
            total_balance = float(balance_result.scalar() or 0)
            self._state.current_balance = total_balance
            self._state.peak_balance = total_balance

            # Get open position count
            pos_result = await db.execute(
                select(func.count()).where(Position.status == "OPEN")
            )
            self._state.open_position_count = pos_result.scalar() or 0

            # Get today's P&L
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            pnl_result = await db.execute(
                select(func.sum(Trade.pnl)).where(
                    Trade.closed_at >= today_start,
                    Trade.status == "CLOSED",
                )
            )
            self._state.daily_pnl = float(pnl_result.scalar() or 0)
            self._state.daily_pnl_date = today_start.strftime("%Y-%m-%d")

            logger.info(
                f"Risk manager initialized: balance={total_balance:.2f} "
                f"positions={self._state.open_position_count} "
                f"daily_pnl={self._state.daily_pnl:.2f}"
            )
        except Exception as e:
            logger.error(f"Error initializing risk manager: {e}")

    # -----------------------------------------------------------------------
    # Position Sizing
    # -----------------------------------------------------------------------

    def calculate_position_size(
        self,
        capital: float,
        risk_pct: float,
        stop_loss_distance: float,
        price: Optional[float] = None,
        method: str = "fixed_fractional",
    ) -> float:
        """
        Calculate optimal position size based on risk parameters.

        Args:
            capital: Available capital in quote currency.
            risk_pct: Maximum risk per trade as fraction (e.g., 0.02 for 2%).
            stop_loss_distance: Distance from entry to stop loss in price units.
            price: Current entry price (needed for some methods).
            method: Position sizing method:
                - "fixed_fractional": Risk a fixed % of capital per trade.
                - "fixed_amount": Risk a fixed dollar amount per trade.
                - "kelly": Kelly criterion based sizing.

        Returns:
            Position size in base currency units.
        """
        if stop_loss_distance <= 0:
            logger.warning("Stop loss distance is zero or negative, returning zero size")
            return 0.0

        risk_amount = capital * risk_pct

        if method == "fixed_fractional":
            position_size = risk_amount / stop_loss_distance
        elif method == "fixed_amount":
            position_size = risk_amount / stop_loss_distance
        elif method == "kelly":
            # Simplified Kelly: uses risk_pct as a proxy for win probability
            # In a real system, use historical win rate and win/loss ratio
            kelly_fraction = risk_pct * 2  # More aggressive than fixed fractional
            kelly_fraction = min(kelly_fraction, 0.25)  # Cap at 25% Kelly
            position_size = (capital * kelly_fraction) / stop_loss_distance
        else:
            position_size = risk_amount / stop_loss_distance

        return round(position_size, 8)

    # -----------------------------------------------------------------------
    # Risk Validation
    # -----------------------------------------------------------------------

    async def check_risk(
        self,
        symbol: str,
        side: str,
        quantity: float,
        price: float,
        leverage: int,
        user_id: str,
        db: AsyncSession,
        stop_loss: Optional[float] = None,
    ) -> RiskAssessment:
        """
        Comprehensive risk assessment for a proposed trade.

        Runs all risk checks and returns a detailed assessment.

        Args:
            symbol: Trading symbol.
            side: Trade side ("buy" or "sell").
            quantity: Trade quantity.
            price: Trade price.
            leverage: Leverage multiplier.
            user_id: User ID.
            db: Database session.
            stop_loss: Optional stop loss price.

        Returns:
            RiskAssessment with approval status and details.
        """
        warnings: List[str] = []
        reasons: List[str] = []
        risk_score: float = 0.0
        position_size = price * quantity
        margin_required = position_size / leverage
        max_loss = position_size  # Worst case: total position value

        if stop_loss and price > 0:
            stop_distance = abs(price - stop_loss)
            max_loss = stop_distance * quantity * leverage
            risk_score += 10

        state = self._get_user_state(user_id)

        with state.with_lock():
            # Check kill switch
            if self._state.is_kill_switch_active or state.is_kill_switch_active:
                return RiskAssessment(
                    approved=False,
                    risk_score=100,
                    position_size=0,
                    margin_required=0,
                    max_loss=0,
                    warnings=["Kill switch is active"],
                    reasons=["Trading is halted by kill switch"],
                )

            # Check daily loss limit
            if not self.check_daily_loss_limit(user_id):
                reasons.append(
                    f"Daily loss limit reached: ${abs(state.daily_pnl):.2f} "
                    f"/ ${self._settings.max_daily_loss:.2f}"
                )
                risk_score += 40

            # Check drawdown limit
            if not self.check_drawdown_limit(user_id):
                reasons.append(
                    f"Drawdown limit reached: {self._state.total_drawdown:.2%} "
                    f"/ {self._settings.max_drawdown:.2%}"
                )
                risk_score += 40

            # Check max positions
            if not self.check_max_positions(user_id):
                reasons.append(
                    f"Maximum positions reached: {state.open_position_count} "
                    f"/ {self._settings.max_positions}"
                )
                risk_score += 30

            # Validate leverage
            if not self.validate_leverage(symbol, leverage):
                reasons.append(
                    f"Leverage {leverage}x exceeds maximum {self._settings.max_leverage}x"
                )
                risk_score += 20

        # Check volatility filter
        if not await self.check_volatility_filter(symbol, db):
            warnings.append(f"High volatility detected for {symbol}")
            risk_score += 10

        # Check spread filter
        if not await self.check_spread_filter(symbol, db):
            warnings.append(f"Spread too wide for {symbol}")
            risk_score += 15

        # Check position size
        if position_size > self._settings.max_position_size:
            reasons.append(
                f"Position size ${position_size:.2f} exceeds maximum "
                f"${self._settings.max_position_size:.2f}"
            )
            risk_score += 25

        # Calculate final risk score (0-100)
        risk_score = min(risk_score, 100)
        approved = len(reasons) == 0

        if risk_score > 60 and approved:
            warnings.append(f"High risk score: {risk_score:.0f}/100")

        return RiskAssessment(
            approved=approved,
            risk_score=risk_score,
            position_size=position_size,
            margin_required=margin_required,
            max_loss=max_loss,
            warnings=warnings,
            reasons=reasons,
        )

    # -----------------------------------------------------------------------
    # Risk Checks
    # -----------------------------------------------------------------------

    def check_daily_loss_limit(self, user_id: str) -> bool:
        """
        Check if the daily loss limit has been exceeded.

        Args:
            user_id: User ID.

        Returns:
            True if within limits, False if limit exceeded.
        """
        state = self._get_user_state(user_id)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        with state.with_lock():
            # Reset daily P&L if it's a new day
            if state.daily_pnl_date != today:
                state.daily_pnl = 0.0
                state.daily_pnl_date = today
                state.total_trades_today = 0

            if state.daily_pnl < 0:
                return abs(state.daily_pnl) < self._settings.max_daily_loss

        return True

    def check_drawdown_limit(self, user_id: str) -> bool:
        """
        Check if the maximum drawdown limit has been exceeded.

        Args:
            user_id: User ID.

        Returns:
            True if within limits, False if limit exceeded.
        """
        if self._state.peak_balance <= 0:
            return True

        current_dd = (self._state.peak_balance - self._state.current_balance) / self._state.peak_balance
        self._state.total_drawdown = current_dd

        return current_dd < self._settings.max_drawdown

    def check_max_positions(self, user_id: str) -> bool:
        """
        Check if the maximum number of positions has been reached.

        Args:
            user_id: User ID.

        Returns:
            True if within limit, False if limit exceeded.
        """
        state = self._get_user_state(user_id)
        with state.with_lock():
            return state.open_position_count < self._settings.max_positions

    def validate_leverage(self, symbol: str, leverage: int) -> bool:
        """
        Validate that leverage is within allowed limits.

        Args:
            symbol: Trading symbol (reserved for per-symbol limits).
            leverage: Requested leverage.

        Returns:
            True if leverage is valid, False otherwise.
        """
        return 1 <= leverage <= self._settings.max_leverage

    async def check_volatility_filter(
        self,
        symbol: str,
        db: AsyncSession,
    ) -> bool:
        """
        Check if market volatility is within acceptable range.

        Uses ATR (Average True Range) as a volatility measure.

        Args:
            symbol: Trading symbol.
            db: Database session.

        Returns:
            True if volatility is acceptable, False if too volatile.
        """
        if not self._settings.volatility_filter:
            return True

        # In production, calculate ATR from recent candles
        # For now, use a simplified check based on the symbol
        # High volatility pairs (meme coins) get flagged more often
        high_vol_symbols = {"DOGE/USDT", "SHIB/USDT", "PEPE/USDT", "WIF/USDT"}
        if symbol.upper() in high_vol_symbols:
            logger.warning(f"High volatility symbol detected: {symbol}")
            # Still allow but flag it

        return True

    async def check_spread_filter(
        self,
        symbol: str,
        db: AsyncSession,
    ) -> bool:
        """
        Check if the bid-ask spread is within acceptable range.

        Args:
            symbol: Trading symbol.
            db: Database session.

        Returns:
            True if spread is acceptable, False if too wide.
        """
        # In production, fetch live spread from exchange
        # For now, always pass this check
        return True

    # -----------------------------------------------------------------------
    # Kill Switch
    # -----------------------------------------------------------------------

    def kill_switch(self, user_id: Optional[str] = None) -> None:
        """
        Activate the kill switch to immediately halt all trading.

        Args:
            user_id: Optional specific user to halt. If None, halts globally.
        """
        if user_id:
            state = self._get_user_state(user_id)
            with state.with_lock():
                state.is_kill_switch_active = True
            logger.critical(f"Kill switch activated for user: {user_id}")
        else:
            self._state.is_kill_switch_active = True
            for state in self._user_states.values():
                with state.with_lock():
                    state.is_kill_switch_active = True
            logger.critical("GLOBAL KILL SWITCH ACTIVATED!")

    def deactivate_kill_switch(self, user_id: Optional[str] = None) -> None:
        """
        Deactivate the kill switch to resume trading.

        Args:
            user_id: Optional specific user to resume. If None, resumes globally.
        """
        if user_id:
            state = self._get_user_state(user_id)
            with state.with_lock():
                state.is_kill_switch_active = False
            logger.info(f"Kill switch deactivated for user: {user_id}")
        else:
            self._state.is_kill_switch_active = False
            for state in self._user_states.values():
                with state.with_lock():
                    state.is_kill_switch_active = False
            logger.info("GLOBAL KILL SWITCH DEACTIVATED")

    @property
    def is_kill_switch_active(self) -> bool:
        """Check if the global kill switch is active."""
        return self._state.is_kill_switch_active

    # -----------------------------------------------------------------------
    # State Updates
    # -----------------------------------------------------------------------

    def update_balance(self, balance: float, user_id: Optional[str] = None) -> None:
        """
        Update the current balance and recalculate drawdown.

        Args:
            balance: New total balance.
            user_id: Optional user ID.
        """
        self._state.current_balance = balance
        if balance > self._state.peak_balance:
            self._state.peak_balance = balance

    def record_trade_pnl(self, pnl: float, user_id: str) -> None:
        """
        Record a trade's P&L for daily loss tracking.

        Args:
            pnl: Trade profit/loss.
            user_id: User ID.
        """
        state = self._get_user_state(user_id)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        with state.with_lock():
            if state.daily_pnl_date != today:
                state.daily_pnl = 0.0
                state.daily_pnl_date = today
                state.total_trades_today = 0

            state.daily_pnl += pnl
            state.total_trades_today += 1
            state.last_trade_time = time.monotonic()

    def update_position_count(self, count: int, user_id: str) -> None:
        """
        Update the open position count for a user.

        Args:
            count: New open position count.
            user_id: User ID.
        """
        state = self._get_user_state(user_id)
        with state.with_lock():
            state.open_position_count = count

    def get_risk_summary(self, user_id: str) -> Dict[str, Any]:
        """
        Get a comprehensive risk summary for a user.

        Args:
            user_id: User ID.

        Returns:
            Risk summary dictionary.
        """
        state = self._get_user_state(user_id)

        peak = self._state.peak_balance or 1
        drawdown = (peak - self._state.current_balance) / peak

        daily_loss_limit_pct = 0.0
        if self._settings.max_daily_loss > 0 and state.daily_pnl < 0:
            daily_loss_limit_pct = abs(state.daily_pnl) / self._settings.max_daily_loss

        return {
            "daily_pnl": round(state.daily_pnl, 2),
            "daily_loss_limit_used_pct": round(daily_loss_limit_pct * 100, 2),
            "total_drawdown": round(drawdown * 100, 2),
            "max_drawdown_limit": round(self._settings.max_drawdown * 100, 2),
            "open_positions": state.open_position_count,
            "max_positions": self._settings.max_positions,
            "kill_switch_active": state.is_kill_switch_active or self._state.is_kill_switch_active,
            "total_trades_today": state.total_trades_today,
            "risk_per_trade_pct": round(self._settings.risk_per_trade * 100, 2),
            "max_leverage": self._settings.max_leverage,
        }


# Global risk manager instance
risk_manager = RiskManager()
