"""
TradeAI Pro - Main FastAPI Application
Professional AI-Powered Trading System
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import json
from typing import Optional

from config import settings
from database import init_db, get_db
from websocket.handler import ConnectionManager

# Import API routers
from api.auth_routes import router as auth_router
from api.trading_routes import router as trading_router
from api.analytics_routes import router as analytics_router
from api.strategy_routes import router as strategy_router
from api.backtest_routes import router as backtest_router
from api.exchange_routes import router as exchange_router
from api.settings_routes import router as settings_router
from api.notification_routes import router as notification_router

# WebSocket connection manager
ws_manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler - startup and shutdown events."""
    logger.info("=" * 60)
    logger.info(f"  {settings.APP_NAME} - Starting...")
    logger.info(f"  Environment: {settings.ENV}")
    logger.info(f"  Debug: {settings.DEBUG}")
    logger.info("=" * 60)

    # Initialize database
    await init_db()
    logger.info("Database initialized successfully")

    # Start trading engine (if enabled)
    if settings.ENV == "production":
        logger.info("Trading engine starting in production mode")
    else:
        logger.info("Running in development mode - trading engine disabled")

    logger.info("Application started successfully")
    yield

    # Shutdown
    logger.info("Application shutting down...")
    logger.info("Cleanup complete")


# Create FastAPI application
app = FastAPI(
    title=settings.APP_NAME,
    description="Professional AI-Powered Automated Trading System with multi-exchange support, "
                "advanced risk management, backtesting, and real-time monitoring.",
    version="1.0.0",
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip compression
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# Health check endpoint
@app.get("/health", tags=["System"])
async def health_check():
    """Check system health status."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "environment": settings.ENV,
    }


@app.get("/api/health", tags=["System"])
async def api_health():
    """Detailed API health check with service status."""
    checks = {
        "database": "unknown",
        "redis": "unknown",
        "exchanges": {},
    }

    # Check database
    try:
        async for db in get_db():
            from sqlalchemy import text
            await db.execute(text("SELECT 1"))
            checks["database"] = "connected"
            break
    except Exception as e:
        checks["database"] = f"error: {str(e)}"
        logger.warning(f"Database health check failed: {e}")

    # Check Redis
    try:
        import redis.asyncio as redis
        r = redis.from_url(settings.REDIS_URL)
        await r.ping()
        checks["redis"] = "connected"
        await r.close()
    except Exception as e:
        checks["redis"] = f"error: {str(e)}"

    return {
        "status": "healthy" if all(v == "connected" or isinstance(v, dict) for v in checks.values()) else "degraded",
        "checks": checks,
    }


# WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time trading updates."""
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            msg_type = message.get("type", "unknown")
            if msg_type == "subscribe":
                channels = message.get("channels", ["all"])
                logger.info(f"Client subscribed to: {channels}")
                await ws_manager.send_personal_message(
                    websocket,
                    {"type": "subscribed", "channels": channels}
                )
            elif msg_type == "ping":
                await ws_manager.send_personal_message(
                    websocket, {"type": "pong", "timestamp": str(__import__('time').time())}
                )
            else:
                logger.warning(f"Unknown WebSocket message type: {msg_type}")

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        ws_manager.disconnect(websocket)
        logger.error(f"WebSocket error: {e}")


# Include API routers
app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(trading_router, prefix="/api", tags=["Trading"])
app.include_router(analytics_router, prefix="/api", tags=["Analytics"])
app.include_router(strategy_router, prefix="/api", tags=["Strategies"])
app.include_router(backtest_router, prefix="/api", tags=["Backtesting"])
app.include_router(exchange_router, prefix="/api", tags=["Exchanges"])
app.include_router(settings_router, prefix="/api", tags=["Settings"])
app.include_router(notification_router, prefix="/api", tags=["Notifications"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        workers=1 if settings.DEBUG else 4,
        log_level="info",
    )
