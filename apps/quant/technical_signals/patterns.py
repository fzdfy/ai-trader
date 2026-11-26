"""Composable K-line market-state patterns for four object scopes."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from .catalog import CATALOG_VERSION, SignalDefinition, load_signal_catalog
from .engine import (
    _mean,
    _rsi,
    _signal_result,
    _source_for,
    _validate_bars,
)


Bar = Mapping[str, Any]
_PATTERNS = {
    scope: tuple(
        signal
        for signal in load_signal_catalog()
        if signal.layer == "pattern" and signal.scope == scope
    )
    for scope in ("market", "sector", "stock", "gold")
}


def _rolling_mean(values: Sequence[float], period: int, end: int | None = None) -> float:
    stop = len(values) if end is None else end
    return _mean(values[stop - period : stop])


def _rvol(volumes: Sequence[float | None]) -> float | None:
    if len(volumes) < 20 or any(volume is None for volume in volumes[-20:]):
        return None
    numeric = [float(volume) for volume in volumes[-20:] if volume is not None]
    average = _mean(numeric)
    return numeric[-1] / average if average else 0.0


def _pattern_result(
    definition: SignalDefinition,
    *,
    object_type: str,
    object_code: str,
    object_subtype: str | None,
    status: str,
    direction: str,
    value: float,
    quality: str,
    sample_count: int,
    as_of: str,
    computed_at: str,
    source: str,
    confirmation: str,
    invalidation: str,
    components: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    return _signal_result(
        definition,
        object_type=object_type,
        object_code=object_code,
        object_subtype=object_subtype,
        status=status,
        direction=direction,
        value=value,
        unit="score",
        quality=quality,
        sample_count=sample_count,
        as_of=as_of,
        computed_at=computed_at,
        source=source,
        notes=[f"确认：{confirmation}", f"失效：{invalidation}"],
        components=components,
    )


def _unavailable_pattern(
    definition: SignalDefinition,
    *,
    object_type: str,
    object_code: str,
    object_subtype: str | None,
    as_of: str,
    computed_at: str,
    source: str,
    required: int,
    actual: int,
) -> dict[str, Any]:
    return _signal_result(
        definition,
        object_type=object_type,
        object_code=object_code,
        object_subtype=object_subtype,
        status="unavailable",
        direction="neutral",
        value=None,
        unit=None,
        quality="missing",
        sample_count=actual,
        as_of=as_of,
        computed_at=computed_at,
        source=source,
        notes=[f"至少需要 {required} 根日线"],
        missing_fields=["daily_ohlcv"],
    )


def evaluate_pattern_signals(
    bars: Sequence[Bar],
    *,
    object_type: str,
    object_code: str,
    object_subtype: str | None = None,
    as_of: str | None = None,
    computed_at: str | None = None,
) -> list[dict[str, Any]]:
    if object_type not in _PATTERNS:
        raise ValueError(f"unsupported object type: {object_type}")
    if object_type == "sector" and object_subtype not in ("industry", "concept"):
        raise ValueError("sector evaluation requires industry or concept subtype")
    if object_type != "sector" and object_subtype is not None:
        raise ValueError("non-sector evaluation requires object_subtype=None")
    _validate_bars(bars)

    closes = [float(bar["close"]) for bar in bars]
    highs = [float(bar["high"]) for bar in bars]
    lows = [float(bar["low"]) for bar in bars]
    volumes = [
        float(bar["volume"]) if bar.get("volume") is not None else None
        for bar in bars
    ]
    last_close = closes[-1] if closes else None
    previous_close = closes[-2] if len(closes) > 1 else None
    last_as_of = as_of or str(bars[-1]["time"])[:10]
    now = computed_at or __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc
    ).isoformat()
    source = _source_for(object_type)
    band_width = (
        (max(closes[-60:]) - min(closes[-60:])) / _mean(closes[-60:])
        if len(closes) >= 60
        else 0.0
    )
    rvol = _rvol(volumes)
    ma20 = _rolling_mean(closes, 20) if len(closes) >= 20 else last_close
    ma60 = _rolling_mean(closes, 60) if len(closes) >= 60 else last_close
    ma120 = _rolling_mean(closes, 120) if len(closes) >= 120 else ma60
    prior_ma20 = (
        _rolling_mean(closes, 20, len(closes) - 5)
        if len(closes) >= 25
        else ma20
    )
    prior_ma60 = (
        _rolling_mean(closes, 60, len(closes) - 5)
        if len(closes) >= 65
        else ma60
    )
    prior_high_60 = max(highs[-61:-1]) if len(highs) >= 61 else max(highs)
    platform_boundary = (
        max(highs[-62:-2]) if len(highs) >= 62 else prior_high_60
    )
    prior_low_60 = min(lows[-61:-1]) if len(lows) >= 61 else min(lows)
    recent_breakout_index = next(
        (
            index
            for index in range(len(closes) - 2, max(len(closes) - 31, -1), -1)
            if index >= 60
            and closes[index]
            > max(highs[index - 60 : index]) * 1.005
            and (
                volumes[index] is None
                or volumes[index]
                >= 1.5
                * _mean(
                    [
                        float(volume)
                        for volume in volumes[index - 20 : index]
                        if volume is not None
                    ]
                )
            )
        ),
        None,
    )
    high_30 = max(highs[-30:]) if len(highs) >= 30 else max(highs)
    low_30 = min(lows[-30:]) if len(lows) >= 30 else min(lows)
    high_60 = max(highs[-60:]) if len(highs) >= 60 else max(highs)
    low_60 = min(lows[-60:]) if len(lows) >= 60 else min(lows)
    rsi14 = _rsi(closes, 14) if len(closes) >= 30 else 50.0
    result: list[dict[str, Any]] = []

    for definition in _PATTERNS[object_type]:
        name = definition.name
        required_history = max(
            (
                int(requirement["min_history"])
                for requirement in definition.data_requirements
            ),
            default=0,
        )
        requires_volume = any(
            "volume" in requirement["fields"]
            for requirement in definition.data_requirements
        )
        if len(closes) < required_history:
            result.append(
                _unavailable_pattern(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    as_of=last_as_of,
                    computed_at=now,
                    source=source,
                    required=required_history,
                    actual=len(closes),
                )
            )
            continue
        if (
            object_type != "gold"
            and requires_volume
            and any(volume is None for volume in volumes)
        ):
            result.append(
                _unavailable_pattern(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    as_of=last_as_of,
                    computed_at=now,
                    source=source,
                    required=required_history,
                    actual=len(closes),
                )
            )
            continue
        status = "neutral"
        direction = "neutral"
        value = max(band_width, 0.0)
        quality = "available"
        confirmation = definition.confirmation
        invalidation = definition.invalidation
        components: list[dict[str, Any]] = []

        if name == "range_accumulation" and len(closes) >= 90:
            close_position = (
                (last_close - min(closes[-60:])) / max(max(closes[-60:]) - min(closes[-60:]), 1e-12)
            )
            recent_volume = (
                _mean([float(volume) for volume in volumes[-5:] if volume is not None])
                if len(volumes) >= 25
                and all(volume is not None for volume in volumes[-5:])
                else None
            )
            prior_volume = (
                _mean(
                    [float(volume) for volume in volumes[-25:-5] if volume is not None]
                )
                if len(volumes) >= 25
                and all(volume is not None for volume in volumes[-25:-5])
                else None
            )
            volume_recovered = (
                object_type == "gold"
                or (
                    recent_volume is not None
                    and prior_volume is not None
                    and recent_volume >= prior_volume * 0.8
                )
            )
            if (
                band_width <= 0.12
                and close_position >= 0.67
                and ma20 >= prior_ma20
                and volume_recovered
            ):
                status, direction, value = "triggered", "bullish", close_position
            elif last_close < min(lows[-60:]):
                status, direction = "invalidated", "bearish"
            components.append(
                {
                    "signal_id": f"basic.{object_type}.rvol",
                    "status": status,
                    "value": rvol,
                }
            )
        elif name == "volume_contraction_base" and len(closes) >= 60:
            low_position = (
                (last_close - low_60) / max(high_60 - low_60, 1e-12)
            )
            volume_10 = [volume for volume in volumes[-10:] if volume is not None]
            volume_30 = [volume for volume in volumes[-30:] if volume is not None]
            recent_rvol = (
                _mean(volume_10) / _mean(volume_30)
                if volume_10 and volume_30
                else None
            )
            if (
                low_position <= 0.2
                and recent_rvol is not None
                and recent_rvol <= 0.8
                and rsi14 >= 30
                and last_close >= ma20
            ):
                status, direction, value = "triggered", "bullish", recent_rvol
            elif last_close <= low_60:
                status, direction = "invalidated", "bearish"
        elif name == "golden_cross" and len(closes) >= 65:
            crossed = prior_ma20 <= prior_ma60 and ma20 > ma60
            if crossed and last_close >= ma60:
                status, direction, value = "triggered", "bullish", ma20 / ma60 - 1
            elif ma20 < ma60:
                status, direction = "invalidated", "bearish"
        elif name == "bullish_alignment" and len(closes) >= 120:
            alignment = ma20 > ma60 > ma120
            slope = ma20 / prior_ma20 - 1
            if alignment and slope > 0 and last_close >= ma20:
                status, direction, value = "triggered", "bullish", slope
            elif ma20 < ma60:
                status, direction = "invalidated", "bearish"
        elif name == "base_breakout" and len(closes) >= 60:
            prior_high_20 = max(highs[-21:-1])
            if last_close > prior_high_20 * 1.005 and (rvol is None or rvol >= 1.5):
                status, direction, value = (
                    "triggered",
                    "bullish",
                    rvol if rvol is not None else 0.0,
                )
            elif closes[-2] > prior_high_20 and last_close < prior_high_20:
                status, direction = "invalidated", "bearish"
        elif name == "platform_breakout" and len(closes) >= 60:
            if last_close > prior_high_60 * 1.005 and (rvol is None or rvol >= 1.5):
                status, direction, value = (
                    "triggered",
                    "bullish",
                    rvol if rvol is not None else last_close / prior_high_60 - 1,
                )
            elif (
                len(closes) > 1
                and closes[-2] > platform_boundary * 1.005
                and last_close < closes[-2] * 0.97
            ):
                status, direction = "invalidated", "bearish"
            components.append(
                {
                    "signal_id": f"basic.{object_type}.rvol",
                    "status": status,
                    "value": rvol,
                }
            )
        elif name == "pullback_confirmation" and len(closes) >= 60:
            if recent_breakout_index is not None:
                breakout_close = closes[recent_breakout_index]
                pullback_low = min(lows[recent_breakout_index + 1 :])
                reclaiming = previous_close is not None and last_close > previous_close
                if pullback_low <= breakout_close * 0.97 and reclaiming:
                    status, direction, value = (
                        "triggered",
                        "bullish",
                        last_close / breakout_close - 1,
                    )
                elif last_close < prior_high_60:
                    status, direction = "invalidated", "bearish"
        elif name == "acceleration" and len(closes) >= 252:
            return_20 = last_close / closes[-21] - 1
            history_returns = [
                closes[index] / closes[index - 20] - 1
                for index in range(20, len(closes))
            ]
            percentile = sum(item <= return_20 for item in history_returns) / len(
                history_returns
            )
            drawdown = last_close / max(closes[-20:]) - 1
            if ma20 > ma60 and percentile >= 0.8 and drawdown >= -0.08:
                status, direction, value = "triggered", "bullish", percentile
            elif last_close < ma20:
                status, direction = "invalidated", "bearish"
        elif name == "high_level_stall" and len(closes) >= 60:
            high_position = (last_close - low_60) / max(high_60 - low_60, 1e-12)
            short_momentum = last_close / closes[-6] - 1
            prior_momentum = closes[-6] / closes[-11] - 1
            if (
                high_position >= 0.85
                and short_momentum < prior_momentum * 0.5
                and (object_type == "gold" or (rvol is not None and rvol >= 1))
            ):
                status, direction, value = "triggered", "risk", high_position
            elif last_close > high_60:
                status, direction = "invalidated", "bullish"
        elif name == "top_reversal" and len(closes) >= 60:
            lower_high = highs[-1] < max(highs[-20:-5])
            below_ma20 = last_close < ma20
            retrace = last_close / high_30 - 1
            if (
                lower_high
                and below_ma20
                and retrace <= -0.05
                and (object_type == "gold" or rvol is not None)
            ):
                status, direction, value = "triggered", "bearish", retrace
            elif last_close > high_30:
                status, direction = "invalidated", "bullish"
        elif name == "death_cross" and len(closes) >= 65:
            crossed = prior_ma20 >= prior_ma60 and ma20 < ma60
            if crossed and last_close < ma60:
                status, direction, value = "triggered", "bearish", ma20 / ma60 - 1
            elif ma20 > ma60:
                status, direction = "invalidated", "bullish"
        elif name == "bearish_breakdown" and len(closes) >= 60:
            if (
                last_close < prior_low_60
                and last_close < ma60
                and (object_type == "gold" or (rvol is not None and rvol >= 1))
            ):
                status, direction, value = (
                    "triggered",
                    "bearish",
                    last_close / prior_low_60 - 1,
                )
            elif (
                len(closes) > 1
                and closes[-2] < prior_low_60
                and last_close > prior_low_60
            ):
                status, direction = "invalidated", "bullish"
        result.append(
            _pattern_result(
                definition,
                object_type=object_type,
                object_code=object_code,
                object_subtype=object_subtype,
                status=status,
                direction=direction,
                value=value,
                quality=quality,
                sample_count=len(closes),
                as_of=last_as_of,
                computed_at=now,
                source=source,
                confirmation=confirmation,
                invalidation=invalidation,
                components=components,
            )
        )

    return result
