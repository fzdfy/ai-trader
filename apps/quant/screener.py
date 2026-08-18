"""选股模块：根据策略（因子加权）对股票池打分并排名。

选股 = 对股票池中每只股票，用策略配置的因子计算加权综合得分，按得分降序返回 Top N。

因子得分约定（与 factors.registry 一致）：
  - 每个因子的 compute 返回归一化得分 [0, 1]：0.5 中性、>0.5 看多、<0.5 看空
  - 权重 weight 为 0-100 的相对重要度，综合得分 = Σ(score_i * weight_i) / Σ(weight_i)

用法：
    from screener import screen
    result = screen([{"name": "ma_trend_20", "weight": 40}, ...], top_n=20)
"""

import os
from typing import Any

import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

from factors import FACTOR_REGISTRY
from logger import get_logger

log = get_logger("screener")

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

# 因子计算所需历史窗口（覆盖最长因子周期 60，如 ma_trend_60 / macd 慢线 26+9）
HISTORY_COUNT = 61


def _get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL)


def _get_universe(conn: psycopg2.extensions.connection) -> list[dict[str, Any]]:
    """获取有日线数据的股票池（symbol + 中文名）。"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT DISTINCT b.symbol, COALESCE(i.name, b.symbol) AS name
            FROM bar1d_adj b
            LEFT JOIN instrument i ON i.symbol = b.symbol
            ORDER BY b.symbol
            """
        )
        return cur.fetchall()


def _load_recent_bars(conn: psycopg2.extensions.connection, symbol: str) -> list[dict[str, Any]]:
    """加载单个标的最近 HISTORY_COUNT 根日线（升序）。"""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT time, high, low, close, volume
            FROM bar1d_adj
            WHERE symbol = %s
            ORDER BY time DESC
            LIMIT %s
            """,
            (symbol, HISTORY_COUNT),
        )
        rows = cur.fetchall()
    rows.reverse()
    return rows


def screen(
    factors: list[dict[str, Any]],
    top_n: int = 20,
    symbols: list[str] | None = None,
) -> dict[str, Any]:
    """对股票池按策略因子打分排名。

    Args:
        factors: 策略因子列表 [{name, weight}]，weight 为 0-100
        top_n: 返回前 N 名
        symbols: 可选，限定股票池；为 None 时使用全部有日线数据的标的

    Returns:
        {"items": [{symbol, name, score, close, factorScores}], "total": 参与打分标的数}
    """
    # 过滤出有效因子（存在且权重 > 0）
    valid: list[dict[str, Any]] = []
    for f in factors:
        name = f.get("name")
        weight = float(f.get("weight", 0) or 0)
        if name in FACTOR_REGISTRY and weight > 0:
            valid.append({"name": name, "weight": weight})

    if not valid:
        return {"items": [], "total": 0}

    conn = _get_conn()
    try:
        universe = _get_universe(conn)
        if symbols:
            wanted = set(symbols)
            universe = [u for u in universe if u["symbol"] in wanted]

        results: list[dict[str, Any]] = []
        for u in universe:
            rows = _load_recent_bars(conn, u["symbol"])
            if len(rows) < HISTORY_COUNT:
                continue

            data = {
                "close": np.asarray([float(r["close"]) for r in rows], dtype=float),
                "high": np.asarray([float(r["high"]) for r in rows], dtype=float),
                "low": np.asarray([float(r["low"]) for r in rows], dtype=float),
                "volume": np.asarray([float(r["volume"]) for r in rows], dtype=float),
            }

            factor_scores: dict[str, float] = {}
            weighted = 0.0
            total_weight = 0.0
            for f in valid:
                factor = FACTOR_REGISTRY[f["name"]]
                s = float(factor.compute(data))  # [0, 1]
                factor_scores[f["name"]] = round(s * 100, 2)  # 展示为 0-100
                weighted += s * f["weight"]
                total_weight += f["weight"]

            score = (weighted / total_weight) if total_weight > 0 else 0.0
            results.append(
                {
                    "symbol": u["symbol"],
                    "name": u["name"],
                    "score": round(score * 100, 2),
                    "close": round(float(rows[-1]["close"]), 2),
                    "factorScores": factor_scores,
                }
            )

        results.sort(key=lambda x: x["score"], reverse=True)
        return {"items": results[:top_n], "total": len(results)}
    finally:
        conn.close()
