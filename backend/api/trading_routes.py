"""
Trading API Routes
Handles positions, orders, and trades.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import Optional, List
from datetime import datetime, timedelta
from loguru import logger

from database import get_db
from auth import get_current_active_user
from models import User, Position, Order, Trade, Exchange, Strategy
from schemas import (
    PositionResponse,
    OrderCreate,
    OrderResponse,
    TradeResponse,
    TradeFilters,
    DashboardStats,
)
from config import settings

router = APIRouter()


# ============ Dashboard Stats ============

@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comprehensive dashboard statistics."""
    # Total balance across all exchanges
    from models import Balance
    balance_result = await db.execute(
        select(func.sum(Balance.total_balance)).where(Balance.user_id == current_user.id)
    )
    total_balance = balance_result.scalar() or 0.0

    # Today's P&L
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    pnl_result = await db.execute(
        select(func.sum(Trade.pnl)).where(
            Trade.user_id == current_user.id,
            Trade.closed_at >= today_start,
            Trade.status == "CLOSED",
        )
    )
    today_pnl = pnl_result.scalar() or 0.0

    # Win rate
    wins_result = await db.execute(
        select(func.count(Trade.id)).where(
            Trade.user_id == current_user.id,
            Trade.pnl > 0,
            Trade.status == "CLOSED",
        )
    )
    total_result = await db.execute(
        select(func.count(Trade.id)).where(
            Trade.user_id == current_user.id,
            Trade.status == "CLOSED",
        )
    )
    wins = wins_result.scalar() or 0
    total = total_result.scalar() or 0
    win_rate = (wins / total * 100) if total > 0 else 0.0

    # Open positions count
    pos_result = await db.execute(
        select(func.count(Position.id)).where(
            Position.user_id == current_user.id,
            Position.status == "OPEN",
        )
    )
    open_positions = pos_result.scalar() or 0

    # Total unrealized P&L
    unrealized_result = await db.execute(
        select(func.sum(Position.unrealized_pnl)).where(
            Position.user_id == current_user.id,
            Position.status == "OPEN",
        )
    )
    unrealized_pnl = unrealized_result.scalar() or 0.0

    return DashboardStats(
        total_balance=total_balance,
        today_pnl=today_pnl,
        win_rate=win_rate,
        open_positions=open_positions,
        unrealized_pnl=unrealized_pnl,
        total_trades=total,
    )


# ============ Positions ============

