"""多因子组合策略。

CompositeStrategy 通过 JSON 配置驱动，将多个因子加权求和得到综合得分，
得分高于入场阈值时买入，低于出场阈值时卖出，并支持止损止盈。

配置 JSON 结构：
  {
    "factors": [
      { "name": "ma_trend_20", "weight": 0.35, "value": 0.5, "direction": 1 }, ...
    ],
    "combine": "weighted_sum",          # weighted_sum/equal_weight/voting/rank/and/or
    "entry": {                          # 入场层配置
      "type": "threshold",              # threshold=得分达标触发 / cross=得分上穿阈值触发
      "value": 0.65,                    # 入场得分阈值
      "volumeConfirm": false,           # 量能确认（当前量 >= 前 N 日均量 × 倍率）
      "volumeConfirmRatio": 1.5,        # 量能确认倍率（可选，默认 1.5）
      "volumeConfirmWindow": 5,         # 量能确认均线窗口（可选，默认 5）
      "limitFilter": false,             # 涨跌停过滤（涨停/跌停当日不买入）
      "stFilter": false,                # ST 过滤（过滤 ST/*ST 标的）
      "marketFilter": false             # 大盘过滤（大盘走弱时不买入）
    },
    "exit":  { "type": "threshold", "value": 0.30 },
    "risk": { "positionSize": 0.95, "stopLoss": 0.08, "takeProfit": 0.20 }
  }

说明：
  - weight / value / entry / exit / risk 的数值均为 0-1 小数（回测页提交前已 /100 归一化）。
  - value 为每因子信号阈值（voting 模式使用），默认 0.5。
  - direction 为方向覆盖：-1 时反转该因子得分（1 - score）。
  - ST 状态（is_st）与大盘趋势（market_trend）为运行时上下文，
    由 main.py 预解析后通过 build_composite_strategy 注入，而非前端配置。

使用方式：通过 build_composite_strategy(config) 动态子类化，
将配置写入类属性（与 AKQuant 参数机制保持一致）。
"""

from typing import Any

import numpy as np
from akquant import Strategy

from factors import FACTOR_REGISTRY
from factors.combine import apply_direction, combine_scores, normalize_combine

# 历史数据回溯长度（需覆盖最长因子周期，且 <= 引擎 history_depth=100）
HISTORY_COUNT = 61


class CompositeStrategy(Strategy):
    """多因子加权打分策略。"""

    # 预热周期：足够覆盖最长因子计算窗口
    warmup_period = 60

    # ---- 配置类属性（由 build_composite_strategy 子类化时覆盖）----
    factor_names: list[str] = []
    factor_weights: list[float] = []
    factor_values: list[float] = []  # 每因子信号阈值（voting 模式使用），0-1
    factor_directions: list[int] = []  # 每因子方向覆盖（1=正向，-1=反向）
    combine_mode: str = "weighted_sum"  # 信号合成方式
    entry_threshold: float = 0.65
    exit_threshold: float = 0.30
    position_size: float = 0.95
    stop_loss: float = 0.08
    take_profit: float = 0.20

    # ---- 入场层扩展参数（由 build_composite_strategy 子类化时覆盖）----
    entry_type: str = "threshold"  # threshold=得分达标触发，cross=得分上穿阈值触发
    entry_volume_confirm: bool = False  # 量能确认：当前量 >= 前 N 日均量 × 倍率
    entry_volume_ratio: float = 1.5  # 量能确认倍率
    entry_volume_window: int = 5  # 量能确认均线窗口
    entry_limit_filter: bool = False  # 涨跌停过滤：涨停/跌停当日不买入
    entry_st_filter: bool = False  # ST 过滤：过滤 ST/*ST 标的
    entry_market_filter: bool = False  # 大盘过滤：大盘走弱时不买入

    # ---- 运行时上下文（由 main.py 预解析后注入，非前端配置项）----
    is_st: bool = False  # 当前回测标的是否为 ST（解析 instrument.name 注入）
    market_trend: dict[str, bool] = {}  # 日期 -> 大盘看多与否（预计算指数趋势注入）

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._entry_price = 0.0
        # 上一根 bar 的综合得分，供 cross 入场方式做上穿判断
        self._prev_score: float | None = None

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
        """计算综合得分。

        先对每个因子应用方向覆盖，再按 combine_mode 合成，
        返回 [0, 1] 的综合得分（0.5 中性、>0.5 看多、<0.5 看空）。
        """
        scores: list[float] = []
        weights: list[float] = []
        thresholds: list[float] = []
        for name, weight, value, direction in zip(
            self.factor_names,
            self.factor_weights,
            self.factor_values,
            self.factor_directions,
        ):
            factor = FACTOR_REGISTRY.get(name)
            if factor is None:
                continue
            scores.append(apply_direction(float(factor.compute(data)), direction))
            weights.append(float(weight))
            thresholds.append(float(value))

        return combine_scores(scores, weights, thresholds, self.combine_mode)

    def on_bar(self, bar) -> None:
        """每根 K 线触发，根据综合得分与入场过滤条件执行交易。"""
        data = self._collect_data(bar.symbol)
        if len(data["close"]) < HISTORY_COUNT:
            return

        score = self._score(data)
        pos = self.get_position(bar.symbol)

        # 入场：空仓且满足入场信号 + 过滤条件
        if pos <= 0:
            if self._entry_signal(score) and self._entry_filters_pass(bar, data):
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

        # 记录当前得分，供 cross 入场方式做上穿判断
        self._prev_score = score

    def _entry_signal(self, score: float) -> bool:
        """判断是否触发入场信号。

        - threshold：得分 >= 阈值即触发
        - cross：得分从下方上穿阈值（上一根 < 阈值 <= 当前）才触发，更抗噪声
        """
        if self.entry_type == "cross":
            return self._prev_score is not None and self._prev_score < self.entry_threshold <= score
        return score >= self.entry_threshold

    def _entry_filters_pass(self, bar, data: dict[str, np.ndarray]) -> bool:
        """依次执行入场过滤，全部通过才允许买入。"""
        # ST 过滤
        if self.entry_st_filter and self.is_st:
            return False

        # 大盘过滤：当前日期大盘走弱（收盘价低于均线）则不入场
        if self.entry_market_filter:
            d = _bar_date(bar)
            if d is not None and d in self.market_trend and not self.market_trend[d]:
                return False

        # 量能确认：当前成交量需 >= 前 N 日均量 × 倍率
        if self.entry_volume_confirm:
            vol = data["volume"]
            if len(vol) < self.entry_volume_window + 1:
                return False
            avg = float(np.mean(vol[-self.entry_volume_window - 1:-1]))
            if avg <= 0 or float(vol[-1]) < avg * self.entry_volume_ratio:
                return False

        # 涨跌停过滤：涨停或跌停当日不买入
        if self.entry_limit_filter and self._at_limit(bar, data):
            return False

        return True

    def _at_limit(self, bar, data: dict[str, np.ndarray]) -> bool:
        """判断当前 bar 是否触及涨跌停（基于前收盘价 × 涨跌停比例近似）。"""
        closes = data["close"]
        if len(closes) < 2:
            return False
        prev_close = float(closes[-2])
        if prev_close <= 0:
            return False
        ratio = self._limit_ratio(bar.symbol)
        limit_up = prev_close * (1.0 + ratio)
        limit_down = prev_close * (1.0 - ratio)
        cur = float(bar.close)
        return cur >= limit_up or cur <= limit_down

    def _limit_ratio(self, symbol: str) -> float:
        """按代码推断涨跌停比例：ST 5%、主板 10%、创业板/科创板 20%、北交所 30%。"""
        if self.is_st:
            return 0.05
        code = symbol.split(".")[0] if "." in symbol else symbol
        if code.startswith("30") or code.startswith("688"):
            return 0.20
        if code.startswith("8"):
            return 0.30
        return 0.10


