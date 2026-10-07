"""因子检验引擎：对 AKQuant 表达式因子做 IC / RankIC / ICIR / 分层回测 / 因子衰退。

职责：把「因子库」中的表达式因子变成可量化的研究结论——在每个交易日的横截面上，
计算因子值与未来收益的相关性（IC / RankIC），据此得到 IC 均值、ICIR、t 值，并按
因子分位做分层回测（各层净值曲线 + 多空收益），以及不同持有期下的 IC（因子衰退）。

数据口径（重要）：
  - 取数走 bar1d_hfq（后复权），因子值与未来收益都基于后复权价计算。绝不使用前复权
    （qfq）——前复权因子含未来分红信息，会让历史因子值出现前视偏差，IC 会被高估。
  - 未来收益为 close-to-close：ret(t→t+h) = close_{t+h} / close_t - 1，其中因子在 t
    收盘用 ≤t 数据计算，故与收益之间无未来信息泄漏。

性能：
  - 全市场约 5500 只，逐标的取 500 根即 275 万行，故默认对股票池做等距抽样
    （EVAL_MAX_SYMBOLS），横截面 IC 用 800 只已足够稳健，同时把耗时压到可接受范围。

用法：
    from factor_eval import evaluate_factor
    result = evaluate_factor("Ts_Mean(Close,20) / Close - 1", horizon=1)
"""

from __future__ import annotations

import math
import time
from typing import Any

import polars as pl

from logger import get_logger
from factor_code import run_factor_code
from screener import (
    _eval_expression_panel,
    _get_conn,
    _get_universe,
    _load_universe_frame,
)

log = get_logger("factor_eval")

# 每个标的取多少根后复权日线（越长越能覆盖长周期算子，但取数/求值越慢）
EVAL_BARS = 500

# 股票池抽样上限（等距抽样，横截面 IC 用 800 只已足够稳健）
EVAL_MAX_SYMBOLS = 800

# 单个交易日至少要有多少只股票参与，才计算该日 IC（样本太少的截面相关性无意义）
EVAL_MIN_SYMBOLS = 20

# 分层回测默认层数与上限
DEFAULT_LAYERS = 5
MAX_LAYERS = 10

# 因子衰退（IC 随持有期变化）默认考察的持有期（交易日）
DEFAULT_DECAY_HORIZONS = (1, 2, 3, 5, 10, 20)

# 样本外（valid）区间最少需要的有效交易日数：不足则放弃切分（回退为全样本）
MIN_VALID_DAYS = 20

# 交易日年化系数（252 个交易日）
TRADING_DAYS_PER_YEAR = 252

# 取候选标的时排除北交所（历史较短、规则不同，且非检验必需）
_EXCLUDE_BJ = "%.BJ"


def _sample_universe(
    universe: list[dict[str, Any]], max_symbols: int
) -> list[dict[str, Any]]:
    """对股票池做等距抽样，使其数量不超过 max_symbols。

    等距（而非取前 N 只）可让沪深各板块均匀落入样本，避免代码排序带来的板块偏斜。
    max_symbols <= 0 或池子本身不超限时原样返回。
    """
    n = len(universe)
    if max_symbols <= 0 or n <= max_symbols:
        return universe
    step = n / max_symbols
    picked: list[dict[str, Any]] = []
    seen: set[int] = set()
    for i in range(max_symbols):
        idx = int(i * step)
        if idx not in seen:
            seen.add(idx)
            picked.append(universe[idx])
    return picked


def _forward_returns(close_panel: pl.DataFrame, horizon: int) -> pl.DataFrame:
    """由后复权收盘价面板计算未来 horizon 个交易日的 close-to-close 收益。

    Args:
        close_panel: 含 symbol / date / close 三列（按 symbol、date 升序）。
        horizon: 未来持有交易日数（>=1）。

    Returns:
        symbol / date / fwd_ret 三列；末尾不足 horizon 根的记录其 fwd_ret 为 null。
    """
    ordered = close_panel.sort(["symbol", "date"])
    return ordered.with_columns(
        (
            pl.col("close").shift(-horizon).over("symbol") / pl.col("close") - 1.0
        ).alias("fwd_ret")
    ).select(["symbol", "date", "fwd_ret"])


