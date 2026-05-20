"""
EMA MACD Crossover Strategy.

Combines EMA crossover signals with MACD confirmation and volume
analysis. Uses ATR-based dynamic stop loss and take profit levels.
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from strategies.base import BaseStrategy, Signal

logger = logging.getLogger(__name__)


class EMAMACDStrategy(BaseStrategy):
    """
    EMA Crossover + MACD Confirmation Strategy.

    Generates buy/sell signals based on:
    1. Fast EMA crossing above/below Slow EMA
    2. MACD histogram confirmation (same direction)
    3. Volume confirmation (above average)

    Uses ATR for dynamic SL/TP levels.

    Parameters:
        fast_ema: Fast EMA period (default: 9).
        slow_ema: Slow EMA period (default: 21).
        macd_fast: MACD fast EMA period (default: 12).
        macd_slow: MACD slow EMA period (default: 26).
        macd_signal: MACD signal period (default: 9).
        atr_period: ATR period for SL/TP calculation (default: 14).
        atr_multiplier_sl: ATR multiplier for stop loss (default: 1.5).
        atr_multiplier_tp: ATR multiplier for take profit (default: 3.0).
        volume_period: Volume SMA period (default: 20).
        min_confidence: Minimum confidence to generate signal (default: 0.6).
    """

    def __init__(
        self,
        fast_ema: int = 9,
        slow_ema: int = 21,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
        atr_period: int = 14,
        atr_multiplier_sl: float = 1.5,
        atr_multiplier_tp: float = 3.0,
        volume_period: int = 20,
        min_confidence: float = 0.6,
        **kwargs: Any,
    ) -> None:
        super().__init__(name="EMA MACD Crossover", **kwargs)
        self.fast_ema_period = fast_ema
        self.slow_ema_period = slow_ema
        self.macd_fast_period = macd_fast
        self.macd_slow_period = macd_slow
        self.macd_signal_period = macd_signal
        self.atr_period = atr_period
        self.atr_multiplier_sl = atr_multiplier_sl
        self.atr_multiplier_tp = atr_multiplier_tp
        self.volume_period = volume_period
        self.min_confidence = min_confidence

        # State tracking for crossover detection
        self._prev_ema_fast: Optional[float] = None
        self._prev_ema_slow: Optional[float] = None
        self._prev_macd_hist: Optional[float] = None

    async def calculate_signals(
        self,
        symbol: str,
        data: List[List[float]],
    ) -> List[Signal]:
        """
        Generate trading signals based on EMA MACD crossover.

        Args:
            symbol: Trading symbol.
            data: OHLCV data.

        Returns:
            List of Signal objects.
        """
        if not self.is_active or len(data) < max(self.slow_ema_period, self.macd_slow_period) + 5:
            return []

        signals: List[Signal] = []
        _, open_p, high_p, low_p, close_p, volume = self.extract_ohlcv(data)

        # Calculate indicators
        ema_fast = self.ema(close_p, self.fast_ema_period)
        ema_slow = self.ema(close_p, self.slow_ema_period)
        macd_line, signal_line, histogram = self.macd(
            close_p, self.macd_fast_period, self.macd_slow_period, self.macd_signal_period
        )
        atr_values = self.atr(high_p, low_p, close_p, self.atr_period)
        vol_sma = self.volume_sma(volume, self.volume_period)

        # Get the latest valid values
        current_idx = len(close_p) - 1
        prev_idx = current_idx - 1

        # Skip if any indicator is NaN
        if (
            np.isnan(ema_fast[current_idx]) or np.isnan(ema_slow[current_idx])
            or np.isnan(ema_fast[prev_idx]) or np.isnan(ema_slow[prev_idx])
            or np.isnan(histogram[current_idx]) or np.isnan(histogram[prev_idx])
            or np.isnan(atr_values[current_idx])
        ):
            return []

        current_fast = float(ema_fast[current_idx])
        current_slow = float(ema_slow[current_idx])
        prev_fast = float(ema_fast[prev_idx])
        prev_slow = float(ema_slow[prev_idx])
        current_hist = float(histogram[current_idx])
        prev_hist = float(histogram[prev_idx])
        current_close = float(close_p[current_idx])
        current_atr = float(atr_values[current_idx])
        current_vol = float(volume[current_idx])
        avg_vol = float(vol_sma[current_idx]) if not np.isnan(vol_sma[current_idx]) else current_vol

        # Detect EMA crossover
        bullish_cross = prev_fast <= prev_slow and current_fast > current_slow
        bearish_cross = prev_fast >= prev_slow and current_fast < current_slow

        # Check MACD confirmation
        macd_bullish = current_hist > 0 and prev_hist <= 0
        macd_bearish = current_hist < 0 and prev_hist >= 0

        # Check volume confirmation
        vol_confirms = current_vol > avg_vol * 0.8

        # Generate BUY signal (bullish crossover)
        if bullish_cross and macd_bullish:
            confidence = 0.5

            # Volume boost
            if vol_confirms:
                confidence += 0.15

            # MACD histogram strength
            hist_strength = min(abs(current_hist) / (current_close * 0.01), 1.0)
            confidence += hist_strength * 0.2

            # ATR-based SL/TP
            stop_loss = current_close - current_atr * self.atr_multiplier_sl
            take_profit = current_close + current_atr * self.atr_multiplier_tp

            confidence = min(confidence, 1.0)

            if confidence >= self.min_confidence:
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
                        "ema_fast": round(current_fast, 2),
                        "ema_slow": round(current_slow, 2),
                        "macd_hist": round(current_hist, 4),
                        "atr": round(current_atr, 2),
                        "volume_ratio": round(current_vol / avg_vol, 2) if avg_vol > 0 else 0,
                        "crossover_type": "bullish",
                    },
                )
                signals.append(signal)
                logger.info(
                    f"[{self.name}] BUY signal for {symbol}: "
                    f"price={current_close:.2f} confidence={confidence:.3f}"
                )

        # Generate SELL signal (bearish crossover)
        elif bearish_cross and macd_bearish:
            confidence = 0.5

            if vol_confirms:
                confidence += 0.15

            hist_strength = min(abs(current_hist) / (current_close * 0.01), 1.0)
            confidence += hist_strength * 0.2

            stop_loss = current_close + current_atr * self.atr_multiplier_sl
            take_profit = current_close - current_atr * self.atr_multiplier_tp

            confidence = min(confidence, 1.0)

            if confidence >= self.min_confidence:
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
                        "ema_fast": round(current_fast, 2),
                        "ema_slow": round(current_slow, 2),
                        "macd_hist": round(current_hist, 4),
                        "atr": round(current_atr, 2),
                        "volume_ratio": round(current_vol / avg_vol, 2) if avg_vol > 0 else 0,
                        "crossover_type": "bearish",
                    },
                )
                signals.append(signal)
                logger.info(
                    f"[{self.name}] SELL signal for {symbol}: "
                    f"price={current_close:.2f} confidence={confidence:.3f}"
                )

        # Update state
        self._prev_ema_fast = current_fast
        self._prev_ema_slow = current_slow
        self._prev_macd_hist = current_hist

        return signals

    async def on_bar(self, symbol: str, bar: List[float]) -> None:
        """
        Process a new bar and update strategy state.

        Args:
            symbol: Trading symbol.
            bar: Single candle [timestamp, open, high, low, close, volume].
        """
        close = bar[4]
        # Recalculate EMAs could be done here for more accurate state tracking
        pass

    def get_stop_loss(self, entry_price: float, side: str) -> float:
        """
        Calculate ATR-based stop loss.

        Args:
            entry_price: Entry price.
            side: Trade side.

        Returns:
            Stop loss price.
        """
        # Default fallback if ATR is not available
        atr_estimate = entry_price * 0.015  # ~1.5% estimate
        if side == "BUY":
            return entry_price - atr_estimate * self.atr_multiplier_sl
        else:
            return entry_price + atr_estimate * self.atr_multiplier_sl

    def get_take_profit(self, entry_price: float, side: str) -> float:
        """
        Calculate ATR-based take profit.

        Args:
            entry_price: Entry price.
            side: Trade side.

        Returns:
            Take profit price.
        """
        atr_estimate = entry_price * 0.015
        if side == "BUY":
            return entry_price + atr_estimate * self.atr_multiplier_tp
        else:
            return entry_price - atr_estimate * self.atr_multiplier_tp
