"""
Strategy API Routes
Strategy management endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime
from loguru import logger

from database import get_db
from auth import get_current_active_user
from models import User, Strategy
from schemas import StrategyCreate, StrategyUpdate, StrategyResponse

router = APIRouter()


@router.get("/strategies")
async def get_strategies(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all strategies."""
    result = await db.execute(
        select(Strategy).where(Strategy.user_id == current_user.id)
    )
    strategies = result.scalars().all()

    return [
        StrategyResponse(
            id=str(s.id),
            name=s.name,
            description=s.description,
            type=s.type,
            parameters=s.parameters,
            is_active=s.is_active,
            timeframe=s.timeframe,
            user_id=str(s.user_id),
            created_at=s.created_at.isoformat(),
        )
        for s in strategies
    ]


@router.post("/strategies", response_model=StrategyResponse, status_code=status.HTTP_201_CREATED)
async def create_strategy(
    strategy_data: StrategyCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new strategy."""
    strategy = Strategy(
        name=strategy_data.name,
        description=strategy_data.description,
        type=strategy_data.type,
        parameters=strategy_data.parameters or {},
        is_active=strategy_data.is_active or False,
        timeframe=strategy_data.timeframe or "1h",
        user_id=current_user.id,
    )
    db.add(strategy)
    await db.commit()
    await db.refresh(strategy)

    return StrategyResponse(
        id=str(strategy.id),
        name=strategy.name,
        description=strategy.description,
        type=strategy.type,
        parameters=strategy.parameters,
        is_active=strategy.is_active,
        timeframe=strategy.timeframe,
        user_id=str(strategy.user_id),
        created_at=strategy.created_at.isoformat(),
    )


@router.patch("/strategies/{strategy_id}")
async def update_strategy(
    strategy_id: str,
    update_data: StrategyUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a strategy (partial update supported)."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == current_user.id,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # Update provided fields
    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(strategy, key, value)

    strategy.updated_at = datetime.utcnow()
    await db.commit()

    logger.info(f"Strategy {strategy.name} updated")
    return {"status": "success", "message": "Strategy updated"}


@router.patch("/strategies/{strategy_id}/toggle")
async def toggle_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle strategy active/inactive status."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == current_user.id,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    strategy.is_active = not strategy.is_active
    await db.commit()

    action = "activated" if strategy.is_active else "deactivated"
    logger.info(f"Strategy {strategy.name} {action}")
    return {"status": "success", "is_active": strategy.is_active, "message": f"Strategy {action}"}


@router.delete("/strategies/{strategy_id}")
async def delete_strategy(
    strategy_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a strategy."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == current_user.id,
        )
    )
    strategy = result.scalar_one_or_none()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    await db.delete(strategy)
    await db.commit()

    logger.info(f"Strategy {strategy.name} deleted")
    return {"status": "success", "message": "Strategy deleted"}
