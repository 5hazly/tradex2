"""
Backtesting API Routes
Backtesting management and execution endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime
from loguru import logger
import uuid

from database import get_db
from auth import get_current_active_user
from models import User, BacktestResult
from schemas import BacktestConfig

router = APIRouter()


@router.get("/backtests")
async def get_backtest_results(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all backtest results."""
    result = await db.execute(
        select(BacktestResult)
        .where(BacktestResult.user_id == current_user.id)
        .order_by(desc(BacktestResult.created_at))
    )
    results = result.scalars().all()

    return [
        {
            "id": str(r.id),
            "strategy_id": str(r.strategy_id),
            "start_date": r.start_date.isoformat(),
            "end_date": r.end_date.isoformat(),
            "total_pnl": r.total_pnl,
            "win_rate": r.win_rate,
            "profit_factor": r.profit_factor,
            "sharpe_ratio": r.sharpe_ratio,
            "max_drawdown": r.max_drawdown,
            "total_trades": r.total_trades,
            "parameters": r.parameters,
            "created_at": r.created_at.isoformat(),
        }
        for r in results
    ]


@router.post("/backtests")
async def run_backtest(
    config: BacktestConfig,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new backtest. Returns immediately; results are computed in background."""
    backtest_id = str(uuid.uuid4())

    # Create initial record
    result = BacktestResult(
        id=backtest_id,
        strategy_id=config.strategy_id,
        start_date=config.start_date,
        end_date=config.end_date,
        total_pnl=0,
        win_rate=0,
        profit_factor=0,
        sharpe_ratio=0,
        max_drawdown=0,
        total_trades=0,
        parameters={
            "symbol": config.symbol,
            "timeframe": config.timeframe,
            "initial_capital": config.initial_capital,
            "commission": config.commission,
            "slippage": config.slippage,
        },
        user_id=current_user.id,
    )
    db.add(result)
    await db.commit()

    # Run backtest in background
    background_tasks.add_task(
        execute_backtest,
        backtest_id=backtest_id,
        config=config,
        user_id=str(current_user.id),
    )

    return {"status": "running", "backtest_id": backtest_id, "message": "Backtest started"}


async def execute_backtest(backtest_id: str, config: BacktestConfig, user_id: str):
    """Execute backtest in background task."""
    from database import async_session_factory
    logger.info(f"Starting backtest {backtest_id} for {config.symbol}")

    try:
        from backtesting.engine import BacktestingEngine
        engine = BacktestingEngine()

        results = await engine.run_backtest({
            "strategy_id": config.strategy_id,
            "symbol": config.symbol,
            "timeframe": config.timeframe,
            "start_date": config.start_date,
            "end_date": config.end_date,
            "initial_capital": config.initial_capital,
            "commission": config.commission,
            "slippage": config.slippage,
        })

        # Update results in database
        async with async_session_factory() as db:
            bt_result = await db.get(BacktestResult, backtest_id)
            if bt_result:
                bt_result.total_pnl = results.get("total_pnl", 0)
                bt_result.win_rate = results.get("win_rate", 0)
                bt_result.profit_factor = results.get("profit_factor", 0)
                bt_result.sharpe_ratio = results.get("sharpe_ratio", 0)
                bt_result.max_drawdown = results.get("max_drawdown", 0)
                bt_result.total_trades = results.get("total_trades", 0)
                await db.commit()

        logger.info(f"Backtest {backtest_id} completed: PnL={results.get('total_pnl', 0)}")

    except Exception as e:
        logger.error(f"Backtest {backtest_id} failed: {e}")
        async with async_session_factory() as db:
            bt_result = await db.get(BacktestResult, backtest_id)
            if bt_result:
                bt_result.parameters = bt_result.parameters or {}
                bt_result.parameters["error"] = str(e)
                await db.commit()


@router.get("/backtests/{backtest_id}")
async def get_backtest_result(
    backtest_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get specific backtest result."""
    result = await db.execute(
        select(BacktestResult).where(
            BacktestResult.id == backtest_id,
            BacktestResult.user_id == current_user.id,
        )
    )
    bt = result.scalar_one_or_none()
    if not bt:
        raise HTTPException(status_code=404, detail="Backtest not found")

    return {
        "id": str(bt.id),
        "strategy_id": str(bt.strategy_id),
        "start_date": bt.start_date.isoformat(),
        "end_date": bt.end_date.isoformat(),
        "total_pnl": bt.total_pnl,
        "win_rate": bt.win_rate,
        "profit_factor": bt.profit_factor,
        "sharpe_ratio": bt.sharpe_ratio,
        "max_drawdown": bt.max_drawdown,
        "total_trades": bt.total_trades,
        "parameters": bt.parameters,
        "created_at": bt.created_at.isoformat(),
    }
