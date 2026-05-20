"""
MA Cross + Momentum + RSI + MACD Confluence Strategy.

A multi-indicator confluence strategy ported from TradingView Pine Script v5.

Generates signals when ALL of the following conditions align simultaneously:

**Long Entry:**
  1. 9 EMA crosses ABOVE 21 EMA (bullish EMA crossover)
  2. MACD line > MACD Signal line (MACD bullish)
  3. Momentum > 0 (positive momentum / price above N-periods ago)
  4. RSI > Bull Zone (55) AND RSI < 75 (strong but not overbought)

**Short Entry:**
  1. 9 EMA crosses BELOW 21 EMA (bearish EMA crossover)
  2. MACD line < MACD Signal line (MACD bearish)
  3. Momentum < 0 (negative momentum / price below N-periods ago)
  4. RSI < Bear Zone (45) AND RSI > 25 (weak but not oversold)

**Risk Management:**
  - Stop Loss: 0.5% below/above the 21 EMA
  - Take Profit: Entry + (Entry - SL) * Risk:Reward ratio (default 1.5)
  - Early Exit: Close position if MACD crosses back OR momentum reverses

Parameters:
    ema_fast (int): Fast EMA period (default: 9).
    ema_slow (int): Slow EMA period (default: 21).
    macd_fast (int): MACD fast EMA period (default: 12).
    macd_slow (int): MACD slow EMA period (default: 26).
    macd_signal (int): MACD signal period (default: 9).
    rsi_length (int): RSI calculation period (default: 14).
    rsi_bull_zone (int): RSI bullish entry threshold (default: 55).
    rsi_bear_zone (int): RSI bearish entry threshold (default: 45).
    momentum_length (int): Momentum lookback period (default: 14).
    rr_ratio (float): Risk-to-reward ratio for take profit (default: 1.5).
    sl_percent (float): Stop loss percentage offset from slow EMA (default: 0.005).
    min_confidence (float): Minimum signal confidence threshold (default: 0.7).
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from strategies.base import BaseStrategy, Signal

logger = logging.getLogger(__name__)


class ConfluenceStrategy(BaseStrategy):
    """
    MA Cross + Momentum + RSI + MACD Confluence Strategy.

    Requires all four indicators to align before generating a signal.
    Uses EMA-based stop loss with configurable risk-to-reward ratio.
    Includes early exit logic when momentum or MACD reverses.
    """

    def __init__(
        self,
        ema_fast: int = 9,
        ema_slow: int = 21,
        macd_fast: int = 12,
        macd_slow: int = 26,
        macd_signal: int = 9,
        rsi_length: int = 14,
        rsi_bull_zone: int = 55,
        rsi_bear_zone: int = 45,
        momentum_length: int = 14,
        rr_ratio: float = 1.5,
        sl_percent: float = 0.005,
        min_confidence: float = 0.7,
        **kwargs: Any,
    ) -> None:
        super().__init__(name="MA Cross + Momentum + RSI + MACD Confluence", **kwargs)
        self.ema_fast_period = ema_fast
        self.ema_slow_period = ema_slow
        self.macd_fast_period = macd_fast
        self.macd_slow_period = macd_slow
        self.macd_signal_period = macd_signal
        self.rsi_length = rsi_length
        self.rsi_bull_zone = rsi_bull_zone
        self.rsi_bear_zone = rsi_bear_zone
        self.momentum_length = momentum_length
        self.rr_ratio = rr_ratio
        self.sl_percent = sl_percent
        self.min_confidence = min_confidence

        # State for early exit detection
        self._prev_macd_line: Optional[float] = None
        self._prev_signal_line: Optional[float] = None
        self._prev_momentum: Optional[float] = None
        self._position_side: Optional[str] = None  # Track current position direction

    @staticmethod
    def momentum(data: np.ndarray, period: int) -> np.ndarray:
        """
        Calculate momentum indicator (close - close[N periods ago]).

        Equivalent to Pine Script: momVal = close - ta.valuewhen(true, close, momLen)

        Args:
            data: Array of closing prices.
            period: Lookback period.

        Returns:
            Array of momentum values.
        """
        if len(data) < period + 1:
            return np.full_like(data, np.nan, dtype=float)

        result = np.full_like(data, np.nan, dtype=float)
        for i in range(period, len(data)):
            result[i] = data[i] - data[i - period]
        return result

    async def calculate_signals(
        self,
        symbol: str,
        data: List[List[float]],
    ) -> List[Signal]:
        """
        Calculate trading signals using multi-indicator confluence.

        All four conditions must be true simultaneously for a signal:
        1. EMA crossover (9 EMA x 21 EMA)
        2. MACD direction confirmation
        3. Momentum direction confirmation
        4. RSI zone filter

        Args:
            symbol: Trading symbol (e.g., "BTC/USDT").
            data: OHLCV data as list of [timestamp, open, high, low, close, volume].

        Returns:
            List of Signal objects.
        """
        min_data = max(
            self.ema_slow_period,
            self.macd_slow_period + self.macd_signal_period,
            self.rsi_length + 1,
            self.momentum_length + 1,
        ) + 5

        if not self.is_active or len(data) < min_data:
            return []

        signals: List[Signal] = []
        _, _, _, _, close_p, _ = self.extract_ohlcv(data)

        # ── Calculate all indicators ──
        ema_fast = self.ema(close_p, self.ema_fast_period)
        ema_slow = self.ema(close_p, self.ema_slow_period)
        macd_line, signal_line, _ = self.macd(
            close_p, self.macd_fast_period, self.macd_slow_period, self.macd_signal_period
        )
        rsi_val = self.rsi(close_p, self.rsi_length)
        mom_val = self.momentum(close_p, self.momentum_length)

        # ── Get current and previous bar values ──
        current_idx = len(close_p) - 1
        prev_idx = current_idx - 1

        # Validate all indicators have valid values
        required_values = [
            ema_fast[current_idx], ema_slow[current_idx],
            ema_fast[prev_idx], ema_slow[prev_idx],
            macd_line[current_idx], signal_line[current_idx],
            rsi_val[current_idx], mom_val[current_idx],
        ]

        if any(np.isnan(v) for v in required_values):
            return []

        curr_fast = float(ema_fast[current_idx])
        curr_slow = float(ema_slow[current_idx])
        prev_fast = float(ema_fast[prev_idx])
        prev_slow = float(ema_slow[prev_idx])
        curr_macd = float(macd_line[current_idx])
        curr_signal = float(signal_line[current_idx])
        curr_rsi = float(rsi_val[current_idx])
        curr_mom = float(mom_val[current_idx])
        curr_close = float(close_p[current_idx])

        # ── Detect EMA crossover ──
        # ta.crossover(emaFast, emaSlow): prev fast <= prev slow AND curr fast > curr slow
        ma_long_cross = (prev_fast <= prev_slow) and (curr_fast > curr_slow)
        # ta.crossunder(emaFast, emaSlow): prev fast >= prev slow AND curr fast < curr slow
        ma_short_cross = (prev_fast >= prev_slow) and (curr_fast < curr_slow)

        # ── MACD condition ──
        macd_long = curr_macd > curr_signal    # MACD line above signal = bullish
        macd_short = curr_macd < curr_signal   # MACD line below signal = bearish

        # ── Momentum condition ──
        mom_long = curr_mom > 0    # Positive momentum
        mom_short = curr_mom < 0   # Negative momentum

        # ── RSI condition ──
        rsi_long = (curr_rsi > self.rsi_bull_zone) and (curr_rsi < 75)   # Strong but not overbought
        rsi_short = (curr_rsi < self.rsi_bear_zone) and (curr_rsi > 25)  # Weak but not oversold

        # ── Generate Long Signal ──
        long_condition = ma_long_cross and macd_long and mom_long and rsi_long

        if long_condition:
            # Stop loss: 0.5% below 21 EMA
            sl = curr_slow * (1 - self.sl_percent)
            # Take profit based on R:R ratio
            risk = curr_close - sl
            tp = curr_close + (risk * self.rr_ratio)

            # Confidence calculation (base 0.7 + boosts for each confirming factor)
            confidence = 0.70
            # RSI strength bonus (closer to 60-70 range = stronger)
            if 60 <= curr_rsi <= 70:
                confidence += 0.08
            # MACD spread bonus (larger spread = stronger trend)
            macd_spread = abs(curr_macd - curr_signal) / curr_close
            if macd_spread > 0.005:
                confidence += 0.07
            # Momentum strength bonus
            mom_pct = abs(curr_mom) / curr_close
            if mom_pct > 0.02:
                confidence += 0.05
            # EMA separation bonus
            ema_sep = abs(curr_fast - curr_slow) / curr_slow
            if ema_sep > 0.005:
                confidence += 0.05

            confidence = min(confidence, 0.98)

            if confidence >= self.min_confidence:
                signal = Signal(
                    symbol=symbol,
                    side="BUY",
                    strategy_name=self.name,
                    confidence=round(confidence, 3),
                    entry_price=round(curr_close, 2),
                    stop_loss=round(sl, 2),
                    take_profit=round(tp, 2),
                    signal_type="ENTRY",
                    timeframe=self.timeframe,
                    metadata={
                        "ema_fast": round(curr_fast, 2),
                        "ema_slow": round(curr_slow, 2),
                        "macd_line": round(curr_macd, 4),
                        "macd_signal": round(curr_signal, 4),
                        "rsi": round(curr_rsi, 2),
                        "momentum": round(curr_mom, 4),
                        "momentum_pct": round(mom_pct * 100, 2),
                        "rr_ratio": self.rr_ratio,
                        "risk": round(risk, 2),
                        "crossover_type": "bullish_confluence",
                        "indicators_aligned": ["EMA_CROSS", "MACD", "MOMENTUM", "RSI"],
                    },
                )
                signals.append(signal)
                self._position_side = "BUY"
                logger.info(
                    f"[{self.name}] LONG signal for {symbol}: "
                    f"price={curr_close:.2f} SL={sl:.2f} TP={tp:.2f} "
                    f"confidence={confidence:.3f} RSI={curr_rsi:.1f} MOM={curr_mom:.4f}"
                )

        # ── Generate Short Signal ──
        short_condition = ma_short_cross and macd_short and mom_short and rsi_short

        if short_condition:
            # Stop loss: 0.5% above 21 EMA
            sl = curr_slow * (1 + self.sl_percent)
            # Take profit based on R:R ratio
            risk = sl - curr_close
            tp = curr_close - (risk * self.rr_ratio)

            # Confidence calculation
            confidence = 0.70
            if 30 <= curr_rsi <= 40:
                confidence += 0.08
            macd_spread = abs(curr_macd - curr_signal) / curr_close
            if macd_spread > 0.005:
                confidence += 0.07
            mom_pct = abs(curr_mom) / curr_close
            if mom_pct > 0.02:
                confidence += 0.05
            ema_sep = abs(curr_fast - curr_slow) / curr_slow
            if ema_sep > 0.005:
                confidence += 0.05

            confidence = min(confidence, 0.98)

            if confidence >= self.min_confidence:
                signal = Signal(
                    symbol=symbol,
                    side="SELL",
                    strategy_name=self.name,
                    confidence=round(confidence, 3),
                    entry_price=round(curr_close, 2),
                    stop_loss=round(sl, 2),
                    take_profit=round(tp, 2),
                    signal_type="ENTRY",
                    timeframe=self.timeframe,
                    metadata={
                        "ema_fast": round(curr_fast, 2),
                        "ema_slow": round(curr_slow, 2),
                        "macd_line": round(curr_macd, 4),
                        "macd_signal": round(curr_signal, 4),
                        "rsi": round(curr_rsi, 2),
                        "momentum": round(curr_mom, 4),
                        "momentum_pct": round(mom_pct * 100, 2),
                        "rr_ratio": self.rr_ratio,
                        "risk": round(risk, 2),
                        "crossover_type": "bearish_confluence",
                        "indicators_aligned": ["EMA_CROSS", "MACD", "MOMENTUM", "RSI"],
                    },
                )
                signals.append(signal)
                self._position_side = "SELL"
                logger.info(
                    f"[{self.name}] SHORT signal for {symbol}: "
                    f"price={curr_close:.2f} SL={sl:.2f} TP={tp:.2f} "
                    f"confidence={confidence:.3f} RSI={curr_rsi:.1f} MOM={curr_mom:.4f}"
                )

        # ── Update state for early exit detection ──
        self._prev_macd_line = curr_macd
        self._prev_signal_line = curr_signal
        self._prev_momentum = curr_mom

        return signals

    async def should_exit(
        self,
        position: Any,
        data: List[List[float]],
    ) -> bool:
        """
        Early exit logic: close position if momentum or MACD reverses.

        Matches Pine Script logic:
        - Long: if MACD crosses UNDER signal OR momentum < 0 -> close
        - Short: if MACD crosses OVER signal OR momentum > 0 -> close

        Args:
            position: The open position.
            data: Current OHLCV data.

        Returns:
            True if the position should be closed early.
        """
        if len(data) < 30:
            return False

        _, _, _, _, close_p, _ = self.extract_ohlcv(data)
        macd_line, signal_line, _ = self.macd(
            close_p, self.macd_fast_period, self.macd_slow_period, self.macd_signal_period
        )
        mom_val = self.momentum(close_p, self.momentum_length)

        curr_idx = len(close_p) - 1
        prev_idx = curr_idx - 1

        if (
            np.isnan(macd_line[curr_idx]) or np.isnan(signal_line[curr_idx])
            or np.isnan(macd_line[prev_idx]) or np.isnan(signal_line[prev_idx])
            or np.isnan(mom_val[curr_idx])
        ):
            return False

        curr_macd = float(macd_line[curr_idx])
        curr_signal = float(signal_line[curr_idx])
        prev_macd = float(macd_line[prev_idx])
        prev_signal = float(signal_line[prev_idx])
        curr_mom = float(mom_val[curr_idx])

        side = getattr(position, "side", self._position_side)

        if side == "BUY" or side == "LONG":
            # MACD crosses under signal
            macd_reversal = (prev_macd >= prev_signal) and (curr_macd < curr_signal)
            # Momentum turns negative
            mom_reversal = curr_mom < 0
            if macd_reversal or mom_reversal:
                logger.info(
                    f"[{self.name}] Early exit LONG on {getattr(position, 'symbol', '?')}: "
                    f"MACD reversal={macd_reversal} MOM reversal={mom_reversal}"
                )
                return True

        elif side == "SELL" or side == "SHORT":
            # MACD crosses over signal
            macd_reversal = (prev_macd <= prev_signal) and (curr_macd > curr_signal)
            # Momentum turns positive
            mom_reversal = curr_mom > 0
            if macd_reversal or mom_reversal:
                logger.info(
                    f"[{self.name}] Early exit SHORT on {getattr(position, 'symbol', '?')}: "
                    f"MACD reversal={macd_reversal} MOM reversal={mom_reversal}"
                )
                return True

        return False

    def get_stop_loss(self, entry_price: float, side: str) -> float:
        """
        Calculate stop loss: 0.5% offset from estimated slow EMA.

        Args:
            entry_price: Entry price of the trade.
            side: Trade side ("BUY" or "SELL").

        Returns:
            Stop loss price.
        """
        offset = entry_price * self.sl_percent
        if side == "BUY":
            return entry_price - offset
        else:
            return entry_price + offset

    def get_take_profit(self, entry_price: float, side: str) -> float:
        """
        Calculate take profit based on risk-to-reward ratio.

        TP = entry +/- (risk * rr_ratio)
        where risk = entry - SL

        Args:
            entry_price: Entry price.
            side: Trade side.

        Returns:
            Take profit price.
        """
        sl = self.get_stop_loss(entry_price, side)
        if side == "BUY":
            risk = entry_price - sl
            return entry_price + (risk * self.rr_ratio)
        else:
            risk = sl - entry_price
            return entry_price - (risk * self.rr_ratio)
