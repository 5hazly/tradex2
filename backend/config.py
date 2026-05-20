"""
Configuration management using Pydantic Settings.

Loads all configuration from environment variables with sensible defaults.
"""

from typing import Dict, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RiskSettings(BaseSettings):
    """Risk management configuration."""

    max_position_size: float = Field(default=10000.0, description="Maximum position size in USD")
    max_leverage: int = Field(default=20, description="Maximum allowed leverage")
    max_positions: int = Field(default=10, description="Maximum concurrent positions")
    risk_per_trade: float = Field(default=0.02, description="Risk per trade as fraction of capital")
    max_daily_loss: float = Field(default=5000.0, description="Maximum daily loss in USD")
    max_drawdown: float = Field(default=0.10, description="Maximum drawdown as fraction")
    kill_switch_enabled: bool = Field(default=True, description="Enable kill switch")
    max_spread_bps: float = Field(default=10.0, description="Maximum spread in basis points")
    slippage_protection: bool = Field(default=True, description="Enable slippage protection")
    max_slippage_pct: float = Field(default=0.5, description="Maximum slippage percentage")
    volatility_filter: bool = Field(default=True, description="Enable volatility filter")
    atr_threshold: float = Field(default=2.0, description="ATR threshold for volatility filter")

    model_config = SettingsConfigDict(env_prefix="RISK_")


class Settings(BaseSettings):
    """Main application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        env_nested_delimiter="__",
    )

    # Application
    APP_NAME: str = Field(default="TradeAI Pro Backend", description="Application name")
    ENV: str = Field(default="development", description="Environment (development/production)")
    DEBUG: bool = Field(default=False, description="Debug mode")
    SECRET_KEY: str = Field(default="change-me-in-production", description="Secret key for signing")
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")
    ALLOWED_ORIGINS: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:3001", "https://tradeai.pro"],
        description="Allowed CORS origins"
    )
    api_prefix: str = Field(default="/api/v1", description="API route prefix")

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/tradeai",
        description="Async PostgreSQL connection string",
    )
    database_pool_size: int = Field(default=10, description="Database connection pool size")
    database_max_overflow: int = Field(default=20, description="Database max overflow connections")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis connection URL")

    # JWT
    JWT_SECRET: str = Field(default="jwt-secret-change-in-production", description="JWT secret key")
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    JWT_EXPIRATION_MINUTES: int = Field(default=1440, description="JWT token expiration in minutes")
    jwt_secret: str = Field(default="jwt-secret-change-in-production", description="JWT secret key")
    jwt_algorithm: str = Field(default="HS256", description="JWT algorithm")
    jwt_expiration_minutes: int = Field(default=1440, description="JWT token expiration in minutes")

    # Exchange API Keys
    exchange_api_keys: Dict[str, Dict[str, str]] = Field(
        default_factory=lambda: {
            "BINGX": {"api_key": "", "api_secret": ""},
            "BINANCE": {"api_key": "", "api_secret": ""},
            "BYBIT": {"api_key": "", "api_secret": ""},
            "OKX": {"api_key": "", "api_secret": "", "passphrase": ""},
            "KUCOIN": {"api_key": "", "api_secret": "", "passphrase": ""},
        },
        description="Exchange API keys by exchange name",
    )

    # Telegram
    telegram_bot_token: str = Field(default="", description="Telegram bot token")
    telegram_chat_id: str = Field(default="", description="Telegram chat ID")
    telegram_enabled: bool = Field(default=False, description="Enable Telegram notifications")

    # Discord
    discord_webhook_url: str = Field(default="", description="Discord webhook URL")
    discord_enabled: bool = Field(default=False, description="Enable Discord notifications")

    # SMTP / Email
    smtp_host: str = Field(default="", description="SMTP server host")
    smtp_port: int = Field(default=587, description="SMTP server port")
    smtp_user: str = Field(default="", description="SMTP username")
    smtp_password: str = Field(default="", description="SMTP password")
    smtp_use_tls: bool = Field(default=True, description="Use TLS for SMTP")
    smtp_from_email: str = Field(default="", description="From email address")
    email_enabled: bool = Field(default=False, description="Enable email notifications")

    # WebSocket
    ws_heartbeat_interval: int = Field(default=30, description="WebSocket heartbeat interval in seconds")
    ws_max_connections: int = Field(default=100, description="Maximum WebSocket connections")

    # Trading
    default_timeframe: str = Field(default="1h", description="Default candle timeframe")
    default_leverage: int = Field(default=10, description="Default leverage")
    maker_fee: float = Field(default=0.0002, description="Default maker fee rate")
    taker_fee: float = Field(default=0.0005, description="Default taker fee rate")

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level is a known value."""
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        v_upper = v.upper()
        if v_upper not in allowed:
            raise ValueError(f"log_level must be one of {allowed}, got '{v}'")
        return v_upper

    @field_validator("jwt_algorithm")
    @classmethod
    def validate_jwt_algorithm(cls, v: str) -> str:
        """Validate JWT algorithm."""
        allowed = {"HS256", "HS384", "HS512", "RS256"}
        if v not in allowed:
            raise ValueError(f"jwt_algorithm must be one of {allowed}, got '{v}'")
        return v

    @property
    def risk(self) -> RiskSettings:
        """Get risk settings."""
        return RiskSettings()


# Global settings instance
settings = Settings()
