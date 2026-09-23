"""指标可视化模块。

为选股结果提供「指标缩略图」所需的序列数据：

  - 内置因子：按因子名分派到对应的 series 构建器，产出有意义的曲线
    （如 ma_trend 产出「收盘价 + 均线」；rsi 产出「RSI 曲线 + 30/70 参考线」；
    macd 产出「DIF/DEA 线 + 柱值」；boll 产出「收盘价 + 布林带」）。
  - 自定义-表达式因子：用 AKQuant 表达式引擎对单个标的求值，产出「价格 + 因子值」双 pane。
  - 自定义-Python 因子：用受限环境执行 compute(data)，产出「价格 + 因子值」双 pane。

契约（FactorViz / PaneSpec / SeriesSpec / BandSpec）与前端 SVG 缩略图组件约定一致，
序列值为 JSON 可序列化的 float 列表，缺失值用 null 表示（前端断线渲染）。

注意：内置因子的 compute 返回归一化得分（[0,1]），无法从得分反推曲线，因此每个
因子需要独立的 series 构建器，直接基于原始 OHLCV 计算可展示的序列。
"""

from __future__ import annotations

import math
import os
import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

from factor_code import run_factor_code
from logger import get_logger
from screener import CUSTOM_HISTORY_COUNT, HISTORY_COUNT, _get_conn

log = get_logger("indicators")

# ============================================================================
# 可视化契约（与前端 IndicatorThumbnail 组件约定一致）
# ============================================================================


@dataclass
class SeriesSpec:
    """单条序列（折线 / 柱状 / 面积）。"""

    name: str
    kind: str  # "line" | "bar" | "area"
    values: list[float | None] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "kind": self.kind, "values": self.values}


@dataclass
class BandSpec:
    """带状区间（上下轨），如布林带、高低通道。"""

    name: str
    upper: list[float | None] = field(default_factory=list)
    lower: list[float | None] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "upper": self.upper, "lower": self.lower}


@dataclass
class PaneSpec:
    """一个图块（多序列 + 带状 + 水平参考线），可多块纵向堆叠。"""

    title: str
    series: list[SeriesSpec] = field(default_factory=list)
    bands: list[BandSpec] = field(default_factory=list)
    refs: list[float] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "series": [s.to_dict() for s in self.series],
            "bands": [b.to_dict() for b in self.bands],
            "refs": self.refs,
        }


@dataclass
class FactorViz:
    """单个因子的完整可视化描述。"""

    name: str
    label: str
    panes: list[PaneSpec] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "label": self.label, "panes": [p.to_dict() for p in self.panes]}


# ============================================================================
# 序列工具：把 numpy 数组转成 JSON 安全的 float/None 列表
# ============================================================================


def _clean(arr: np.ndarray) -> list[float | None]:
    """numpy 数组 → float 列表，NaN/Inf → None（前端断线）。"""
    out: list[float | None] = []
    for v in arr:
        fv = float(v)
        if math.isnan(fv) or math.isinf(fv):
            out.append(None)
        else:
            out.append(round(fv, 3))
    return out


def _line(name: str, arr: np.ndarray) -> SeriesSpec:
    return SeriesSpec(name=name, kind="line", values=_clean(arr))


def _bar(name: str, arr: np.ndarray) -> SeriesSpec:
    return SeriesSpec(name=name, kind="bar", values=_clean(arr))


def _band(name: str, upper: np.ndarray, lower: np.ndarray) -> BandSpec:
    return BandSpec(name=name, upper=_clean(upper), lower=_clean(lower))


# ============================================================================
# 全序列指标计算（区别于 registry 中只取最新值的标量版本）
# ============================================================================


def _sma(values: np.ndarray, period: int) -> np.ndarray:
    """滚动均值（SMA），前 period-1 个为 NaN。"""
    n = len(values)
    out = np.full(n, np.nan)
    if n >= period:
        c = np.cumsum(np.insert(values.astype(float), 0, 0.0))
        out[period - 1 :] = (c[period:] - c[:-period]) / period
    return out


def _ema_series(values: np.ndarray, period: int) -> np.ndarray:
    """EMA 序列（与 registry._ema 一致：首值即原始首值）。"""
    values = np.asarray(values, dtype=float)
    k = 2.0 / (period + 1)
    out = values.copy()
    for i in range(1, len(out)):
        out[i] = out[i] * k + out[i - 1] * (1 - k)
    return out


