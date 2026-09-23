"""选股模块：根据策略（因子组合）对股票池打分并排名。

选股 = 对股票池中每只股票，用策略配置的因子计算综合得分，按得分降序返回 Top N。

因子得分约定（与 factors.registry 一致）：
  - 每个因子的 compute 返回归一化得分 [0, 1]：0.5 中性、>0.5 看多、<0.5 看空
  - weight 为 0-100 的相对重要度，value 为每因子信号阈值 0-100（voting 模式使用）
  - direction 为方向覆盖：-1 时反转该因子得分（1 - score）
  - combine 支持：weighted_sum / equal_weight / voting / rank / and / or

用法：
    from screener import screen
    result = screen([{"name": "ma_trend_20", "weight": 40, "value": 60}], top_n=20)
"""

import os
import time
from typing import Any

import numpy as np
import polars as pl
import psycopg2
from psycopg2.extras import RealDictCursor

from akquant.factor import ExpressionParser
from factors import FACTOR_REGISTRY
from factors.combine import apply_direction, combine_scores, normalize_combine
from logger import get_logger

log = get_logger("screener")

# 自定义因子表达式解析器（与 AKQuant FactorEngine 一致，仅对内存 DataFrame 求值）
_CUSTOM_PARSER = ExpressionParser()

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

# 因子计算所需历史窗口（覆盖最长因子周期 60，如 ma_trend_60 / macd 慢线 26+9）
HISTORY_COUNT = 61

# 自定义因子（AKQuant 表达式）历史窗口：需覆盖最长窗口算子（如 250 日均线年线）。
# Ts_Mean(Close,250) 至少需要 250 根，叠加 Delay(...,1) 后再比较需 251 根。
CUSTOM_HISTORY_COUNT = 251


def _get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL)


def _get_universe(conn: psycopg2.extensions.connection) -> list[dict[str, Any]]:
    """获取有日线数据的股票池（symbol + 中文名）。

    直接读 instrument（5564 行，主键索引）而非对 bar1d_adj（1600 万行）做
    DISTINCT 全表扫描——后者单次约 35s，会让选股请求超出网关超时。没有日线的
    标的会在后续按历史长度被跳过，因此结果集不变。
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT symbol, COALESCE(name, symbol) AS name
            FROM instrument
            ORDER BY symbol
            """
        )
        return cur.fetchall()


