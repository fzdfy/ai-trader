"""因子注册表。

定义可复用的技术因子（Factor），供 CompositeStrategy 组合使用。

因子计算约定：
  - 每个因子的 compute 接收一个 dict，包含历史行情数组：
      { "close": np.ndarray, "high": np.ndarray, "low": np.ndarray, "volume": np.ndarray }
    数组按时间升序，最后一个元素为当前 bar。
  - 返回值是归一化后的得分，范围 [0, 1]：
      0.5 表示中性，> 0.5 看多，< 0.5 看空。
  - direction 字段仅作元数据描述（1=正向因子，-1=反向因子），
    归一化逻辑已在 compute 内部处理，无需额外反转。
"""

from dataclasses import dataclass, field
from typing import Any, Callable

import numpy as np


# ============================================================================
# 基础工具函数
# ============================================================================


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """将数值裁剪到 [lo, hi] 区间。"""
    return max(lo, min(hi, x))


def _rsi(closes: np.ndarray, period: int) -> float:
    """计算 RSI（相对强弱指标），返回最新值 (0-100)。"""
    if len(closes) < period + 1:
        return 50.0
    diff = np.diff(closes)
    gain = np.maximum(diff, 0.0)
    loss = np.maximum(-diff, 0.0)
    avg_gain = gain[-period:].mean()
    avg_loss = loss[-period:].mean()
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    return 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    """计算 EMA（指数移动平均），返回与输入等长的数组。"""
    if len(values) == 0:
        return values
    k = 2.0 / (period + 1)
    result = values.astype(float).copy()
    for i in range(1, len(result)):
        result[i] = result[i] * k + result[i - 1] * (1 - k)
    return result


def _macd(closes: np.ndarray, fast: int, slow: int, signal: int) -> float:
    """计算 MACD 柱值 (DIF - DEA) 的归一化值。

    返回 DIF - DEA 除以当前收盘价的比例（消除价格量纲）。
    """
    if len(closes) < slow + signal:
        return 0.0
    ef = _ema(closes, fast)
    es = _ema(closes, slow)
    dif = ef - es
    dea = _ema(dif, signal)
    hist = float(dif[-1] - dea[-1])
    return hist / float(closes[-1]) if closes[-1] != 0 else 0.0


def _atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> float:
    """计算 ATR（平均真实波幅），返回最新值。"""
    if len(closes) < period + 1:
        return 0.0
    prev_close = closes[:-1]
    tr = np.maximum(
        highs[1:] - lows[1:],
        np.maximum(
            np.abs(highs[1:] - prev_close),
            np.abs(lows[1:] - prev_close),
        ),
    )
    return float(tr[-period:].mean())


def _mfi(
    highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, volumes: np.ndarray, period: int
) -> float:
    """计算 MFI（资金流量指标），返回最新值 (0-100)。"""
    if len(closes) < period + 1:
        return 50.0
    typical = (highs + lows + closes) / 3.0
    raw_mf = typical * volumes
    pos_flow = np.where(typical[1:] > typical[:-1], raw_mf[1:], 0.0)
    neg_flow = np.where(typical[1:] < typical[:-1], raw_mf[1:], 0.0)
    pos_sum = float(pos_flow[-period:].sum())
    neg_sum = float(neg_flow[-period:].sum())
    if neg_sum == 0:
        return 100.0 if pos_sum > 0 else 50.0
    return 100.0 - 100.0 / (1.0 + pos_sum / neg_sum)


# ============================================================================
# 因子计算函数
# ============================================================================


def _f_roc(data: dict[str, np.ndarray], period: int) -> float:
    """N 日涨跌幅动量因子。

    返回近 N 日收益率映射到 [0,1]（0.5 对应 0% 涨跌）。
    """
    closes = data["close"]
    if len(closes) < period + 1:
        return 0.5
    roc = float(closes[-1] / closes[-period - 1] - 1.0)
    # 短周期用大斜率放大，长周期用小斜率，避免极端值过度压缩
    slope = 10.0 if period <= 10 else 5.0
    return _clamp(0.5 + roc * slope)


def _f_rsi(data: dict[str, np.ndarray], period: int) -> float:
    """RSI 因子，映射到 [0,1]（RSI=50 → 0.5）。"""
    rsi = _rsi(data["close"], period)
    return _clamp(rsi / 100.0)


def _f_macd(data: dict[str, np.ndarray], fast: int, slow: int, signal: int) -> float:
    """MACD 柱值因子。

    DIF-DEA 除以收盘价后经斜率放大映射到 [0,1]。
    """
    hist = _macd(data["close"], fast, slow, signal)
    return _clamp(0.5 + hist * 100.0)


