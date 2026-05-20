"""
Scalping Strategy — quick trades on small timeframes.

Uses Bollinger Bands with RSI confirmation for rapid entry/exit
signals. Designed for high-frequency trading on 1m and 5m timeframes.
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from strategies.base import BaseStrategy, Signal

logger = logging.getLogger(__name__)


class ScalpingStrategy(BaseStrategy):
    """
    Scalping Strategy using Bollinger Bands + RSI.

    Designed for quick trades on small timeframes (1m, 5m).
    Entry conditions:
    - BUY: Price touches lower Bollinger Band + RSI < 30 (oversold)
    - SELL: Price touches upper Bollinger Band + RSI > 70 (overbought)
    Tight stop losses and quick take profits.

    Parameters:
        bb_period: Bollinger Bands period (default: 20).
        bb_std: Bollinger Bands standard deviation (default: 2.0).
        rsi_period: RSI period (default: 7).
        rsi_oversold: RSI oversold threshold (default: 30).
        rsi_overbought: RSI overbought threshold (default: 70).
        sl_pct: Stop loss percentage (default: 0.3%).
        tp_pct: Take profit percentage (default: 0.5%).
        max_bars_in_trade: Maximum bars to hold a position (default: 10).
        min_volume_ratio: Minimum volume ratio (default: 0.5).
    """

    def __init__(
        self,
        bb_period: int = 20,
        bb_std: float = 2.0,
        rsi_period: int = 7,
        rsi_oversold: float = 30,
        rsi_overbought: float = 70,
        sl_pct: float = 0.3,
        tp_pct: float = 0.5,
        max_bars_in_trade: int = 10,
        min_volume_ratio: float = 0.5,
        **kwargs: Any,
    ) -> None:
        super().__init__(name="Scalp Master", **kwargs)
        self.bb_period = bb_period
        self.bb_std = bb_std
        self.rsi_period = rsi_period
        self.rsi_oversold = rsi_oversold
        self.rsi_overbought = rsi_overbought
        self.sl_pct = sl_pct / 100
        self.tp_pct = tp_pct / 100
        self.max_bars_in_trade = max_bars_in_trade
        self.min_volume_ratio = min_volume_ratio
        self._bars_since_signal = 0

    async def calculate_signals(
        self,
        symbol: str,
        data: List[List[float]],
    ) -> List[Signal]:
        """
        Generate scalping signals using Bollinger Bands + RSI.

        Args:
            symbol: Trading symbol.
            data: OHLCV data.

        Returns:
            List of Signal objects.
        """
        if not self.is_active or len(data) < self.bb_period + 5:
            return []

        signals: List[Signal] = []
        _, _, high_p, low_p, close_p, volume = self.extract_ohlcv(data)

        # Calculate indicators
        upper_band, middle_band, lower_band = self.bollinger_bands(
            close_p, self.bb_period, self.bb_std
        )
        rsi_values = self.rsi(close_p, self.rsi_period)

        current_idx = len(close_p) - 1
        prev_idx = current_idx - 1

        # Skip if indicators are NaN
        if (
            np.isnan(upper_band[current_idx]) or np.isnan(lower_band[current_idx])
            or np.isnan(rsi_values[current_idx]) or np.isnan(rsi_values[prev_idx])
        ):
            return []

        current_close = float(close_p[current_idx])
        prev_close = float(close_p[prev_idx])
        upper = float(upper_band[current_idx])
        lower = float(lower_band[current_idx])
        middle = float(middle_band[current_idx])
        current_rsi = float(rsi_values[current_idx])
        prev_rsi = float(rsi_values[prev_idx])
        current_vol = float(volume[current_idx])

        # Volume confirmation
        recent_vol = np.mean(volume[max(0, current_idx - 20):current_idx])
        vol_ratio = current_vol / recent_vol if recent_vol > 0 else 1.0
        vol_ok = vol_ratio >= self.min_volume_ratio

        # Calculate band width for squeeze detection
        band_width = (upper - lower) / middle if middle > 0 else 0

        # BUY: Price touches or crosses below lower band + RSI oversold
        if prev_close >= lower and current_close < lower:
            if current_rsi < self.rsi_oversold:
                confidence = 0.4

                # RSI depth boost
                rsi_depth = (self.rsi_oversold - current_rsi) / self.rsi_oversold
                confidence += rsi_depth * 0.3

                # Volume boost
                if vol_ok:
                    confidence += 0.1

                # Band width boost (wider bands = stronger signal)
                if band_width > 0.02:
                    confidence += 0.1

                confidence = min(confidence, 1.0)

                if confidence >= 0.5:
                    stop_loss = current_close * (1 - self.sl_pct)
                    take_profit = current_close * (1 + self.tp_pct)

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
                            "bb_upper": round(upper, 2),
                            "bb_lower": round(lower, 2),
                            "bb_middle": round(middle, 2),
                            "rsi": round(current_rsi, 2),
                            "band_width": round(band_width, 4),
                            "volume_ratio": round(vol_ratio, 2),
                            "sl_pct": self.sl_pct * 100,
                            "tp_pct": self.tp_pct * 100,
                        },
                    )
                    signals.append(signal)
                    self._bars_since_signal = 0
                    logger.debug(
                        f"[{self.name}] BUY scalping signal for {symbol}: "
                        f"price={current_close:.2f} RSI={current_rsi:.1f}"
                    )

        # SELL: Price touches or crosses above upper band + RSI overbought
        elif prev_close <= upper and current_close > upper:
            if current_rsi > self.rsi_overbought:
                confidence = 0.4

                rsi_depth = (current_rsi - self.rsi_overbought) / (100 - self.rsi_overbought)
                confidence += rsi_depth * 0.3

                if vol_ok:
                    confidence += 0.1

                if band_width > 0.02:
                    confidence += 0.1

                confidence = min(confidence, 1.0)

                if confidence >= 0.5:
                    stop_loss = current_close * (1 + self.sl_pct)
                    take_profit = current_close * (1 - self.tp_pct)

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
                            "bb_upper": round(upper, 2),
                            "bb_lower": round(lower, 2),
                            "bb_middle": round(middle, 2),
                            "rsi": round(current_rsi, 2),
                            "band_width": round(band_width, 4),
                            "volume_ratio": round(vol_ratio, 2),
                            "sl_pct": self.sl_pct * 100,
                            "tp_pct": self.tp_pct * 100,
                        },
                    )
                    signals.append(signal)
                    self._bars_since_signal = 0
                    logger.debug(
                        f"[{self.name}] SELL scalping signal for {symbol}: "
                        f"price={current_close:.2f} RSI={current_rsi:.1f}"
                    )

        self._bars_since_signal += 1
        return signals

    async def should_exit(
        self,
        position: Any,
        data: List[List[float]],
    ) -> bool:
        """
        Quick exit check for scalping positions.

        Args:
            position: Open position.
            data: Current OHLCV data.

        Returns:
            True if position should be closed.
        """
        if len(data) < 2:
            return False

        _, _, _, _, close_p, _ = self.extract_ohlcv(data)
        current_close = float(close_p[-1])

        # Exit if held too many bars
        if self._bars_since_signal >= self.max_bars_in_trade:
            logger.debug(f"[{self.name}] Exiting {position.symbol}: max bars reached")
            return True

        # Quick profit/loss check
        if hasattr(position, "entry_price") and hasattr(position, "side"):
            if position.side.value == "LONG":
                pnl_pct = (current_close - position.entry_price) / position.entry_price
            else:
                pnl_pct = (position.entry_price - current_close) / position.entry_price

            # Take quick profit
            if pnl_pct >= self.tp_pct * 0.8:
                return True
            # Cut loss quickly
            if pnl_pct <= -self.sl_pct * 0.5:
                return True

        return False

    def get_stop_loss(self, entry_price: float, side: str) -> float:
        """Calculate tight stop loss for scalping."""
        if side == "BUY":
            return entry_price * (1 - self.sl_pct)
        else:
            return entry_price * (1 + self.sl_pct)

    def get_take_profit(self, entry_price: float, side: str) -> float:
        """Calculate quick take profit for scalping."""
        if side == "BUY":
            return entry_price * (1 + self.tp_pct)
        else:
            return entry_price * (1 - self.tp_pct)