def _load_universe_bars(
    conn: psycopg2.extensions.connection, universe: list[dict[str, Any]]
) -> dict[str, dict[str, np.ndarray]]:
    """一次性加载股票池全部标的最近 HISTORY_COUNT 根日线，按标的切分为 numpy 数组。

    替代原先逐标的发起 SQL 的写法（N+1：全池 5000+ 次往返，且每行付出
    numeric→Decimal 与 RealDictCursor 字典构造开销）。性能要点与
    _load_universe_frame 一致：
      - LATERAL + (symbol, time) 索引逐标的取最近 N 根，避免全表 ROW_NUMBER 排序；
      - SQL 侧 ::float8 转换 + 普通游标（非 RealDictCursor）；
      - 排序改由 Polars 完成（比 SQL 排序更快）。

    Returns:
        {symbol: {"close"/"high"/"low"/"volume"/"amount": np.ndarray}}，
        仅包含日线数量 >= HISTORY_COUNT 的标的，数组按时间升序。
    """
    symbols = [u["symbol"] for u in universe]
    if not symbols:
        return {}

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.symbol, b.time,
                   b.high::float8, b.low::float8, b.close::float8, b.volume::float8,
                   b.amount::float8
            FROM unnest(%s::text[]) AS u(symbol)
            CROSS JOIN LATERAL (
                SELECT time, high, low, close, volume, amount
                FROM bar1d_adj
                WHERE symbol = u.symbol
                ORDER BY time DESC
                LIMIT %s
            ) AS b
            """,
            (symbols, HISTORY_COUNT),
        )
        rows = cur.fetchall()
    if not rows:
        return {}

    frame = pl.DataFrame(
        {
            "symbol": [r[0] for r in rows],
            "date": [r[1] for r in rows],
            "high": [r[2] for r in rows],
            "low": [r[3] for r in rows],
            "close": [r[4] for r in rows],
            "volume": [r[5] for r in rows],
            "amount": [r[6] for r in rows],
        }
    ).sort(["symbol", "date"])

    syms = frame["symbol"].to_numpy()
    arrays = {
        "high": frame["high"].to_numpy(),
        "low": frame["low"].to_numpy(),
        "close": frame["close"].to_numpy(),
        "volume": frame["volume"].to_numpy(),
        # amount 可为空（停牌等）：统一为空值填充 NaN，下游用 isfinite 判定后转 None
        "amount": frame["amount"].cast(pl.Float64).fill_null(float("nan")).to_numpy(),
    }

    # 已按 symbol 排序，相邻股票代码不相等处即为分组边界
    borders = np.flatnonzero(syms[1:] != syms[:-1]) + 1
    starts = np.concatenate(([0], borders))
    ends = np.concatenate((borders, [len(syms)]))

    result: dict[str, dict[str, np.ndarray]] = {}
    for start, end in zip(starts, ends):
        if end - start < HISTORY_COUNT:
            continue
        result[str(syms[start])] = {name: arr[start:end] for name, arr in arrays.items()}
    return result


def _load_universe_frame(
    conn: psycopg2.extensions.connection, universe: list[dict[str, Any]]
) -> pl.DataFrame:
    """一次性加载股票池全部标的最近 CUSTOM_HISTORY_COUNT 根日线，构造 Polars DataFrame。

    列：symbol / date / high / low / close / volume，按 symbol、date 升序。
    供自定义因子表达式（AKQuant）在横截面上求值使用。窗口取较长历史以满足
    250 日均线（年线）等长周期算子的最小样本要求。

    性能要点：
      - LATERAL + (symbol, time) 索引逐标的取最近 N 根，避免全表 ROW_NUMBER 排序；
      - SQL 侧 ::float8 转换 + 普通游标（非 RealDictCursor），避免 130 万行 numeric→Decimal
        与字典构造开销（实测 50s → 7s）；
      - 排序改由 Polars 完成（比 SQL 排序 130 万行更快）。
    """
    symbols = [u["symbol"] for u in universe]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT u.symbol, b.time,
                   b.high::float8, b.low::float8, b.close::float8, b.volume::float8
            FROM unnest(%s::text[]) AS u(symbol)
            CROSS JOIN LATERAL (
                SELECT time, high, low, close, volume
                FROM bar1d_adj
                WHERE symbol = u.symbol
                ORDER BY time DESC
                LIMIT %s
            ) AS b
            """,
            (symbols, CUSTOM_HISTORY_COUNT),
        )
        rows = cur.fetchall()
    return pl.DataFrame(
        {
            "symbol": [r[0] for r in rows],
            "date": [r[1] for r in rows],
            "high": [r[2] for r in rows],
            "low": [r[3] for r in rows],
            "close": [r[4] for r in rows],
            "volume": [r[5] for r in rows],
        }
    ).sort(["symbol", "date"])


def _eval_expression(frame: pl.DataFrame, expr_str: str) -> dict[str, float]:
    """在股票池日线上求自定义因子表达式，返回 {symbol: 最新一根的因子原始值}。

    复刻 AKQuant FactorEngine.run_on_data 的分步执行：先 plan 拆解嵌套窗口函数，
    再逐步 with_columns 物化，最后取每标的最后一根（最新）的因子值。
    """
    steps = _CUSTOM_PARSER.plan(expr_str)
    current = frame
    factor_col: pl.DataFrame | None = None
    for var_name, sub_expr_str in steps:
        sub_expr = _CUSTOM_PARSER.parse(sub_expr_str)
        if var_name == "result":
            factor_col = current.with_columns(sub_expr.alias("factor")).select(
                ["symbol", "date", "factor"]
            )
        else:
            current = current.with_columns(sub_expr.alias(var_name))

    if factor_col is None:
        return {}

    # 已按 symbol、date 升序，保留每标的最后一行即最新值
    latest = factor_col.sort(["symbol", "date"]).unique(subset=["symbol"], keep="last")
    result: dict[str, float] = {}
    for row in latest.iter_rows(named=True):
        v = row["factor"]
        if v is not None and np.isfinite(float(v)):
            result[row["symbol"]] = float(v)
    return result