def _factor_panel_from_code(frame: pl.DataFrame, code: str) -> pl.DataFrame:
    """在整段后复权日线上执行受限 Python 因子代码，构造 symbol/date/factor 面板。

    逐标的把行情列（open/high/low/close/volume/amount，时间升序）喂给 compute：
      - compute 返回与行情等长的序列 → 逐日对齐为因子值。要求因子只用 ≤t 的数据
        （否则存在前视偏差，属因子作者责任，与表达式因子同口径）；
      - 返回标量或长度不匹配 → 只取最后一个有效值，贡献到该标的的最新交易日。

    面板为空（如逐标的全部返回 None）时返回空 DataFrame，由上层判定为无效。
    仅返回标量（归一为长度 1）的因子通常无法支撑时序 IC 检验——只剩最新一个
    截面，会因参与标的数不足被 min_symbols 过滤掉。
    """
    schema = {"symbol": pl.Utf8, "date": pl.Datetime, "factor": pl.Float64}
    data_by_symbol: dict[str, dict[str, Any]] = {}
    dates_by_symbol: dict[str, list[Any]] = {}
    for key, group in frame.group_by("symbol", maintain_order=True):
        symbol = str(key[0] if isinstance(key, tuple) else key)
        g = group.sort("date")
        data_by_symbol[symbol] = {
            "open": g["open"].to_numpy(),
            "high": g["high"].to_numpy(),
            "low": g["low"].to_numpy(),
            "close": g["close"].to_numpy(),
            "volume": g["volume"].to_numpy(),
            "amount": g["amount"].to_numpy(),
        }
        dates_by_symbol[symbol] = g["date"].to_list()

    if not data_by_symbol:
        return pl.DataFrame(schema=schema)

    series_by_symbol = run_factor_code(code, data_by_symbol)

    out_sym: list[str] = []
    out_date: list[Any] = []
    out_factor: list[float] = []
    for symbol, values in series_by_symbol.items():
        dates = dates_by_symbol.get(symbol)
        if not dates or not values:
            continue
        if len(values) == len(dates):
            for d, v in zip(dates, values):
                if v is None:
                    continue
                out_sym.append(symbol)
                out_date.append(d)
                out_factor.append(float(v))
            continue
        last = next((v for v in reversed(values) if v is not None), None)
        if last is not None:
            out_sym.append(symbol)
            out_date.append(dates[-1])
            out_factor.append(float(last))

    return pl.DataFrame(
        {"symbol": out_sym, "date": out_date, "factor": out_factor}, schema=schema
    )


def _factor_panel(
    frame: pl.DataFrame,
    expression: str | None = None,
    code: str | None = None,
) -> pl.DataFrame:
    """按因子类型（表达式 / Python 代码）求 symbol/date/factor 面板。"""
    if code:
        return _factor_panel_from_code(frame, code)
    factor_panel = _eval_expression_panel(frame, expression or "")
    if factor_panel is None:
        raise ValueError("表达式未产出结果（缺少 result），无法检验")
    return factor_panel


def _build_panel(
    frame: pl.DataFrame,
    horizon: int,
    min_symbols: int,
    expression: str | None = None,
    code: str | None = None,
) -> pl.DataFrame:
    """构造检验面板：factor（因子值）+ fwd_ret（未来收益），并去掉无效行。

    流程：先在整段日线上求因子（表达式或 Python 代码）得到 symbol/date/factor 面板，
    再与未来收益按 symbol/date 内连接；随后剔除因子值或收益为空的记录，最后只保留
    参与标的数 >= min_symbols 的交易日（保证截面相关性有效）。
    """
    factor_panel = _factor_panel(frame, expression=expression, code=code)

    close_panel = frame.select(["symbol", "date", "close"])
    fwd = _forward_returns(close_panel, horizon)

    panel = (
        factor_panel.join(fwd, on=["symbol", "date"], how="inner")
        .drop_nulls(["factor", "fwd_ret"])
        .filter(pl.col("fwd_ret").is_finite() & pl.col("factor").is_finite())
    )

    counts = panel.group_by("date").len()
    enough = counts.filter(pl.col("len") >= min_symbols).select("date")
    return panel.join(enough, on="date", how="semi")


