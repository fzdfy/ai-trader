"""复权仿射参数反解（Route A：腾讯仿射复刻）。

腾讯日线的复权为分段仿射（已实测，逐点零误差）：

- 前复权  ``qfq_t = p_t · raw_t + D_t``
  ``p_t`` 为前复权乘法因子（送转/拆股累计比，段内常数，未送转段恒为 1）；
  ``D_t`` 为前复权加法偏移（段内常数，最新段恒为 0）。
- 后复权  ``hfq_t = S · qfq_t + B``
  ``S`` / ``B`` 为标的级全局常量（无分段）。

关键：**qfq 不是纯加法**——含送转/拆股的标的（如 002594 送转后 ``p_t = 1/3``）
在送转日之前 ``qfq − raw`` 随价每日变化，单一加法模型无法拟合，必须带乘法因子。

落库口径（对齐 server 端 ``adj_factor`` / ``adj_factor_latest`` 与
``bar1d_qfq`` / ``bar1d_hfq`` 视图）：

- ``qfq_ratio``  ``p_t``
- ``qfq_offset`` ``D_t``
- ``scale``      ``S``
- ``hfq_base``   ``B``

分段点 = 原始价单日跌幅 >20% 的送转/拆股日；段内先稳健估 ``p``（取 |Δraw| 最大的一批
区间的 Δqfq/Δraw 中位数），再取 ``D = qfq − p·raw`` 并按跳变切行。``S`` / ``B`` 由
``hfq = S·qfq + B`` 的稳健估计（相邻点斜率中位数 + 偏移中位数）求得，对当日未结算
的离群 K 线免疫（见 ``_fit_hfq``）。

本模块只做纯计算：输入同一 symbol 的 raw/qfq/hfq 三份日线（已按日期对齐），
输出可直接 upsert 到 ``adj_factor`` 的参数序列，不做任何取数。

已知限制：腾讯 fqkline 单次最多返回约 800 根日线（>800 静默回退 640 根，
≥2500 返回错误形状），故参数只覆盖最近窗口；更早历史无法从腾讯仿射式直接反解。
"""
from __future__ import annotations

from .schemas import AdjustParamPoint, AdjustParams

# 送转/拆股判定：原始价单日跌幅 >20% 视为分割点（A 股送转除权幅度远大于 20%）。
_SPLIT_DROP = 0.8
# D_t 跳变阈值：价格保留 2 位小数。过紧（如 1e-3）会让高价股段内 p 估计的微小误差
# 随价格线性放大、触发大量伪段边界（实测 920982.BJ 775 根日线畸变出 370 段，真实仅 2 段）；
# 取 1e-2（1 分钱）与最小价格变动单位同量级，既收敛伪段又把重建残差压在 1 分内。
_OFFSET_TOL = 1e-2


def _median(values: list[float]) -> float:
    xs = sorted(values)
    n = len(xs)
    if not n:
        return 1.0
    mid = n // 2
    return xs[mid] if n % 2 else (xs[mid - 1] + xs[mid]) / 2.0


def _split_bounds(raw: list[float]) -> list[int]:
    """送转/拆股分割点：原始价单日跌幅 >20% 的次日索引。"""
    return [
        i for i in range(1, len(raw))
        if raw[i - 1] > 0 and raw[i] / raw[i - 1] < _SPLIT_DROP
    ]