def _bar_date(bar) -> str | None:
    """从 bar 对象中稳健地提取日期字符串（YYYY-MM-DD）。"""
    for attr in ("time", "datetime", "date", "name"):
        v = getattr(bar, attr, None)
        if v is None:
            continue
        try:
            s = str(v).strip()
        except Exception:
            continue
        if len(s) >= 10:
            return s[:10]
    return None


def build_composite_strategy(
    config: dict[str, Any],
    *,
    is_st: bool = False,
    market_trend: dict[str, bool] | None = None,
) -> type[CompositeStrategy]:
    """根据 JSON 配置动态构建 CompositeStrategy 子类。

    Args:
        config: 策略配置 JSON（结构见模块 docstring）
        is_st: 当前回测标的是否为 ST（由 main.py 解析 instrument.name 注入）
        market_trend: 日期 -> 大盘看多与否（由 main.py 预计算指数趋势注入）

    Returns:
        配置注入后的 CompositeStrategy 子类（可直接传给 engine.run）
    """
    factors = config.get("factors", [])
    combine = normalize_combine(config.get("combine"))
    entry = config.get("entry", {})
    exit_cfg = config.get("exit", {})
    risk = config.get("risk", {})

    n = len(factors)
    default_weight = 1.0 / n if n else 0.0
    names: list[str] = []
    weights: list[float] = []
    values: list[float] = []
    directions: list[int] = []
    for f in factors:
        names.append(f["name"])
        weights.append(float(f.get("weight", default_weight)))
        values.append(float(f.get("value", 0.5)))  # 0-1 阈值
        directions.append(-1 if int(f.get("direction", 1)) < 0 else 1)

    entry_type = entry.get("type", "threshold")
    if entry_type not in ("threshold", "cross"):
        entry_type = "threshold"

    overrides: dict[str, Any] = {
        "factor_names": names,
        "factor_weights": weights,
        "factor_values": values,
        "factor_directions": directions,
        "combine_mode": combine,
        "entry_threshold": float(entry.get("value", 0.65)),
        "entry_type": entry_type,
        "entry_volume_confirm": bool(entry.get("volumeConfirm", False)),
        "entry_volume_ratio": float(entry.get("volumeConfirmRatio", 1.5)),
        "entry_volume_window": int(entry.get("volumeConfirmWindow", 5)),
        "entry_limit_filter": bool(entry.get("limitFilter", False)),
        "entry_st_filter": bool(entry.get("stFilter", False)),
        "entry_market_filter": bool(entry.get("marketFilter", False)),
        "is_st": bool(is_st),
        "market_trend": market_trend or {},
        "exit_threshold": float(exit_cfg.get("value", 0.30)),
        "position_size": float(risk.get("positionSize", 0.95)),
        "stop_loss": abs(float(risk.get("stopLoss", 0.08))),
        "take_profit": float(risk.get("takeProfit", 0.20)),
    }

    return type("CompositeStrategy", (CompositeStrategy,), overrides)
