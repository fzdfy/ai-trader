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

    # ---- 风控层扩展参数（由 build_composite_strategy 子类化时覆盖，数值均为 0-1 小数）----
    stop_type: str = "fixed"  # 止损方式：fixed=固定百分比 / trailing=移动止损 / atr=ATR 止损
    trailing_stop: float = 0.10  # 移动止损回撤比例（从持仓最高价回撤触发）
    atr_stop_multiple: float = 2.0  # ATR 止损倍数（止损价 = 入场价 - N × ATR）
    take_type: str = "fixed"  # 止盈方式：fixed=固定百分比 / trailing=移动止盈
    trailing_take: float = 0.10  # 移动止盈回撤比例（从持仓最高价回撤触发）
    max_loss_per_trade: float = 0.0  # 单笔最大亏损（0=不限，超限强制离场）
    max_consecutive_losses: int = 0  # 连续亏损熔断次数（0=不限，达到后暂停开仓）

    # ---- 出场层扩展参数（由 build_composite_strategy 子类化时覆盖）----
    exit_type: str = "threshold"  # threshold=得分≤阈值触发，cross=得分下穿阈值触发
    max_holding_days: int = 0  # 持仓时间上限（交易日，0=不限）

    # ---- 仓位层扩展参数（由 build_composite_strategy 子类化时覆盖，数值均为 0-1 小数）----
    position_sizing: str = "fixed"  # 仓位计算方式：fixed/kelly/atr
    position_base_size: float = 0.95  # 基础目标仓位（fixed 直接使用，kelly/atr 作为上限参考）
    position_max_size: float = 0.95  # 单票仓位硬上限
    position_total_cap: float = 1.0  # 总仓位上限
    position_max_count: int = 1  # 最大持仓数量（组合回测用，单标的恒为 1）
    kelly_fraction: float = 0.5  # 凯利分数系数（0.5=半凯利）
    atr_period: int = 14  # ATR 周期
    atr_risk_budget: float = 0.02  # ATR 单笔风险预算（占净值比例）
    pyramiding: bool = False  # 是否分批建仓（加仓）
    first_entry_ratio: float = 0.5  # 首仓比例（相对基础仓位）
    add_on_profit: float = 0.05  # 加仓触发浮盈阈值
    add_size_ratio: float = 0.25  # 每次加仓比例（相对基础仓位）
    max_adds: int = 2  # 最大加仓次数
    partial_exit: bool = False  # 是否分批止盈（减仓）
    partial_exit_ratio: float = 0.5  # 首段止盈后保留比例

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
        # 上一根 bar 的综合得分，供 cross 入场/出场方式做上穿/下穿判断
        self._prev_score: float | None = None
        # 当前持仓已持有的交易日数（用于持仓时间上限强制离场）
        self._holding_bars = 0
        # 仓位层运行时状态
        self._add_count = 0  # 当前持仓已加仓次数
        self._partial_exited = False  # 是否已完成分批止盈减仓
        self._target_size = 0.0  # 当前持仓的目标仓位（0-1）
        self._trade_pnls: list[float] = []  # 已平仓收益率（凯利公式统计用）
        # 风控层运行时状态
        self._highest_price = 0.0  # 当前持仓期间的最高价（移动止损/止盈用）
        self._consecutive_losses = 0  # 连续亏损次数（熔断统计用）
        self._halted = False  # 是否已触发连续亏损熔断（暂停开仓）

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
        """每根 K 线触发，根据综合得分、入场过滤与仓位层配置执行交易。"""
        data = self._collect_data(bar.symbol)
        if len(data["close"]) < HISTORY_COUNT:
            return

        score = self._score(data)
        pos = self.get_position(bar.symbol)

        # 入场：空仓且满足入场信号 + 过滤条件（已熔断则暂停开仓）
        if pos <= 0:
            if not self._halted and self._entry_signal(score) and self._entry_filters_pass(bar, data):
                self._open_position(bar, data)
            self._prev_score = score
            return

        # 持仓：更新最高价、计算浮盈，依次处理分批止盈 / 分批加仓 / 离场
        if float(bar.close) > self._highest_price:
            self._highest_price = float(bar.close)
        change = float(bar.close) / self._entry_price - 1.0 if self._entry_price > 0 else 0.0

        # 1) 分批止盈：首次达到止盈线，减仓保留部分，剩余继续持有
        if self.partial_exit and not self._partial_exited and change >= self.take_profit:
            self._partial_exited = True
            keep = self._target_size * self.partial_exit_ratio
            self.order_target_percent(symbol=bar.symbol, target_percent=keep)
            self._prev_score = score
            return

        # 2) 分批加仓：浮盈达到阈值且未满仓且次数未达上限
        if self.pyramiding and self._add_count < self.max_adds and change >= self.add_on_profit:
            self._add_count += 1
            ratio = self.first_entry_ratio + self.add_size_ratio * self._add_count
            new_target = min(self._target_size * ratio, self._target_size)
            self.order_target_percent(symbol=bar.symbol, target_percent=new_target)

        # 3) 离场信号：得分信号 + 止损/止盈（按风控层方式）+ 单笔最大亏损
        exit_signal = self._exit_signal(score)
        if self._entry_price > 0:
            if self._stop_signal(bar, change, data):
                exit_signal = True
            elif not self.partial_exit and self._take_signal(bar, change):
                exit_signal = True
            # 单笔最大亏损硬止损（0 表示不限）
            if self.max_loss_per_trade > 0 and change <= -self.max_loss_per_trade:
                exit_signal = True

        # 持仓时间上限：持有交易日数达到上限即强制离场
        self._holding_bars += 1
        if self.max_holding_days > 0 and self._holding_bars >= self.max_holding_days:
            exit_signal = True

        if exit_signal:
            self._record_trade(change)
            self._update_consecutive_losses(change)
            self.order_target_percent(symbol=bar.symbol, target_percent=0.0)
            self._entry_price = 0.0
            self._holding_bars = 0
            self._add_count = 0
            self._partial_exited = False
            self._target_size = 0.0
            self._highest_price = 0.0

        # 记录当前得分，供 cross 入场/出场方式做上穿/下穿判断
        self._prev_score = score

    def _open_position(self, bar, data: dict[str, np.ndarray]) -> None:
        """建仓：计算目标仓位，按分批建仓配置决定首笔买入比例。"""
        self._target_size = self._compute_target_size(data)
        self._add_count = 0
        self._partial_exited = False
        self._highest_price = float(bar.close)
        if self.pyramiding:
            first = self._target_size * self.first_entry_ratio
        else:
            first = self._target_size
        self.order_target_percent(symbol=bar.symbol, target_percent=first)
        self._entry_price = bar.close
        self._holding_bars = 0

    def _record_trade(self, change: float) -> None:
        """记录一笔已平仓交易的收益率（供凯利公式动态统计胜率/盈亏比）。"""
        self._trade_pnls.append(change)
        if len(self._trade_pnls) > 200:
            self._trade_pnls = self._trade_pnls[-200:]

    def _stop_signal(self, bar, change: float, data: dict[str, np.ndarray]) -> bool:
        """止损信号：按 stop_type 判定（fixed 固定 / trailing 移动 / atr 波动）。"""
        if self.stop_type == "trailing":
            # 移动止损：从持仓最高价回撤 trailing_stop 比例触发
            if self._highest_price <= 0:
                return False
            return float(bar.close) <= self._highest_price * (1.0 - self.trailing_stop)
        if self.stop_type == "atr":
            # ATR 止损：入场价 - N × ATR
            atr = self._current_atr(data)
            if atr <= 0 or self._entry_price <= 0:
                return False
            return float(bar.close) <= self._entry_price - self.atr_stop_multiple * atr
        # fixed：固定百分比止损
        return change <= -self.stop_loss

    def _take_signal(self, bar, change: float) -> bool:
        """止盈信号：按 take_type 判定（fixed 固定 / trailing 移动）。"""
        if self.take_type == "trailing":
            # 移动止盈：先有浮盈，且从持仓最高价回撤 trailing_take 比例触发
            if self._highest_price <= 0 or self._highest_price <= self._entry_price:
                return False
            return float(bar.close) <= self._highest_price * (1.0 - self.trailing_take)
        # fixed：固定百分比止盈
        return change >= self.take_profit

    def _update_consecutive_losses(self, change: float) -> None:
        """连续亏损熔断统计：亏损累加，盈利清零；达到上限后暂停开仓。"""
        if self.max_consecutive_losses <= 0:
            return
        if change < 0:
            self._consecutive_losses += 1
            if self._consecutive_losses >= self.max_consecutive_losses:
                self._halted = True
        else:
            self._consecutive_losses = 0

    def _compute_target_size(self, data: dict[str, np.ndarray]) -> float:
        """根据仓位计算方式与上限约束，返回目标仓位（0-1）。"""
        base = self.position_base_size
        if self.position_sizing == "kelly":
            size = self._kelly_size(base)
        elif self.position_sizing == "atr":
            size = self._atr_size(data, base)
        else:  # fixed
            size = base
        size = min(size, self.position_max_size, self.position_total_cap)
        return max(0.0, min(size, 1.0))

    def _kelly_size(self, base: float) -> float:
        """凯利公式目标仓位：基于历史已平仓交易动态统计胜率与盈亏比。"""
        if len(self._trade_pnls) < 5:
            return base
        wins = [p for p in self._trade_pnls if p > 0]
        losses = [p for p in self._trade_pnls if p <= 0]
        if not losses:
            return base
        win_rate = len(wins) / len(self._trade_pnls)
        avg_loss = sum(abs(p) for p in losses) / len(losses)
        if avg_loss <= 0:
            return base
        avg_win = sum(wins) / len(wins) if wins else 0.0
        payoff = avg_win / avg_loss
        if payoff <= 0:
            return base
        # 凯利公式 f* = (p * b - q) / b，其中 q = 1 - p
        kelly = (win_rate * payoff - (1.0 - win_rate)) / payoff
        kelly = max(0.0, kelly)
        return min(base, kelly * self.kelly_fraction)

    def _current_atr(self, data: dict[str, np.ndarray]) -> float:
        """计算当前 ATR（真实波幅均值），供 ATR 止损 / ATR 仓位复用。"""
        closes = data["close"]
        highs = data["high"]
        lows = data["low"]
        n = self.atr_period
        if len(closes) < n + 1:
            return 0.0
        trs: list[float] = []
        for i in range(len(closes) - n, len(closes)):
            h = float(highs[i])
            l = float(lows[i])
            pc = float(closes[i - 1])
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        return float(np.mean(trs)) if trs else 0.0

    def _atr_size(self, data: dict[str, np.ndarray], base: float) -> float:
        """ATR 波动率目标仓位：波动越大仓位越小。"""
        closes = data["close"]
        atr = self._current_atr(data)
        price = float(closes[-1])
        if price <= 0 or atr <= 0:
            return base
        # 以 2×ATR 作为单笔止损距离，仓位 = 风险预算 / 止损幅度
        size = self.atr_risk_budget * price / (2.0 * atr)
        return min(base, max(0.0, size))

    def _entry_signal(self, score: float) -> bool:
        """判断是否触发入场信号。

        - threshold：得分 >= 阈值即触发
        - cross：得分从下方上穿阈值（上一根 < 阈值 <= 当前）才触发，更抗噪声
        """
        if self.entry_type == "cross":
            return self._prev_score is not None and self._prev_score < self.entry_threshold <= score
        return score >= self.entry_threshold

    def _exit_signal(self, score: float) -> bool:
        """判断是否触发出场信号。

        - threshold：得分 <= 阈值即触发
        - cross：得分从上方下穿阈值（上一根 > 阈值 >= 当前）才触发，更抗噪声
        """
        if self.exit_type == "cross":
            return self._prev_score is not None and self._prev_score > self.exit_threshold >= score
        return score <= self.exit_threshold

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
    position_cfg = config.get("position", {})
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

    pos_sizing = position_cfg.get("sizing", "fixed")
    if pos_sizing not in ("fixed", "kelly", "atr"):
        pos_sizing = "fixed"

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
        "exit_type": "cross" if exit_cfg.get("type", "threshold") == "cross" else "threshold",
        "max_holding_days": int(exit_cfg.get("maxHoldingDays", 0) or 0),
        "position_sizing": pos_sizing,
        "position_base_size": float(position_cfg.get("baseSize", 0.95)),
        "position_max_size": float(position_cfg.get("maxSize", 0.95)),
        "position_total_cap": float(position_cfg.get("totalCap", 1.0)),
        "position_max_count": int(position_cfg.get("maxPositions", 1) or 1),
        "kelly_fraction": float(position_cfg.get("kellyFraction", 0.5)),
        "atr_period": int(position_cfg.get("atrPeriod", 14) or 14),
        "atr_risk_budget": float(position_cfg.get("atrRiskBudget", 0.02)),
        "pyramiding": bool(position_cfg.get("pyramiding", False)),
        "first_entry_ratio": float(position_cfg.get("firstEntry", 0.5)),
        "add_on_profit": float(position_cfg.get("addOnProfit", 0.05)),
        "add_size_ratio": float(position_cfg.get("addSize", 0.25)),
        "max_adds": int(position_cfg.get("maxAdds", 2) or 2),
        "partial_exit": bool(position_cfg.get("partialExit", False)),
        "partial_exit_ratio": float(position_cfg.get("partialExitRatio", 0.5)),
        "position_size": float(risk.get("positionSize", 0.95)),
        "stop_loss": abs(float(risk.get("stopLoss", 0.08))),
        "take_profit": float(risk.get("takeProfit", 0.20)),
        "stop_type": "trailing" if risk.get("stopType") == "trailing" else ("atr" if risk.get("stopType") == "atr" else "fixed"),
        "trailing_stop": abs(float(risk.get("trailingStop", 0.10))),
        "atr_stop_multiple": float(risk.get("atrStopMultiple", 2.0)),
        "take_type": "trailing" if risk.get("takeType") == "trailing" else "fixed",
        "trailing_take": abs(float(risk.get("trailingTake", 0.10))),
        "max_loss_per_trade": abs(float(risk.get("maxLossPerTrade", 0.0))),
        "max_consecutive_losses": int(risk.get("maxConsecutiveLosses", 0) or 0),
    }

    return type("CompositeStrategy", (CompositeStrategy,), overrides)
