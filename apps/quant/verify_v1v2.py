"""v1 / v2 选股结果一致性与查询次数验证（假 DB，不依赖真实 PostgreSQL）。

用途：
  1. 证明 v1（逐标的 N+1 取数）与 v2（LATERAL 批量取数）在**打分结果上完全一致**；
  2. 证明 v1 的日线查询次数 == 股票池标的数，v2 == 1（性能差异的根因）；
  3. 覆盖全部 6 种 combine 模式、默认版本、无有效因子、symbols 子集等边界。

运行：
    apps/quant/.venv/bin/python apps/quant/verify_v1v2.py

说明：耗时由假 DB 驱动，只反映 Python 侧结构差异，不代表线上真实 SQL 往返开销；
真实耗时需在 PostgreSQL 可用时实测（见文末提示）。
"""

from __future__ import annotations

import random
import sys
import time
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import screener
from screener import HISTORY_COUNT

# ---------------------------------------------------------------------------
# 假数据库：模拟 psycopg2 的连接 / 游标，按 SQL 特征返回预置行
# ---------------------------------------------------------------------------

N_SYMBOLS = 40
N_BARS = 80  # > HISTORY_COUNT=61，保证多数标的通过长度过滤
SHORT_SYMBOLS = 3  # 前 3 只刻意给 30 根（< 61），验证两版都跳过
SHORT_BARS = 30

_COMBINE_MODES = ["weighted_sum", "equal_weight", "voting", "rank", "and", "or"]


def _build_bars(symbol_index: int, n_bars: int) -> list[dict[str, Any]]:
    """合成一段确定性日线（时间升序）。"""
    rng = random.Random(20240101 + symbol_index)
    close = 10.0 + symbol_index
    bars: list[dict[str, Any]] = []
    base = date(2024, 1, 1)
    for t in range(n_bars):
        close = round(close * (1 + rng.uniform(-0.03, 0.03)), 3)
        high = round(close * (1 + rng.uniform(0.0, 0.02)), 3)
        low = round(close * (1 - rng.uniform(0.0, 0.02)), 3)
        volume = int(rng.uniform(1e6, 5e6))
        bars.append(
            {
                "time": base + timedelta(days=t),
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )
    return bars


SYMBOLS = [f"SH{600000 + i}" for i in range(N_SYMBOLS)]
BARS: dict[str, list[dict[str, Any]]] = {
    sym: _build_bars(i, SHORT_BARS if i < SHORT_SYMBOLS else N_BARS)
    for i, sym in enumerate(SYMBOLS)
}

STORE: dict[str, Any] = {
    "symbols": SYMBOLS,
    "bars": BARS,
    "calls": [],  # [(kind, sql)]，kind ∈ {universe, v1_bar, v2_bar}
}


def _norm(sql: str) -> str:
    return " ".join(sql.split())


class FakeCursor:
    def __init__(self, store: dict[str, Any]) -> None:
        self._store = store
        self._rows: list[Any] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: Any) -> bool:
        return False

    def close(self) -> None:  # 兼容显式 close
        pass

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> None:
        s = _norm(sql)
        if "FROM instrument" in s:
            self._store["calls"].append(("universe", s))
            self._rows = [{"symbol": sym, "name": f"股票{sym}"} for sym in self._store["symbols"]]
            return

        if "unnest(" in s and "CROSS JOIN LATERAL" in s:
            # ---- v2 批量：返回 6 元组，且 rows 顺序被刻意打乱 ----
            self._store["calls"].append(("v2_bar", s))
            syms, limit = params  # type: ignore[misc]
            out: list[tuple[Any, ...]] = []
            for sym in syms:
                bars = self._store["bars"][sym]
                if len(bars) < limit:
                    continue
                for b in bars[-limit:]:
                    # ::float8 语义：价格列已是 float
                    out.append(
                        (sym, b["time"], b["high"], b["low"], b["close"], float(b["volume"]))
                    )
            random.Random(42).shuffle(out)  # 验证 Polars sort + 分组边界切分
            self._rows = out
            return

        if "FROM bar1d_adj" in s and "WHERE symbol = %s" in s:
            # ---- v1 单标的：RealDictCursor 语义，numeric → Decimal，SQL 侧 DESC ----
            self._store["calls"].append(("v1_bar", s))
            sym, limit = params  # type: ignore[misc]
            bars = self._store["bars"][sym]
            if len(bars) < limit:
                self._rows = []
                return
            rows = [
                {
                    "time": b["time"],
                    "high": Decimal(repr(b["high"])),
                    "low": Decimal(repr(b["low"])),
                    "close": Decimal(repr(b["close"])),
                    "volume": Decimal(repr(float(b["volume"]))),
                }
                for b in bars[-limit:]
            ]
            rows.reverse()  # 与 SQL ORDER BY time DESC 对齐
            self._rows = rows
            return

        raise AssertionError(f"未预期的 SQL: {s}")

    def fetchall(self) -> list[Any]:
        return self._rows


class FakeConn:
    """忽略 cursor_factory（RealDictCursor），统一返回预置结构。"""

    def __init__(self, store: dict[str, Any]) -> None:
        self._store = store

    def cursor(self, cursor_factory: Any = None) -> FakeCursor:
        return FakeCursor(self._store)

    def close(self) -> None:
        pass


