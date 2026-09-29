"""Route A 复权仿射复刻 · 算法级双跑比对校验（步骤 8）。

不依赖 DB：对同一标的直接取源端（沪深腾讯 / 北交所东财）的 raw / qfq / hfq 三份日线，
用 ``solve_adjust_params`` 反解分段仿射参数，再按 ``bar1d_qfq`` / ``bar1d_hfq`` 视图的
公式逐点重建：

    qfq_recon_t = p_t · raw_t + D_t      （p_t / D_t 取 date <= t 的最近有效段）
    hfq_recon_t = S · qfq_recon_t + B

与源端真实 qfq / hfq 逐点比对，统计每标的与整体的最大绝对 / 相对误差，验证「复刻腾讯
仿射逐点零误差」。超差标的与超差日期逐条打印，便于定位算法边界（送转分割点、现金分红
偏移、无复权标的等）。

比对口径注意：腾讯 ``fqkline`` 的 hfqday **末根（当日未结算）在大窗口下返回离群值**
（实测 limit=800 时 002594 末根 hfq=84.65 ≈ 未复权 raw，而 limit=5 时为正确的 260.591），
属源端瑕疵而非我方算法缺陷（生产 ``bar1d_hfq`` 视图只由 raw 重建、不消费该行）。故 hfq
比对默认跳过最后一根；qfq 末根正常（最新段 D≡0），不跳过。

容差：``abs <= ABS_TOL`` 或 ``rel <= REL_TOL`` 二者达标其一即通过——abs 约束低价标的
（分级分敏感），rel 约束高价标的（绝对误差随价放大）。

样本为风险靶向：送转 / 拆股、普通沪深、创业板、北交所、指数、ETF 各取样。

用法（cwd = apps/quant）：
    .venv/bin/python verify_adjust.py                 # 跑内置风险靶向样本
    .venv/bin/python verify_adjust.py 002594.SZ 600519.SH   # 覆盖为指定标的

退出码：全部通过 0；任一标的超差或取数失败 1。
"""

from __future__ import annotations

import sys
from dataclasses import dataclass

from data.adjust import align_series, solve_adjust_params
from data.providers import EastmoneyProvider, TencentProvider
from data.schemas import AdjustParams

# 单标的拉取窗口（腾讯 fqkline 单次上限约 800 根；东财同样支持）
LIMIT = 800
# 绝对容差：价格源端保留 2 位小数，重建误差应在「半厘」量级；给到 1 分钱判通过
ABS_TOL = 0.01
# 相对容差：高价股绝对误差随价格放大，用相对误差兜底（1e-4 = 万分之一）
REL_TOL = 1e-4

# 风险靶向样本：(symbol, 分类说明)
SAMPLES: list[tuple[str, str]] = [
    ("002594.SZ", "送转/高价（比亚迪，含分段仿射）"),
    ("600519.SH", "沪市高价无送转（贵州茅台，大额现金分红）"),
    ("000001.SZ", "深市银行（平安银行，多年现金分红）"),
    ("601318.SH", "沪市权重（中国平安，分红+送转）"),
    ("300750.SZ", "创业板高价（宁德时代）"),
    ("000858.SZ", "深市消费（五粮液）"),
    ("920992.BJ", "北交所（中科美菱，走东财源）"),
    ("920982.BJ", "北交所（锦波生物，走东财源）"),
    ("000001.SH", "沪市指数（上证指数，无复权）"),
    ("510300.SH", "ETF（沪深300ETF，无复权）"),
]


@dataclass
class Result:
    symbol: str
    category: str
    source: str
    bars: int = 0
    segments: int = 0
    max_abs_qfq: float = 0.0
    max_rel_qfq: float = 0.0
    max_abs_hfq: float = 0.0
    max_rel_hfq: float = 0.0
    worst_qfq_date: str = ""
    worst_hfq_date: str = ""
    error: str | None = None

    @property
    def ok(self) -> bool:
        if self.error is not None:
            return False
        return self._within(self.max_abs_qfq, self.max_rel_qfq) and self._within(
            self.max_abs_hfq, self.max_rel_hfq
        )

    @staticmethod
    def _within(max_abs: float, max_rel: float) -> bool:
        return max_abs <= ABS_TOL or max_rel <= REL_TOL


def _provider_for(symbol: str):
    """按市场选反解源：北交所走东财，其余走腾讯（与 adj-factor 管道口径一致）。"""
    if symbol.upper().endswith(".BJ"):
        return EastmoneyProvider(), "eastmoney"
    return TencentProvider(), "tencent"


