"""
Backtesting Engine — simulate trading strategies on historical data.

Provides event-driven backtesting with realistic simulation including
slippage, fees, and position management.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from strategies.base import BaseStrategy, Signal

logger = logging.getLogger(__name__)


@dataclass
class BacktestTrade:
    """Represents a single trade in a backtest."""

    id: int
    symbol: str
    side: str  # "BUY" or "SELL"
    entry_price: float
    exit_price: float
    quantity: float
    leverage: int
    pnl: float
    fee: float
    net_pnl: float
    entry_time: datetime
    exit_time: datetime
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    strategy_signal: str = ""


@dataclass
class BacktestEquityPoint:
    """Represents an equity curve data point."""

    timestamp: datetime
    equity: float
    drawdown: float
    drawdown_pct: float
    trades: int
    winning_trades: int
    losing_trades: int


@dataclass
class BacktestMetrics:
    """Comprehensive backtest performance metrics."""

    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_duration_bars: int = 0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    avg_trade_duration_bars: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    expectancy: float = 0.0
    calmar_ratio: float = 0.0
    total_fees: float = 0.0
    equity_curve: List[BacktestEquityPoint] = field(default_factory=list)
    trades_list: List[BacktestTrade] = field(default_factory=list)


class BacktestingEngine:
    """
    Event-driven backtesting engine.

    Simulates strategy execution on historical OHLCV data with
    realistic fee calculation, slippage, and position management.

    Usage:
        engine = BacktestingEngine()
        result = await engine.run_backtest(
            strategy=my_strategy,
            symbol="BTC/USDT",
            data=ohlcv_data,
            initial_capital=10000,
            commission_rate=0.001,
            slippage=0.0005,
        )
        print(f"P&L: ${result.total_pnl:.2f}, Win Rate: {result.win_rate:.1f}%")
    """

    def __init__(self) -> None:
        """Initialize the BacktestingEngine."""
        self._trades: List[BacktestTrade] = []
        self._equity_curve: List[BacktestEquityPoint] = []
        self._trade_counter: int = 0
        self._open_position: Optional[Dict[str, Any]] = None
        self._max_equity: float = 0.0
        self._drawdown_start: int = 0

    async def run_backtest(
        self,
        strategy: BaseStrategy,
        symbol: str,
        data: List[List[float]],
        initial_capital: float = 10000.0,
        commission_rate: float = 0.001,
        slippage: float = 0.0005,
        leverage: int = 1,
        max_positions: int = 1,
        risk_per_trade: float = 0.02,
        stop_loss_pct: Optional[float] = None,
        take_profit_pct: Optional[float] = None,
    ) -> BacktestMetrics:
        """
        Run a backtest simulation.

        Args:
            strategy: Strategy instance to backtest.
            symbol: Trading symbol.
            data: OHLCV data as list of [timestamp, open, high, low, close, volume].
            initial_capital: Starting capital.
            commission_rate: Fee rate per trade (e.g., 0.001 = 0.1%).
            slippage: Slippage per trade (e.g., 0.0005 = 0.05%).
            leverage: Leverage multiplier.
            max_positions: Maximum concurrent positions.
            risk_per_trade: Fraction of capital to risk per trade.
            stop_loss_pct: Default stop loss percentage.
            take_profit_pct: Default take profit percentage.

        Returns:
            BacktestMetrics with all performance metrics.
        """
        logger.info(
            f"Starting backtest: {strategy.name} on {symbol} "
            f"({len(data)} candles, capital=${initial_capital:,.2f})"
        )

        # Reset state
        self._trades = []
        self._equity_curve = []
        self._trade_counter = 0
        self._open_position = None
        self._max_equity = initial_capital
        self._drawdown_start = 0

        equity = initial_capital
        peak_equity = initial_capital
        max_dd = 0.0
        max_dd_duration = 0
        dd_start_bar = 0
        current_dd_duration = 0

        winning_trades = 0
        losing_trades = 0
        total_fees = 0.0
        total_win_pnl = 0.0
        total_loss_pnl = 0.0

        # Initialize strategy
        await strategy.initialize()

        # Process each candle
        for bar_idx in range(len(data)):
            candle = data[bar_idx]
            bar_time = datetime.fromtimestamp(candle[0] / 1000, tz=timezone.utc) if candle[0] > 1e12 else datetime.fromtimestamp(candle[0], tz=timezone.utc)
            close_price = candle[4]

            # Check if open position should be closed
            if self._open_position is not None:
                pos = self._open_position
                pos_high = candle[2]  # Bar high
                pos_low = candle[3]   # Bar low

                exit_reason = None
                exit_price = None

                # Check stop loss
                if pos["stop_loss"] is not None:
                    if pos["side"] == "BUY" and pos_low <= pos["stop_loss"]:
                        exit_reason = "stop_loss"
                        exit_price = pos["stop_loss"]
                    elif pos["side"] == "SELL" and pos_high >= pos["stop_loss"]:
                        exit_reason = "stop_loss"
                        exit_price = pos["stop_loss"]

                # Check take profit
                if exit_reason is None and pos["take_profit"] is not None:
                    if pos["side"] == "BUY" and pos_high >= pos["take_profit"]:
                        exit_reason = "take_profit"
                        exit_price = pos["take_profit"]
                    elif pos["side"] == "SELL" and pos_low <= pos["take_profit"]:
                        exit_reason = "take_profit"
                        exit_price = pos["take_profit"]

                # Check strategy exit
                if exit_reason is None:
                    from models import Position as PositionModel
                    mock_position = type('MockPosition', (), {
                        'symbol': pos['symbol'],
                        'side': type('Side', (), {'value': pos['side']})(),
                        'entry_price': pos['entry_price'],
                        'quantity': pos['quantity'],
                        'leverage': pos.get('leverage', 1),
                    })()

                    should_exit = await strategy.should_exit(mock_position, data[:bar_idx + 1])
                    if should_exit:
                        exit_reason = "strategy_exit"
                        exit_price = close_price

                # Close position
                if exit_price is not None:
                    trade = self._close_position(
                        exit_price=exit_price,
                        bar_time=bar_time,
                        reason=exit_reason,
                        commission_rate=commission_rate,
                        slippage=slippage,
                    )

                    if trade:
                        equity += trade.net_pnl
                        total_fees += trade.fee
                        self._trades.append(trade)

                        if trade.pnl > 0:
                            winning_trades += 1
                            total_win_pnl += trade.pnl
                        else:
                            losing_trades += 1
                            total_loss_pnl += abs(trade.pnl)

                        self._open_position = None

            # Generate signals if no open position
            if self._open_position is None:
                bar_data = data[max(0, bar_idx - 100):bar_idx + 1]
                signals = await strategy.calculate_signals(symbol, bar_data)

                for signal in signals:
                    if self._open_position is not None:
                        break

                    if signal.side in ("BUY", "SELL"):
                        # Calculate position size
                        risk_amount = equity * risk_per_trade
                        sl_distance = 0
                        if signal.stop_loss and close_price > 0:
                            sl_distance = abs(close_price - signal.stop_loss)

                        if sl_distance > 0:
                            quantity = risk_amount / sl_distance
                        else:
                            quantity = (equity * 0.1) / close_price if close_price > 0 else 0

                        if quantity <= 0:
                            continue

                        # Calculate fees for entry
                        entry_fee = close_price * quantity * commission_rate

                        # Apply slippage
                        actual_entry = close_price * (1 + slippage) if signal.side == "BUY" else close_price * (1 - slippage)

                        # Determine SL/TP
                        sl = signal.stop_loss
                        tp = signal.take_profit

                        if sl is None and stop_loss_pct:
                            sl = actual_entry * (1 - stop_loss_pct) if signal.side == "BUY" else actual_entry * (1 + stop_loss_pct)

                        if tp is None and take_profit_pct:
                            tp = actual_entry * (1 + take_profit_pct) if signal.side == "BUY" else actual_entry * (1 - take_profit_pct)

                        # Use strategy defaults if still None
                        if sl is None:
                            sl = strategy.get_stop_loss(actual_entry, signal.side)
                        if tp is None:
                            tp = strategy.get_take_profit(actual_entry, signal.side)

                        self._open_position = {
                            "symbol": symbol,
                            "side": signal.side,
                            "entry_price": actual_entry,
                            "quantity": quantity,
                            "leverage": leverage,
                            "stop_loss": sl,
                            "take_profit": tp,
                            "entry_time": bar_time,
                            "entry_fee": entry_fee,
                            "signal": signal.strategy_name,
                        }

            # Update equity curve
            if equity > peak_equity:
                peak_equity = equity
                current_dd_duration = 0
            else:
                current_dd_duration += 1

            dd = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0
            if dd > max_dd:
                max_dd = dd
                max_dd_duration = current_dd_duration

            equity_point = BacktestEquityPoint(
                timestamp=bar_time,
                equity=round(equity, 2),
                drawdown=round(peak_equity - equity, 2),
                drawdown_pct=round(dd * 100, 2),
                trades=len(self._trades),
                winning_trades=winning_trades,
                losing_trades=losing_trades,
            )
            self._equity_curve.append(equity_point)

        # Calculate final metrics
        total_trades = len(self._trades)
        win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0
        total_pnl = equity - initial_capital
        total_pnl_pct = (total_pnl / initial_capital * 100) if initial_capital > 0 else 0

        avg_win = total_win_pnl / winning_trades if winning_trades > 0 else 0
        avg_loss = total_loss_pnl / losing_trades if losing_trades > 0 else 0
        profit_factor = total_win_pnl / total_loss_pnl if total_loss_pnl > 0 else float("inf")

        best_trade = max((t.pnl for t in self._trades), default=0)
        worst_trade = min((t.pnl for t in self._trades), default=0)

        expectancy = (
            (win_rate / 100 * avg_win) - ((1 - win_rate / 100) * avg_loss)
        )

        # Sharpe ratio (simplified)
        returns = np.diff([p.equity for p in self._equity_curve])
        sharpe = 0.0
        if len(returns) > 1 and np.std(returns) > 0:
            sharpe = np.mean(returns) / np.std(returns) * np.sqrt(252)

        calmar = (total_pnl_pct / 100) / max_dd if max_dd > 0 else 0

        # Avg trade duration
        avg_duration = 0.0
        if self._trades:
            durations = []
            for t in self._trades:
                delta = t.exit_time - t.entry_time
                durations.append(delta.total_seconds() / 3600)  # hours
            avg_duration = np.mean(durations)

        metrics = BacktestMetrics(
            total_pnl=round(total_pnl, 2),
            total_pnl_pct=round(total_pnl_pct, 2),
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            win_rate=round(win_rate, 2),
            profit_factor=round(profit_factor, 2),
            sharpe_ratio=round(sharpe, 2),
            max_drawdown=round(max_dd * 100, 2),
            max_drawdown_duration_bars=max_dd_duration,
            avg_win=round(avg_win, 2),
            avg_loss=round(avg_loss, 2),
            avg_trade_duration_bars=round(avg_duration, 1),
            best_trade=round(best_trade, 2),
            worst_trade=round(worst_trade, 2),
            expectancy=round(expectancy, 2),
            calmar_ratio=round(calmar, 2),
            total_fees=round(total_fees, 2),
            equity_curve=self._equity_curve,
            trades_list=self._trades,
        )

        logger.info(
            f"Backtest complete: {total_trades} trades, "
            f"P&L=${total_pnl:.2f} ({total_pnl_pct:.1f}%), "
            f"Win Rate={win_rate:.1f}%, Sharpe={sharpe:.2f}"
        )

        return metrics

    def _close_position(
        self,
        exit_price: float,
        bar_time: datetime,
        reason: str,
        commission_rate: float,
        slippage: float,
    ) -> Optional[BacktestTrade]:
        """
        Close the current open position and record the trade.

        Args:
            exit_price: Exit price before slippage.
            bar_time: Bar timestamp.
            reason: Exit reason.
            commission_rate: Fee rate.
            slippage: Slippage rate.

        Returns:
            BacktestTrade if a position was open, None otherwise.
        """
        if self._open_position is None:
            return None

        pos = self._open_position

        # Apply slippage to exit price
        if pos["side"] == "BUY":
            actual_exit = exit_price * (1 - slippage)
        else:
            actual_exit = exit_price * (1 + slippage)

        # Calculate P&L
        if pos["side"] == "BUY":
            pnl = (actual_exit - pos["entry_price"]) * pos["quantity"]
        else:
            pnl = (pos["entry_price"] - actual_exit) * pos["quantity"]

        # Apply leverage
        if pos.get("leverage", 1) > 1:
            pnl *= pos["leverage"]

        # Calculate exit fee
        exit_fee = actual_exit * pos["quantity"] * commission_rate
        total_fee = pos.get("entry_fee", 0) + exit_fee

        net_pnl = pnl - total_fee

        self._trade_counter += 1

        trade = BacktestTrade(
            id=self._trade_counter,
            symbol=pos["symbol"],
            side=pos["side"],
            entry_price=pos["entry_price"],
            exit_price=round(actual_exit, 6),
            quantity=pos["quantity"],
            leverage=pos.get("leverage", 1),
            pnl=round(pnl, 2),
            fee=round(total_fee, 4),
            net_pnl=round(net_pnl, 2),
            entry_time=pos["entry_time"],
            exit_time=bar_time,
            stop_loss=pos.get("stop_loss"),
            take_profit=pos.get("take_profit"),
            strategy_signal=pos.get("signal", ""),
        )

        return trade

    @staticmethod
    def calculate_slippage(price: float, volume: float, slippage_rate: float = 0.0005) -> float:
        """
        Calculate slippage-adjusted price.

        Args:
            price: Original price.
            volume: Trade volume.
            slippage_rate: Base slippage rate.

        Returns:
            Slippage-adjusted price.
        """
        # Volume impact: larger trades get more slippage
        volume_impact = min(volume * 0.00001, 0.001)
        total_slippage = slippage_rate + volume_impact
        return price * (1 + total_slippage)

    @staticmethod
    def calculate_fees(price: float, quantity: float, commission_rate: float) -> float:
        """
        Calculate trading fees.

        Args:
            price: Trade price.
            quantity: Trade quantity.
            commission_rate: Commission rate.

        Returns:
            Total fee amount.
        """
        return round(price * quantity * commission_rate, 6)

    @staticmethod
    async def simulate_candles(
        symbol: str,
        timeframe: str,
        start_date: datetime,
        end_date: datetime,
        exchange_name: Optional[str] = None,
    ) -> List[List[float]]:
        """
        Simulate or fetch historical candle data.

        In production, fetches from exchange. For simulation, generates
        random walk data.

        Args:
            symbol: Trading symbol.
            timeframe: Candle timeframe.
            start_date: Start date.
            end_date: End date.
            exchange_name: Optional exchange name for live data.

        Returns:
            List of OHLCV candles.
        """
        # Simple random walk simulation for testing
        np.random.seed(42)
        duration_hours = (end_date - start_date).total_seconds() / 3600

        # Timeframe to hours mapping
        tf_hours = {
            "1m": 1/60, "5m": 5/60, "15m": 15/60,
            "1h": 1, "4h": 4, "1d": 24, "1w": 168,
        }
        bar_hours = tf_hours.get(timeframe, 1)
        num_bars = int(duration_hours / bar_hours)

        if num_bars <= 0:
            return []

        # Start price based on symbol
        base_prices = {
            "BTC/USDT": 67000, "ETH/USDT": 3500, "SOL/USDT": 195,
            "DOGE/USDT": 0.15, "XRP/USDT": 0.60, "AVAX/USDT": 40,
            "LINK/USDT": 15, "ADA/USDT": 0.45,
        }
        start_price = base_prices.get(symbol, 100.0)

        candles: List[List[float]] = []
        current_price = start_price

        for i in range(num_bars):
            timestamp = start_date.timestamp() * 1000 + i * bar_hours * 3600 * 1000

            # Random walk with slight upward bias
            change = np.random.normal(0.0001, 0.005)
            open_price = current_price
            close_price = open_price * (1 + change)

            # Generate high/low
            intra_range = abs(close_price - open_price)
            high = max(open_price, close_price) + np.random.uniform(0, intra_range * 2)
            low = min(open_price, close_price) - np.random.uniform(0, intra_range * 2)

            # Generate volume
            volume = np.random.lognormal(mean=10, sigma=1)

            candles.append([
                timestamp, round(open_price, 2), round(high, 2),
                round(low, 2), round(close_price, 2), round(volume, 2),
            ])

            current_price = close_price

        return candles
