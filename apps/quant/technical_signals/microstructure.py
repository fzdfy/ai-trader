"""Microstructure signals constrained by the actual V1 data granularity."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from .catalog import CATALOG_VERSION, SignalDefinition, load_signal_catalog
from .engine import _mean, _signal_result


Tick = Mapping[str, Any]
_MICRO = tuple(
    signal
    for signal in load_signal_catalog()
    if signal.layer == "micro" and signal.scope == "stock"
)


def _unavailable(
    definition: SignalDefinition,
    *,
    object_code: str,
    as_of: str,
    computed_at: str,
    missing: str,
) -> dict[str, Any]:
    return _signal_result(
        definition,
        object_type="stock",
        object_code=object_code,
        object_subtype=None,
        status="unavailable",
        direction="neutral",
        value=None,
        unit=None,
        quality="missing",
        sample_count=0,
        as_of=as_of,
        computed_at=computed_at,
        source="not_connected",
        notes=[f"缺少 {missing}，不生成历史代理或胜率"],
        missing_fields=[missing],
    )


def _validate_ticks(ticks: Sequence[Tick]) -> None:
    for index, tick in enumerate(ticks):
        for field in ("price", "volume", "amount"):
            value = float(tick[field])
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"tick {index} has an invalid {field}")


def evaluate_microstructure_signals(
    bars: Sequence[Mapping[str, Any]],
    *,
    ticks: Sequence[Tick] | None = None,
    order_book: Mapping[str, Any] | None = None,
    object_code: str,
    as_of: str,
    computed_at: str | None = None,
) -> list[dict[str, Any]]:
    ticks = ticks or []
    _validate_ticks(ticks)
    now = computed_at or datetime.now(timezone.utc).isoformat()
    result: list[dict[str, Any]] = []

    tick_prices = [float(tick["price"]) for tick in ticks]
    tick_volumes = [float(tick["volume"]) for tick in ticks]
    directions = [
        1
        if tick.get("direction") == "buy"
        else -1
        if tick.get("direction") == "sell"
        else 1
        if index > 0 and tick_prices[index] >= tick_prices[index - 1]
        else -1
        for index, tick in enumerate(ticks)
    ]
    signed_volumes = [
        tick_volumes[index] * directions[index] for index in range(len(ticks))
    ]
    cvd_value = (
        sum(signed_volumes) / max(sum(tick_volumes), 1.0) if ticks else None
    )

    vwap = (
        sum(
            tick_prices[index] * tick_volumes[index] for index in range(len(ticks))
        )
        / max(sum(tick_volumes), 1.0)
        if ticks
        else None
    )

    kyle_value: float | None = None
    if len(ticks) >= 10 and sum(tick_volumes):
        mean_signed = _mean(signed_volumes)
        mean_change = _mean(
            [
                tick_prices[index] - tick_prices[index - 1]
                for index in range(1, len(tick_prices))
            ]
        )
        covariance = _mean(
            [
                (signed_volumes[index] - mean_signed)
                * (tick_prices[index] - tick_prices[index - 1] - mean_change)
                for index in range(1, len(ticks))
            ]
        )
        variance = _mean([(value - mean_signed) ** 2 for value in signed_volumes])
        kyle_value = covariance / variance if variance > 0 else 0.0

    large_value: float | None = None
    if len(ticks) >= 20:
        amounts = sorted(float(tick["amount"]) for tick in ticks)
        threshold_index = min(len(amounts) - 1, int(len(amounts) * 0.95))
        threshold = amounts[threshold_index]
        large_buy = sum(
            tick_volumes[index]
            for index, tick in enumerate(ticks)
            if float(tick["amount"]) >= threshold and directions[index] > 0
        )
        large_sell = sum(
            tick_volumes[index]
            for index, tick in enumerate(ticks)
            if float(tick["amount"]) >= threshold and directions[index] < 0
        )
        large_value = (large_buy - large_sell) / max(large_buy + large_sell, 1.0)

    amihud_value: float | None = None
    if len(bars) >= 2:
        observations = []
        for index in range(1, len(bars)):
            amount = float(bars[index].get("amount") or 0)
            if amount <= 0:
                continue
            change = abs(
                float(bars[index]["close"]) / float(bars[index - 1]["close"]) - 1
            )
            observations.append(change / amount)
        amihud_value = _mean(observations) * 1_000_000_000 if observations else None

    obi_value: float | None = None
    if order_book is not None:
        bid_depth = float(order_book.get("bid_depth", 0))
        ask_depth = float(order_book.get("ask_depth", 0))
        if (
            math.isfinite(bid_depth)
            and math.isfinite(ask_depth)
            and bid_depth >= 0
            and ask_depth >= 0
            and bid_depth + ask_depth > 0
        ):
            obi_value = (bid_depth - ask_depth) / (bid_depth + ask_depth)

    for definition in _MICRO:
        name = definition.name
        if name == "cvd" and cvd_value is not None:
            signal = _signal_result(
                definition,
                object_type="stock",
                object_code=object_code,
                object_subtype=None,
                status="triggered" if cvd_value else "neutral",
                direction="bullish"
                if cvd_value > 0
                else "bearish"
                if cvd_value < 0
                else "neutral",
                value=cvd_value,
                unit="ratio",
                quality="low",
                sample_count=len(ticks),
                as_of=as_of,
                computed_at=now,
                source="tencent_tick_proxy",
                notes=["约 3 秒聚合分笔，不是交易所逐笔主动买卖分类"],
                proxy=True,
            )
        elif name == "kyle_lambda" and kyle_value is not None:
            signal = _signal_result(
                definition,
                object_type="stock",
                object_code=object_code,
                object_subtype=None,
                status="triggered" if abs(kyle_value) > 0 else "neutral",
                direction="neutral",
                value=kyle_value,
                unit="price_per_volume",
                quality="low",
                sample_count=len(ticks),
                as_of=as_of,
                computed_at=now,
                source="tencent_tick_proxy",
                notes=["基于聚合成交分桶回归，非逐笔交易所样本"],
                proxy=True,
            )
        elif name == "large_trade_imbalance" and large_value is not None:
            signal = _signal_result(
                definition,
                object_type="stock",
                object_code=object_code,
                object_subtype=None,
                status="triggered" if large_value else "neutral",
                direction="bullish"
                if large_value > 0
                else "bearish"
                if large_value < 0
                else "neutral",
                value=large_value,
                unit="ratio",
                quality="low",
                sample_count=len(ticks),
                as_of=as_of,
                computed_at=now,
                source="tencent_tick_proxy",
                notes=["大单是成交额阈值代理，不代表机构身份"],
                proxy=True,
            )
        elif name == "amihud" and amihud_value is not None:
            signal = _signal_result(
                definition,
                object_type="stock",
                object_code=object_code,
                object_subtype=None,
                status="triggered" if amihud_value > 0 else "neutral",
                direction="risk" if amihud_value > 0 else "neutral",
                value=amihud_value,
                unit="impact_per_amount",
                quality="low",
                sample_count=len(bars),
                as_of=as_of,
                computed_at=now,
                source="bar1d_hfq",
                notes=["日线非流动性代理，不代表逐笔冲击"],
                proxy=True,
            )
        elif name == "obi" and obi_value is not None:
            signal = _signal_result(
                definition,
                object_type="stock",
                object_code=object_code,
                object_subtype=None,
                status="triggered" if abs(obi_value) >= 0.1 else "neutral",
                direction="bullish"
                if obi_value > 0
                else "bearish"
                if obi_value < 0
                else "neutral",
                value=obi_value,
                unit="ratio",
                quality="low",
                sample_count=1,
                as_of=as_of,
                computed_at=now,
                source="current_quote_only",
                notes=["只有当前时点盘口，没有连续历史"],
                proxy=True,
            )
        elif name == "vwap_deviation" and vwap is not None:
            close = float(bars[-1]["close"])
            signal = _signal_result(
                definition,
                object_type="stock",
                object_code=object_code,
                object_subtype=None,
                status="triggered" if close != vwap else "neutral",
                direction="bullish"
                if close > vwap
                else "bearish"
                if close < vwap
                else "neutral",
                value=close / vwap - 1,
                unit="ratio",
                quality="low",
                sample_count=len(ticks),
                as_of=as_of,
                computed_at=now,
                source="tencent_tick_proxy",
                notes=["由聚合分笔重建当日 VWAP"],
                proxy=True,
            )
        else:
            missing = {
                "ofi": "连续 Level 2 订单簿历史",
                "cvd": "最近交易日分笔",
                "vpin": "带主动买卖方向的逐笔成交",
                "kyle_lambda": "最近交易日分笔",
                "obi": "当前五档盘口",
                "absorption": "同步逐笔与盘口",
                "large_trade_imbalance": "最近交易日分笔",
                "amihud": "日线成交额",
                "volume_profile": "历史分价成交量",
                "replenishment_cancellation": "逐笔委托与连续盘口",
                "auction_imbalance": "集合竞价逐笔",
                "vwap_deviation": "分钟线或分笔",
            }[name]
            signal = _unavailable(
                definition,
                object_code=object_code,
                as_of=as_of,
                computed_at=now,
                missing=missing,
            )
        result.append(signal)

    return result
