"""
Analytics API Routes
Provides performance metrics, equity curves, and analysis data.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import Optional
from datetime import datetime, timedelta
from loguru import logger

from database import get_db
from auth import get_current_active_user
from models import User, Trade, AnalyticsRecord, Position

router = APIRouter()


@router.get("/analytics/summary")
async def get_analytics_summary(
    period: str = Query("30d", regex="^(24h|7d|30d|90d|1y|all)$"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics summary for a given period."""
    now = datetime.utcnow()
    period_map = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
        "90d": timedelta(days=90),
        "1y": timedelta(days=365),
        "all": timedelta(days=365 * 10),
    }
    start_date = now - period_map.get(period, timedelta(days=30))

    # Basic metrics
    total_trades_q = select(func.count(Trade.id)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.status == "CLOSED",
    )
    wins_q = select(func.count(Trade.id)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.pnl > 0,
        Trade.status == "CLOSED",
    )
    total_pnl_q = select(func.sum(Trade.pnl)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.status == "CLOSED",
    )
    avg_win_q = select(func.avg(Trade.pnl)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.pnl > 0,
        Trade.status == "CLOSED",
    )
    avg_loss_q = select(func.avg(Trade.pnl)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.pnl < 0,
        Trade.status == "CLOSED",
    )
    gross_profit_q = select(func.sum(Trade.pnl)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.pnl > 0,
        Trade.status == "CLOSED",
    )
    gross_loss_q = select(func.sum(Trade.pnl)).where(
        Trade.user_id == current_user.id,
        Trade.closed_at >= start_date,
        Trade.pnl < 0,
        Trade.status == "CLOSED",
    )

    total_trades = (await db.execute(total_trades_q)).scalar() or 0
    wins = (await db.execute(wins_q)).scalar() or 0
    total_pnl = (await db.execute(total_pnl_q)).scalar() or 0
    avg_win = (await db.execute(avg_win_q)).scalar() or 0
    avg_loss = abs((await db.execute(avg_loss_q)).scalar() or 0)
    gross_profit = (await db.execute(gross_profit_q)).scalar() or 0
    gross_loss = abs((await db.execute(gross_loss_q)).scalar() or 0)

    win_rate = (wins / total_trades * 100) if total_trades > 0 else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    # Sharpe Ratio calculation (simplified)
    all_pnls_result = await db.execute(
        select(Trade.pnl).where(
            Trade.user_id == current_user.id,
            Trade.closed_at >= start_date,
            Trade.status == "CLOSED",
        )
    )
    pnls = [r[0] for r in all_pnls_result.fetchall()]
    import numpy as np
    sharpe = 0.0
    if len(pnls) > 1:
        returns = np.array(pnls)
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        sharpe = (mean_return / std_return) * (365 ** 0.5) if std_return > 0 else 0

    # Max drawdown
    max_drawdown = 0.0
    if pnls:
        cumulative = np.cumsum(pnls)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = running_max - cumulative
        max_drawdown = float(np.max(drawdowns)) if len(drawdowns) > 0 else 0

    # Expectancy
    expectancy = (win_rate / 100 * avg_win) - ((1 - win_rate / 100) * avg_loss)

    return {
        "period": period,
        "total_trades": total_trades,
        "winning_trades": wins,
        "losing_trades": total_trades - wins,
        "win_rate": round(win_rate, 2),
        "total_pnl": round(total_pnl, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else None,
        "sharpe_ratio": round(sharpe, 2),
        "max_drawdown": round(max_drawdown, 2),
        "expectancy": round(expectancy, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
    }


@router.get("/analytics/equity-curve")
async def get_equity_curve(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get equity curve data for the specified number of days."""
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get daily P&L aggregation
    from sqlalchemy import func, Date
    result = await db.execute(
        select(
            func.date(Trade.closed_at).label("date"),
            func.sum(Trade.pnl).label("daily_pnl"),
            func.count(Trade.id).label("trade_count"),
        )
        .where(
            Trade.user_id == current_user.id,
            Trade.closed_at >= start_date,
            Trade.status == "CLOSED",
        )
        .group_by(func.date(Trade.closed_at))
        .order_by(func.date(Trade.closed_at))
    )

    daily_data = result.fetchall()

    # Build equity curve
    equity_curve = []
    running_equity = 10000.0  # Starting balance

    current = start_date.date()
    end = datetime.utcnow().date()
    data_index = 0

    while current <= end:
        daily_pnl = 0.0
        trade_count = 0

        if data_index < len(daily_data) and daily_data[data_index][0] == current:
            daily_pnl = float(daily_data[data_index][1]) if daily_data[data_index][1] else 0
            trade_count = int(daily_data[data_index][2]) if daily_data[data_index][2] else 0
            data_index += 1

        running_equity += daily_pnl
        equity_curve.append({
            "date": current.isoformat(),
            "equity": round(running_equity, 2),
            "daily_pnl": round(daily_pnl, 2),
            "trade_count": trade_count,
        })
        current += timedelta(days=1)

    return {"equity_curve": equity_curve, "start_balance": 10000.0, "end_balance": round(running_equity, 2)}


@router.get("/analytics/symbols")
async def get_symbol_performance(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get performance breakdown by symbol."""
    result = await db.execute(
        select(
            Trade.symbol,
            func.count(Trade.id).label("total_trades"),
            func.sum(Trade.pnl).label("total_pnl"),
            func.avg(Trade.pnl).label("avg_pnl"),
            func.sum(func.cast(Trade.pnl > 0, Integer)).label("wins"),
        )
        .where(Trade.user_id == current_user.id, Trade.status == "CLOSED")
        .group_by(Trade.symbol)
        .order_by(desc(func.sum(Trade.pnl)))
    )

    from sqlalchemy import Integer
    result = await db.execute(
        select(
            Trade.symbol,
            func.count(Trade.id).label("total_trades"),
            func.sum(Trade.pnl).label("total_pnl"),
            func.avg(Trade.pnl).label("avg_pnl"),
        )
        .where(Trade.user_id == current_user.id, Trade.status == "CLOSED")
        .group_by(Trade.symbol)
        .order_by(desc(func.sum(Trade.pnl)))
    )

    symbols = []
    for row in result.fetchall():
        total = int(row[1])
        pnl = float(row[2]) if row[2] else 0
        wins_count = await db.execute(
            select(func.count(Trade.id)).where(
                Trade.user_id == current_user.id,
                Trade.symbol == row[0],
                Trade.pnl > 0,
                Trade.status == "CLOSED",
            )
        )
        w = int(wins_count.scalar() or 0)
        symbols.append({
            "symbol": row[0],
            "total_trades": total,
            "total_pnl": round(pnl, 2),
            "avg_pnl": round(float(row[3]) if row[3] else 0, 2),
            "win_rate": round((w / total * 100), 2) if total > 0 else 0,
        })

    return {"symbols": symbols}


@router.get("/analytics/performance-by-strategy")
async def get_strategy_performance(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get performance breakdown by strategy."""
    from models import Strategy
    result = await db.execute(
        select(
            Strategy.name,
            Strategy.type,
            func.count(Trade.id).label("total_trades"),
            func.sum(Trade.pnl).label("total_pnl"),
        )
        .join(Trade, Trade.strategy_id == Strategy.id, isouter=True)
        .where(Trade.user_id == current_user.id, Trade.status == "CLOSED")
        .group_by(Strategy.id)
        .order_by(desc(func.sum(Trade.pnl)))
    )

    strategies = []
    for row in result.fetchall():
        strategies.append({
            "strategy_name": row[0],
            "strategy_type": row[1],
            "total_trades": int(row[2]),
            "total_pnl": round(float(row[3]) if row[3] else 0, 2),
        })

    return {"strategies": strategies}