def _reconstruct(
    dates: list[str], raw: list[float], params: AdjustParams
) -> tuple[list[float], list[float]]:
    """按视图口径逐点重建 qfq / hfq。

    复刻 ``bar1d_qfq`` 的 ``left join lateral ... date <= b.time order by date desc limit 1``：
    每个日期应用「最近一个 date <= t 的段」的 (p_t, D_t)；hfq 再由标的级 (S, B) 全局仿射。
    """
    points = sorted(params.points, key=lambda p: p.date)
    qfq: list[float] = []
    j = 0
    ratio = 1.0
    offset = 0.0
    for t, r in zip(dates, raw):
        while j < len(points) and points[j].date <= t:
            ratio = points[j].qfq_ratio
            offset = points[j].qfq_offset
            j += 1
        qfq.append(ratio * r + offset)
    hfq = [params.scale * q + params.hfq_base for q in qfq]
    return qfq, hfq


def _max_error(
    recon: list[float], actual: list[float], dates: list[str], exclude_last: bool = False
) -> tuple[float, float, str]:
    max_abs = 0.0
    max_rel = 0.0
    worst = ""
    stop = len(dates) - 1 if exclude_last else len(dates)
    for d, a, b in zip(dates[:stop], recon[:stop], actual[:stop]):
        err = abs(a - b)
        rel = err / max(abs(b), 1e-9)
        if err > max_abs:
            max_abs = err
            worst = d
        max_rel = max(max_rel, rel)
    return max_abs, max_rel, worst


def verify_one(symbol: str, category: str) -> Result:
    provider, source = _provider_for(symbol)
    result = Result(symbol=symbol, category=category, source=source)
    try:
        bars_by = {
            adj: provider.kline(symbol, tf="1d", limit=LIMIT, adjust=adj)
            for adj in ("none", "qfq", "hfq")
        }
    except Exception as exc:
        result.error = f"取数失败: {exc}"
        return result

    dates, raw, qfq_act, hfq_act = align_series(bars_by)
    if len(dates) < 2:
        result.error = f"对齐后仅 {len(dates)} 根，样本不足"
        return result

    params = solve_adjust_params(symbol, dates, raw, qfq_act, hfq_act, source=source)
    qfq_rec, hfq_rec = _reconstruct(dates, raw, params)

    result.bars = len(dates)
    result.segments = len(params.points)
    (
        result.max_abs_qfq,
        result.max_rel_qfq,
        result.worst_qfq_date,
    ) = _max_error(qfq_rec, qfq_act, dates)
    (
        result.max_abs_hfq,
        result.max_rel_hfq,
        result.worst_hfq_date,
    ) = _max_error(hfq_rec, hfq_act, dates, exclude_last=True)
    return result


def _fmt(err: float) -> str:
    return f"{err:.6f}"


def main(argv: list[str]) -> int:
    samples = (
        [(s.strip(), "") for s in argv[1:] if s.strip()] if len(argv) > 1 else SAMPLES
    )

    print(f"Route A 复权仿射复刻 · 双跑比对校验（样本 {len(samples)} 只）")
    print(f"容差：abs <= {ABS_TOL} 元 / rel <= {REL_TOL}")
    print()

    results: list[Result] = []
    for symbol, category in samples:
        r = verify_one(symbol, category)
        results.append(r)
        if r.error is not None:
            print(f"  {r.symbol:<12} [{r.source:<9}] !! {r.error}")
            continue
        flag = "OK  " if r.ok else "FAIL"
        print(
            f"  {r.symbol:<12} [{r.source:<9}] {flag} "
            f"bars={r.bars:<3} seg={r.segments:<2} "
            f"qfq<max {_fmt(r.max_abs_qfq)} rel {r.max_rel_qfq:.2e}"
            f"@{r.worst_qfq_date} "
            f"| hfq<max(末根除外) {_fmt(r.max_abs_hfq)} rel {r.max_rel_hfq:.2e}"
            f"@{r.worst_hfq_date}"
        )

    ok = [r for r in results if r.ok]
    bad = [r for r in results if not r.ok]
    print()
    print(f"通过 {len(ok)}/{len(results)}，失败 {len(bad)}")

    if bad:
        print("失败明细：")
        for r in bad:
            reason = r.error or (
                f"qfq max_abs={_fmt(r.max_abs_qfq)} max_rel={r.max_rel_qfq:.2e} "
                f"@{r.worst_qfq_date}; hfq max_abs={_fmt(r.max_abs_hfq)} "
                f"max_rel={r.max_rel_hfq:.2e}@{r.worst_hfq_date}"
            )
            print(f"  - {r.symbol} ({r.category or r.source}): {reason}")
        return 1

    # 通过时给出整体上界，量化「逐点零误差」的裕度
    worst_qfq = max(ok, key=lambda r: r.max_abs_qfq)
    worst_hfq = max(ok, key=lambda r: r.max_abs_hfq)
    print(
        f"整体最大 qfq 绝对误差 {_fmt(worst_qfq.max_abs_qfq)} "
        f"（{worst_qfq.symbol} @ {worst_qfq.worst_qfq_date}）；"
        f"最大 hfq 绝对误差 {_fmt(worst_hfq.max_abs_hfq)} "
        f"（{worst_hfq.symbol} @ {worst_hfq.worst_hfq_date}）"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
