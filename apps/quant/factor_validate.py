"""因子「能否运行」校验（Python 代码 + AKQuant 表达式）。

用于 AI 生成因子后的兜底校验，分两级：
  1. 静态校验：代码走 factor_code.validate_factor_code（AST 白名单 + 入口签名），
     表达式走 AKQuant ExpressionParser 的编译（plan + parse）；
  2. 真实执行：从本地库取少量标的（真实日线）实际跑一遍，能跑通且产出有效数值
     才算通过。

之所以要真跑一遍：静态校验只能排除危险语法 / 白名单外的算子，无法发现运行期错误
（如除零、索引越界、返回非数值、算子签名写错、引用了白名单允许但数据里缺失的行情列
等）。样本量刻意压到个位数标的，避免校验请求拖长；代码执行仍在 factor_code 的受限
环境 + 行级看门狗内。
"""

from __future__ import annotations

from typing import Any

import polars as pl

from factor_code import DEFAULT_TIMEOUT, FactorCodeError, run_factor_code, validate_factor_code
from logger import get_logger
from screener import (
    CUSTOM_HISTORY_COUNT,
    _CUSTOM_PARSER,
    _eval_expression,
    _get_conn,
    _load_universe_bars,
    _load_universe_frame,
)

log = get_logger("factor_validate")

# 校验用样本：候选标的数量（先多取再按历史长度过滤）与每标的历史窗口。
# 窗口取 CUSTOM_HISTORY_COUNT，覆盖 250 日均线等长周期算子。
SAMPLE_CANDIDATE_COUNT = 20
SAMPLE_SYMBOL_COUNT = 3
SAMPLE_BARS = CUSTOM_HISTORY_COUNT

# 校验执行超时（比正式选股更短，避免请求长时间挂起）
VALIDATE_TIMEOUT = min(DEFAULT_TIMEOUT, 10.0)

# 取候选标的时排除北交所（3xx 开头规则不同、历史较短，且非校验必需）
_EXCLUDE_BJ = "%.BJ"


def _sample_universe(conn: Any, count: int) -> list[dict[str, Any]]:
    """取候选标的列表（按代码升序，仅用于拿样本，不保证历史足够）。"""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT symbol, COALESCE(name, symbol) AS name
            FROM instrument
            WHERE symbol NOT LIKE %s
            ORDER BY symbol
            LIMIT %s
            """,
            (_EXCLUDE_BJ, count),
        )
        return [{"symbol": row[0], "name": row[1]} for row in cur.fetchall()]


def validate_factor_code_runnable(code: str) -> dict[str, Any]:
    """校验因子代码能否运行。

    Returns:
        {
          "valid": bool,
          "stage": "syntax" | "data" | "runtime" | "executed",
          "reason": str | None,      # valid 为 False 时的失败原因
          "sampleSymbols": list[str] # 实际用于执行的标的
        }
    """
    reason = validate_factor_code(code)
    if reason:
        return {"valid": False, "stage": "syntax", "reason": reason, "sampleSymbols": []}

    conn = _get_conn()
    try:
        candidates = _sample_universe(conn, SAMPLE_CANDIDATE_COUNT)
        bars = _load_universe_bars(conn, candidates, SAMPLE_BARS)
    finally:
        conn.close()

    sample_symbols = sorted(bars.keys())[:SAMPLE_SYMBOL_COUNT]
    if not sample_symbols:
        return {
            "valid": False,
            "stage": "data",
            "reason": "本地样本数据不足，无法完成运行校验",
            "sampleSymbols": [],
        }

    sample = {symbol: bars[symbol] for symbol in sample_symbols}

    try:
        series_by_symbol = run_factor_code(code, sample, timeout=VALIDATE_TIMEOUT)
    except FactorCodeError as e:
        return {
            "valid": False,
            "stage": "runtime",
            "reason": str(e),
            "sampleSymbols": sample_symbols,
        }

    produced = {
        symbol: values
        for symbol, values in series_by_symbol.items()
        if any(v is not None for v in values)
    }
    if not produced:
        return {
            "valid": False,
            "stage": "runtime",
            "reason": "compute 未产出有效数值（返回值为空或全为 None / NaN）",
            "sampleSymbols": sample_symbols,
        }

    log.info(
        "因子代码运行校验通过",
        samples=len(produced),
        checked=len(sample_symbols),
    )
    return {
        "valid": True,
        "stage": "executed",
        "reason": None,
        "sampleSymbols": sorted(produced.keys()),
    }


def _filter_frame_by_history(frame: pl.DataFrame, min_bars: int) -> pl.DataFrame:
    """只保留历史长度 >= min_bars 的标的，避免长周期算子在样本不足时误判为失败。"""
    counts = frame.group_by("symbol").agg(pl.len().alias("n"))
    enough = counts.filter(pl.col("n") >= min_bars).select("symbol")
    return frame.join(enough, on="symbol", how="semi")


def validate_factor_expression_runnable(expression: str) -> dict[str, Any]:
    """校验 AKQuant 因子表达式能否运行。

    与 validate_factor_code_runnable 同口径：表达式先经引擎编译（plan + parse），
    再到真实库样本日线上实际求值，能跑通且产出有效数值才算通过。静态白名单由
    服务端 TS 侧负责，这里补的是它覆盖不到的运行期语义（引擎宽松放行的写法、
    数据里缺失的行情列、除零导致的全 NaN 等）。

    Returns:
        {
          "valid": bool,
          "stage": "syntax" | "data" | "runtime" | "executed",
          "reason": str | None,      # valid 为 False 时的失败原因
          "sampleSymbols": list[str] # 实际用于求值的标的
        }
    """
    try:
        steps = _CUSTOM_PARSER.plan(expression)
        for _var_name, sub_expr_str in steps:
            _CUSTOM_PARSER.parse(sub_expr_str)
    except Exception as exc:  # noqa: BLE001 — 引擎解析异常即视为语法不通过
        return {
            "valid": False,
            "stage": "syntax",
            "reason": f"表达式无法编译：{exc}",
            "sampleSymbols": [],
        }

    conn = _get_conn()
    try:
        candidates = _sample_universe(conn, SAMPLE_CANDIDATE_COUNT)
        frame = _load_universe_frame(conn, candidates)
    finally:
        conn.close()

    frame = _filter_frame_by_history(frame, SAMPLE_BARS)
    sample_symbols = sorted(frame["symbol"].unique().to_list())[:SAMPLE_SYMBOL_COUNT]
    if not sample_symbols:
        return {
            "valid": False,
            "stage": "data",
            "reason": "本地样本数据不足，无法完成运行校验",
            "sampleSymbols": [],
        }

    sample_frame = frame.filter(pl.col("symbol").is_in(sample_symbols))

    try:
        raw = _eval_expression(sample_frame, expression)
    except Exception as exc:  # noqa: BLE001 — 引擎求值异常即视为运行不通过
        return {
            "valid": False,
            "stage": "runtime",
            "reason": str(exc),
            "sampleSymbols": sample_symbols,
        }

    if not raw:
        return {
            "valid": False,
            "stage": "runtime",
            "reason": "表达式未产出有效数值（结果为 None / NaN 或引用的行情列不存在）",
            "sampleSymbols": sample_symbols,
        }

    log.info(
        "因子表达式运行校验通过",
        samples=len(raw),
        checked=len(sample_symbols),
    )
    return {
        "valid": True,
        "stage": "executed",
        "reason": None,
        "sampleSymbols": sorted(raw.keys()),
    }
