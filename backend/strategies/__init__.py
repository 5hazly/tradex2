"""Strategy package initialization."""

from strategies.base import BaseStrategy, Signal
from strategies.ema_macd import EMAMACDStrategy
from strategies.scalping import ScalpingStrategy
from strategies.breakout import BreakoutStrategy
from strategies.smart_money import SmartMoneyStrategy
from strategies.confluence import ConfluenceStrategy

__all__ = [
    "BaseStrategy",
    "Signal",
    "EMAMACDStrategy",
    "ScalpingStrategy",
    "BreakoutStrategy",
    "SmartMoneyStrategy",
    "ConfluenceStrategy",
]
