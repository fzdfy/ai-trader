"""多因子组合策略。

CompositeStrategy 通过 JSON 配置驱动，将多个因子加权求和得到综合得分，
得分高于入场阈值时买入，低于出场阈值时卖出，并支持止损止盈。

配置 JSON 结构：
  {
    "factors": [{ "name": "ma_trend_20", "weight": 0.35 }, ...],
    "combine": "weighted_sum",          # 目前仅支持 weighted_sum
    "entry": { "type": "threshold", "value": 0.65 },
    "exit":  { "type": "threshold", "value": 0.30 },
    "risk": { "positionSize": 0.95, "stopLoss": 0.08, "takeProfit": 0.20 }
  }

使用方式：通过 build_composite_strategy(config) 动态子类化，
将配置写入类属性（与 AKQuant 参数机制保持一致）。
"""

from typing import Any

import numpy as np
from akquant import Strategy

from factors import FACTOR_REGISTRY

# 历史数据回溯长度（需覆盖最长因子周期，且 <= 引擎 history_depth=100）
HISTORY_COUNT = 61


class CompositeStrategy(Strategy):
    """多因子加权打分策略。"""

    # 预热周期：足够覆盖最长因子计算窗口
    warmup_period = 60

    # ---- 配置类属性（由 build_composite_strategy 子类化时覆盖）----
    factor_names: list[str] = []
    factor_weights: list[float] = []
    entry_threshold: float = 0.65
    exit_threshold: float = 0.30
    position_size: float = 0.95
    stop_loss: float = 0.08
    take_profit: float = 0.20

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._entry_price = 0.0

    def _collect_data(self, symbol: str) -> dict[str, np.ndarray]:
        """拉取历史行情数据，组织成因子计算所需的 dict。"""
        closes = self.get_history(count=HISTORY_COUNT, symbol=symbol, field="close")
        highs = self.get_history(count=HISTORY_COUNT, symbol=symbol, field="high")
        lows = self.get_history(count=HISTORY_COUNT, symbol=symbol, field="low")
        volumes = self.get_history(count=HISTORY_COUNT, symbol=symbol, field="volume")
        return {
            "close": np.asarray(closes, dtype=float),
            "high": np.asarray(highs, dtype=float),
            "low": np.asarray(lows, dtype=float),
            "volume": np.asarray(volumes, dtype=float),
        }

    def _score(self, data: dict[str, np.ndarray]) -> float:
        """计算加权综合得分。"""
        total = 0.0
        for name, weight in zip(self.factor_names, self.factor_weights):
            factor = FACTOR_REGISTRY.get(name)
            if factor is None:
                continue
            total += factor.compute(data) * weight
        return total

    def on_bar(self, bar) -> None:
        """每根 K 线触发，根据综合得分执行交易。"""
        data = self._collect_data(bar.symbol)
        if len(data["close"]) < HISTORY_COUNT:
            return

        score = self._score(data)
        pos = self.get_position(bar.symbol)

        # 入场：空仓且得分达到阈值
        if pos <= 0 and score >= self.entry_threshold:
            self.order_target_percent(symbol=bar.symbol, target_percent=self.position_size)
            self._entry_price = bar.close

        # 出场：持仓且满足任一离场条件
        elif pos > 0:
            exit_signal = score <= self.exit_threshold

            # 止损 / 止盈
            if self._entry_price > 0:
                change = float(bar.close) / self._entry_price - 1.0
                if change <= -self.stop_loss or change >= self.take_profit:
                    exit_signal = True

            if exit_signal:
                self.order_target_percent(symbol=bar.symbol, target_percent=0.0)
                self._entry_price = 0.0


def build_composite_strategy(config: dict[str, Any]) -> type[CompositeStrategy]:
    """根据 JSON 配置动态构建 CompositeStrategy 子类。

    Args:
        config: 策略配置 JSON（结构见模块 docstring）

    Returns:
        配置注入后的 CompositeStrategy 子类（可直接传给 engine.run）
    """
    factors = config.get("factors", [])
    entry = config.get("entry", {})
    exit_cfg = config.get("exit", {})
    risk = config.get("risk", {})

    overrides: dict[str, Any] = {
        "factor_names": [f["name"] for f in factors],
        "factor_weights": [float(f.get("weight", 1.0 / len(factors))) for f in factors],
        "entry_threshold": float(entry.get("value", 0.65)),
        "exit_threshold": float(exit_cfg.get("value", 0.30)),
        "position_size": float(risk.get("positionSize", 0.95)),
        "stop_loss": abs(float(risk.get("stopLoss", 0.08))),
        "take_profit": float(risk.get("takeProfit", 0.20)),
    }

    return type("CompositeStrategy", (CompositeStrategy,), overrides)
