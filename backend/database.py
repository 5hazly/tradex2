"""
Database connection and session management using SQLAlchemy async.

Provides async engine, session factory, and dependency injection helpers.
"""

import logging
from collections.abc import AsyncGenerator
from typing import AsyncContextManager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import settings

logger = logging.getLogger(__name__)

# Create async engine
engine = create_async_engine(
    settings.database_url,
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Create async session factory
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base class for all ORM models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an async database session.

    Yields an AsyncSession and ensures proper cleanup after use.
    Automatically commits on success and rolls back on exception.

    Usage:
        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_context() -> AsyncContextManager[AsyncSession]:
    """
    Async context manager for database sessions (non-FastAPI usage).

    Usage:
        async with get_db_context() as db:
            result = await db.execute(select(User))
    """

    class _DBContext:
        async def __aenter__(self) -> AsyncSession:
            self._session = async_session_factory()
            return self._session

        async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
            try:
                if exc_type:
                    await self._session.rollback()
                else:
                    await self._session.commit()
            finally:
                await self._session.close()

    return _DBContext()


async def init_db() -> None:
    """
    Initialize the database by creating all tables.

    Should be called once at application startup.
    In production, prefer using Alembic migrations.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


async def close_db() -> None:
    """
    Close the database engine and clean up connections.

    Should be called at application shutdown.
    """
    try:
        await engine.dispose()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Error closing database: {e}")
        raise


async def check_db_connection() -> bool:
    """
    Check if the database connection is alive.

    Returns:
        True if connection is successful, False otherwise.
    """
    try:
        async with engine.connect() as conn:
            await conn.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return False
