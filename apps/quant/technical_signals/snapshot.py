"""Compatibility technical snapshot migrated from the Server implementation."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any


Bar = Mapping[str, Any]


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values)


def _round(value: float) -> float:
    return float(f"{value:.4f}")


def calculate_technical_snapshot(bars: Sequence[Bar]) -> dict[str, Any] | None:
    """Return the existing stock-analysis technical shape or None below 60 bars."""
    if len(bars) < 60:
        return None

    closes = [float(bar["close"]) for bar in bars]
    last = bars[-1]
    window_mean = lambda size: _mean(closes[-size:])

    changes = [
        closes[index] - closes[index - 1] for index in range(1, len(closes))
    ]
    gains = [max(value, 0.0) for value in changes[-14:]]
    losses = [max(-value, 0.0) for value in changes[-14:]]
    average_gain = _mean(gains)
    average_loss = _mean(losses)
    rsi = (
        100.0
        if average_loss == 0
        else 100 - 100 / (1 + average_gain / average_loss)
    )

    true_ranges: list[float] = []
    for bar in bars[-14:]:
        previous_index = len(bars) - 14 + len(true_ranges) - 1
        previous_close = (
            float(bars[previous_index]["close"]) if previous_index >= 0 else None
        )
        high = float(bar["high"])
        low = float(bar["low"])
        if previous_close is None:
            true_ranges.append(high - low)
        else:
            true_ranges.append(
                max(
                    high - low,
                    abs(high - previous_close),
                    abs(low - previous_close),
                )
            )

    returns_20 = [
        closes[index] / closes[index - 1] - 1 for index in range(len(closes) - 20, len(closes))
    ]
    mean_return = _mean(returns_20)
    volatility_20 = (
        math.sqrt(_mean([value**2 for value in returns_20]) - mean_return**2)
        * math.sqrt(252)
        * 100
    )

    peak = closes[-60]
    max_drawdown = 0.0
    for close in closes[-60:]:
        peak = max(peak, close)
        max_drawdown = min(max_drawdown, close / peak - 1)

    return {
        "asOf": str(last["time"]),
        "close": float(last["close"]),
        "ma5": _round(window_mean(5)),
        "ma10": _round(window_mean(10)),
        "ma20": _round(window_mean(20)),
        "ma60": _round(window_mean(60)),
        "rsi14": _round(rsi),
        "atr14": _round(_mean(true_ranges)),
        "volatility20": _round(volatility_20),
        "support20": _round(
            min(float(bar["low"]) for bar in bars[-20:])
        ),
        "resistance60": _round(
            max(float(bar["high"]) for bar in bars[-60:])
        ),
        "change20": _round((closes[-1] / closes[-21] - 1) * 100),
        "change60": _round((closes[-1] / closes[-61] - 1) * 100),
        "maxDrawdown60": _round(max_drawdown * 100),
    }