@router.get("/positions", response_model=List[PositionResponse])
async def get_positions(
    symbol: Optional[str] = None,
    side: Optional[str] = None,
    status: Optional[str] = "OPEN",
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all positions with optional filters."""
    query = select(Position).where(
        Position.user_id == current_user.id,
    )
    if symbol:
        query = query.where(Position.symbol.ilike(f"%{symbol}%"))
    if side:
        query = query.where(Position.side == side.upper())
    if status:
        query = query.where(Position.status == status.upper())

    query = query.order_by(desc(Position.opened_at))
    result = await db.execute(query)
    positions = result.scalars().all()

    return [
        PositionResponse(
            id=str(p.id),
            symbol=p.symbol,
            side=p.side,
            entry_price=p.entry_price,
            quantity=p.quantity,
            leverage=p.leverage,
            unrealized_pnl=p.unrealized_pnl,
            stop_loss=p.stop_loss,
            take_profit=p.take_profit,
            liquidation_price=p.liquidation_price,
            margin=p.margin,
            status=p.status,
            exchange_id=str(p.exchange_id),
            strategy_id=str(p.strategy_id) if p.strategy_id else None,
            opened_at=p.opened_at.isoformat(),
            updated_at=p.updated_at.isoformat(),
        )
        for p in positions
    ]


@router.post("/positions/{position_id}/close")
async def close_position(
    position_id: str,
    quantity: Optional[float] = None,
    order_type: str = "MARKET",
    price: Optional[float] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Close a position (full or partial)."""
    result = await db.execute(
        select(Position).where(
            Position.id == position_id,
            Position.user_id == current_user.id,
        )
    )
    position = result.scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    close_qty = quantity if quantity else position.quantity

    # Execute close via exchange manager
    try:
        from exchange_manager import ExchangeManager
        mgr = ExchangeManager()
        exchange_result = await mgr.close_position(
            exchange_id=str(position.exchange_id),
            symbol=position.symbol,
            side=position.side,
            quantity=close_qty,
            order_type=order_type,
            price=price,
        )

        # Update position
        if close_qty >= position.quantity:
            position.status = "CLOSED"
        position.quantity -= close_qty
        position.updated_at = datetime.utcnow()
        await db.commit()

        logger.info(f"Closed {close_qty} of {position.symbol} position")
        return {"status": "success", "message": "Position closed", "data": exchange_result}

    except Exception as e:
        logger.error(f"Failed to close position: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Orders ============

@router.get("/orders", response_model=List[OrderResponse])
async def get_orders(
    symbol: Optional[str] = None,
    side: Optional[str] = None,
    order_type: Optional[str] = None,
    order_status: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all orders with optional filters."""
    query = select(Order).where(Order.user_id == current_user.id)
    if symbol:
        query = query.where(Order.symbol.ilike(f"%{symbol}%"))
    if side:
        query = query.where(Order.side == side.upper())
    if order_type:
        query = query.where(Order.type == order_type.upper())
    if order_status:
        query = query.where(Order.status == order_status.upper())

    query = query.order_by(desc(Order.created_at))
    result = await db.execute(query)
    orders = result.scalars().all()

    return [
        OrderResponse(
            id=str(o.id),
            symbol=o.symbol,
            side=o.side,
            type=o.type,
            price=o.price,
            quantity=o.quantity,
            leverage=o.leverage,
            status=o.status,
            reduce_only=o.reduce_only,
            exchange_id=str(o.exchange_id),
            strategy_id=str(o.strategy_id) if o.strategy_id else None,
            created_at=o.created_at.isoformat(),
            updated_at=o.updated_at.isoformat(),
        )
        for o in orders
    ]


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_data: OrderCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new order."""
    # Validate with risk manager
    try:
        from risk_manager import RiskManager
        risk_mgr = RiskManager()
        risk_check = await risk_mgr.check_risk(order_data)
        if not risk_check.approved:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Risk check failed: {risk_check.reason}",
            )
    except ImportError:
        logger.warning("Risk manager not available, skipping risk check")

    # Execute order via exchange manager
    try:
        from exchange_manager import ExchangeManager
        mgr = ExchangeManager()
        exchange_result = await mgr.create_order(
            exchange_id=str(order_data.exchange_id),
            symbol=order_data.symbol,
            side=order_data.side,
            order_type=order_data.type,
            quantity=order_data.quantity,
            price=order_data.price,
            leverage=order_data.leverage,
            reduce_only=order_data.reduce_only,
            stop_loss=order_data.stop_loss,
            take_profit=order_data.take_profit,
        )

        # Save order to database
        order = Order(
            symbol=order_data.symbol,
            side=order_data.side,
            type=order_data.type,
            price=order_data.price,
            quantity=order_data.quantity,
            leverage=order_data.leverage,
            status="PENDING",
            reduce_only=order_data.reduce_only,
            exchange_id=order_data.exchange_id,
            strategy_id=order_data.strategy_id,
            user_id=current_user.id,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        return OrderResponse(
            id=str(order.id),
            symbol=order.symbol,
            side=order.side,
            type=order.type,
            price=order.price,
            quantity=order.quantity,
            leverage=order.leverage,
            status=order.status,
            reduce_only=order.reduce_only,
            exchange_id=str(order.exchange_id),
            strategy_id=str(order.strategy_id) if order.strategy_id else None,
            created_at=order.created_at.isoformat(),
            updated_at=order.updated_at.isoformat(),
        )

    except Exception as e:
        logger.error(f"Failed to create order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending order."""
    result = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.user_id == current_user.id,
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "PENDING":
        raise HTTPException(status_code=400, detail="Can only cancel pending orders")

    try:
        from exchange_manager import ExchangeManager
        mgr = ExchangeManager()
        await mgr.cancel_order(
            exchange_id=str(order.exchange_id),
            order_id=str(order.id),
            symbol=order.symbol,
        )
        order.status = "CANCELLED"
        await db.commit()
        return {"status": "success", "message": "Order cancelled"}
    except Exception as e:
        logger.error(f"Failed to cancel order: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Trades ============

@router.get("/trades", response_model=dict)
async def get_trades(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    symbol: Optional[str] = None,
    side: Optional[str] = None,
    strategy_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get trade history with pagination and filters."""
    query = select(Trade).where(Trade.user_id == current_user.id)
    count_query = select(func.count(Trade.id)).where(Trade.user_id == current_user.id)

    if symbol:
        query = query.where(Trade.symbol.ilike(f"%{symbol}%"))
        count_query = count_query.where(Trade.symbol.ilike(f"%{symbol}%"))
    if side:
        query = query.where(Trade.side == side.upper())
        count_query = count_query.where(Trade.side == side.upper())
    if strategy_id:
        query = query.where(Trade.strategy_id == strategy_id)
        count_query = count_query.where(Trade.strategy_id == strategy_id)
    if start_date:
        sd = datetime.fromisoformat(start_date)
        query = query.where(Trade.closed_at >= sd)
        count_query = count_query.where(Trade.closed_at >= sd)
    if end_date:
        ed = datetime.fromisoformat(end_date)
        query = query.where(Trade.closed_at <= ed)
        count_query = count_query.where(Trade.closed_at <= ed)

    # Get total count
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get paginated results
    query = query.order_by(desc(Trade.closed_at))
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    trades = result.scalars().all()

    return {
        "trades": [
            TradeResponse(
                id=str(t.id),
                symbol=t.symbol,
                side=t.side,
                entry_price=t.entry_price,
                exit_price=t.exit_price,
                quantity=t.quantity,
                leverage=t.leverage,
                pnl=t.pnl,
                fee=t.fee,
                status=t.status,
                exchange_id=str(t.exchange_id),
                strategy_id=str(t.strategy_id) if t.strategy_id else None,
                opened_at=t.opened_at.isoformat() if t.opened_at else None,
                closed_at=t.closed_at.isoformat() if t.closed_at else None,
            )
            for t in trades
        ],
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": (total + per_page - 1) // per_page,
        },
    }