# 注入假连接
screener._get_conn = lambda: FakeConn(STORE)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# 断言辅助
# ---------------------------------------------------------------------------

_failures: list[str] = []
_checks = 0


def check(cond: bool, label: str) -> bool:
    global _checks
    _checks += 1
    if cond:
        print(f"  [PASS] {label}")
    else:
        print(f"  [FAIL] {label}")
        _failures.append(label)
    return cond


def _counts() -> dict[str, int]:
    c = {"universe": 0, "v1_bar": 0, "v2_bar": 0}
    for kind, _ in STORE["calls"]:
        c[kind] += 1
    return c


FACTORS = [
    {"name": "ma_trend_20", "weight": 40, "value": 60},
    {"name": "roc_20", "weight": 30, "value": 50},
    {"name": "rsi_14", "weight": 30, "value": 50, "direction": -1},
]

EXPECTED_RANKED = N_SYMBOLS - SHORT_SYMBOLS  # 通过长度过滤的标的数


def run_version(version: str, combine: str, **kwargs: Any) -> tuple[dict[str, Any], float, dict[str, int]]:
    STORE["calls"] = []
    t0 = time.perf_counter()
    res = screener.screen(FACTORS, top_n=20, combine=combine, version=version, **kwargs)
    wall_ms = (time.perf_counter() - t0) * 1000
    return res, wall_ms, _counts()


# ---------------------------------------------------------------------------
# 主验证
# ---------------------------------------------------------------------------

def main() -> int:
    print(f"股票池 {N_SYMBOLS} 只（其中 {SHORT_SYMBOLS} 只仅有 {SHORT_BARS} 根 < {HISTORY_COUNT}）")
    print(f"每只标的日线 {N_BARS} 根；预期参与打分 {EXPECTED_RANKED} 只\n")

    print("[1] 6 种 combine 模式下 v1 / v2 结果一致性")
    for mode in _COMBINE_MODES:
        v1, w1, c1 = run_version("v1", mode)
        v2, w2, c2 = run_version("v2", mode)

        check(
            v1["items"] == v2["items"],
            f"{mode}: items 完全一致（含 symbol/score/close/factorScores）",
        )
        check(v1["total"] == v2["total"] == EXPECTED_RANKED, f"{mode}: total 均为 {EXPECTED_RANKED}")
        check(v1["version"] == "v1" and v2["version"] == "v2", f"{mode}: version 标记正确")
        check(c1["v1_bar"] == N_SYMBOLS and c2["v1_bar"] == 0, f"{mode}: v1 逐标的查询 {N_SYMBOLS} 次")
        check(c2["v2_bar"] == 1 and c1["v2_bar"] == 0, f"{mode}: v2 批量查询 1 次")
        check(v1["fetchMs"] >= 0 and v2["fetchMs"] >= 0, f"{mode}: fetchMs 非负")
        print(
            f"    {mode:<13} v1 总 {v1['elapsedMs']:>8.1f}ms/取数 {v1['fetchMs']:>7.1f}ms"
            f" | v2 总 {v2['elapsedMs']:>8.1f}ms/取数 {v2['fetchMs']:>7.1f}ms"
            f" | 墙钟 v1 {w1:.1f}ms v2 {w2:.1f}ms"
        )

    print("\n[2] 默认版本应为 v2")
    STORE["calls"] = []
    default_res = screener.screen(FACTORS, top_n=20)
    dc = _counts()
    check(default_res["version"] == "v2", "不传 version 时 version == v2")
    check(dc["v2_bar"] == 1 and dc["v1_bar"] == 0, "默认走 v2 批量查询")

    print("\n[3] 无有效因子（weight 全 0）不查日线")
    STORE["calls"] = []
    empty_res = screener.screen([{"name": "ma_trend_20", "weight": 0}], version="v1")
    ec = _counts()
    check(empty_res["items"] == [] and empty_res["total"] == 0, "返回空结果")
    check(empty_res["version"] == "v1", "无有效因子时仍回传请求版本")
    check(ec["v1_bar"] == 0 and ec["universe"] == 0, "未发起任何日线/股票池查询")

    print("\n[4] symbols 子集在两版下一致")
    subset = SYMBOLS[-8:]  # 全为长历史标的
    s1, _, sc1 = run_version("v1", "weighted_sum", symbols=subset)
    s2, _, sc2 = run_version("v2", "weighted_sum", symbols=subset)
    check(s1["items"] == s2["items"], "子集：items 完全一致")
    check(s1["total"] == s2["total"] == len(subset), f"子集：total 均为 {len(subset)}")
    check(sc1["v1_bar"] == len(subset), f"子集：v1 查询 {len(subset)} 次（仅池内）")
    check(sc2["v2_bar"] == 1, "子集：v2 仍为 1 次批量查询")

    print("\n" + "=" * 68)
    if _failures:
        print(f"结果：FAIL —— {len(_failures)}/{_checks} 项未通过")
        for f in _failures:
            print(f"  - {f}")
        return 1
    print(f"结果：PASS —— {_checks}/{_checks} 项全部通过")
    print(
        "提示：此处耗时为假 DB 驱动，仅反映 Python 侧结构开销；\n"
        "      真实 N+1 SQL 往返差异需在 PostgreSQL 可用时实测。"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
