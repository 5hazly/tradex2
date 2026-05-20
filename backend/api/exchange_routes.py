"""
Exchange API Routes
Exchange management endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from loguru import logger

from database import get_db
from auth import get_current_active_user
from models import User, Exchange, Balance
from schemas import ExchangeCreate

router = APIRouter()


@router.get("/exchanges")
async def get_exchanges(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all configured exchanges."""
    result = await db.execute(
        select(Exchange).where(Exchange.user_id == current_user.id)
    )
    exchanges = result.scalars().all()

    exchange_list = []
    for ex in exchanges:
        # Get balance for this exchange
        balance_result = await db.execute(
            select(Balance).where(
                Balance.exchange_id == ex.id,
                Balance.user_id == current_user.id,
            )
        )
        balance = balance_result.scalar_one_or_none()

        exchange_list.append({
            "id": str(ex.id),
            "name": ex.name,
            "is_testnet": ex.is_testnet,
            "is_active": ex.is_active,
            "balance": {
                "total_balance": balance.total_balance if balance else 0,
                "available_balance": balance.available_balance if balance else 0,
                "unrealized_pnl": balance.unrealized_pnl if balance else 0,
                "currency": balance.currency if balance else "USDT",
            },
            "connected": ex.is_active,
        })

    return {"exchanges": exchange_list}


@router.post("/exchanges", status_code=status.HTTP_201_CREATED)
async def add_exchange(
    exchange_data: ExchangeCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new exchange connection."""
    from cryptography.fernet import Fernet
    import os

    # Encrypt API keys
    key = os.environ.get("ENCRYPTION_KEY", Fernet.generate_key().decode())
    f = Fernet(key.encode() if isinstance(key, str) else key)
    encrypted_api_key = f.encrypt(exchange_data.api_key.encode()).decode()
    encrypted_secret = f.encrypt(exchange_data.api_secret.encode()).decode()

    exchange = Exchange(
        name=exchange_data.name,
        api_key=encrypted_api_key,
        api_secret=encrypted_secret,
        is_testnet=exchange_data.is_testnet or False,
        is_active=True,
        user_id=current_user.id,
    )
    db.add(exchange)
    await db.commit()
    await db.refresh(exchange)

    # Test connection
    try:
        from exchange_manager import ExchangeManager
        mgr = ExchangeManager()
        await mgr.test_connection(str(exchange.id), exchange.name)
        logger.info(f"Exchange {exchange.name} connected successfully")
    except Exception as e:
        logger.warning(f"Exchange {exchange.name} connection test failed: {e}")
        exchange.is_active = False
        await db.commit()

    return {"status": "success", "exchange_id": str(exchange.id), "name": exchange.name}


@router.post("/exchanges/{exchange_id}/test")
async def test_exchange_connection(
    exchange_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Test exchange API connection."""
    result = await db.execute(
        select(Exchange).where(
            Exchange.id == exchange_id,
            Exchange.user_id == current_user.id,
        )
    )
    exchange = result.scalar_one_or_none()
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    try:
        from exchange_manager import ExchangeManager
        mgr = ExchangeManager()
        balance = await mgr.get_balance(str(exchange.id), exchange.name)
        return {"status": "connected", "balance": balance}
    except Exception as e:
        return {"status": "failed", "error": str(e)}


@router.delete("/exchanges/{exchange_id}")
async def remove_exchange(
    exchange_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an exchange connection."""
    result = await db.execute(
        select(Exchange).where(
            Exchange.id == exchange_id,
            Exchange.user_id == current_user.id,
        )
    )
    exchange = result.scalar_one_or_none()
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    await db.delete(exchange)
    await db.commit()

    logger.info(f"Exchange {exchange.name} removed")
    return {"status": "success", "message": "Exchange removed"}


@router.get("/exchanges/{exchange_id}/balances")
async def get_exchange_balances(
    exchange_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get balances from a specific exchange."""
    result = await db.execute(
        select(Exchange).where(
            Exchange.id == exchange_id,
            Exchange.user_id == current_user.id,
        )
    )
    exchange = result.scalar_one_or_none()
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange not found")

    try:
        from exchange_manager import ExchangeManager
        mgr = ExchangeManager()
        balances = await mgr.get_balance(str(exchange.id), exchange.name)
        return {"exchange": exchange.name, "balances": balances}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
