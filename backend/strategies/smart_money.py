"""
Smart Money Concepts Strategy.

Implements simplified Smart Money Concepts (SMC) trading including
order block detection, liquidity zone identification, break of
structure, and fair value gap analysis.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from strategies.base import BaseStrategy, Signal

logger = logging.getLogger(__name__)


class SmartMoneyStrategy(BaseStrategy):
    """
    Smart Money Concepts (SMC) Strategy.

    Identifies institutional order flow patterns:
    1. Order blocks (last bearish candle before bullish move, or vice versa)
    2. Break of structure (higher highs or lower lows)
    3. Fair value gaps (imbalance between two candles)
    4. Liquidity zones (swing highs/lows where stops cluster)

    Parameters:
        swing_lookback: Bars to look back for swing detection (default: 10).
        min_fvg_size_pct: Minimum fair value gap size (default: 0.1%).
        atr_period: ATR period (default: 14).
        atr_sl_multiplier: ATR multiplier for stop loss (default: 1.5).
        atr_tp_multiplier: ATR multiplier for take profit (default: 3.0).
        structure_confirm_bars: Bars to confirm break of structure (default: 3).
        min_confidence: Minimum confidence threshold (default: 0.55).
    """

    def __init__(
        self,
        swing_lookback: int = 10,
        min_fvg_size_pct: float = 0.1,
        atr_period: int = 14,
        atr_sl_multiplier: float = 1.5,
        atr_tp_multiplier: float = 3.0,
        structure_confirm_bars: int = 3,
        min_confidence: float = 0.55,
        **kwargs: Any,
    ) -> None:
        super().__init__(name="Smart Money Concepts", **kwargs)
        self.swing_lookback = swing_lookback
        self.min_fvg_size_pct = min_fvg_size_pct / 100
        self.atr_period = atr_period
        self.atr_sl_multiplier = atr_sl_multiplier
        self.atr_tp_multiplier = atr_tp_multiplier
        self.structure_confirm_bars = structure_confirm_bars
        self.min_confidence = min_confidence

        # Track market structure
        self._swing_highs: List[Tuple[int, float]] = []
        self._swing_lows: List[Tuple[int, float]] = []
        self._last_structure_break: Optional[str] = None  # "BOS_UP" or "BOS_DOWN"
        self._order_blocks: List[Dict[str, Any]] = []
        self._fair_value_gaps: List[Dict[str, Any]] = []

    async def calculate_signals(
        self,
        symbol: str,
        data: List[List[float]],
    ) -> List[Signal]:
        """
        Generate SMC-based trading signals.

        Args:
            symbol: Trading symbol.
            data: OHLCV data.

        Returns:
            List of Signal objects.
        """
        if not self.is_active or len(data) < self.swing_lookback * 3:
            return []

        signals: List[Signal] = []
        timestamps, open_p, high_p, low_p, close_p, volume = self.extract_ohlcv(data)
        n = len(close_p)

        atr_values = self.atr(high_p, low_p, close_p, self.atr_period)
        current_idx = n - 1
        current_close = float(close_p[current_idx])
        current_atr = float(atr_values[current_idx]) if not np.isnan(atr_values[current_idx]) else current_close * 0.015

        # 1. Detect swing points
        swing_highs, swing_lows = self._detect_swing_points(high_p, low_p, data)

        # 2. Detect break of structure
        bos = self._detect_break_of_structure(high_p, close_p, swing_highs, swing_lows, current_idx)

        # 3. Detect order blocks
        order_blocks = self._detect_order_blocks(open_p, close_p, high_p, low_p, data, current_idx)

        # 4. Detect fair value gaps
        fvg = self._detect_fair_value_gaps(high_p, low_p, current_idx, current_close)

        # Combine signals
        # Bullish SMC setup: BOS up + bullish order block + FVG
        if bos == "BOS_UP" and order_blocks.get("bullish"):
            confidence = 0.45
            signal_reasons = ["BOS_UP"]

            if fvg.get("bullish"):
                confidence += 0.15
                signal_reasons.append("Bullish_FVG")

            if order_blocks["bullish"]["tested"]:
                confidence += 0.15
                signal_reasons.append("OB_tested")

            if len(self._swing_lows) >= 2:
                hl_validated = (
                    self._swing_lows[-1][1] > self._swing_lows[-2][1]
                    if len(self._swing_lows) >= 2 else False
                )
                if hl_validated:
                    confidence += 0.1
                    signal_reasons.append("HL_validation")

            confidence = min(confidence, 1.0)

            if confidence >= self.min_confidence:
                ob = order_blocks["bullish"]
                stop_loss = ob["low"] - current_atr * 0.5

                # TP at next liquidity level or ATR-based
                tp_levels = [sh[1] for sh in swing_highs[-3:]] if swing_highs else []
                if tp_levels:
                    take_profit = max(tp_levels)
                else:
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
                        "bos": "BOS_UP",
                        "order_block_high": round(ob["high"], 2),
                        "order_block_low": round(ob["low"], 2),
                        "fvg": fvg.get("bullish", {}),
                        "signal_reasons": signal_reasons,
                    },
                )
                signals.append(signal)
                logger.info(
                    f"[{self.name}] SMC BUY for {symbol}: "
                    f"price={current_close:.2f} reasons={signal_reasons}"
                )

        # Bearish SMC setup: BOS down + bearish order block + FVG
        elif bos == "BOS_DOWN" and order_blocks.get("bearish"):
            confidence = 0.45
            signal_reasons = ["BOS_DOWN"]

            if fvg.get("bearish"):
                confidence += 0.15
                signal_reasons.append("Bearish_FVG")

            if order_blocks["bearish"]["tested"]:
                confidence += 0.15
                signal_reasons.append("OB_tested")

            if len(self._swing_highs) >= 2:
                lh_validated = (
                    self._swing_highs[-1][1] < self._swing_highs[-2][1]
                    if len(self._swing_highs) >= 2 else False
                )
                if lh_validated:
                    confidence += 0.1
                    signal_reasons.append("LH_validation")

            confidence = min(confidence, 1.0)

            if confidence >= self.min_confidence:
                ob = order_blocks["bearish"]
                stop_loss = ob["high"] + current_atr * 0.5

                tp_levels = [sl[1] for sl in swing_lows[-3:]] if swing_lows else []
                if tp_levels:
                    take_profit = min(tp_levels)
                else:
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
                        "bos": "BOS_DOWN",
                        "order_block_high": round(ob["high"], 2),
                        "order_block_low": round(ob["low"], 2),
                        "fvg": fvg.get("bearish", {}),
                        "signal_reasons": signal_reasons,
                    },
                )
                signals.append(signal)
                logger.info(
                    f"[{self.name}] SMC SELL for {symbol}: "
                    f"price={current_close:.2f} reasons={signal_reasons}"
                )

        # Store state
        self._swing_highs = swing_highs
        self._swing_lows = swing_lows
        self._last_structure_break = bos
        self._order_blocks = list(order_blocks.values()) if order_blocks else []

        return signals

    def _detect_swing_points(
        self,
        high: np.ndarray,
        low: np.ndarray,
        data: List[List[float]],
    ) -> Tuple[List[Tuple[int, float]], List[Tuple[int, float]]]:
        """
        Detect swing highs and swing lows in the price data.

        Args:
            high: Array of high prices.
            low: Array of low prices.
            data: Raw OHLCV data.

        Returns:
            Tuple of (swing_highs, swing_lows) as (index, price) tuples.
        """
        swing_highs: List[Tuple[int, float]] = []
        swing_lows: List[Tuple[int, float]] = []

        lb = self.swing_lookback
        n = len(high)

        for i in range(lb, n - lb):
            # Swing high: highest high in lookback window
            window_high = high[i - lb : i + lb + 1]
            if high[i] == np.max(window_high):
                swing_highs.append((i, float(high[i])))

            # Swing low: lowest low in lookback window
            window_low = low[i - lb : i + lb + 1]
            if low[i] == np.min(window_low):
                swing_lows.append((i, float(low[i])))

        return swing_highs, swing_lows

    def _detect_break_of_structure(
        self,
        high: np.ndarray,
        close: np.ndarray,
        swing_highs: List[Tuple[int, float]],
        swing_lows: List[Tuple[int, float]],
        current_idx: int,
    ) -> Optional[str]:
        """
        Detect break of structure (BOS).

        A bullish BOS occurs when price closes above the last swing high.
        A bearish BOS occurs when price closes below the last swing low.

        Args:
            high: Array of high prices.
            close: Array of close prices.
            swing_highs: Detected swing highs.
            swing_lows: Detected swing lows.
            current_idx: Current bar index.

        Returns:
            "BOS_UP", "BOS_DOWN", or None.
        """
        if not swing_highs and not swing_lows:
            return None

        current_close = float(close[current_idx])
        current_high = float(high[current_idx])

        # Bullish BOS: close above last relevant swing high
        recent_highs = [sh for sh in swing_highs if sh[0] < current_idx]
        if recent_highs:
            last_swing_high = max(recent_highs, key=lambda x: x[0])
            if current_close > last_swing_high[1]:
                return "BOS_UP"

        # Bearish BOS: close below last relevant swing low
        recent_lows = [sl for sl in swing_lows if sl[0] < current_idx]
        if recent_lows:
            last_swing_low = min(recent_lows, key=lambda x: x[0])
            if current_close < last_swing_low[1]:
                return "BOS_DOWN"

        return None

    def _detect_order_blocks(
        self,
        open_p: np.ndarray,
        close_p: np.ndarray,
        high_p: np.ndarray,
        low_p: np.ndarray,
        data: List[List[float]],
        current_idx: int,
    ) -> Dict[str, Any]:
        """
        Detect order blocks.

        Bullish OB: Last bearish candle before a significant bullish move.
        Bearish OB: Last bullish candle before a significant bearish move.

        Args:
            open_p: Array of open prices.
            close_p: Array of close prices.
            high_p: Array of high prices.
            low_p: Array of low prices.
            data: Raw OHLCV data.
            current_idx: Current bar index.

        Returns:
            Dict with "bullish" and/or "bearish" order block info.
        """
        result: Dict[str, Any] = {}

        lookback = min(20, current_idx)
        if lookback < 3:
            return result

        for i in range(current_idx - lookback, current_idx - 1):
            if i < 1:
                continue

            curr_close = float(close_p[i])
            curr_open = float(open_p[i])
            prev_close = float(close_p[i - 1])
            next_close = float(close_p[i + 1])

            candle_body = abs(curr_close - curr_open)

            # Bullish order block: bearish candle followed by strong bullish move
            if curr_close < curr_open:  # Bearish candle
                if next_close > curr_open and (next_close - curr_open) > candle_body * 1.5:
                    # Check if current price is near this OB (retest)
                    ob_high = max(curr_open, curr_close)
                    ob_low = min(curr_open, curr_close)
                    ob_mid = (ob_high + ob_low) / 2

                    tested = abs(current_close - ob_mid) / ob_mid < 0.005 if ob_mid > 0 else False

                    result["bullish"] = {
                        "high": ob_high,
                        "low": ob_low,
                        "mid": ob_mid,
                        "index": i,
                        "tested": tested,
                    }

            # Bearish order block: bullish candle followed by strong bearish move
            elif curr_close > curr_open:  # Bullish candle
                if next_close < curr_open and (curr_open - next_close) > candle_body * 1.5:
                    ob_high = max(curr_open, curr_close)
                    ob_low = min(curr_open, curr_close)
                    ob_mid = (ob_high + ob_low) / 2

                    tested = abs(current_close - ob_mid) / ob_mid < 0.005 if ob_mid > 0 else False

                    result["bearish"] = {
                        "high": ob_high,
                        "low": ob_low,
                        "mid": ob_mid,
                        "index": i,
                        "tested": tested,
                    }

        return result

    def _detect_fair_value_gaps(
        self,
        high_p: np.ndarray,
        low_p: np.ndarray,
        current_idx: int,
        current_close: float,
    ) -> Dict[str, Any]:
        """
        Detect fair value gaps (price imbalance between candles).

        A bullish FVG: gap between candle[1] low and candle[-1] high
        A bearish FVG: gap between candle[-1] low and candle[1] high

        Args:
            high_p: Array of high prices.
            low_p: Array of low prices.
            current_idx: Current bar index.
            current_close: Current close price.

        Returns:
            Dict with bullish and/or bearish FVG info.
        """
        result: Dict[str, Any] = {}

        if current_idx < 3:
            return result

        # Check recent 5 candles for FVG
        for i in range(max(2, current_idx - 5), current_idx - 1):
            candle_1_high = float(high_p[i - 1])  # Two bars ago
            candle_1_low = float(low_p[i - 1])
            candle_0_high = float(high_p[i])       # One bar ago
            candle_0_low = float(low_p[i])
            candle_n1_high = float(high_p[i + 1])   # Current bar
            candle_n1_low = float(low_p[i + 1])

            # Bullish FVG: candle[-1] high < candle[1] low (gap up)
            if candle_n1_low > candle_1_high:
                fvg_top = candle_n1_low
                fvg_bottom = candle_1_high
                fvg_size = (fvg_top - fvg_bottom) / fvg_bottom if fvg_bottom > 0 else 0

                if fvg_size >= self.min_fvg_size_pct:
                    filled = current_close < fvg_bottom
                    result["bullish"] = {
                        "top": round(fvg_top, 2),
                        "bottom": round(fvg_bottom, 2),
                        "size_pct": round(fvg_size * 100, 3),
                        "filled": filled,
                        "index": i,
                    }

            # Bearish FVG: candle[1] low > candle[-1] high (gap down)
            if candle_n1_high < candle_1_low:
                fvg_top = candle_1_low
                fvg_bottom = candle_n1_high
                fvg_size = (fvg_top - fvg_bottom) / fvg_top if fvg_top > 0 else 0

                if fvg_size >= self.min_fvg_size_pct:
                    filled = current_close > fvg_top
                    result["bearish"] = {
                        "top": round(fvg_top, 2),
                        "bottom": round(fvg_bottom, 2),
                        "size_pct": round(fvg_size * 100, 3),
                        "filled": filled,
                        "index": i,
                    }

        return result

    async def should_exit(
        self,
        position: Any,
        data: List[List[float]],
    ) -> bool:
        """
        Check if SMC position should be exited on structure change.

        Args:
            position: Open position.
            data: Current OHLCV data.

        Returns:
            True if position should be closed.
        """
        if len(data) < self.swing_lookback * 2:
            return False

        _, _, high_p, low_p, close_p, _ = self.extract_ohlcv(data)
        n = len(close_p)
        current_close = float(close_p[-1])

        swing_highs, swing_lows = self._detect_swing_points(high_p, low_p, data)

        if hasattr(position, "side"):
            if position.side.value == "LONG":
                # Exit on bearish BOS
                recent_lows = [sl for sl in swing_lows if sl[0] < n - 1]
                if recent_lows:
                    last_low = min(recent_lows, key=lambda x: x[0])
                    if current_close < last_low[1]:
                        return True
            elif position.side.value == "SHORT":
                # Exit on bullish BOS
                recent_highs = [sh for sh in swing_highs if sh[0] < n - 1]
                if recent_highs:
                    last_high = max(recent_highs, key=lambda x: x[0])
                    if current_close > last_high[1]:
                        return True

        return False

    def get_stop_loss(self, entry_price: float, side: str) -> float:
        """Calculate stop loss for SMC trades."""
        atr_est = entry_price * 0.015
        if side == "BUY":
            return entry_price - atr_est * self.atr_sl_multiplier
        else:
            return entry_price + atr_est * self.atr_sl_multiplier

    def get_take_profit(self, entry_price: float, side: str) -> float:
        """Calculate take profit for SMC trades."""
        atr_est = entry_price * 0.015
        if side == "BUY":
            return entry_price + atr_est * self.atr_tp_multiplier
        else:
            return entry_price - atr_est * self.atr_tp_multiplier
