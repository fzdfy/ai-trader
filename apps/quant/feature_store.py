"""因子预计算与落库。

直读 PostgreSQL 的 bar1d_adj 日线，用 factors.registry 内置因子，
对每个标的按交易日滑动窗口计算因子值，写入 feature_value 表。
同时负责初始化 factor_registry（因子元数据）与 feature_set（默认特征集）。

用法：
    from feature_store import compute_features
    stats = compute_features()                 # 计算所有自选股（watchlist）
    stats = compute_features(["600519.SH"])    # 指定标的
"""

import os
from typing import Any

import numpy as np
import psycopg2
from psycopg2.extras import Json, RealDictCursor

from factors import FACTOR_REGISTRY, get_factor_list
from logger import get_logger

log = get_logger("feature_store")

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

# 默认特征集标识（对应 feature_set 表）
DEFAULT_FEATURE_SET_NAME = "builtin_technical_factors"
DEFAULT_FEATURE_SET_VERSION = "1"

# 因子计算所需历史窗口（覆盖最长因子周期，如 ma_trend_60 / macd 慢线 26+9）
HISTORY_COUNT = 61


def _get_conn() -> psycopg2.extensions.connection:
    return psycopg2.connect(DATABASE_URL)


def _init_factor_registry(cur: psycopg2.extensions.cursor) -> None:
    """将内置因子元数据同步到 factor_registry 表（幂等 upsert）。"""
    for f in get_factor_list():
        cur.execute(
            """
            INSERT INTO factor_registry (name, label, category, direction, description)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (name) DO UPDATE SET
              label = EXCLUDED.label,
              category = EXCLUDED.category,
              direction = EXCLUDED.direction,
              description = EXCLUDED.description
            """,
            (f["name"], f["label"], f["category"], f["direction"], f["description"]),
        )


def _ensure_feature_set(cur: psycopg2.extensions.cursor) -> int:
    """确保默认特征集存在，返回其 id（幂等）。"""
    cur.execute(
        "SELECT id FROM feature_set WHERE name = %s AND version = %s",
        (DEFAULT_FEATURE_SET_NAME, DEFAULT_FEATURE_SET_VERSION),
    )
    row = cur.fetchone()
    if row:
        return int(row["id"])

    cur.execute(
        "INSERT INTO feature_set (name, version, definition_json) VALUES (%s, %s, %s) RETURNING id",
        (
            DEFAULT_FEATURE_SET_NAME,
            DEFAULT_FEATURE_SET_VERSION,
            Json({"factors": [f["name"] for f in get_factor_list()]}),
        ),
    )
    return int(cur.fetchone()["id"])


def _compute_features(rows: list[dict[str, Any]]) -> list[tuple[Any, dict[str, float]]]:
    """对单个标的的日线序列，滑动窗口计算每个交易日的因子值。

    Args:
        rows: 按 time 升序的日线行（含 time/high/low/close/volume）

    Returns:
        [(time, {factor_name: score}), ...]，仅返回窗口完整的交易日
    """
    closes = np.asarray([float(r["close"]) for r in rows], dtype=float)
    highs = np.asarray([float(r["high"]) for r in rows], dtype=float)
    lows = np.asarray([float(r["low"]) for r in rows], dtype=float)
    volumes = np.asarray([float(r["volume"]) for r in rows], dtype=float)
    times = [r["time"] for r in rows]

    results: list[tuple[Any, dict[str, float]]] = []
    for i in range(HISTORY_COUNT - 1, len(rows)):
        data = {
            "close": closes[i - HISTORY_COUNT + 1 : i + 1],
            "high": highs[i - HISTORY_COUNT + 1 : i + 1],
            "low": lows[i - HISTORY_COUNT + 1 : i + 1],
            "volume": volumes[i - HISTORY_COUNT + 1 : i + 1],
        }
        features = {name: float(factor.compute(data)) for name, factor in FACTOR_REGISTRY.items()}
        results.append((times[i], features))
    return results


def compute_features(symbols: list[str] | None = None) -> dict[str, int]:
    """计算并落库因子值。

    Args:
        symbols: 要计算的标的列表；为 None 时使用自选股（watchlist）。

    Returns:
        {"symbols": 处理的标的数, "rows": 写入的特征行数}
    """
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            _init_factor_registry(cur)
            feature_set_id = _ensure_feature_set(cur)

            if symbols is None:
                cur.execute("SELECT DISTINCT symbol FROM watchlist")
                symbols = [row["symbol"] for row in cur.fetchall()]

            if not symbols:
                log.warning("无自选标的，跳过因子计算")
                return {"symbols": 0, "rows": 0}

            total_rows = 0
            for symbol in symbols:
                cur.execute(
                    """
                    SELECT time, high, low, close, volume
                    FROM bar1d_adj
                    WHERE symbol = %s
                    ORDER BY time ASC
                    """,
                    (symbol,),
                )
                rows = cur.fetchall()
                if len(rows) < HISTORY_COUNT:
                    log.warning("标的数据不足，跳过", symbol=symbol, bars=len(rows))
                    continue

                for time, features in _compute_features(rows):
                    cur.execute(
                        """
                        INSERT INTO feature_value (time, symbol, feature_set_id, features_json)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (time, symbol, feature_set_id) DO UPDATE SET
                          features_json = EXCLUDED.features_json
                        """,
                        (time, symbol, feature_set_id, Json(features)),
                    )
                    total_rows += 1

            conn.commit()
            log.info("因子计算完成", symbols=len(symbols), rows=total_rows)
            return {"symbols": len(symbols), "rows": total_rows}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