def _split_panel_by_date(
    panel: pl.DataFrame, valid_ratio: float
) -> tuple[pl.DataFrame, pl.DataFrame, str] | None:
    """按交易日把检验面板切成样本内(train) / 样本外(valid) 两段。

    以面板中实际参与计算的交易日为基准，取时间靠后的 valid_ratio 比例作为样本外区间，
    两段在时间上不重叠（train 全部早于 valid），从而度量因子的样本外稳定性。

    任一区间有效交易日不足 MIN_VALID_DAYS 时返回 None（放弃切分、回退为全样本）。
    """
    dates = panel["date"].unique().sort()
    n = len(dates)
    n_valid = int(round(n * valid_ratio))
    if n_valid < MIN_VALID_DAYS or n - n_valid < MIN_VALID_DAYS:
        return None
    cutoff = dates[n - n_valid]
    train = panel.filter(pl.col("date") < cutoff)
    valid = panel.filter(pl.col("date") >= cutoff)
    return train, valid, cutoff.strftime("%Y-%m-%d")


def _valid_summary(valid_panel: pl.DataFrame, layers: int) -> dict[str, Any] | None:
    """汇总样本外(valid)区间的检验指标（IC / RankIC / 多空）。

    样本外有效交易日为 0（无法计算截面相关）时返回 None。
    """
    valid_ic = _ic_series(valid_panel)
    if valid_ic.height == 0:
        return None
    return {
        "ic": _summarize_series(valid_ic, "ic"),
        "rankIc": _summarize_series(valid_ic, "rank_ic"),
        "longShort": _layer_backtest(valid_panel, layers)["longShort"],
        "turnover": _quantile_turnover(valid_panel, layers),
        "rankAutocorr": _rank_autocorr(valid_panel),
        "alphaBeta": _alpha_beta(valid_panel, layers),
        "monthlyIc": _monthly_ic(valid_ic),
        "sampleCount": valid_ic.height,
        "startDate": valid_panel["date"].min().strftime("%Y-%m-%d"),
        "endDate": valid_panel["date"].max().strftime("%Y-%m-%d"),
    }


def _ic_series(panel: pl.DataFrame) -> pl.DataFrame:
    """逐交易日计算截面 Pearson IC 与 Spearman RankIC。

    Returns:
        date / ic / rank_ic / count 四列（按 date 升序），已剔除无法计算的截面：
        因子在当日截面内无区分度（方差为 0，如 0/1 信号当日全为 0）时相关性为
        NaN，必须一并剔除——否则单个 NaN 会污染整段序列的均值，使 IC/ICIR/t 值
        全部变为 NaN（落库后表现为 null）。
    """
    return (
        panel.group_by("date")
        .agg(
            pl.corr("factor", "fwd_ret").alias("ic"),
            pl.corr("factor", "fwd_ret", method="spearman").alias("rank_ic"),
            pl.len().alias("count"),
        )
        .filter(pl.col("ic").is_finite() & pl.col("rank_ic").is_finite())
        .sort("date")
    )


def _summarize_series(ic_df: pl.DataFrame, col: str) -> dict[str, Any]:
    """汇总逐日 IC 序列（ic / rank_ic）的检验指标。

    指标：均值 / 标准差 / ICIR / t 值 / IC>0 占比 / 年化 ICIR。
    ICIR = mean(IC) / std(IC)；t 值 = ICIR * sqrt(交易日数)。
    """
    n = ic_df.height
    if n == 0:
        return {
            "mean": None,
            "std": None,
            "icir": None,
            "tStat": None,
            "positiveRatio": None,
            "icirAnnual": None,
            "count": 0,
        }
    vals = ic_df[col].to_numpy()
    mean = float(vals.mean())
    std = float(vals.std(ddof=1)) if n > 1 else 0.0
    icir = mean / std if std > 0 else None
    t_stat = icir * math.sqrt(n) if icir is not None else None
    return {
        "mean": round(mean, 6),
        "std": round(std, 6),
        "icir": round(icir, 6) if icir is not None else None,
        "tStat": round(t_stat, 4) if t_stat is not None else None,
        "positiveRatio": round(float((vals > 0).mean()), 4),
        "icirAnnual": round(icir * math.sqrt(TRADING_DAYS_PER_YEAR), 4)
        if icir is not None
        else None,
        "count": n,
    }


