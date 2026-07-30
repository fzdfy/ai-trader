from .strategies import MACrossStrategy, RSIStrategy, MACDStrategy, BollingerStrategy

STRATEGIES = [
    {
        "name": "ma_cross",
        "label": "MA 双均线交叉",
        "cls": MACrossStrategy,
        "params": [
            {"key": "fast", "label": "快线周期", "default": 5},
            {"key": "slow", "label": "慢线周期", "default": 20},
        ],
    },
    {
        "name": "rsi",
        "label": "RSI 超买超卖",
        "cls": RSIStrategy,
        "params": [
            {"key": "period", "label": "RSI 周期", "default": 14},
            {"key": "oversold", "label": "超卖阈值", "default": 30},
            {"key": "overbought", "label": "超买阈值", "default": 70},
        ],
    },
    {
        "name": "macd",
        "label": "MACD 信号交叉",
        "cls": MACDStrategy,
        "params": [
            {"key": "fast", "label": "快线 EMA", "default": 12},
            {"key": "slow", "label": "慢线 EMA", "default": 26},
            {"key": "signal", "label": "信号线", "default": 9},
        ],
    },
    {
        "name": "bollinger",
        "label": "布林带突破",
        "cls": BollingerStrategy,
        "params": [
            {"key": "period", "label": "布林周期", "default": 20},
            {"key": "multiplier", "label": "标准差倍数", "default": 2},
        ],
    },
]

__all__ = ["MACrossStrategy", "RSIStrategy", "MACDStrategy", "BollingerStrategy", "STRATEGIES"]
