"""
Exchange Manager — CCXT-based abstraction layer for crypto exchanges.

Provides a unified async interface to interact with multiple exchanges
(Binance, Bybit, BingX, OKX, KuCoin) through CCXT.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import ccxt.async_support as ccxt

from config import settings

logger = logging.getLogger(__name__)

# Mapping of exchange names to CCXT exchange classes
EXCHANGE_CLASSES: Dict[str, type] = {
    "BINANCE": ccxt.binance,
    "BYBIT": ccxt.bybit,
    "BINGX": ccxt.bingx,
    "OKX": ccxt.okx,
    "KUCOIN": ccxt.kucoin,
}


class ExchangeError(Exception):
    """Custom exception for exchange-related errors."""

    def __init__(self, message: str, exchange: str = "", code: Optional[str] = None):
        self.exchange = exchange
        self.code = code
        super().__init__(f"[{exchange}] {message}" if exchange else message)


class RateLimiter:
    """
    Simple token bucket rate limiter for exchange API calls.

    Args:
        max_requests: Maximum number of requests allowed per window.
        window_seconds: Time window in seconds.
    """

    def __init__(self, max_requests: int = 10, window_seconds: float = 1.0):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._tokens: float = float(max_requests)
        self._last_refill: float = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait until a token is available."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            self._tokens = min(
                self.max_requests,
                self._tokens + elapsed * (self.max_requests / self.window_seconds),
            )
            self._last_refill = now

            if self._tokens < 1.0:
                wait_time = (1.0 - self._tokens) / (self.max_requests / self.window_seconds)
                logger.debug(f"Rate limited, waiting {wait_time:.3f}s")
                await asyncio.sleep(wait_time)
                self._tokens = 0.0
            else:
                self._tokens -= 1.0


class ExchangeManager:
    """
    Unified exchange abstraction using CCXT async.

    Manages connections to multiple exchanges with rate limiting,
    error handling, and automatic reconnection logic.

    Usage:
        manager = ExchangeManager()

        # Create an exchange instance
        exchange = await manager.create_exchange("BINANCE", api_key, api_secret)

        # Get balance
        balance = await manager.get_balance("BINANCE")

        # Get positions
        positions = await manager.get_positions("BINANCE")

        # Create order
        order = await manager.create_order("BINANCE", "BTC/USDT", "buy", "limit", 50000, 0.001)
    """

    def __init__(self) -> None:
        """Initialize the ExchangeManager with empty connection pool."""
        self._exchanges: Dict[str, ccxt.Exchange] = {}
        self._rate_limiters: Dict[str, RateLimiter] = {}
        self._last_heartbeat: Dict[str, float] = {}
        self._heartbeat_interval: int = settings.ws_heartbeat_interval
        self._max_retries: int = 3
        self._retry_delay: float = 1.0

    # -----------------------------------------------------------------------
    # Exchange Lifecycle
    # -----------------------------------------------------------------------

    async def create_exchange(
        self,
        name: str,
        api_key: str,
        api_secret: str,
        passphrase: Optional[str] = None,
        testnet: bool = False,
    ) -> ccxt.Exchange:
        """
        Create and register an exchange instance.

        Args:
            name: Exchange name (BINANCE, BYBIT, BINGX, OKX, KUCOIN).
            api_key: API key for authentication.
            api_secret: API secret for authentication.
            passphrase: Optional passphrase (required for OKX, KuCoin).
            testnet: Whether to use the testnet environment.

        Returns:
            Configured CCXT exchange instance.

        Raises:
            ExchangeError: If the exchange name is not supported.
        """
        name_upper = name.upper()
        if name_upper not in EXCHANGE_CLASSES:
            raise ExchangeError(
                f"Unsupported exchange: {name}. Supported: {list(EXCHANGE_CLASSES.keys())}",
                exchange=name,
            )

        # Close existing connection if any
        if name_upper in self._exchanges:
            await self.close_exchange(name_upper)

        exchange_class = EXCHANGE_CLASSES[name_upper]
        config: Dict[str, Any] = {
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
            "options": {
                "defaultType": "future",
            },
        }

        if passphrase:
            config["password"] = passphrase
        if testnet:
            config["sandbox"] = True

        try:
            exchange = exchange_class(config)
            await exchange.load_markets()
            self._exchanges[name_upper] = exchange
            self._rate_limiters[name_upper] = RateLimiter(max_requests=10, window_seconds=1.0)
            self._last_heartbeat[name_upper] = time.monotonic()
            logger.info(f"Exchange '{name_upper}' connected successfully ({len(exchange.markets)} markets loaded)")
            return exchange
        except ccxt.AuthenticationError as e:
            logger.error(f"Authentication failed for '{name_upper}': {e}")
            raise ExchangeError(f"Authentication failed: {e}", exchange=name, code="AUTH_ERROR")
        except ccxt.NetworkError as e:
            logger.error(f"Network error connecting to '{name_upper}': {e}")
            raise ExchangeError(f"Network error: {e}", exchange=name, code="NETWORK_ERROR")
        except ccxt.ExchangeError as e:
            logger.error(f"Exchange error for '{name_upper}': {e}")
            raise ExchangeError(f"Exchange error: {e}", exchange=name, code="EXCHANGE_ERROR")
        except Exception as e:
            logger.error(f"Unexpected error creating exchange '{name_upper}': {e}")
            raise ExchangeError(f"Unexpected error: {e}", exchange=name, code="UNKNOWN_ERROR")

    async def close_exchange(self, name: str) -> None:
        """
        Close an exchange connection.

        Args:
            name: Exchange name to close.
        """
        name_upper = name.upper()
        if name_upper in self._exchanges:
            try:
                await self._exchanges[name_upper].close()
                logger.info(f"Exchange '{name_upper}' connection closed")
            except Exception as e:
                logger.warning(f"Error closing exchange '{name_upper}': {e}")
            finally:
                del self._exchanges[name_upper]
                self._rate_limiters.pop(name_upper, None)
                self._last_heartbeat.pop(name_upper, None)

    async def close_all(self) -> None:
        """Close all exchange connections."""
        names = list(self._exchanges.keys())
        for name in names:
            await self.close_exchange(name)
        logger.info("All exchange connections closed")

    # -----------------------------------------------------------------------
    # Heartbeat
    # -----------------------------------------------------------------------

    def check_heartbeat(self, name: str) -> bool:
        """
        Check if an exchange connection is still alive.

        Args:
            name: Exchange name to check.

        Returns:
            True if heartbeat is within interval, False otherwise.
        """
        name_upper = name.upper()
        if name_upper not in self._last_heartbeat:
            return False
        elapsed = time.monotonic() - self._last_heartbeat[name_upper]
        return elapsed < self._heartbeat_interval

    def update_heartbeat(self, name: str) -> None:
        """Update the heartbeat timestamp for an exchange."""
        self._last_heartbeat[name.upper()] = time.monotonic()

    # -----------------------------------------------------------------------
    # Retry Wrapper
    # -----------------------------------------------------------------------

    async def _execute_with_retry(
        self,
        name: str,
        method_name: str,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """
        Execute an exchange method with retry logic.

        Args:
            name: Exchange name.
            method_name: Name of the exchange method to call.
            *args: Positional arguments for the method.
            **kwargs: Keyword arguments for the method.

        Returns:
            Result of the exchange method call.

        Raises:
            ExchangeError: If all retries are exhausted.
        """
        name_upper = name.upper()
        if name_upper not in self._exchanges:
            raise ExchangeError(f"Exchange '{name_upper}' not connected", exchange=name, code="NOT_CONNECTED")

        rate_limiter = self._rate_limiters.get(name_upper)
        exchange = self._exchanges[name_upper]

        last_error: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            if rate_limiter:
                await rate_limiter.acquire()

            try:
                method = getattr(exchange, method_name)
                result = await method(*args, **kwargs)
                self.update_heartbeat(name_upper)
                return result
            except ccxt.RateLimitExceeded as e:
                logger.warning(f"Rate limit exceeded for '{name_upper}', attempt {attempt}/{self._max_retries}")
                last_error = e
                wait_time = self._retry_delay * attempt * 2
                await asyncio.sleep(wait_time)
            except ccxt.NetworkError as e:
                logger.warning(f"Network error for '{name_upper}', attempt {attempt}/{self._max_retries}: {e}")
                last_error = e
                wait_time = self._retry_delay * attempt
                await asyncio.sleep(wait_time)
            except ccxt.ExchangeError as e:
                logger.error(f"Exchange error for '{name_upper}': {e}")
                raise ExchangeError(f"Exchange error: {e}", exchange=name, code="EXCHANGE_ERROR")
            except Exception as e:
                logger.error(f"Unexpected error for '{name_upper}': {e}")
                raise ExchangeError(f"Unexpected error: {e}", exchange=name, code="UNKNOWN_ERROR")

        raise ExchangeError(
            f"Failed after {self._max_retries} retries: {last_error}",
            exchange=name,
            code="RETRY_EXHAUSTED",
        )

    # -----------------------------------------------------------------------
    # Exchange Operations
    # -----------------------------------------------------------------------

    async def get_balance(
        self,
        name: str,
        currency: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get account balance from an exchange.

        Args:
            name: Exchange name.
            currency: Optional currency filter (e.g., "USDT").

        Returns:
            Dictionary of currency balances.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        balance = await self._execute_with_retry(name, "fetch_balance")
        if currency:
            return {currency: balance.get(currency, {})}
        return balance

    async def get_positions(
        self,
        name: str,
        symbol: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get open positions from an exchange.

        Args:
            name: Exchange name.
            symbol: Optional symbol filter (e.g., "BTC/USDT").

        Returns:
            List of position dictionaries.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        positions = await self._execute_with_retry(name, "fetch_positions", [symbol] if symbol else None)
        # Filter out positions with zero amount
        active_positions = [
            p for p in positions
            if float(p.get("contracts", 0)) > 0 or float(p.get("positionAmt", 0)) != 0
        ]
        return active_positions

    async def create_order(
        self,
        name: str,
        symbol: str,
        side: str,
        order_type: str,
        amount: float,
        price: Optional[float] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create an order on an exchange.

        Args:
            name: Exchange name.
            symbol: Trading pair (e.g., "BTC/USDT").
            side: Order side ("buy" or "sell").
            order_type: Order type ("market", "limit", "stop", etc.).
            amount: Order quantity.
            price: Optional price for limit/stop orders.
            params: Additional exchange-specific parameters.

        Returns:
            Order dictionary from the exchange.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(
            name,
            "create_order",
            symbol,
            side,
            order_type,
            amount,
            price,
            params or {},
        )

    async def cancel_order(
        self,
        name: str,
        order_id: str,
        symbol: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Cancel an existing order on an exchange.

        Args:
            name: Exchange name.
            order_id: ID of the order to cancel.
            symbol: Optional trading pair.

        Returns:
            Cancellation response dictionary.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "cancel_order", order_id, symbol)

    async def get_order_book(
        self,
        name: str,
        symbol: str,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """
        Get the order book for a symbol.

        Args:
            name: Exchange name.
            symbol: Trading pair.
            limit: Depth of the order book.

        Returns:
            Order book dictionary with 'bids' and 'asks'.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "fetch_order_book", symbol, limit)

    async def get_ohlcv(
        self,
        name: str,
        symbol: str,
        timeframe: str = "1h",
        since: Optional[int] = None,
        limit: int = 100,
    ) -> List[List[float]]:
        """
        Get OHLCV (candlestick) data for a symbol.

        Args:
            name: Exchange name.
            symbol: Trading pair.
            timeframe: Candle timeframe (e.g., "1m", "5m", "1h", "1d").
            since: Optional start timestamp in milliseconds.
            limit: Maximum number of candles to return.

        Returns:
            List of OHLCV arrays: [timestamp, open, high, low, close, volume].

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "fetch_ohlcv", symbol, timeframe, since, limit)

    async def get_ticker(
        self,
        name: str,
        symbol: str,
    ) -> Dict[str, Any]:
        """
        Get the current ticker/price for a symbol.

        Args:
            name: Exchange name.
            symbol: Trading pair.

        Returns:
            Ticker dictionary with price, volume, change, etc.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "fetch_ticker", symbol)

    async def get_all_tickers(
        self,
        name: str,
    ) -> List[Dict[str, Any]]:
        """
        Get all available tickers from an exchange.

        Args:
            name: Exchange name.

        Returns:
            List of ticker dictionaries.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "fetch_tickers")

    async def get_order(
        self,
        name: str,
        order_id: str,
        symbol: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get a specific order by ID.

        Args:
            name: Exchange name.
            order_id: Order ID to retrieve.
            symbol: Optional trading pair.

        Returns:
            Order dictionary.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "fetch_order", order_id, symbol)

    async def get_open_orders(
        self,
        name: str,
        symbol: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all open orders.

        Args:
            name: Exchange name.
            symbol: Optional symbol filter.

        Returns:
            List of open order dictionaries.

        Raises:
            ExchangeError: On exchange or network errors.
        """
        return await self._execute_with_retry(name, "fetch_open_orders", symbol)

    async def test_connection(
        self,
        name: str,
        api_key: str,
        api_secret: str,
        passphrase: Optional[str] = None,
        testnet: bool = False,
    ) -> Tuple[bool, str]:
        """
        Test exchange connection with given credentials.

        Args:
            name: Exchange name.
            api_key: API key.
            api_secret: API secret.
            passphrase: Optional passphrase.
            testnet: Whether to use testnet.

        Returns:
            Tuple of (success, message).
        """
        try:
            exchange = await self.create_exchange(
                name, api_key, api_secret, passphrase, testnet
            )
            await exchange.fetch_balance()
            await self.close_exchange(name)
            return True, f"Successfully connected to {name}"
        except ExchangeError as e:
            return False, str(e)
        except Exception as e:
            return False, f"Connection failed: {e}"

    def is_exchange_connected(self, name: str) -> bool:
        """
        Check if an exchange is currently connected.

        Args:
            name: Exchange name.

        Returns:
            True if connected, False otherwise.
        """
        return name.upper() in self._exchanges


# Global exchange manager instance
exchange_manager = ExchangeManager()