def _rank_custom_scores(raw: dict[str, float]) -> dict[str, float]:
    """将自定义因子原始值做横截面百分位排名，映射到 [0, 1]（0=最低，1=最高）。"""
    syms = list(raw.keys())
    n = len(syms)
    if n == 0:
        return {}
    if n == 1:
        return {syms[0]: 0.5}
    arr = np.asarray([raw[s] for s in syms], dtype=float)
    order = np.argsort(arr, kind="mergesort")
    ranks = np.empty(n, dtype=float)
    ranks[order] = np.arange(n, dtype=float)
    ranks /= n - 1
    return {s: float(ranks[i]) for i, s in enumerate(syms)}


def _apply_rank_score(
    results: list[dict[str, Any]], valid: list[dict[str, Any]]
) -> None:
    """按横截面百分位排名合成综合得分（rank 模式）。

    对每个因子，将股票池内的得分转换为百分位排名（0=最低，1=最高），
    再按权重加权合成，得到综合排名得分。

    Args:
        results: 参与排名的结果列表（每项含内部字段 _scores）
        valid: 有效因子配置（含 weight）
    """
    n_stocks = len(results)
    n_factors = len(valid)
    if n_stocks == 0:
        return

    mat = np.zeros((n_stocks, n_factors), dtype=float)
    for i, r in enumerate(results):
        for j in range(n_factors):
            mat[i, j] = r["_scores"][j]

    weights = np.asarray([float(v["weight"]) for v in valid], dtype=float)
    wsum = float(weights.sum())

    # 每因子独立做横截面百分位排名
    rank_mat = np.zeros_like(mat)
    for j in range(n_factors):
        col = mat[:, j]
        if n_stocks > 1:
            sorted_col = np.sort(col)
            rank_pos = np.searchsorted(sorted_col, col).astype(float)
            rank_mat[:, j] = rank_pos / (n_stocks - 1)
        else:
            rank_mat[:, j] = 0.5  # 单标的时排名无意义，取中性

    combined = (
        (rank_mat * weights).sum(axis=1) / wsum
        if wsum > 0
        else rank_mat.mean(axis=1)
    )

    for i, r in enumerate(results):
        r["score"] = round(float(combined[i]) * 100, 2)