def _assign_layers(panel: pl.DataFrame, layers: int) -> pl.DataFrame:
    """按每个交易日的因子值升序排名，等分为 layers 层（layer 0 为最低层）。"""
    return (
        panel.with_columns(
            [
                pl.col("factor").rank(method="ordinal").over("date").alias("_rk"),
                pl.len().over("date").alias("_cnt"),
            ]
        )
        .with_columns(
            (
                (((pl.col("_rk") - 1) * layers) // pl.col("_cnt"))
                .clip(0, layers - 1)
                .cast(pl.Int64)
            ).alias("layer")
        )
        .drop(["_rk", "_cnt"])
    )


def _layer_backtest(panel: pl.DataFrame, layers: int) -> dict[str, Any]:
    """按因子分位做分层回测。

    每个交易日按因子值升序排名，等分为 layers 层（第 1 层因子值最低，第 N 层最高），
    层内等权持有，持有期与面板的未来收益口径一致（默认 1 日）。输出各层净值曲线、
    多空（最高层 - 最低层）净值，以及各层的区间/日均收益与胜率。

    注意：当持有期 horizon > 1 时，未来收益相互重叠，净值曲线会被高估，仅作趋势参考。
    """
    ranked = _assign_layers(panel, layers).select(["date", "layer", "fwd_ret"])

    daily = (
        ranked.group_by(["date", "layer"])
        .agg(pl.col("fwd_ret").mean().alias("ret"))
        .sort(["layer", "date"])
    )

    # 各层累计净值（层内按日复利）
    daily = daily.with_columns(
        (1.0 + pl.col("ret")).cum_prod().over("layer").alias("nav")
    )

    # 多空日收益 = 最高层 - 最低层
    long_short = (
        daily.group_by("date")
        .agg(
            (
                pl.col("ret").filter(pl.col("layer") == layers - 1).first()
                - pl.col("ret").filter(pl.col("layer") == 0).first()
            ).alias("ls_ret")
        )
        .sort("date")
        .with_columns((1.0 + pl.col("ls_ret")).cum_prod().alias("ls_nav"))
    )

    nav_wide = daily.pivot(on="layer", index="date", values="nav").sort("date")

    # 各层区间汇总
    summary_rows: list[dict[str, Any]] = []
    for layer in range(layers):
        sub = daily.filter(pl.col("layer") == layer)
        if sub.height == 0:
            continue
        rets = sub["ret"].to_numpy()
        nav = sub["nav"].to_numpy()
        days = len(rets)
        mean_ret = float(rets.mean())
        ann_ret = (1.0 + mean_ret) ** TRADING_DAYS_PER_YEAR - 1.0 if mean_ret > -1 else None
        summary_rows.append(
            {
                "layer": layer + 1,
                "cumRet": round(float(nav[-1]) - 1.0, 6),
                "meanRet": round(mean_ret, 6),
                "annRet": round(ann_ret, 6) if ann_ret is not None else None,
                "winRate": round(float((rets > 0).mean()), 4),
                "days": days,
            }
        )

    ls_rets = long_short["ls_ret"].to_numpy()
    ls_nav_last = float(long_short["ls_nav"].to_numpy()[-1]) if len(ls_rets) else 1.0
    ls_mean = float(ls_rets.mean()) if len(ls_rets) else 0.0
    long_short_summary = {
        "cumRet": round(ls_nav_last - 1.0, 6),
        "meanRet": round(ls_mean, 6),
        "annRet": round((1.0 + ls_mean) ** TRADING_DAYS_PER_YEAR - 1.0, 6)
        if ls_mean > -1
        else None,
        "winRate": round(float((ls_rets > 0).mean()), 4) if len(ls_rets) else None,
    }

    dates = [d.strftime("%Y-%m-%d") for d in nav_wide["date"].to_list()]
    nav_by_layer: dict[str, list[float]] = {}
    for layer in range(layers):
        col = str(layer)
        if col in nav_wide.columns:
            nav_by_layer[f"L{layer + 1}"] = [
                round(float(v), 6) for v in nav_wide[col].to_list()
            ]
    nav_by_layer["longShort"] = [round(float(v), 6) for v in long_short["ls_nav"].to_list()]

    return {
        "count": layers,
        "dates": dates,
        "nav": nav_by_layer,
        "summary": summary_rows,
        "longShort": long_short_summary,
    }


def _decay_curve(
    frame: pl.DataFrame,
    horizons: list[int],
    min_symbols: int,
    expression: str | None = None,
    code: str | None = None,
) -> list[dict[str, Any]]:
    """因子衰退：在不同持有期下分别计算 IC 均值 / RankIC 均值 / ICIR。

    持有期越长、IC 越低，说明因子信号衰减越快。
    """
    factor_panel = _factor_panel(frame, expression=expression, code=code)
    if factor_panel is None or factor_panel.is_empty():
        return []
    close_panel = frame.select(["symbol", "date", "close"])

    curve: list[dict[str, Any]] = []
    for h in horizons:
        fwd = _forward_returns(close_panel, h)
        panel = (
            factor_panel.join(fwd, on=["symbol", "date"], how="inner")
            .drop_nulls(["factor", "fwd_ret"])
            .filter(pl.col("fwd_ret").is_finite() & pl.col("factor").is_finite())
        )
        counts = panel.group_by("date").len()
        enough = counts.filter(pl.col("len") >= min_symbols).select("date")
        panel = panel.join(enough, on="date", how="semi")
        ic_df = _ic_series(panel)
        ic_sum = _summarize_series(ic_df, "ic")
        rank_sum = _summarize_series(ic_df, "rank_ic")
        curve.append(
            {
                "horizon": h,
                "icMean": ic_sum["mean"],
                "rankIcMean": rank_sum["mean"],
                "icir": ic_sum["icir"],
                "count": ic_sum["count"],
            }
        )
    return curve


def _quantile_turnover(panel: pl.DataFrame, layers: int) -> dict[str, Any]:
    """分位换手率：相邻两个交易日的同层成分股更替比例。

    每个交易日按因子分位分层，第 t 日某层换手 = 1 - |S_t ∩ S_{t-1}| / |S_{t-1}|，
    在全部相邻日对与各层上取平均。换手越高，说明因子排名越不稳定、交易成本越高。
    """
    if panel.height == 0:
        return {"mean": None, "byLayer": [], "count": 0}
    grouped = (
        _assign_layers(panel, layers)
        .select(["date", "symbol", "layer"])
        .group_by("date")
        .agg(pl.col("symbol").alias("_syms"), pl.col("layer").alias("_layers"))
        .sort("date")
    )
    turnover_by_layer: dict[int, list[float]] = {i: [] for i in range(layers)}
    prev_members: dict[int, set[str]] | None = None
    pairs = 0
    for row in grouped.iter_rows(named=True):
        members: dict[int, set[str]] = {i: set() for i in range(layers)}
        for sym, layer in zip(row["_syms"], row["_layers"]):
            members[int(layer)].add(sym)
        if prev_members is not None:
            for layer in range(layers):
                prev = prev_members[layer]
                if prev:
                    cur = members[layer]
                    turnover_by_layer[layer].append(1.0 - len(prev & cur) / len(prev))
            pairs += 1
        prev_members = members

    by_layer: list[dict[str, Any]] = []
    all_vals: list[float] = []
    for layer in range(layers):
        vals = turnover_by_layer[layer]
        if vals:
            all_vals.extend(vals)
            by_layer.append({"layer": layer + 1, "turnover": round(sum(vals) / len(vals), 4)})
        else:
            by_layer.append({"layer": layer + 1, "turnover": None})
    mean = sum(all_vals) / len(all_vals) if all_vals else None
    return {
        "mean": round(mean, 4) if mean is not None else None,
        "byLayer": by_layer,
        "count": pairs,
    }


def _rank_autocorr(panel: pl.DataFrame) -> dict[str, Any]:
    """秩自相关：相邻两个交易日因子横截面排名的 Spearman 相关，衡量因子稳定性。

    仅用两日共同存在的标的计算；在相邻日对上取均值与标准差。越接近 1 越稳定。
    """
    if panel.height < 2:
        return {"mean": None, "std": None, "count": 0}
    parts = panel.select(["date", "symbol", "factor"]).sort(["date", "symbol"]).partition_by(
        "date", maintain_order=True
    )
    corrs: list[float] = []
    for i in range(1, len(parts)):
        left = parts[i - 1].select(["symbol", pl.col("factor").alias("_a")])
        right = parts[i].select(["symbol", pl.col("factor").alias("_b")])
        joined = left.join(right, on="symbol", how="inner")
        if joined.height < 5:
            continue
        corr = joined.select(pl.corr("_a", "_b", method="spearman")).item()
        if corr is not None and math.isfinite(corr):
            corrs.append(float(corr))
    n = len(corrs)
    if n == 0:
        return {"mean": None, "std": None, "count": 0}
    mean = sum(corrs) / n
    std = math.sqrt(sum((c - mean) ** 2 for c in corrs) / (n - 1)) if n > 1 else 0.0
    return {"mean": round(mean, 4), "std": round(std, 4), "count": n}


def _alpha_beta(panel: pl.DataFrame, layers: int) -> dict[str, Any]:
    """Alpha/Beta 回归：把多空组合日收益对市场（等权全样本日均收益）做 OLS。

    ls_ret = 最高层日均收益 - 最低层日均收益；mkt = 面板当日全部标的等权收益。
    beta = cov(ls, mkt) / var(mkt)，alpha = mean(ls) - beta * mean(mkt)（日频），
    annualAlpha 按 252 个交易日复利年化。beta 反映因子的市场暴露（多空应接近 0）。
    """
    empty = {"alpha": None, "beta": None, "rSquared": None, "annualAlpha": None, "count": 0}
    if panel.height == 0 or panel["date"].n_unique() < 3:
        return empty
    ranked = _assign_layers(panel, layers).select(["date", "layer", "fwd_ret"])
    daily = ranked.group_by(["date", "layer"]).agg(pl.col("fwd_ret").mean().alias("ret"))
    pivot = daily.pivot(on="layer", index="date", values="ret").sort("date")
    top, bot = str(layers - 1), "0"
    if top not in pivot.columns or bot not in pivot.columns:
        return empty
    ls_df = pivot.select([pl.col("date"), (pl.col(top) - pl.col(bot)).alias("ls")])
    mkt = ranked.group_by("date").agg(pl.col("fwd_ret").mean().alias("mkt"))
    reg = (
        ls_df.join(mkt, on="date", how="inner")
        .drop_nulls(["ls", "mkt"])
        .filter(pl.col("ls").is_finite() & pl.col("mkt").is_finite())
    )
    if reg.height < 3:
        return empty
    x = reg["mkt"].to_numpy()
    y = reg["ls"].to_numpy()
    mx, my = float(x.mean()), float(y.mean())
    sxx = float(((x - mx) ** 2).sum())
    syy = float(((y - my) ** 2).sum())
    if sxx == 0:
        return empty
    sxy = float(((x - mx) * (y - my)).sum())
    beta = sxy / sxx
    alpha = my - beta * mx
    r2 = (sxy * sxy) / (sxx * syy) if syy > 0 else None
    annual_alpha = (1.0 + alpha) ** TRADING_DAYS_PER_YEAR - 1.0 if alpha > -1 else None
    return {
        "alpha": round(alpha, 6),
        "beta": round(beta, 4),
        "rSquared": round(r2, 4) if r2 is not None else None,
        "annualAlpha": round(annual_alpha, 4) if annual_alpha is not None else None,
        "count": reg.height,
    }


def _inv_norm(p: float) -> float:
    """标准正态分布分位函数（Acklam 近似），用于 QQ 图的理论分位。"""
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02,
         1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02,
         6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00,
         -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00,
         3.754408661907416e00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p <= 0:
        return float("-inf")
    if p >= 1:
        return float("inf")
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    if p <= phigh:
        q = p - 0.5
        r = q * q
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (
            ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1
        )
    q = math.sqrt(-2 * math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
        (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
    )


def _ic_normality(ic_df: pl.DataFrame) -> dict[str, Any]:
    """IC 序列的正态性：偏度 / 峰度 / Jarque-Bera 统计量与 p 值，以及 QQ 采样点。

    JB = n/6 * (skew² + (kurt-3)²/4)，自由度 2 的卡方，p 值即 exp(-JB/2)。
    p 值越小越拒绝正态（IC 分布偏斜或有厚尾，稳定性存疑）。QQ 点最多采样 80 个。
    """
    empty = {"skew": None, "kurtosis": None, "jarqueBera": None, "pValue": None, "count": 0, "qq": []}
    n = ic_df.height
    if n < 3:
        return {**empty, "count": n}
    x = ic_df["ic"].to_numpy()
    mu = float(x.mean())
    sd = float(x.std())
    if sd == 0:
        return {**empty, "count": n}
    z = (x - mu) / sd
    skew = float((z ** 3).mean())
    kurt = float((z ** 4).mean())
    jb = n / 6.0 * (skew ** 2 + (kurt - 3.0) ** 2 / 4.0)
    p_value = math.exp(-jb / 2.0)
    ordered = sorted(ic_df["ic"].to_list())
    step = max(1, len(ordered) // 80)
    qq: list[dict[str, float]] = []
    for i in range(0, len(ordered), step):
        p_i = (i + 0.5) / len(ordered)
        qq.append(
            {"theoretical": round(_inv_norm(p_i) * sd + mu, 6), "sample": round(ordered[i], 6)}
        )
    return {
        "skew": round(skew, 4),
        "kurtosis": round(kurt, 4),
        "jarqueBera": round(jb, 4),
        "pValue": round(p_value, 6),
        "count": n,
        "qq": qq,
    }


def _monthly_ic(ic_df: pl.DataFrame) -> list[dict[str, Any]]:
    """按自然月聚合逐日 IC：月度 IC 均值与参与天数，用于观察 IC 的时间稳定性。"""
    if ic_df.height == 0:
        return []
    monthly = (
        ic_df.with_columns(pl.col("date").dt.strftime("%Y-%m").alias("month"))
        .group_by("month")
        .agg(
            pl.col("ic").mean().alias("ic"),
            pl.col("rank_ic").mean().alias("rankIc"),
            pl.len().alias("count"),
        )
        .sort("month")
    )
    return [
        {
            "month": row["month"],
            "ic": round(float(row["ic"]), 6),
            "rankIc": round(float(row["rankIc"]), 6),
            "count": int(row["count"]),
        }
        for row in monthly.iter_rows(named=True)
    ]


def evaluate_factor(
    expression: str = "",
    horizon: int = 1,
    layers: int = DEFAULT_LAYERS,
    bars: int = EVAL_BARS,
    max_symbols: int = EVAL_MAX_SYMBOLS,
    min_symbols: int = EVAL_MIN_SYMBOLS,
    horizons: list[int] | None = None,
    valid_ratio: float = 0.0,
    code: str | None = None,
    as_of: str | None = None,
) -> dict[str, Any]:
    """对因子做完整检验（IC / RankIC / ICIR / 分层回测 / 因子衰退）。

    支持两类因子（二者必居其一）：
      - 表达式因子（kind=expression）：传 AKQuant 表达式（必须包含 result）；
      - 受限 Python 代码因子（kind=python）：传 code（须定义 compute(data)），此时
        expression 可为空。代码逐标的在整段后复权日线上执行，返回序列者逐日对齐
        为因子值（可做时序 IC 检验），返回标量者仅贡献最新截面。

    Args:
        expression: AKQuant 因子表达式（kind=expression）。
        horizon: 分层回测与主 IC 的持有期（交易日），默认 1。
        layers: 分层回测层数（2-10），默认 5。
        bars: 每标的取多少根后复权日线，默认 500。
        max_symbols: 股票池抽样上限，默认 800。
        min_symbols: 单日最少参与标的数，默认 20。
        horizons: 因子衰退考察的持有期列表，默认 (1,2,3,5,10,20)。
        valid_ratio: 样本外占比（0~0.5）。>0 时按交易日把面板切成样本内/样本外两段：
            主指标（ic/rankIc/layers）在样本内计算，另返回 valid 样本外指标，
            用于识别样本内高分、样本外失效的过拟合因子。默认 0（不切分，全样本）。
        code: 受限 Python 因子代码（kind=python），与 expression 互斥优先。

    Returns:
        {
          "expression": str,
          "universe": {"symbols", "bars", "startDate", "endDate"},
          "horizon": int,
          "ic": {...}, "rankIc": {...},
          "icSeries": [{"date", "ic", "rankIc", "count"}, ...],
          "layers": {"count", "dates", "nav", "summary", "longShort"},
          "turnover": {"mean", "byLayer": [{"layer", "turnover"}], "count"},
          "rankAutocorr": {"mean", "std", "count"},
          "alphaBeta": {"alpha", "beta", "rSquared", "annualAlpha", "count"},
          "icNormality": {"skew", "kurtosis", "jarqueBera", "pValue", "count",
                          "qq": [{"theoretical", "sample"}, ...]},
          "monthlyIc": [{"month", "ic", "rankIc", "count"}, ...],
          "decay": [{"horizon", "icMean", "rankIcMean", "icir", "count"}, ...],
          "split": {"validRatio", "splitDate"} | None,
          "valid": {"ic", "rankIc", "longShort", "turnover", "rankAutocorr",
                    "alphaBeta", "monthlyIc", "sampleCount", "startDate", "endDate"} | None
        }
    """
    expression = (expression or "").strip()
    code = (code or "").strip()
    if not expression and not code:
        raise ValueError("必须提供 expression 或 code")

    horizon = max(1, int(horizon))
    layers = int(layers)
    if layers < 2 or layers > MAX_LAYERS:
        raise ValueError(f"分层数需在 2-{MAX_LAYERS} 之间")
    if bars < 60 or bars > 2000:
        raise ValueError("bars 需在 60-2000 之间")
    if min_symbols < 5:
        raise ValueError("minSymbols 不能小于 5")
    valid_ratio = float(valid_ratio or 0.0)
    if valid_ratio < 0 or valid_ratio >= 0.5:
        raise ValueError("validRatio 需在 [0, 0.5) 之间")

    started = time.perf_counter()
    conn = _get_conn()
    try:
        universe = _get_universe(conn)
        universe = [u for u in universe if not str(u["symbol"]).endswith(".BJ")]
        sampled = _sample_universe(universe, max_symbols)
        if not sampled:
            raise ValueError("股票池为空，无法检验")

        frame = _load_universe_frame(conn, sampled, limit=bars, adjust="hfq", as_of=as_of)
    finally:
        conn.close()

    if frame.is_empty():
        raise ValueError("未取到日线数据，无法检验")

    panel = _build_panel(
        frame, horizon, min_symbols, expression=expression or None, code=code or None
    )
    if panel.is_empty():
        raise ValueError("检验面板为空（因子值或未来收益全为无效值，或有效交易日不足）")

    split = _split_panel_by_date(panel, valid_ratio) if valid_ratio > 0 else None
    if split is not None:
        train_panel, valid_panel, split_date = split
    else:
        train_panel, valid_panel, split_date = panel, None, None

    ic_df = _ic_series(train_panel)
    if ic_df.height == 0:
        raise ValueError("有效 IC 交易日为 0，无法汇总（可能因子在各截面无区分度）")

    valid_block = _valid_summary(valid_panel, layers) if valid_panel is not None else None

    dates = frame["date"].to_list()
    result = {
        "expression": expression,
        "universe": {
            "symbols": frame["symbol"].n_unique(),
            "bars": bars,
            "startDate": min(dates).strftime("%Y-%m-%d"),
            "endDate": max(dates).strftime("%Y-%m-%d"),
        },
        "horizon": horizon,
        "ic": _summarize_series(ic_df, "ic"),
        "rankIc": _summarize_series(ic_df, "rank_ic"),
        "icSeries": [
            {
                "date": row["date"].strftime("%Y-%m-%d"),
                "ic": round(float(row["ic"]), 6),
                "rankIc": round(float(row["rank_ic"]), 6),
                "count": int(row["count"]),
            }
            for row in ic_df.iter_rows(named=True)
        ],
        "layers": _layer_backtest(train_panel, layers),
        "turnover": _quantile_turnover(train_panel, layers),
        "rankAutocorr": _rank_autocorr(train_panel),
        "alphaBeta": _alpha_beta(train_panel, layers),
        "icNormality": _ic_normality(ic_df),
        "monthlyIc": _monthly_ic(ic_df),
        "decay": _decay_curve(
            frame,
            list(horizons) if horizons else list(DEFAULT_DECAY_HORIZONS),
            min_symbols,
            expression=expression or None,
            code=code or None,
        ),
        "split": {"validRatio": valid_ratio, "splitDate": split_date}
        if split_date
        else None,
        "valid": valid_block,
        "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
    }
    log.info(
        "因子检验完成",
        horizon=horizon,
        symbols=result["universe"]["symbols"],
        icDays=ic_df.height,
        icMean=result["ic"]["mean"],
        validIcMean=valid_block["ic"]["mean"] if valid_block else None,
        elapsedMs=result["elapsedMs"],
    )
    return result