def _f_ma_trend(data: dict[str, np.ndarray], period: int) -> float:
    """均线趋势因子：收盘价相对 N 日均线的偏离度。"""
    closes = data["close"]
    if len(closes) < period:
        return 0.5
    ma = float(closes[-period:].mean())
    if ma == 0:
        return 0.5
    ratio = float(closes[-1] / ma - 1.0)
    return _clamp(0.5 + ratio * 10.0)


def _f_close_position(data: dict[str, np.ndarray], period: int) -> float:
    """价格位置因子：收盘价在 N 日高低区间的相对位置。"""
    highs = data["high"]
    lows = data["low"]
    closes = data["close"]
    if len(closes) < period:
        return 0.5
    hh = float(highs[-period:].max())
    ll = float(lows[-period:].min())
    if hh == ll:
        return 0.5
    return _clamp((float(closes[-1]) - ll) / (hh - ll))


def _f_volume_ratio(data: dict[str, np.ndarray], period: int) -> float:
    """量比因子：当日成交量相对 N 日均量的比值。"""
    volumes = data["volume"]
    if len(volumes) < period:
        return 0.5
    avg = float(volumes[-period:].mean())
    if avg == 0:
        return 0.5
    ratio = float(volumes[-1] / avg)
    # 量比 1 → 0.5，2 倍 → 0.7，0.5 倍 → 0.4
    return _clamp(0.5 + (ratio - 1.0) * 0.2)


def _f_mfi(data: dict[str, np.ndarray], period: int) -> float:
    """MFI 资金流量因子，映射到 [0,1]。"""
    mfi = _mfi(data["high"], data["low"], data["close"], data["volume"], period)
    return _clamp(mfi / 100.0)


def _f_atr_ratio(data: dict[str, np.ndarray], period: int) -> float:
    """波动率因子：ATR 相对收盘价的比例（反向，波动越小得分越高）。"""
    closes = data["close"]
    atr = _atr(data["high"], data["low"], closes, period)
    if closes[-1] == 0:
        return 0.5
    ratio = atr / float(closes[-1])
    # ATR/close 通常 < 0.05，ratio=0.01 → 0.9，ratio=0.05 → 0.5
    return _clamp(1.0 - ratio * 10.0)


# ============================================================================
# Factor 数据类与注册表
# ============================================================================


@dataclass
class Factor:
    """因子元数据 + 计算函数。"""

    name: str
    label: str
    category: str
    direction: int  # 1=正向（越大越看多），-1=反向
    description: str = ""
    compute: Callable[[dict[str, np.ndarray]], float] = field(default=lambda d: 0.5)


def _make_factor(
    name: str,
    label: str,
    category: str,
    direction: int,
    description: str,
    fn: Callable,
    **params: Any,
) -> Factor:
    """构建因子，将 params 绑定到计算函数。"""
    import functools

    compute = functools.partial(fn, **params)
    return Factor(
        name=name,
        label=label,
        category=category,
        direction=direction,
        description=description,
        compute=compute,
    )


# 内置因子列表
_BUILTIN_FACTORS: list[Factor] = [
    # ---- 动量 ----
    _make_factor("roc_5", "5日动量", "momentum", 1, "近5日涨跌幅", _f_roc, period=5),
    _make_factor("roc_20", "20日动量", "momentum", 1, "近20日涨跌幅", _f_roc, period=20),
    _make_factor("rsi_14", "RSI(14)", "momentum", 1, "相对强弱指标", _f_rsi, period=14),
    _make_factor("macd_diff", "MACD柱", "momentum", 1, "MACD 柱值", _f_macd, fast=12, slow=26, signal=9),
    # ---- 趋势 ----
    _make_factor("ma_trend_20", "MA趋势(20)", "trend", 1, "收盘价相对20日均线偏离", _f_ma_trend, period=20),
    _make_factor("ma_trend_60", "MA趋势(60)", "trend", 1, "收盘价相对60日均线偏离", _f_ma_trend, period=60),
    _make_factor("close_position", "价格位置(20)", "trend", 1, "收盘价在20日高低区间位置", _f_close_position, period=20),
    # ---- 成交量 ----
    _make_factor("volume_ratio_5", "量比(5)", "volume", 1, "当日量相对5日均量", _f_volume_ratio, period=5),
    _make_factor("mfi_14", "MFI(14)", "volume", 1, "资金流量指标", _f_mfi, period=14),
    # ---- 波动 ----
    _make_factor("atr_ratio_14", "波动率(14)", "volatility", -1, "ATR相对收盘价（反向）", _f_atr_ratio, period=14),
]

# 因子名 → Factor 的注册表
FACTOR_REGISTRY: dict[str, Factor] = {f.name: f for f in _BUILTIN_FACTORS}


def get_factor_list() -> list[dict[str, Any]]:
    """返回因子元数据列表（供前端因子选择器使用）。"""
    return [
        {
            "name": f.name,
            "label": f.label,
            "category": f.category,
            "direction": f.direction,
            "description": f.description,
        }
        for f in _BUILTIN_FACTORS
    ]
