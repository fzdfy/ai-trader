"""涨跌停成交约束撮合器（AKQuant custom matcher）。

背景：AKQuant 无原生涨跌停支持，内置撮合器会在涨停/跌停价照常成交，产生
「一字板买入」「跌停日卖出」等不可信收益。本模块提供 ``LimitMatcher``，注册为
``AssetType.Stock`` 的自定义撮合器（注册后**完全替换**该资产类型的内置撮合器），
在**逐字段复刻默认 NextOpen 成交口径**（下一根 bar 开盘价 ± 滑点）与成本口径的
前提下，拦截不可成交的委托：

  - 买单：成交 bar 为涨停 → 本 bar 不成交（返回 None，挂单顺延 / 当日失效）
  - 卖单：成交 bar 为跌停 → 本 bar 不成交

涨跌停在**原始价空间**判定（``raw 前收 × (1 ± 比例)`` 四舍五入到 0.01），不能用
后复权价近似——``hfq/raw`` 比例随复权因子时间漂移（仿射偏移项非零），近似会有
约 1% 的判定误差。

撮合器按 ``bar_index``（等价于回测 DataFrame 行号）索引，不按 symbol 查：引擎传给
撮合器的 ``bar.symbol`` / ``order.symbol`` 为 ``BENCHMARK``。同一委托首次回调若
成交即返回 ``Trade``，其后每次回调必须返回 ``None``，否则会重复成交。
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from akquant import OrderSide, Trade


def limit_ratio(symbol: str, is_st: bool = False) -> float:
    """按代码推断涨跌停比例：ST 5%、主板 10%、创业板/科创板 20%、北交所 30%。"""
    if is_st:
        return 0.05
    code = symbol.split(".")[0] if "." in symbol else symbol
    if code.startswith("30") or code.startswith("688"):
        return 0.20
    if code.startswith("8"):
        return 0.30
    return 0.10


def compute_limit_sets(
    df: pd.DataFrame,
    raw_close: pd.Series | None,
    symbol: str,
    is_st: bool = False,
) -> tuple[set[int], set[int]]:
    """计算回测区间内逐 bar 的涨停 / 跌停标记（按 df 行号索引）。

    判定在原始价空间：``raw_close[i] >= round(raw_close[i-1] * (1 + ratio), 2)`` 为
    涨停（跌停同理）。raw 序列按自然日与 df 索引对齐，缺数据的行标记为否。
    """
    if raw_close is None or len(raw_close) == 0:
        return set(), set()
    ratio = limit_ratio(symbol, is_st)
    series = pd.Series(
        pd.to_numeric(raw_close.to_numpy(), errors="coerce"),
        index=pd.to_datetime(raw_close.index).normalize(),
        dtype="float64",
    )
    series = series[~series.index.duplicated(keep="last")].sort_index()
    aligned = series.reindex(pd.to_datetime(df.index).normalize())
    prev = aligned.shift(1)
    upper = (prev * (1.0 + ratio)).round(2)
    lower = (prev * (1.0 - ratio)).round(2)
    up_mask = (aligned >= (upper - 1e-9)).fillna(False)
    down_mask = (aligned <= (lower + 1e-9)).fillna(False)
    limit_up = {i for i, v in enumerate(up_mask.tolist()) if bool(v)}
    limit_down = {i for i, v in enumerate(down_mask.tolist()) if bool(v)}
    return limit_up, limit_down


def _basis_to_ratio(value: Any) -> float:
    try:
        return float(value) / 10000.0
    except (TypeError, ValueError):
        return 0.0


class LimitMatcher:
    """复刻默认 NextOpen 成交 + 成本的涨跌停约束撮合器。"""

    def __init__(
        self,
        cost: dict[str, Any] | None = None,
        *,
        limit_up: set[int] | None = None,
        limit_down: set[int] | None = None,
    ) -> None:
        c = cost or {}
        slippage_type = c.get("slippageType", "percent")
        if slippage_type not in ("percent", "fixed"):
            slippage_type = "percent"
        slippage_value = float(c.get("slippageValue", 2))
        self._slippage_type = slippage_type
        self._slippage = (
            _basis_to_ratio(slippage_value) if slippage_type == "percent" else slippage_value
        )
        self._commission = _basis_to_ratio(c.get("commissionRate", 3))
        self._stamp_tax = _basis_to_ratio(c.get("stampTaxRate", 10))
        self._transfer_fee = _basis_to_ratio(c.get("transferFeeRate", 0.1))
        self._min_commission = float(c.get("minCommission", 5.0))
        self._limit_up = set(limit_up or ())
        self._limit_down = set(limit_down or ())
        self._filled: set[Any] = set()

    def _fill_price(self, open_px: float, is_buy: bool) -> float:
        if self._slippage_type == "fixed":
            return open_px + self._slippage if is_buy else open_px - self._slippage
        return open_px * (1.0 + self._slippage) if is_buy else open_px * (1.0 - self._slippage)

    def _commission_for(self, amount: float, is_buy: bool) -> float:
        fee = max(amount * self._commission, self._min_commission) + amount * self._transfer_fee
        if not is_buy:
            fee += amount * self._stamp_tax
        return fee

    def match(self, order: Any, bar: Any, instrument: Any, bar_index: int) -> Trade | None:
        """AKQuant custom matcher 回调：返回 Trade 即成交，返回 None 则本 bar 不成交。"""
        oid = getattr(order, "id", None)
        if oid is not None and oid in self._filled:
            return None
        idx = int(bar_index)
        is_buy = getattr(order, "side", None) == OrderSide.Buy
        if is_buy and idx in self._limit_up:
            return None
        if not is_buy and idx in self._limit_down:
            return None
        quantity = float(getattr(order, "quantity", 0.0) or 0.0)
        open_px = float(getattr(bar, "open", 0.0) or 0.0)
        if quantity <= 0 or open_px <= 0:
            return None
        price = self._fill_price(open_px, is_buy)
        if oid is not None:
            self._filled.add(oid)
        return Trade(
            id=f"lm-{oid}",
            order_id=oid,
            symbol=getattr(order, "symbol", None),
            side=getattr(order, "side", None),
            quantity=quantity,
            price=price,
            commission=self._commission_for(price * quantity, is_buy),
            timestamp=int(getattr(bar, "timestamp", 0) or 0),
            bar_index=idx,
            position_effect=getattr(order, "position_effect", None),
            owner_strategy_id=getattr(order, "owner_strategy_id", None),
        )