def screen(
    factors: list[dict[str, Any]],
    top_n: int = 20,
    symbols: list[str] | None = None,
    combine: str = "weighted_sum",
) -> dict[str, Any]:
    """对股票池按策略因子打分排名。

    Args:
        factors: 策略因子列表 [{name, weight, value?, direction?, expression?}]
                 weight 为 0-100，value 为信号阈值 0-100（默认 50），
                 direction 为方向覆盖 1/-1（默认 1）；
                 expression 仅自定义因子需要（AKQuant 表达式），内置因子忽略
        top_n: 返回前 N 名
        symbols: 可选，限定股票池；为 None 时使用全部有日线数据的标的
        combine: 信号合成方式（weighted_sum/equal_weight/voting/rank/and/or）

    Returns:
        {"items": [{symbol, name, score, close, factorScores}], "total": 参与打分标的数,
         "elapsedMs": 总耗时(ms), "fetchMs": 日线取数耗时(ms)}
    """
    combine = normalize_combine(combine)
    started = time.perf_counter()

    # 过滤出有效因子（权重 > 0）：
    #  - 内置因子：name 在 FACTOR_REGISTRY，用 numpy compute 计算
    #  - 自定义因子：带 expression，用 AKQuant 表达式引擎对股票池日线求值
    valid: list[dict[str, Any]] = []
    for f in factors:
        name = f.get("name")
        weight = float(f.get("weight", 0) or 0)
        if weight <= 0:
            continue
        direction = -1 if int(f.get("direction", 1)) < 0 else 1
        value = float(f.get("value", 50) or 50)  # 0-100
        if name in FACTOR_REGISTRY:
            valid.append(
                {
                    "name": name,
                    "weight": weight,
                    "value": value,
                    "direction": direction,
                    "kind": "builtin",
                    "factor": FACTOR_REGISTRY[name],
                }
            )
        elif f.get("expression"):
            valid.append(
                {
                    "name": name,
                    "weight": weight,
                    "value": value,
                    "direction": direction,
                    "kind": "custom",
                    "expression": str(f["expression"]),
                }
            )

    if not valid:
        return {
            "items": [],
            "total": 0,
            "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
            "fetchMs": 0.0,
        }

    # voting 模式使用的每因子阈值（0-1）
    thresholds = [v["value"] / 100.0 for v in valid]

    conn = _get_conn()
    try:
        universe = _get_universe(conn)
        if symbols:
            wanted = set(symbols)
            universe = [u for u in universe if u["symbol"] in wanted]

        # 自定义因子：一次性加载股票池日线，逐因子求值并横截面归一化得分
        custom_scores: dict[str, dict[str, float]] = {}
        if any(v["kind"] == "custom" for v in valid):
            frame = _load_universe_frame(conn, universe)
            for v in valid:
                if v["kind"] != "custom":
                    continue
                raw = _eval_expression(frame, v["expression"])
                custom_scores[v["name"]] = _rank_custom_scores(raw)

        # 内置因子所需日线：一次性批量取回全池
        fetch_started = time.perf_counter()
        universe_bars = _load_universe_bars(conn, universe)
        fetch_ms = round((time.perf_counter() - fetch_started) * 1000, 1)

        results: list[dict[str, Any]] = []
        for u in universe:
            data = universe_bars.get(u["symbol"])
            if data is None:
                continue

            factor_scores: dict[str, float] = {}
            scores: list[float] = []
            weights: list[float] = []
            for f in valid:
                if f["kind"] == "builtin":
                    raw = float(f["factor"].compute(data))  # [0, 1]
                else:
                    # 自定义因子得分已横截面归一化到 [0, 1]，缺失标的取中性
                    raw = custom_scores[f["name"]].get(u["symbol"], 0.5)
                s = apply_direction(raw, f["direction"])
                factor_scores[f["name"]] = round(s * 100, 2)  # 展示为 0-100
                scores.append(s)
                weights.append(f["weight"])

            close = float(data["close"][-1])
            prev_close = float(data["close"][-2])
            change_pct = round((close - prev_close) / prev_close * 100, 2) if prev_close > 0 else None

            amount_latest = float(data["amount"][-1])
            amount = round(amount_latest, 2) if np.isfinite(amount_latest) else None

            results.append(
                {
                    "symbol": u["symbol"],
                    "name": u["name"],
                    "close": round(close, 2),
                    "changePct": change_pct,
                    "amount": amount,
                    "factorScores": factor_scores,
                    "_scores": scores,
                    "_weights": weights,
                }
            )

        # 合成综合得分（rank 模式走横截面排名，其余走点式合成）
        if combine == "rank":
            _apply_rank_score(results, valid)
        else:
            for r in results:
                r["score"] = round(
                    combine_scores(r["_scores"], r["_weights"], thresholds, combine) * 100,
                    2,
                )

        # 清理内部字段
        for r in results:
            r.pop("_scores", None)
            r.pop("_weights", None)

        results.sort(key=lambda x: x["score"], reverse=True)
        return {
            "items": results[:top_n],
            "total": len(results),
            "elapsedMs": round((time.perf_counter() - started) * 1000, 1),
            "fetchMs": fetch_ms,
        }
    finally:
        conn.close()
