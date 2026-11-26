"""Pure technical-signal computation shared by the Quant API and workers."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

from .catalog import (
    CATALOG_VERSION,
    SignalDefinition,
    compute_definition_hash,
    load_signal_catalog,
)
from .snapshot import calculate_technical_snapshot


Bar = Mapping[str, Any]
SignalStatus = str

_SIGNALS = load_signal_catalog()
_BASIC_BY_SCOPE = {
    scope: tuple(
        signal
        for signal in _SIGNALS
        if signal.layer == "basic" and signal.scope == scope
    )
    for scope in ("market", "sector", "stock", "gold")
}
BASIC_SIGNAL_IDS = {
    scope: tuple(signal.signal_id for signal in definitions)
    for scope, definitions in _BASIC_BY_SCOPE.items()
}


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values)


def _ema(values: Sequence[float], period: int) -> list[float]:
    if not values:
        return []
    multiplier = 2 / (period + 1)
    output = [values[0]]
    for value in values[1:]:
        output.append(value * multiplier + output[-1] * (1 - multiplier))
    return output


def _rsi(closes: Sequence[float], period: int) -> float:
    changes = [
        closes[index] - closes[index - 1]
        for index in range(len(closes) - period, len(closes))
    ]
    average_gain = _mean([max(value, 0.0) for value in changes])
    average_loss = _mean([max(-value, 0.0) for value in changes])
    if average_loss == 0:
        return 100.0
    return 100 - 100 / (1 + average_gain / average_loss)


def _true_ranges(bars: Sequence[Bar]) -> list[float]:
    output: list[float] = []
    for index, bar in enumerate(bars):
        high = float(bar["high"])
        low = float(bar["low"])
        if index == 0:
            output.append(high - low)
            continue
        previous_close = float(bars[index - 1]["close"])
        output.append(
            max(
                high - low,
                abs(high - previous_close),
                abs(low - previous_close),
            )
        )
    return output


def _macd(
    closes: Sequence[float],
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9,
) -> tuple[float, float, float]:
    fast = _ema(closes, fast_period)
    slow = _ema(closes, slow_period)
    dif = [fast[index] - slow[index] for index in range(len(closes))]
    dea = _ema(dif, signal_period)
    return dif[-1], dea[-1], 2 * (dif[-1] - dea[-1])


def _macd_dif_series(
    closes: Sequence[float], fast_period: int, slow_period: int
) -> list[float]:
    fast = _ema(closes, fast_period)
    slow = _ema(closes, slow_period)
    return [fast[index] - slow[index] for index in range(len(closes))]


def _adx_and_di(bars: Sequence[Bar], period: int = 14) -> tuple[float, float, float]:
    ranges = _true_ranges(bars)
    plus_dm: list[float] = [0.0]
    minus_dm: list[float] = [0.0]
    for index in range(1, len(bars)):
        up = float(bars[index]["high"]) - float(bars[index - 1]["high"])
        down = float(bars[index - 1]["low"]) - float(bars[index]["low"])
        plus_dm.append(up if up > down and up > 0 else 0.0)
        minus_dm.append(down if down > up and down > 0 else 0.0)

    smoothed_tr = _mean(ranges[1 : period + 1])
    smoothed_plus = _mean(plus_dm[1 : period + 1])
    smoothed_minus = _mean(minus_dm[1 : period + 1])
    plus_di_values: list[float] = []
    minus_di_values: list[float] = []
    adx_values: list[float] = []
    dx_values: list[float] = []
    for index in range(period, len(bars)):
        if index > period:
            smoothed_tr = smoothed_tr - smoothed_tr / period + ranges[index]
            smoothed_plus = (
                smoothed_plus - smoothed_plus / period + plus_dm[index]
            )
            smoothed_minus = (
                smoothed_minus - smoothed_minus / period + minus_dm[index]
            )
        plus_di = 100 * smoothed_plus / max(smoothed_tr, 1e-12)
        minus_di = 100 * smoothed_minus / max(smoothed_tr, 1e-12)
        plus_di_values.append(plus_di)
        minus_di_values.append(minus_di)
        denominator = plus_di + minus_di
        dx = 0.0 if denominator == 0 else 100 * abs(plus_di - minus_di) / denominator
        dx_values.append(dx)

    if len(dx_values) < period:
        return 0.0, plus_di_values[-1], minus_di_values[-1]
    adx = _mean(dx_values[:period])
    for dx in dx_values[period:]:
        adx = (adx * (period - 1) + dx) / period
        adx_values.append(adx)
    return adx, plus_di_values[-1], minus_di_values[-1]


def _obv(closes: Sequence[float], volumes: Sequence[float]) -> list[float]:
    output = [0.0]
    for index in range(1, len(closes)):
        if closes[index] > closes[index - 1]:
            output.append(output[-1] + volumes[index])
        elif closes[index] < closes[index - 1]:
            output.append(output[-1] - volumes[index])
        else:
            output.append(output[-1])
    return output


def _percentile_rank(history: Sequence[float], value: float) -> float:
    return sum(item <= value for item in history) / len(history)


def _int_param(definition: SignalDefinition, name: str, fallback: int) -> int:
    value = definition.params.get(name, fallback)
    return int(value) if isinstance(value, (int, float)) else fallback


def _float_param(
    definition: SignalDefinition, name: str, fallback: float
) -> float:
    value = definition.params.get(name, fallback)
    return float(value) if isinstance(value, (int, float)) else fallback


def _bollinger_bandwidth_series(
    closes: Sequence[float], period: int
) -> list[float]:
    output: list[float] = []
    for index in range(period - 1, len(closes)):
        window = closes[index - (period - 1) : index + 1]
        middle = _mean(window)
        deviation = math.sqrt(_mean([(value - middle) ** 2 for value in window]))
        output.append(4 * deviation / middle if middle else 0.0)
    return output


def _signal_result(
    definition: SignalDefinition,
    *,
    object_type: str,
    object_code: str,
    object_subtype: str | None,
    status: SignalStatus,
    direction: str,
    value: float | str | None,
    unit: str | None,
    quality: str,
    sample_count: int,
    as_of: str,
    computed_at: str,
    source: str,
    notes: Sequence[str] = (),
    missing_fields: Sequence[str] = (),
    components: Sequence[Mapping[str, Any]] = (),
    proxy: bool = False,
) -> dict[str, Any]:
    return {
        "signal_id": definition.signal_id,
        "display_name": definition.display_name,
        "rule": definition.rule,
        "params": definition.params,
        "confirmation": definition.confirmation,
        "invalidation": definition.invalidation,
        "data_requirements": list(definition.data_requirements),
        "scope": object_type,
        "object_type": object_type,
        "object_subtype": object_subtype,
        "object_code": object_code,
        "status": status,
        "direction": direction,
        "value": value,
        "unit": unit,
        "quality": quality,
        "proxy": proxy,
        "sample_count": sample_count,
        "as_of": as_of,
        "computed_at": computed_at,
        "data_sources": [source],
        "evidence": {
            "components": list(components),
            "notes": list(notes),
            "missing_fields": list(missing_fields),
        },
        "catalog_version": CATALOG_VERSION,
        "definition_hash": compute_definition_hash(definition),
    }


def _unavailable(
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
        notes=[f"至少需要 {required} 根有效日线"],
        missing_fields=["daily_ohlcv"],
    )


def _not_applicable(
    definition: SignalDefinition,
    *,
    object_type: str,
    object_code: str,
    object_subtype: str | None,
    as_of: str,
    computed_at: str,
    source: str,
) -> dict[str, Any]:
    return _signal_result(
        definition,
        object_type=object_type,
        object_code=object_code,
        object_subtype=object_subtype,
        status="not-applicable",
        direction="neutral",
        value=None,
        unit=None,
        quality="not-applicable",
        sample_count=0,
        as_of=as_of,
        computed_at=computed_at,
        source=source,
        notes=["XAU/USD 没有可信成交量"],
        missing_fields=["volume"],
    )


def _validate_bars(bars: Sequence[Bar]) -> None:
    for index, bar in enumerate(bars):
        values = [float(bar[field]) for field in ("open", "high", "low", "close")]
        volume = bar.get("volume")
        if volume is not None:
            values.append(float(volume))
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"bar {index} contains a non-finite numeric value")
        if values[1] < values[2]:
            raise ValueError(f"bar {index} high is below low")


def _business_time(
    bars: Sequence[Bar],
    explicit_as_of: str | None,
) -> str:
    if explicit_as_of:
        return explicit_as_of
    if not bars:
        return datetime.now(timezone.utc).date().isoformat()
    return str(bars[-1]["time"])[:10]


def _source_for(object_type: str) -> str:
    return {
        "market": "market_index",
        "sector": "board_kline",
        "stock": "bar1d_hfq",
        "gold": "market_asset_daily_bar",
    }[object_type]


def evaluate_technical_signals(
    bars: Sequence[Bar],
    *,
    object_type: str,
    object_code: str,
    object_subtype: str | None = None,
    as_of: str | None = None,
    computed_at: str | None = None,
) -> dict[str, Any]:
    """Evaluate the ten basic signals for one object and include compatible technical fields."""
    if object_type not in _BASIC_BY_SCOPE:
        raise ValueError(f"unsupported object type: {object_type}")
    if object_type == "sector" and object_subtype not in ("industry", "concept"):
        raise ValueError("sector evaluation requires industry or concept subtype")
    if object_type != "sector" and object_subtype is not None:
        raise ValueError("non-sector evaluation requires object_subtype=None")
    _validate_bars(bars)

    computed_at = computed_at or datetime.now(timezone.utc).isoformat()
    business_as_of = _business_time(bars, as_of)
    source = _source_for(object_type)
    technical = calculate_technical_snapshot(bars)
    closes = [float(bar["close"]) for bar in bars]
    volumes = [
        float(bar["volume"]) if bar.get("volume") is not None else None
        for bar in bars
    ]
    highs = [float(bar["high"]) for bar in bars]
    lows = [float(bar["low"]) for bar in bars]
    signals: list[dict[str, Any]] = []

    for definition in _BASIC_BY_SCOPE[object_type]:
        name = definition.name
        if object_type == "gold" and name in ("rvol", "obv_trend"):
            signals.append(
                _not_applicable(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "price_vs_ma200":
            window = _int_param(definition, "ma_window", 200)
            if len(closes) < window:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=window,
                        actual=len(closes),
                    )
                )
                continue
            moving_average = _mean(closes[-window:])
            value = closes[-1] / moving_average - 1
            status = "triggered" if value >= 0 else "invalidated"
            direction = "bullish" if value >= 0 else "bearish"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction=direction,
                    value=value,
                    unit="ratio",
                    quality="available",
                    sample_count=len(closes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                    notes=[f"MA{window}={moving_average:.6f}"],
                )
            )
            continue

        if name == "ma200_slope_20":
            ma_window = _int_param(definition, "ma_window", 200)
            lookback = _int_param(definition, "lookback", 20)
            required = ma_window + lookback
            if len(closes) < required:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=required,
                        actual=len(closes),
                    )
                )
                continue
            current_ma = _mean(closes[-ma_window:])
            previous_ma = _mean(
                closes[-(ma_window + lookback) : -lookback]
            )
            value = current_ma / previous_ma - 1
            status = "triggered" if value > 0 else "invalidated"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction="bullish" if value > 0 else "bearish",
                    value=value,
                    unit="ratio",
                    quality="available",
                    sample_count=len(closes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "macd_zero_axis":
            fast_period = _int_param(definition, "fast", 12)
            slow_period = _int_param(definition, "slow", 26)
            signal_period = _int_param(definition, "signal", 9)
            required = slow_period + signal_period
            if len(closes) < required:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=required,
                        actual=len(closes),
                    )
                )
                continue
            dif, dea, histogram = _macd(
                closes, fast_period, slow_period, signal_period
            )
            if dif > 0 and dea > 0:
                status, direction = "triggered", "bullish"
            elif dif < 0 and dea < 0:
                status, direction = "invalidated", "bearish"
            else:
                status, direction = "neutral", "neutral"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction=direction,
                    value=dif,
                    unit="price",
                    quality="available",
                    sample_count=len(closes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                    components=[
                        {
                            "signal_id": definition.signal_id,
                            "status": status,
                            "value": dea,
                        }
                    ],
                    notes=[f"DIF={dif:.6f}", f"DEA={dea:.6f}", f"HIST={histogram:.6f}"],
                )
            )
            continue

        if name == "macd_divergence":
            search_window = _int_param(definition, "search_window", 60)
            if len(closes) < search_window:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=search_window,
                        actual=len(closes),
                    )
                )
                continue
            fast_period = _int_param(definition, "fast", 12)
            slow_period = _int_param(definition, "slow", 26)
            macd_dif_series = _macd_dif_series(
                closes, fast_period, slow_period
            )
            distance = highs[-1] - highs[-20]
            status, direction = "neutral", "neutral"
            if highs[-1] > max(highs[-40:-5]) and macd_dif_series[-1] < max(
                macd_dif_series[-40:-5]
            ):
                status, direction = "triggered", "bearish"
            elif lows[-1] < min(lows[-40:-5]) and macd_dif_series[-1] > min(
                macd_dif_series[-40:-5]
            ):
                status, direction = "triggered", "bullish"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction=direction,
                    value=distance,
                    unit="price",
                    quality="available",
                    sample_count=len(closes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "rsi_state":
            rsi_period = _int_param(definition, "period", 14)
            if len(closes) < rsi_period + 16:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=rsi_period + 16,
                        actual=len(closes),
                    )
                )
                continue
            value = float(f"{_rsi(closes, rsi_period):.4f}")
            overbought = _float_param(definition, "overbought", 70)
            oversold = _float_param(definition, "oversold", 30)
            if value >= overbought:
                status, direction = "triggered", "bearish"
            elif value <= oversold:
                status, direction = "triggered", "bullish"
            else:
                status, direction = "neutral", "neutral"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction=direction,
                    value=value,
                    unit="index",
                    quality="available",
                    sample_count=len(closes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "bollinger_regime":
            period = _int_param(definition, "period", 20)
            percentile_window = _int_param(
                definition, "percentile_window", 252
            )
            bandwidths = _bollinger_bandwidth_series(closes, period)
            if len(bandwidths) < percentile_window:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=period + percentile_window - 1,
                        actual=len(bandwidths),
                    )
                )
                continue
            percentile = _percentile_rank(
                bandwidths[-percentile_window:], bandwidths[-1]
            )
            status = (
                "triggered"
                if percentile <= 0.2
                else "invalidated"
                if percentile >= 0.8
                else "neutral"
            )
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction="neutral",
                    value=percentile,
                    unit="percentile",
                    quality="available",
                    sample_count=len(bandwidths),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "rvol":
            volume_window = _int_param(definition, "volume_window", 20)
            if (
                len(volumes) < volume_window
                or any(volume is None for volume in volumes)
            ):
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=20,
                        actual=len(volumes),
                    )
                )
                continue
            numeric_volumes = [float(volume) for volume in volumes if volume is not None]
            average_volume = _mean(numeric_volumes[-volume_window:])
            value = numeric_volumes[-1] / average_volume if average_volume else 0.0
            status = (
                "triggered"
                if value
                >= _float_param(definition, "breakout_threshold", 1.5)
                else "neutral"
            )
            direction = (
                "bullish"
                if len(closes) > 1 and closes[-1] > closes[-2]
                else "bearish"
                if len(closes) > 1 and closes[-1] < closes[-2]
                else "neutral"
            )
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction=direction,
                    value=value,
                    unit="ratio",
                    quality="available",
                    sample_count=len(volumes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "adx_di":
            adx_period = _int_param(definition, "period", 14)
            if len(bars) < adx_period * 2 + 2:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=adx_period * 2 + 2,
                        actual=len(bars),
                    )
                )
                continue
            adx, plus_di, minus_di = _adx_and_di(bars, adx_period)
            trend_threshold = _float_param(
                definition, "trend_threshold", 25
            )
            if adx >= trend_threshold and plus_di > minus_di:
                status, direction = "triggered", "bullish"
            elif adx >= trend_threshold and minus_di > plus_di:
                status, direction = "invalidated", "bearish"
            else:
                status, direction = "neutral", "neutral"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction=direction,
                    value=adx,
                    unit="index",
                    quality="available",
                    sample_count=len(bars),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                    components=[
                        {
                            "signal_id": definition.signal_id,
                            "status": status,
                            "value": plus_di,
                        },
                        {
                            "signal_id": definition.signal_id,
                            "status": status,
                            "value": minus_di,
                        },
                    ],
                )
            )
            continue

        if name == "obv_trend":
            slope_window = _int_param(definition, "slope_window", 20)
            if (
                len(closes) < slope_window + 1
                or any(volume is None for volume in volumes)
            ):
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=20,
                        actual=len(closes),
                    )
                )
                continue
            numeric_volumes = [float(volume) for volume in volumes if volume is not None]
            obv_values = _obv(closes, numeric_volumes)
            scale = max(_mean(numeric_volumes[-slope_window:]), 1.0)
            value = (
                obv_values[-1] - obv_values[-(slope_window + 1)]
            ) / scale
            status = "triggered" if value > 0 else "invalidated"
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction="bullish" if value > 0 else "bearish",
                    value=value,
                    unit="ratio",
                    quality="available",
                    sample_count=len(closes),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        if name == "atr_regime":
            atr_period = _int_param(definition, "period", 14)
            percentile_window = _int_param(
                definition, "percentile_window", 252
            )
            ranges = _true_ranges(bars)
            ratios = [
                _mean(ranges[index - (atr_period - 1) : index + 1])
                / closes[index]
                for index in range(atr_period - 1, len(closes))
            ]
            if len(ratios) < percentile_window:
                signals.append(
                    _unavailable(
                        definition,
                        object_type=object_type,
                        object_code=object_code,
                        object_subtype=object_subtype,
                        as_of=business_as_of,
                        computed_at=computed_at,
                        source=source,
                        required=atr_period + percentile_window - 1,
                        actual=len(ratios),
                    )
                )
                continue
            percentile = _percentile_rank(
                ratios[-percentile_window:], ratios[-1]
            )
            high_percentile = (
                _float_param(definition, "high_percentile", 80) / 100
            )
            status = (
                "triggered"
                if percentile >= high_percentile
                else "neutral"
            )
            signals.append(
                _signal_result(
                    definition,
                    object_type=object_type,
                    object_code=object_code,
                    object_subtype=object_subtype,
                    status=status,
                    direction="risk" if percentile >= 0.8 else "neutral",
                    value=percentile,
                    unit="percentile",
                    quality="available",
                    sample_count=len(ratios),
                    as_of=business_as_of,
                    computed_at=computed_at,
                    source=source,
                )
            )
            continue

        raise AssertionError(f"unimplemented basic signal: {name}")

    input_hash = hashlib.sha256(
        json.dumps(
            {
                "object_type": object_type,
                "object_subtype": object_subtype,
                "object_code": object_code,
                "as_of": business_as_of,
                "bars": list(bars),
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    ).hexdigest()
    return {
        "catalog_version": CATALOG_VERSION,
        "object_type": object_type,
        "object_subtype": object_subtype,
        "object_code": object_code,
        "as_of": business_as_of,
        "computed_at": computed_at,
        "input_hash": input_hash,
        "technical": technical,
        "signals": signals,
    }


def calculate_technical_snapshots(
    bars_by_object: Mapping[str, Sequence[Bar]],
) -> dict[str, dict[str, Any] | None]:
    """Calculate compatible technical snapshots for a batch, preserving per-object failures."""
    return {
        object_code: calculate_technical_snapshot(bars)
        for object_code, bars in bars_by_object.items()
    }
