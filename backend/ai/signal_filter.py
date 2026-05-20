"""
AI Signal Filter — machine learning-based signal quality assessment.

Uses feature engineering and a gradient boosting model to evaluate
trading signals, detect market regime, and predict trend direction.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from schemas import FilteredSignal, Signal

logger = logging.getLogger(__name__)


@dataclass
class TrendPrediction:
    """Trend prediction result."""

    direction: str  # "UP", "DOWN", "NEUTRAL"
    confidence: float  # 0.0 to 1.0
    expected_return_pct: float = 0.0
    timeframe: str = "1h"


@dataclass
class MarketFeatures:
    """Engineered features from OHLCV data."""

    returns_1: float = 0.0
    returns_5: float = 0.0
    returns_10: float = 0.0
    volatility: float = 0.0
    volume_ratio: float = 1.0
    rsi_14: float = 50.0
    macd_hist: float = 0.0
    bb_position: float = 0.5  # Position within Bollinger Bands (0=lower, 1=upper)
    atr_ratio: float = 0.0
    trend_strength: float = 0.0
    momentum: float = 0.0
    mean_reversion_score: float = 0.0


class SignalFilter:
    """
    AI-powered signal filtering system.

    Evaluates trading signals using machine learning to:
    - Filter out low-quality signals
    - Detect current market regime (trending/ranging/volatile)
    - Predict trend direction
    - Calculate signal confidence scores

    Uses an sklearn GradientBoostingClassifier as a placeholder
    for an XGBoost model in production.

    Usage:
        filter = SignalFilter()
        await filter.initialize()

        # Filter a signal
        filtered = filter.filter_signal(signal, features)

        # Detect market regime
        regime = filter.detect_market_regime(data)

        # Predict trend
        prediction = filter.predict_trend(features)
    """

    def __init__(self) -> None:
        """Initialize the SignalFilter."""
        self._model: Optional[Any] = None
        self._is_initialized: bool = False
        self._feature_names: List[str] = [
            "returns_1", "returns_5", "returns_10",
            "volatility", "volume_ratio", "rsi_14",
            "macd_hist", "bb_position", "atr_ratio",
            "trend_strength", "momentum", "mean_reversion_score",
        ]

    async def initialize(self) -> None:
        """
        Initialize the ML model.

        In production, this would load a pre-trained XGBoost model.
        Here, we use a simple heuristic-based approach as a placeholder.
        """
        try:
            from sklearn.ensemble import GradientBoostingClassifier
            from sklearn.preprocessing import StandardScaler
            import sklearn

            # Create a simple model with reasonable defaults
            self._model = GradientBoostingClassifier(
                n_estimators=50,
                max_depth=4,
                learning_rate=0.1,
                random_state=42,
            )
            self._scaler = StandardScaler()

            # Pre-train with synthetic data for initialization
            self._pre_train_model()

            self._is_initialized = True
            logger.info("AI Signal Filter initialized with sklearn model")
        except ImportError:
            logger.warning(
                "sklearn not available. AI Signal Filter will use heuristic fallback."
            )
            self._is_initialized = True
        except Exception as e:
            logger.error(f"Failed to initialize AI Signal Filter: {e}")
            self._is_initialized = True

    def _pre_train_model(self) -> None:
        """
        Pre-train the model with synthetic data.

        This provides reasonable default behavior until the model
        is trained on real trading data.
        """
        np.random.seed(42)
        n_samples = 500

        # Generate synthetic features
        X = np.random.randn(n_samples, len(self._feature_names))
        X[:, 0] *= 0.02  # returns_1
        X[:, 1] *= 0.05  # returns_5
        X[:, 2] *= 0.08  # returns_10
        X[:, 3] = np.abs(X[:, 3]) * 0.01 + 0.001  # volatility
        X[:, 4] = np.abs(X[:, 4]) + 0.5  # volume_ratio
        X[:, 5] = X[:, 5] * 15 + 50  # RSI centered around 50
        X[:, 5] = np.clip(X[:, 5], 0, 100)

        # Generate labels based on feature heuristics
        y = np.zeros(n_samples, dtype=int)
        for i in range(n_samples):
            score = 0
            if X[i, 0] > 0.005: score += 1
            if X[i, 5] < 30: score += 1
            if X[i, 6] > 0: score += 1  # positive MACD hist
            if X[i, 4] > 1.0: score += 1  # above avg volume
            y[i] = 1 if score >= 2 else 0

        # Fit the model
        X_scaled = self._scaler.fit_transform(X)
        self._model.fit(X_scaled, y)

    def extract_features(self, data: List[List[float]]) -> MarketFeatures:
        """
        Extract ML features from OHLCV data.

        Args:
            data: OHLCV data as list of [timestamp, open, high, low, close, volume].

        Returns:
            MarketFeatures with engineered feature values.
        """
        if len(data) < 20:
            return MarketFeatures()

        arr = np.array(data, dtype=float)
        close = arr[:, 4]
        high = arr[:, 2]
        low = arr[:, 3]
        volume = arr[:, 5]
        n = len(close)

        # Returns at different horizons
        returns_1 = (close[-1] / close[-2] - 1) if n >= 2 else 0
        returns_5 = (close[-1] / close[-6] - 1) if n >= 6 else 0
        returns_10 = (close[-1] / close[-11] - 1) if n >= 11 else 0

        # Volatility (rolling std of returns)
        returns = np.diff(close) / close[:-1]
        volatility = float(np.std(returns[-20:])) if len(returns) >= 20 else 0

        # Volume ratio (current vs 20-period average)
        avg_volume = np.mean(volume[-20:])
        volume_ratio = float(volume[-1] / avg_volume) if avg_volume > 0 else 1.0

        # RSI(14) — simplified calculation
        rsi = self._calculate_rsi(close, 14)
        rsi_14 = float(rsi[-1]) if len(rsi) > 0 and not np.isnan(rsi[-1]) else 50

        # MACD histogram (simplified)
        ema_12 = self._calculate_ema(close, 12)
        ema_26 = self._calculate_ema(close, 26)
        if len(ema_12) > 0 and len(ema_26) > 0 and not np.isnan(ema_12[-1]) and not np.isnan(ema_26[-1]):
            macd_hist = float(ema_12[-1] - ema_26[-1])
        else:
            macd_hist = 0

        # Bollinger Band position (where close is within the bands)
        bb_upper, bb_lower = self._calculate_bollinger(close, 20)
        if not np.isnan(bb_upper) and not np.isnan(bb_lower) and (bb_upper - bb_lower) > 0:
            bb_position = float((close[-1] - bb_lower) / (bb_upper - bb_lower))
        else:
            bb_position = 0.5

        # ATR ratio
        atr = self._calculate_atr(high, low, close, 14)
        atr_ratio = float(atr / close[-1]) if not np.isnan(atr) and close[-1] > 0 else 0

        # Trend strength (linear regression slope normalized)
        if n >= 20:
            x = np.arange(20)
            y = close[-20:]
            slope = np.polyfit(x, y, 1)[0]
            trend_strength = float(slope / close[-1] * 100)
        else:
            trend_strength = 0

        # Momentum (rate of change)
        momentum = returns_5

        # Mean reversion score (deviation from moving average)
        ma_20 = np.mean(close[-20:])
        mean_rev = float((close[-1] - ma_20) / ma_20) if ma_20 > 0 else 0

        return MarketFeatures(
            returns_1=returns_1,
            returns_5=returns_5,
            returns_10=returns_10,
            volatility=volatility,
            volume_ratio=volume_ratio,
            rsi_14=rsi_14,
            macd_hist=macd_hist,
            bb_position=np.clip(bb_position, 0, 1),
            atr_ratio=atr_ratio,
            trend_strength=trend_strength,
            momentum=momentum,
            mean_reversion_score=mean_rev,
        )

    def filter_signal(
        self,
        signal: Signal,
        features: MarketFeatures,
    ) -> FilteredSignal:
        """
        Filter a trading signal using the ML model.

        Args:
            signal: The trading signal to evaluate.
            features: Extracted market features.

        Returns:
            FilteredSignal with approval status and confidence.
        """
        # Calculate base confidence from features
        confidence = self.calculate_confidence(features)

        # Detect market regime
        regime = self.detect_market_regime_from_features(features)

        # Predict trend
        trend = self.predict_trend_from_features(features)

        # Determine approval
        is_approved = True
        reasons: List[str] = []

        # Confidence threshold
        if confidence < 0.4:
            is_approved = False
            reasons.append(f"Low confidence: {confidence:.2f}")

        # Regime compatibility
        if regime == "volatile" and signal.confidence < 0.7:
            is_approved = False
            reasons.append(f"High volatility regime with low signal confidence")

        # RSI extreme zones
        if signal.side == "BUY" and features.rsi_14 > 75:
            is_approved = False
            reasons.append(f"RSI overbought ({features.rsi_14:.1f}), skipping BUY")

        if signal.side == "SELL" and features.rsi_14 < 25:
            is_approved = False
            reasons.append(f"RSI oversold ({features.rsi_14:.1f}), skipping SELL")

        # Volume confirmation
        if features.volume_ratio < 0.7:
            reasons.append(f"Low volume ({features.volume_ratio:.2f}x average)")

        # Trend alignment
        if signal.side == "BUY" and trend.direction == "DOWN" and trend.confidence > 0.6:
            is_approved = False
            reasons.append("BUY signal against bearish trend prediction")

        if signal.side == "SELL" and trend.direction == "UP" and trend.confidence > 0.6:
            is_approved = False
            reasons.append("SELL signal against bullish trend prediction")

        # ML model prediction (if available)
        if self._model is not None:
            feature_vector = np.array([[
                features.returns_1, features.returns_5, features.returns_10,
                features.volatility, features.volume_ratio, features.rsi_14,
                features.macd_hist, features.bb_position, features.atr_ratio,
                features.trend_strength, features.momentum, features.mean_reversion_score,
            ]])

            try:
                scaled = self._scaler.transform(feature_vector)
                ml_prediction = self._model.predict_proba(scaled)[0]
                ml_confidence = ml_prediction[1]  # Probability of class 1 (good signal)

                if ml_confidence < 0.35:
                    is_approved = False
                    reasons.append(f"ML model confidence too low: {ml_confidence:.2f}")

                # Blend ML confidence with heuristic confidence
                confidence = 0.6 * confidence + 0.4 * ml_confidence
            except Exception as e:
                logger.warning(f"ML prediction failed: {e}")

        confidence = round(np.clip(confidence, 0, 1), 3)

        return FilteredSignal(
            original_signal=signal,
            is_approved=is_approved,
            confidence=confidence,
            market_regime=regime,
            trend_prediction=f"{trend.direction} ({trend.confidence:.0%})",
            reasons=reasons,
        )

    def calculate_confidence(self, features: MarketFeatures) -> float:
        """
        Calculate signal confidence score from market features.

        Args:
            features: Extracted market features.

        Returns:
            Confidence score between 0.0 and 1.0.
        """
        confidence = 0.5

        # Trend alignment (+/- 0.1)
        if features.trend_strength > 0.1:
            confidence += 0.1
        elif features.trend_strength < -0.1:
            confidence -= 0.1

        # Volume (+/- 0.1)
        if features.volume_ratio > 1.5:
            confidence += 0.1
        elif features.volume_ratio < 0.5:
            confidence -= 0.1

        # RSI quality (+/- 0.1)
        if 30 < features.rsi_14 < 70:
            confidence += 0.05
        elif features.rsi_14 > 80 or features.rsi_14 < 20:
            confidence -= 0.1

        # MACD direction (+/- 0.1)
        if features.macd_hist > 0:
            confidence += 0.05
        elif features.macd_hist < 0:
            confidence -= 0.05

        # Volatility penalty (up to -0.15)
        if features.volatility > 0.03:
            confidence -= 0.15
        elif features.volatility > 0.02:
            confidence -= 0.05

        # Mean reversion opportunity (+/- 0.1)
        if abs(features.mean_reversion_score) > 0.02:
            confidence += 0.05

        return np.clip(confidence, 0, 1)

    def detect_market_regime(self, data: List[List[float]]) -> str:
        """
        Detect current market regime from OHLCV data.

        Args:
            data: OHLCV data.

        Returns:
            "trending", "ranging", or "volatile".
        """
        features = self.extract_features(data)
        return self.detect_market_regime_from_features(features)

    def detect_market_regime_from_features(self, features: MarketFeatures) -> str:
        """
        Detect market regime from pre-computed features.

        Args:
            features: Market features.

        Returns:
            "trending", "ranging", or "volatile".
        """
        if features.volatility > 0.025:
            return "volatile"

        if abs(features.trend_strength) > 0.15:
            return "trending"

        if abs(features.bb_position - 0.5) < 0.2:
            return "ranging"

        return "ranging"

    def predict_trend(self, features: MarketFeatures) -> TrendPrediction:
        """
        Predict trend direction from features.

        Args:
            features: Market features.

        Returns:
            TrendPrediction with direction and confidence.
        """
        return self.predict_trend_from_features(features)

    def predict_trend_from_features(self, features: MarketFeatures) -> TrendPrediction:
        """
        Predict trend direction from pre-computed features.

        Args:
            features: Market features.

        Returns:
            TrendPrediction with direction and confidence.
        """
        # Combine multiple indicators for trend prediction
        score = 0.0

        # Trend strength
        score += features.trend_strength * 2

        # RSI direction
        if features.rsi_14 < 40:
            score -= 0.2
        elif features.rsi_14 > 60:
            score += 0.2

        # MACD
        if features.macd_hist > 0:
            score += 0.15
        else:
            score -= 0.15

        # Momentum
        score += features.momentum * 3

        # Determine direction and confidence
        confidence = min(abs(score), 1.0)

        if score > 0.1:
            direction = "UP"
        elif score < -0.1:
            direction = "DOWN"
        else:
            direction = "NEUTRAL"

        expected_return = features.momentum * 100  # Convert to percentage

        return TrendPrediction(
            direction=direction,
            confidence=round(confidence, 3),
            expected_return_pct=round(expected_return, 4),
        )

    # -----------------------------------------------------------------------
    # Helper Methods — Indicator Calculations
    # -----------------------------------------------------------------------

    @staticmethod
    def _calculate_rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
        """Calculate RSI."""
        if len(close) < period + 1:
            return np.array([50.0])

        deltas = np.diff(close)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])

        rsi_values = np.zeros(len(deltas))
        if avg_loss == 0:
            rsi_values[period - 1] = 100
        else:
            rsi_values[period - 1] = 100 - 100 / (1 + avg_gain / avg_loss)

        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            if avg_loss == 0:
                rsi_values[i] = 100
            else:
                rsi_values[i] = 100 - 100 / (1 + avg_gain / avg_loss)

        return rsi_values

    @staticmethod
    def _calculate_ema(data: np.ndarray, period: int) -> np.ndarray:
        """Calculate EMA."""
        if len(data) < period:
            return np.full(len(data), np.nan)

        result = np.full(len(data), np.nan)
        multiplier = 2.0 / (period + 1)
        result[period - 1] = np.mean(data[:period])

        for i in range(period, len(data)):
            result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1]

        return result

    @staticmethod
    def _calculate_bollinger(close: np.ndarray, period: int = 20) -> Tuple[float, float]:
        """Calculate Bollinger Band upper and lower values."""
        if len(close) < period:
            return np.nan, np.nan

        window = close[-period:]
        middle = np.mean(window)
        std = np.std(window, ddof=0)
        return middle + 2 * std, middle - 2 * std

    @staticmethod
    def _calculate_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> float:
        """Calculate ATR."""
        if len(close) < 2:
            return np.nan

        tr = np.zeros(len(close))
        tr[0] = high[0] - low[0]

        for i in range(1, len(close)):
            tr[i] = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))

        if len(tr) < period:
            return np.mean(tr)

        return float(np.mean(tr[-period:]))


# Global signal filter instance
signal_filter = SignalFilter()
