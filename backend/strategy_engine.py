"""
Strategy Engine — manages trading strategies and signal generation.

Provides the StrategyEngine orchestrator class that manages multiple
strategy instances, handles multi-timeframe analysis, and coordinates
signal generation across active strategies.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Type

from loguru import logger

from strategies.base import BaseStrategy, Signal
from strategies.ema_macd import EMAMACDStrategy
from strategies.scalping import ScalpingStrategy
from strategies.breakout import BreakoutStrategy
from strategies.smart_money import SmartMoneyStrategy
from strategies.confluence import ConfluenceStrategy

# Registry mapping strategy types to their implementation classes
STRATEGY_REGISTRY: Dict[str, Type[BaseStrategy]] = {
    "EMA_MACD": EMAMACDStrategy,
    "SCALPING": ScalpingStrategy,
    "BREAKOUT": BreakoutStrategy,
    "SMART_MONEY": SmartMoneyStrategy,
    "CONFLUENCE": ConfluenceStrategy,
}


class StrategyEngineError(Exception):
    """Custom exception for strategy engine errors."""

    def __init__(self, message: str, code: Optional[str] = None):
        self.code = code
        super().__init__(message)


class StrategyEngine:
    """
    Strategy engine that manages multiple trading strategies.

    Responsibilities:
    - Create and configure strategy instances from database records
    - Run multi-timeframe analysis
    - Coordinate signal generation
    - Track strategy performance
    - Handle strategy lifecycle (start, stop, reload)

    Usage:
        engine = StrategyEngine()
        await engine.initialize_from_db(db_session)

        # Add a strategy
        await engine.add_strategy(strategy_db_record)

        # Generate signals for a symbol
        signals = await engine.generate_signals("BTC/USDT", ohlcv_data)

        # Process a new candle
        await engine.on_new_candle("BTC/USDT", "1h", candle)
    """

    def __init__(self) -> None:
        """Initialize the StrategyEngine."""
        self._strategies: Dict[str, BaseStrategy] = {}
        self._strategy_configs: Dict[str, Dict[str, Any]] = {}
        self._is_running: bool = False
        self._signal_callbacks: List[Any] = []
        self._performance_tracker: Dict[str, Dict[str, Any]] = {}

    @property
    def active_strategies(self) -> List[str]:
        """Get list of active strategy IDs."""
        return [
            sid for sid, strategy in self._strategies.items()
            if strategy.is_active
        ]

    @property
    def strategy_count(self) -> int:
        """Get total number of loaded strategies."""
        return len(self._strategies)

    # -----------------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------------

    async def initialize_from_db(self, db: Any) -> None:
        """
        Load all active strategies from the database.

        Args:
            db: Async database session.
        """
        from models import Strategy as StrategyModel
        from sqlalchemy import select

        result = await db.execute(
            select(StrategyModel).where(StrategyModel.is_active == True)
        )
        strategies = result.scalars().all()

        for strategy_record in strategies:
            try:
                await self.add_strategy(strategy_record)
                logger.info(f"Loaded strategy: {strategy_record.name} (type={strategy_record.type})")
            except StrategyEngineError as e:
                logger.error(f"Failed to load strategy {strategy_record.name}: {e}")

        self._is_running = True
        logger.info(f"Strategy engine initialized with {len(self._strategies)} strategies")

    async def shutdown(self) -> None:
        """Shut down the strategy engine and stop all strategies."""
        self._is_running = False
        for strategy_id, strategy in self._strategies.items():
            try:
                await strategy.stop()
            except Exception as e:
                logger.warning(f"Error stopping strategy {strategy_id}: {e}")
        self._strategies.clear()
        self._strategy_configs.clear()
        logger.info("Strategy engine shut down")

    # -----------------------------------------------------------------------
    # Strategy Management
    # -----------------------------------------------------------------------

    async def add_strategy(self, strategy_record: Any) -> BaseStrategy:
        """
        Add a strategy from a database Strategy record.

        Args:
            strategy_record: SQLAlchemy Strategy model instance.

        Returns:
            Created BaseStrategy instance.

        Raises:
            StrategyEngineError: If strategy type is not found or configuration fails.
        """
        strategy_type = strategy_record.type
        if strategy_type not in STRATEGY_REGISTRY:
            raise StrategyEngineError(
                f"Unknown strategy type: {strategy_type}. "
                f"Available: {list(STRATEGY_REGISTRY.keys())}",
                code="UNKNOWN_STRATEGY_TYPE",
            )

        strategy_class = STRATEGY_REGISTRY[strategy_type]

        # Parse parameters JSON
        import json
        try:
            params = json.loads(strategy_record.parameters) if strategy_record.parameters else {}
        except (json.JSONDecodeError, TypeError):
            params = {}

        # Create strategy instance
        config = {
            "name": strategy_record.name,
            "strategy_id": strategy_record.id,
            "timeframe": strategy_record.timeframe,
            "is_active": strategy_record.is_active,
            **params,
        }

        try:
            strategy = strategy_class(**config)
            await strategy.initialize()
            self._strategies[strategy_record.id] = strategy
            self._strategy_configs[strategy_record.id] = config
            self._performance_tracker[strategy_record.id] = {
                "name": strategy_record.name,
                "type": strategy_type,
                "signals_generated": 0,
                "trades_taken": 0,
                "win_count": 0,
                "loss_count": 0,
                "total_pnl": 0.0,
                "last_signal_time": None,
            }
            return strategy
        except Exception as e:
            raise StrategyEngineError(
                f"Failed to create strategy '{strategy_record.name}': {e}",
                code="STRATEGY_CREATE_FAILED",
            )

    async def remove_strategy(self, strategy_id: str) -> None:
        """
        Remove and stop a strategy.

        Args:
            strategy_id: ID of the strategy to remove.
        """
        if strategy_id in self._strategies:
            try:
                await self._strategies[strategy_id].stop()
            except Exception as e:
                logger.warning(f"Error stopping strategy {strategy_id}: {e}")
            del self._strategies[strategy_id]
            self._strategy_configs.pop(strategy_id, None)
            self._performance_tracker.pop(strategy_id, None)
            logger.info(f"Strategy removed: {strategy_id}")

    async def toggle_strategy(self, strategy_id: str, is_active: bool) -> None:
        """
        Enable or disable a strategy.

        Args:
            strategy_id: ID of the strategy.
            is_active: Whether the strategy should be active.
        """
        if strategy_id in self._strategies:
            self._strategies[strategy_id].is_active = is_active
            status = "activated" if is_active else "deactivated"
            logger.info(f"Strategy {status}: {strategy_id}")

    # -----------------------------------------------------------------------
    # Signal Generation
    # -----------------------------------------------------------------------

    async def generate_signals(
        self,
        symbol: str,
        data: List[List[float]],
        timeframe: str = "1h",
    ) -> List[Signal]:
        """
        Generate trading signals from all active strategies.

        Args:
            symbol: Trading symbol (e.g., "BTC/USDT").
            data: OHLCV data as list of [timestamp, open, high, low, close, volume].
            timeframe: Candle timeframe.

        Returns:
            List of generated Signal objects.
        """
        if not self._is_running:
            return []

        all_signals: List[Signal] = []
        tasks = []

        for strategy_id, strategy in self._strategies.items():
            if not strategy.is_active:
                continue
            if strategy.timeframe != timeframe:
                continue

            tasks.append(self._generate_single_signal(strategy, symbol, data))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"Signal generation error: {result}")
                elif isinstance(result, list):
                    all_signals.extend(result)

        # Notify callbacks
        for signal in all_signals:
            await self._notify_signal_callbacks(signal)

        return all_signals

    async def _generate_single_signal(
        self,
        strategy: BaseStrategy,
        symbol: str,
        data: List[List[float]],
    ) -> List[Signal]:
        """
        Generate signals from a single strategy.

        Args:
            strategy: Strategy instance.
            symbol: Trading symbol.
            data: OHLCV data.

        Returns:
            List of Signal objects.
        """
        try:
            signals = await strategy.calculate_signals(symbol, data)

            # Update performance tracker
            if strategy.strategy_id and strategy.strategy_id in self._performance_tracker:
                tracker = self._performance_tracker[strategy.strategy_id]
                tracker["signals_generated"] += len(signals)
                if signals:
                    tracker["last_signal_time"] = datetime.now(timezone.utc).isoformat()

            return signals
        except Exception as e:
            logger.error(
                f"Error generating signals from strategy '{strategy.name}': {e}"
            )
            return []

    async def on_new_candle(
        self,
        symbol: str,
        timeframe: str,
        candle: List[float],
    ) -> List[Signal]:
        """
        Process a new candle and generate signals.

        Args:
            symbol: Trading symbol.
            timeframe: Candle timeframe.
            candle: Single candle [timestamp, open, high, low, close, volume].

        Returns:
            List of generated Signal objects.
        """
        all_signals: List[Signal] = []

        for strategy_id, strategy in self._strategies.items():
            if not strategy.is_active or strategy.timeframe != timeframe:
                continue

            try:
                await strategy.on_bar(symbol, candle)
                signals = await strategy.calculate_signals(symbol, [candle])
                all_signals.extend(signals)
            except Exception as e:
                logger.error(f"Error processing candle for strategy '{strategy.name}': {e}")

        return all_signals

    async def check_exit_conditions(
        self,
        position: Any,
        data: List[List[float]],
    ) -> Optional[Signal]:
        """
        Check if any strategy recommends exiting a position.

        Args:
            position: Position to check exit conditions for.
            data: Current OHLCV data.

        Returns:
            Exit Signal if conditions met, None otherwise.
        """
        if not position.strategy_id or position.strategy_id not in self._strategies:
            return None

        strategy = self._strategies[position.strategy_id]
        try:
            should_exit = await strategy.should_exit(position, data)
            if should_exit:
                return Signal(
                    symbol=position.symbol,
                    side="SELL" if position.side.value == "LONG" else "BUY",
                    strategy_name=strategy.name,
                    confidence=0.8,
                    signal_type="EXIT",
                    timestamp=datetime.now(timezone.utc),
                    metadata={"reason": "strategy_exit_signal"},
                )
        except Exception as e:
            logger.error(f"Error checking exit conditions: {e}")

        return None

    # -----------------------------------------------------------------------
    # Multi-Timeframe Analysis
    # -----------------------------------------------------------------------

    async def multi_timeframe_analysis(
        self,
        symbol: str,
        timeframes: Dict[str, List[List[float]]],
    ) -> Dict[str, List[Signal]]:
        """
        Run analysis across multiple timeframes.

        Args:
            symbol: Trading symbol.
            timeframes: Dict mapping timeframe to OHLCV data.

        Returns:
            Dict mapping timeframe to list of signals.
        """
        results: Dict[str, List[Signal]] = {}

        for tf, data in timeframes.items():
            signals = await self.generate_signals(symbol, data, timeframe=tf)
            results[tf] = signals

        return results

    # -----------------------------------------------------------------------
    # Callbacks
    # -----------------------------------------------------------------------

    def add_signal_callback(self, callback: Any) -> None:
        """
        Add a callback function to be called when a signal is generated.

        Args:
            callback: Async function accepting a Signal argument.
        """
        self._signal_callbacks.append(callback)

    def remove_signal_callback(self, callback: Any) -> None:
        """
        Remove a signal callback.

        Args:
            callback: The callback function to remove.
        """
        if callback in self._signal_callbacks:
            self._signal_callbacks.remove(callback)

    async def _notify_signal_callbacks(self, signal: Signal) -> None:
        """Notify all registered signal callbacks."""
        for callback in self._signal_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(signal)
                else:
                    callback(signal)
            except Exception as e:
                logger.error(f"Signal callback error: {e}")

    # -----------------------------------------------------------------------
    # Performance Tracking
    # -----------------------------------------------------------------------

    def record_trade_result(
        self,
        strategy_id: str,
        pnl: float,
    ) -> None:
        """
        Record a trade result for performance tracking.

        Args:
            strategy_id: ID of the strategy.
            pnl: Profit/loss of the trade.
        """
        if strategy_id not in self._performance_tracker:
            return

        tracker = self._performance_tracker[strategy_id]
        tracker["trades_taken"] += 1
        tracker["total_pnl"] += pnl

        if pnl > 0:
            tracker["win_count"] += 1
        elif pnl < 0:
            tracker["loss_count"] += 1

    def get_strategy_performance(self, strategy_id: str) -> Dict[str, Any]:
        """
        Get performance metrics for a strategy.

        Args:
            strategy_id: ID of the strategy.

        Returns:
            Performance metrics dictionary.
        """
        tracker = self._performance_tracker.get(strategy_id, {})
        total_trades = tracker.get("trades_taken", 0)

        win_rate = 0.0
        if total_trades > 0:
            win_rate = (tracker.get("win_count", 0) / total_trades) * 100

        return {
            **tracker,
            "win_rate": round(win_rate, 2),
        }

    def get_all_performance(self) -> Dict[str, Dict[str, Any]]:
        """
        Get performance metrics for all strategies.

        Returns:
            Dict mapping strategy ID to performance metrics.
        """
        return {
            sid: self.get_strategy_performance(sid)
            for sid in self._performance_tracker
        }