def _rsi_series(closes: np.ndarray, period: int) -> np.ndarray:
    """RSI 全序列（简单滚动均值口径，与 registry._rsi 一致）。"""
    n = len(closes)
    out = np.full(n, np.nan)
    if n < period + 1:
        return out
    diff = np.diff(closes)
    gain = np.maximum(diff, 0.0)
    loss = np.maximum(-diff, 0.0)
    avg_gain = _sma(gain, period)
    avg_loss = _sma(loss, period)
    for i in range(period, n):
        g = avg_gain[i - 1]
        l = avg_loss[i - 1]
        if l == 0:
            out[i] = 100.0 if g > 0 else 50.0
        else:
            out[i] = 100.0 - 100.0 / (1.0 + g / l)
    return out


def _macd_series(closes: np.ndarray, fast: int, slow: int, signal: int) -> tuple[np.ndarray, ...]:
    """返回 (DIF, DEA, 柱值) 全序列。"""
    ef = _ema_series(closes, fast)
    es = _ema_series(closes, slow)
    dif = ef - es
    dea = _ema_series(dif, signal)
    hist = dif - dea
    return dif, dea, hist


def _atr_series(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> np.ndarray:
    """ATR 全序列。"""
    n = len(closes)
    out = np.full(n, np.nan)
    if n < period + 1:
        return out
    prev_close = closes[:-1]
    tr = np.maximum(
        highs[1:] - lows[1:],
        np.maximum(np.abs(highs[1:] - prev_close), np.abs(lows[1:] - prev_close)),
    )
    atr_tr = _sma(tr, period)
    for i in range(period, n):
        out[i] = atr_tr[i - 1]
    return out


def _mfi_series(
    highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, volumes: np.ndarray, period: int
) -> np.ndarray:
    """MFI 全序列。"""
    n = len(closes)
    out = np.full(n, np.nan)
    if n < period + 1:
        return out
    typical = (highs + lows + closes) / 3.0
    raw_mf = typical * volumes
    pos = np.where(typical[1:] > typical[:-1], raw_mf[1:], 0.0)
    neg = np.where(typical[1:] < typical[:-1], raw_mf[1:], 0.0)
    pos_sum = _sma(pos, period)
    neg_sum = _sma(neg, period)
    for i in range(period, n):
        ps = pos_sum[i - 1]
        ns = neg_sum[i - 1]
        if ns == 0:
            out[i] = 100.0 if ps > 0 else 50.0
        else:
            out[i] = 100.0 - 100.0 / (1.0 + ps / ns)
    return out


def _boll_series(closes: np.ndarray, period: int, num_std: float) -> tuple[np.ndarray, ...]:
    """返回 (中轨, 上轨, 下轨) 全序列。"""
    mid = _sma(closes, period)
    n = len(closes)
    std = np.full(n, np.nan)
    for i in range(period - 1, n):
        std[i] = float(closes[i - period + 1 : i + 1].std())
    upper = mid + num_std * std
    lower = mid - num_std * std
    return mid, upper, lower


# ============================================================================
# 数据加载
# ============================================================================


def _load_bars(
    conn: psycopg2.extensions.connection, symbol: str, limit: int = HISTORY_COUNT
) -> list[dict[str, Any]]:
    """加载单个标的最近 limit 根日线（升序，含 open / amount 供自定义因子求值）。"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT time, open, high, low, close, volume, amount
            FROM bar1d_adj
            WHERE symbol = %s
            ORDER BY time DESC
            LIMIT %s
            """,
            (symbol, limit),
        )
        rows = cur.fetchall()
    rows.reverse()
    return rows


def _opt_float(value: Any) -> float:
    """可空数值列（如停牌的 amount）→ float，缺失用 NaN。"""
    return float("nan") if value is None else float(value)


def _data_from_rows(rows: list[dict[str, Any]]) -> dict[str, np.ndarray]:
    """把行列表转成 OHLCV 数组（升序）。"""
    return {
        "open": np.asarray([float(r["open"]) for r in rows], dtype=float),
        "close": np.asarray([float(r["close"]) for r in rows], dtype=float),
        "high": np.asarray([float(r["high"]) for r in rows], dtype=float),
        "low": np.asarray([float(r["low"]) for r in rows], dtype=float),
        "volume": np.asarray([float(r["volume"]) for r in rows], dtype=float),
        "amount": np.asarray([_opt_float(r["amount"]) for r in rows], dtype=float),
    }


# ============================================================================
# 内置因子 series 构建器
# ============================================================================


def _viz_ma(data: dict[str, np.ndarray], period: int) -> FactorViz:
    closes = data["close"]
    ma = _sma(closes, period)
    return FactorViz(
        name="", label="", panes=[PaneSpec("价格", series=[_line("收盘", closes), _line(f"MA{period}", ma)])]
    )


