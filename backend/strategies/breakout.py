"""
Breakout Detection Strategy.

Identifies breakouts from consolidation zones using volume spike
detection and ATR-based dynamic stop loss and take profit levels.
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from strategies.base import BaseStrategy, Signal

logger = logging.getLogger(__name__)


class BreakoutStrategy(BaseStrategy):
    """
    Breakout Detection Strategy.

    Identifies breakouts from price consolidation zones:
    1. Detects consolidation (low ATR / narrow Bollinger Bands)
    2. Monitors for volume spikes on breakout candles
    3. Confirms breakout with close outside the range
    4. Uses ATR for dynamic SL/TP

    Parameters:
        lookback: Consolidation detection lookback period (default: 20).
        min_range_pct: Minimum range to qualify as consolidation (default: 1.5%).
        volume_threshold: Volume spike multiplier vs average (default: 2.0).
        atr_period: ATR period (default: 14).
        atr_sl_multiplier: ATR multiplier for stop loss (default: 2.0).
        atr_tp_multiplier: ATR multiplier for take profit (default: 3.0).
        confirmation_bars: Bars to wait for confirmation (default: 1).
        min_breakout_pct: Minimum breakout percentage (default: 0.5%).
    """

    def __init__(
        self,
        lookback: int = 20,
        min_range_pct: float = 1.5,
        volume_threshold: float = 2.0,
        atr_period: int = 14,
        atr_sl_multiplier: float = 2.0,
        atr_tp_multiplier: float = 3.0,
        confirmation_bars: int = 1,
        min_breakout_pct: float = 0.5,
        **kwargs: Any,
    ) -> None:
        super().__init__(name="Breakout Hunter", **kwargs)
        self.lookback = lookback
        self.min_range_pct = min_range_pct / 100
        self.volume_threshold = volume_threshold
        self.atr_period = atr_period
        self.atr_sl_multiplier = atr_sl_multiplier
        self.atr_tp_multiplier = atr_tp_multiplier
        self.confirmation_bars = confirmation_bars
        self.min_breakout_pct = min_breakout_pct / 100

        # State: track detected consolidation ranges
        self._consolidation_high: Optional[float] = None
        self._consolidation_low: Optional[float] = None
        self._pending_breakout: Optional[str] = None  # "UP" or "DOWN"
        self._confirmation_count: int = 0

    async def calculate_signals(
        self,
        symbol: str,
        data: List[List[float]],
    ) -> List[Signal]:
        """
        Generate breakout signals.

        Args:
            symbol: Trading symbol.
            data: OHLCV data.

        Returns:
            List of Signal objects.
        """
        if not self.is_active or len(data) < self.lookback + 10:
            return []

        signals: List[Signal] = []
        _, _, high_p, low_p, close_p, volume = self.extract_ohlcv(data)

        # Calculate ATR and volume average
        atr_values = self.atr(high_p, low_p, close_p, self.atr_period)

        current_idx = len(close_p) - 1
        prev_idx = current_idx - 1

        if np.isnan(atr_values[current_idx]):
            return []

        current_close = float(close_p[current_idx])
        current_high = float(high_p[current_idx])
        current_low = float(low_p[current_idx])
        current_vol = float(volume[current_idx])
        current_atr = float(atr_values[current_idx])

        # Get consolidation window (previous lookback bars, excluding current)
        start_idx = max(0, current_idx - self.lookback - 1)
        end_idx = current_idx
        window_high = float(np.max(high_p[start_idx:end_idx]))
        window_low = float(np.min(low_p[start_idx:end_idx]))
        window_close = float(np.mean(close_p[start_idx:end_idx]))

        # Calculate consolidation metrics
        range_pct = (window_high - window_low) / window_close if window_close > 0 else 0
        avg_vol = float(np.mean(volume[start_idx:end_idx]))

        # Detect consolidation
        is_consolidating = range_pct < self.min_range_pct

        if is_consolidating:
            self._consolidation_high = window_high
            self._consolidation_low = window_low
            self._pending_breakout = None
            self._confirmation_count = 0
            return []

        # Check for breakout if we have a consolidation range
        if self._consolidation_high is None or self._consolidation_low is None:
            return []

        # Volume spike detection
        vol_spike = current_vol > avg_vol * self.volume_threshold if avg_vol > 0 else False

        # Bullish breakout: close above consolidation high
        if current_close > self._consolidation_high and current_high > self._consolidation_high:
            breakout_pct = (current_close - self._consolidation_high) / self._consolidation_high

            if breakout_pct >= self.min_breakout_pct:
                if self._pending_breakout == "UP":
                    self._confirmation_count += 1
                else:
                    self._pending_breakout = "UP"
                    self._confirmation_count = 1

                if self._confirmation_count >= self.confirmation_bars:
                    confidence = 0.5

                    # Volume confirmation boost
                    if vol_spike:
                        confidence += 0.2

                    # Breakout strength boost
                    strength = min(breakout_pct / (current_atr / current_close), 1.0) if current_close > 0 else 0
                    confidence += strength * 0.15

                    # Range width boost (tighter range = stronger breakout)
                    if range_pct < self.min_range_pct * 1.5:
                        confidence += 0.1

                    confidence = min(confidence, 1.0)

                    if confidence >= 0.6:
                        stop_loss = self._consolidation_high - current_atr * self.atr_sl_multiplier
                        take_profit = current_close + current_atr * self.atr_tp_multiplier

                        signal = Signal(
                            symbol=symbol,
                            side="BUY",
                            strategy_name=self.name,
                            confidence=round(confidence, 3),
                            entry_price=current_close,
                            stop_loss=round(stop_loss, 2),
                            take_profit=round(take_profit, 2),
                            signal_type="ENTRY",
                            timeframe=self.timeframe,
                            metadata={
                                "breakout_type": "bullish",
                                "consolidation_high": round(self._consolidation_high, 2),
                                "consolidation_low": round(self._consolidation_low, 2),
                                "breakout_pct": round(breakout_pct * 100, 2),
                                "range_pct": round(range_pct * 100, 2),
                                "volume_ratio": round(current_vol / avg_vol, 2) if avg_vol > 0 else 0,
                                "atr": round(current_atr, 2),
                            },
                        )
                        signals.append(signal)
                        logger.info(
                            f"[{self.name}] BULLISH breakout for {symbol}: "
                            f"price={current_close:.2f} conf={confidence:.3f}"
                        )

                    # Reset
                    self._pending_breakout = None
                    self._confirmation_count = 0

        # Bearish breakout: close below consolidation low
        elif current_close < self._consolidation_low and current_low < self._consolidation_low:
            breakout_pct = (self._consolidation_low - current_close) / self._consolidation_low

            if breakout_pct >= self.min_breakout_pct:
                if self._pending_breakout == "DOWN":
                    self._confirmation_count += 1
                else:
                    self._pending_breakout = "DOWN"
                    self._confirmation_count = 1

                if self._confirmation_count >= self.confirmation_bars:
                    confidence = 0.5

                    if vol_spike:
                        confidence += 0.2

                    strength = min(breakout_pct / (current_atr / current_close), 1.0) if current_close > 0 else 0
                    confidence += strength * 0.15

                    if range_pct < self.min_range_pct * 1.5:
                        confidence += 0.1

                    confidence = min(confidence, 1.0)

                    if confidence >= 0.6:
                        stop_loss = self._consolidation_low + current_atr * self.atr_sl_multiplier
                        take_profit = current_close - current_atr * self.atr_tp_multiplier

                        signal = Signal(
                            symbol=symbol,
                            side="SELL",
                            strategy_name=self.name,
                            confidence=round(confidence, 3),
                            entry_price=current_close,
                            stop_loss=round(stop_loss, 2),
                            take_profit=round(take_profit, 2),
                            signal_type="ENTRY",
                            timeframe=self.timeframe,
                            metadata={
                                "breakout_type": "bearish",
                                "consolidation_high": round(self._consolidation_high, 2),
                                "consolidation_low": round(self._consolidation_low, 2),
                                "breakout_pct": round(breakout_pct * 100, 2),
                                "range_pct": round(range_pct * 100, 2),
                                "volume_ratio": round(current_vol / avg_vol, 2) if avg_vol > 0 else 0,
                                "atr": round(current_atr, 2),
                            },
                        )
                        signals.append(signal)
                        logger.info(
                            f"[{self.name}] BEARISH breakout for {symbol}: "
                            f"price={current_close:.2f} conf={confidence:.3f}"
                        )

                    self._pending_breakout = None
                    self._confirmation_count = 0

        return signals

    async def should_exit(
        self,
        position: Any,
        data: List[List[float]],
    ) -> bool:
        """
        Check if breakout trade should be exited on failed breakout.

        Args:
            position: Open position.
            data: Current OHLCV data.

        Returns:
            True if position should be closed.
        """
        if len(data) < 5 or self._consolidation_high is None:
            return False

        _, _, _, _, close_p, _ = self.extract_ohlcv(data)
        current_close = float(close_p[-1])

        # Failed breakout: price returns below consolidation high for long
        if hasattr(position, "side") and hasattr(position, "entry_price"):
            if position.side.value == "LONG" and current_close < self._consolidation_high:
                return True
            elif position.side.value == "SHORT" and current_close > self._consolidation_low:
                return True

        return False

    def get_stop_loss(self, entry_price: float, side: str) -> float:
        """Calculate ATR-based stop loss for breakout trades."""
        atr_est = entry_price * 0.015
        if side == "BUY":
            return entry_price - atr_est * self.atr_sl_multiplier
        else:
            return entry_price + atr_est * self.atr_sl_multiplier

    def get_take_profit(self, entry_price: float, side: str) -> float:
        """Calculate ATR-based take profit for breakout trades."""
        atr_est = entry_price * 0.015
        if side == "BUY":
            return entry_price + atr_est * self.atr_tp_multiplier
        else:
            return entry_price - atr_est * self.atr_tp_multiplier