def _estimate_ratio(raw: list[float], qfq: list[float], lo: int, hi: int) -> float:
    """段内稳健估前复权乘法因子 ``p``。

    段内 ``D`` 恒定，故 ``Δqfq/Δraw = p``；取 |Δraw| 最大的前 20% 区间的斜率中位数，
    抵消价格 2 位小数舍入噪声。
    """
    cand: list[tuple[float, float]] = []
    for i in range(lo + 1, hi):
        dr = raw[i] - raw[i - 1]
        if abs(dr) > 1e-9:
            cand.append((abs(dr), (qfq[i] - qfq[i - 1]) / dr))
    if not cand:
        return 1.0
    cand.sort(reverse=True)
    top = [s for _, s in cand[: max(1, len(cand) // 5)]]
    return _median(top)


def _build_points(
    dates: list[str], raw: list[float], qfq: list[float]
) -> list[AdjustParamPoint]:
    """按送转分割点分段，逐段估 ``p`` 后再按 ``D`` 跳变切行。"""
    points: list[AdjustParamPoint] = []
    n = len(dates)
    bounds = [0] + _split_bounds(raw) + [n]
    for k in range(len(bounds) - 1):
        lo, hi = bounds[k], bounds[k + 1]
        p = _estimate_ratio(raw, qfq, lo, hi)
        cur: float | None = None
        for i in range(lo, hi):
            offset = qfq[i] - p * raw[i]
            if cur is None or abs(offset - cur) > _OFFSET_TOL:
                cur = offset
                points.append(
                    AdjustParamPoint(
                        date=dates[i],
                        qfq_ratio=round(p, 6),
                        qfq_offset=round(offset, 6),
                    )
                )
    return points


def _fit_hfq(qfq: list[float], hfq: list[float]) -> tuple[float, float]:
    """稳健拟合 ``hfq = S·qfq + B``（``S``/``B`` 为标的级全局常量）。

    不能直接用全局最小二乘：实测腾讯 fqkline 的最新一根（当日实时/未结算）后复权价
    会显著偏离仿射关系（如 002594 由 ~263 跳到 85），单个离群点即可把最小二乘解带偏，
    进而污染整段历史 hfq。故用「相邻点斜率中位数」估 ``S``（跨越除权日仍成立，因
    ``hfq`` 对 ``qfq`` 全局仿射），再用 ``h − S·q`` 的中位数估 ``B``，对少数离群点免疫。
    """
    n = len(qfq)
    if n < 2:
        return (1.0, 0.0)
    slopes = [
        (hfq[i] - hfq[i - 1]) / (qfq[i] - qfq[i - 1])
        for i in range(1, n)
        if abs(qfq[i] - qfq[i - 1]) > 1e-9
    ]
    if not slopes:
        return 1.0, 0.0
    s = _median(slopes)
    b = _median([h - s * q for q, h in zip(qfq, hfq)])
    return s, b


def solve_adjust_params(
    symbol: str,
    dates: list[str],
    raw_close: list[float],
    qfq_close: list[float],
    hfq_close: list[float],
    source: str = "tencent",
) -> AdjustParams:
    """由对齐后的三份收盘价反解分段仿射参数。

    ``dates`` / ``raw_close`` / ``qfq_close`` / ``hfq_close`` 长度一致且已按日期升序对齐。
    """
    if not dates:
        return AdjustParams(
            symbol=symbol, scale=1.0, latest_date="", hfq_base=0.0,
            source=source, points=[],
        )

    points = _build_points(dates, raw_close, qfq_close)
    scale, base = _fit_hfq(qfq_close, hfq_close)
    return AdjustParams(
        symbol=symbol,
        scale=round(scale, 6),
        latest_date=dates[-1],
        hfq_base=round(base, 6),
        source=source,
        points=points,
    )


def align_series(
    bars_by_adjust: dict[str, list],
) -> tuple[list[str], list[float], list[float], list[float]]:
    """把 raw/qfq/hfq 三份 K 线按日期取交集并对齐为四条平行数组。"""
    by_date: dict[str, dict[str, float]] = {}
    for adj in ("none", "qfq", "hfq"):
        for bar in bars_by_adjust.get(adj) or []:
            by_date.setdefault(bar.time, {})[adj] = bar.close
    dates = sorted(
        d for d, row in by_date.items()
        if row.get("none") is not None and row.get("qfq") is not None and row.get("hfq") is not None
    )
    return (
        dates,
        [by_date[d]["none"] for d in dates],
        [by_date[d]["qfq"] for d in dates],
        [by_date[d]["hfq"] for d in dates],
    )