def _viz_rsi(data: dict[str, np.ndarray], period: int) -> FactorViz:
    rsi = _rsi_series(data["close"], period)
    return FactorViz(name="", label="", panes=[PaneSpec("RSI", series=[_line(f"RSI({period})", rsi)], refs=[30.0, 70.0])])


def _viz_macd(data: dict[str, np.ndarray]) -> FactorViz:
    dif, dea, hist = _macd_series(data["close"], 12, 26, 9)
    return FactorViz(
        name="",
        label="",
        panes=[
            PaneSpec(
                "MACD",
                series=[_line("DIF", dif), _line("DEA", dea), _bar("柱", hist)],
                refs=[0.0],
            )
        ],
    )


def _viz_close_position(data: dict[str, np.ndarray], period: int) -> FactorViz:
    closes = data["close"]
    highs = data["high"]
    lows = data["low"]
    n = len(closes)
    hh = np.full(n, np.nan)
    ll = np.full(n, np.nan)
    for i in range(period - 1, n):
        hh[i] = float(highs[i - period + 1 : i + 1].max())
        ll[i] = float(lows[i - period + 1 : i + 1].min())
    return FactorViz(
        name="",
        label="",
        panes=[PaneSpec("价格", series=[_line("收盘", closes)], bands=[_band("通道", hh, ll)])],
    )


def _viz_volume(data: dict[str, np.ndarray], period: int) -> FactorViz:
    volumes = data["volume"]
    ma_vol = _sma(volumes, period)
    return FactorViz(
        name="", label="", panes=[PaneSpec("成交量", series=[_bar("量", volumes), _line(f"均量{period}", ma_vol)])]
    )


def _viz_mfi(data: dict[str, np.ndarray], period: int) -> FactorViz:
    mfi = _mfi_series(data["high"], data["low"], data["close"], data["volume"], period)
    return FactorViz(name="", label="", panes=[PaneSpec("MFI", series=[_line(f"MFI({period})", mfi)], refs=[20.0, 80.0])])


def _viz_atr(data: dict[str, np.ndarray], period: int) -> FactorViz:
    atr = _atr_series(data["high"], data["low"], data["close"], period)
    return FactorViz(name="", label="", panes=[PaneSpec("波动率", series=[_line(f"ATR({period})", atr)])])


def _viz_boll(data: dict[str, np.ndarray]) -> FactorViz:
    mid, upper, lower = _boll_series(data["close"], 20, 2.0)
    return FactorViz(
        name="",
        label="",
        panes=[
            PaneSpec(
                "价格",
                series=[_line("收盘", data["close"]), _line("中轨", mid)],
                bands=[_band("布林带", upper, lower)],
            )
        ],
    )


def _viz_close(data: dict[str, np.ndarray]) -> FactorViz:
    # 动量类因子（roc）无独立曲线，用收盘价折线作为上下文
    return FactorViz(name="", label="", panes=[PaneSpec("价格", series=[_line("收盘", data["close"])])])


# 因子名 → 构建器
_BUILTIN_VIZ: dict[str, Any] = {
    "roc_5": lambda d: _viz_close(d),
    "roc_20": lambda d: _viz_close(d),
    "rsi_6": lambda d: _viz_rsi(d, 6),
    "rsi_14": lambda d: _viz_rsi(d, 14),
    "macd_diff": _viz_macd,
    "ma_trend_5": lambda d: _viz_ma(d, 5),
    "ma_trend_20": lambda d: _viz_ma(d, 20),
    "ma_trend_60": lambda d: _viz_ma(d, 60),
    "close_position": lambda d: _viz_close_position(d, 20),
    "volume_ratio_5": lambda d: _viz_volume(d, 5),
    "mfi_14": lambda d: _viz_mfi(d, 14),
    "atr_ratio_14": lambda d: _viz_atr(d, 14),
    "boll_position": _viz_boll,
}


# ============================================================================
# 自定义因子：AKQuant 表达式求值
# ============================================================================


