"""量化策略注册表。

定义所有可用策略的元数据列表 STRATEGIES，供 FastAPI 和前端使用。
每个策略条目包含：
  name   策略标识符，对应回测请求中的 strategy 参数
  label  策略中文名称，前端展示用
  cls    策略类引用，回测引擎通过 _apply_params 子类化后传入
  params 可调参数列表（key/label/default），前端据此渲染参数输入控件
"""

from .strategies import MACrossStrategy, RSIStrategy, MACDStrategy, BollingerStrategy

# 策略注册表：所有可用策略的元数据
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