def _evaluate_custom(rows: list[dict[str, Any]], symbol: str, expression: str) -> list[float | None]:
    """用 AKQuant 引擎对单个标的求值，返回按时间升序的因子值序列。"""
    import polars as pl
    from pathlib import Path

    from akquant.factor import FactorEngine

    class _DummyCatalog:
        root = Path(".")

    engine = FactorEngine(_DummyCatalog())

    df = pl.DataFrame(
        {
            "date": [r["time"] for r in rows],
            "symbol": [symbol] * len(rows),
            "open": [float(r["open"]) for r in rows],
            "high": [float(r["high"]) for r in rows],
            "low": [float(r["low"]) for r in rows],
            "close": [float(r["close"]) for r in rows],
            "volume": [float(r["volume"]) for r in rows],
        }
    )
    result = engine.run_on_data(df, expression)
    result = result.sort("date")
    return [None if v is None else round(float(v), 4) for v in result["factor_value"].to_list()]


def _viz_custom(rows: list[dict[str, Any]], symbol: str, expression: str) -> FactorViz:
    """自定义因子：上 pane 价格 +（可选）下 pane 因子值。

    若表达式中含均线（Mean(Close, N)），则在价格 pane 中额外画出对应的
    标准均线序列（如 MA5 / MA10 / MA20），并省略下方因子值 pane ——
    均线形态本身已足够直观，因子值线信息重复。
    不含均线的自定义因子（如信号类）仍保留「价格 + 因子值」双 pane。
    """
    closes = np.asarray([float(r["close"]) for r in rows], dtype=float)

    periods = sorted({int(p) for p in re.findall(r"Mean\(\s*Close\s*,\s*(\d+)\s*\)", expression)})
    price_series = [_line("收盘", closes)]
    price_series += [_line(f"MA{p}", _sma(closes, p)) for p in periods]

    panes = [PaneSpec("价格", series=price_series)]
    if not periods:
        values = _evaluate_custom(rows, symbol, expression)
        panes.append(PaneSpec("因子", series=[SeriesSpec(name="因子值", kind="line", values=values)]))

    return FactorViz(name="", label="", panes=panes)


def _viz_python(rows: list[dict[str, Any]], symbol: str, code: str) -> FactorViz:
    """自定义-Python 因子：上 pane 价格 + 下 pane 由 compute(data) 产出的因子值。

    与表达式因子不同，Python 因子的因子值完全由用户代码决定（可能包含均线、
    动量、组合逻辑等），无法像表达式那样用正则提取均线周期，故统一保留
    「价格 + 因子值」双 pane。
    """
    data = _data_from_rows(rows)
    series_by_symbol = run_factor_code(code, {symbol: data})
    values = series_by_symbol.get(symbol)
    if values is None:
        raise ValueError("Python 因子未返回该标的的因子值")

    closes = data["close"]
    panes = [
        PaneSpec("价格", series=[_line("收盘", closes)]),
        PaneSpec("因子", series=[SeriesSpec(name="因子值", kind="line", values=values)]),
    ]
    return FactorViz(name="", label="", panes=panes)


# ============================================================================
# 编排入口
# ============================================================================


def build_indicators(symbols: list[str], factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """批量构建选股结果的指标序列。

    Args:
        symbols: 需要出图的 symbol 列表
        factors: 因子描述列表 [{name, label?, kind?, expression?, code?}]
                 name 命中内置注册表时走内置构建器；自定义因子按 kind 分派：
                 expression（AKQuant 表达式）或 python（受限环境执行 compute）

    Returns:
        [{symbol, factors: [FactorViz...]}]
    """
    # Python 因子需要更长的历史窗口（用户代码可能使用长周期均线）
    need_long = any(str(f.get("kind") or "") == "python" for f in factors)
    bar_limit = CUSTOM_HISTORY_COUNT if need_long else HISTORY_COUNT

    conn = _get_conn()
    try:
        items: list[dict[str, Any]] = []
        for symbol in symbols:
            rows = _load_bars(conn, symbol, bar_limit)
            if len(rows) < HISTORY_COUNT:
                continue
            data = _data_from_rows(rows)

            factor_vizs: list[dict[str, Any]] = []
            for f in factors:
                name = f.get("name") or ""
                label = f.get("label") or name
                try:
                    if name in _BUILTIN_VIZ:
                        viz = _BUILTIN_VIZ[name](data)
                    elif str(f.get("kind") or "") == "python" and f.get("code"):
                        viz = _viz_python(rows, symbol, f["code"])
                    elif f.get("expression"):
                        viz = _viz_custom(rows, symbol, f["expression"])
                    else:
                        continue
                except Exception as e:  # 单个因子失败不拖垮整个结果
                    log.warning("指标构建失败", symbol=symbol, factor=name, error=str(e))
                    continue
                viz.name = name
                viz.label = label
                factor_vizs.append(viz.to_dict())

            if factor_vizs:
                items.append({"symbol": symbol, "factors": factor_vizs})
        return items
    finally:
        conn.close()
