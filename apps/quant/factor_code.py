"""受限 Python 因子执行模块（kind='python'）。

用户在因子库里用 Python 代码定义因子：必须提供 `compute(data)` 函数，
`data` 为单标的的历史行情数组字典（时间升序，最后一个元素为当前 bar）：

    {"close": np.ndarray, "high": np.ndarray, "low": np.ndarray,
     "volume": np.ndarray, "amount": np.ndarray}
    # open 也可能存在，取决于调用方；amount 允许为 NaN（停牌）

`compute` 返回值：
  - 标量（最新一根的因子原始值），或
  - 与行情等长的序列（本模块取其最后一个有效值）

原始值不做 [0,1] 归一化，由调用方（screener）做横截面百分位排名。

安全边界（与 server 侧 src/lib/factor-code.ts 同源，服务端只做「快速拒绝」）：
  1. AST 白名单：只允许表达式/赋值/if/for 等必要节点，禁止 import、
     while、with、class、async、yield、global、delete 等；
  2. 名称/属性守卫：禁止双下划线名称与以下划线开头的属性（堵住 __class__ /
     __globals__ 逃逸链）；
  3. 受限内置：只暴露安全的纯函数内置 + numpy/math/polars，无 open/eval/exec；
  4. 行级看门狗：用 sys.settrace 统计 Python 行事件并以挂钟时间兜底，
     超时直接抛错，避免死循环拖垮 quant 进程。

注意：这里不做进程/内存隔离，属于「同进程受限执行」。因子作者是需要登录的
受信用户，且执行的是小样本（最近百余根日线）纯计算，风险可控。
"""

from __future__ import annotations

import ast
import math
import sys
import time
from typing import Any

import numpy as np

# 代码长度上限（与 server 侧 MAX_CODE_LENGTH 保持一致）
MAX_CODE_LENGTH = 5000

# 单次执行（一个标的的一次 compute 调用）行事件上限
MAX_LINE_EVENTS = 2_000_000

# 整批（全部标的）执行的挂钟时间上限（秒）
DEFAULT_TIMEOUT = 20.0

# 必须定义的入口函数名
ENTRY_NAME = "compute"


class FactorCodeError(Exception):
    """因子代码校验或执行失败。"""


# ============================================================================
# AST 白名单校验
# ============================================================================

_ALLOWED_NODES: frozenset[type] = frozenset(
    {
        # 结构与语句
        ast.Module,
        ast.Expression,
        ast.FunctionDef,
        ast.Return,
        ast.Assign,
        ast.AugAssign,
        ast.If,
        ast.For,
        ast.Expr,
        ast.Pass,
        ast.Break,
        ast.Continue,
        ast.Raise,
        ast.Assert,
        # 表达式
        ast.BinOp,
        ast.UnaryOp,
        ast.BoolOp,
        ast.Compare,
        ast.IfExp,
        ast.Call,
        ast.Attribute,
        ast.Subscript,
        ast.Slice,
        ast.Tuple,
        ast.List,
        ast.Dict,
        ast.Set,
        ast.Starred,
        ast.ListComp,
        ast.SetComp,
        ast.DictComp,
        ast.GeneratorExp,
        ast.comprehension,
        ast.Lambda,
        ast.keyword,
        ast.JoinedStr,
        ast.FormattedValue,
        ast.Constant,
        ast.Name,
        ast.Load,
        ast.Store,
        ast.arguments,
        ast.arg,
        # 运算符
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.FloorDiv,
        ast.Mod,
        ast.Pow,
        ast.UAdd,
        ast.USub,
        ast.Not,
        ast.And,
        ast.Or,
        ast.Eq,
        ast.NotEq,
        ast.Lt,
        ast.LtE,
        ast.Gt,
        ast.GtE,
        ast.In,
        ast.NotIn,
        ast.Is,
        ast.IsNot,
        ast.BitAnd,
        ast.BitOr,
        ast.BitXor,
        ast.Invert,
        ast.LShift,
        ast.RShift,
    }
)

# 明显危险的名称（即便有受限内置也不允许出现）
_FORBIDDEN_NAMES: frozenset[str] = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "open",
        "input",
        "globals",
        "locals",
        "vars",
        "getattr",
        "setattr",
        "delattr",
        "breakpoint",
        "exit",
        "quit",
        "help",
        "__import__",
    }
)


def _validate_ast(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        if type(node) not in _ALLOWED_NODES:
            raise FactorCodeError(f"不允许的语法：{type(node).__name__}")

        if isinstance(node, ast.Name):
            if node.id in _FORBIDDEN_NAMES or "__" in node.id:
                raise FactorCodeError(f"不允许的名称：{node.id}")

        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise FactorCodeError(f"不允许的属性访问：.{node.attr}")


def _find_entry(tree: ast.Module) -> ast.FunctionDef:
    entry: ast.FunctionDef | None = None
    for stmt in tree.body:
        # 模块级只允许 docstring、常量/简单赋值与 compute 定义
        if isinstance(stmt, ast.FunctionDef):
            if stmt.name == ENTRY_NAME:
                entry = stmt
            continue
        if isinstance(stmt, ast.Assign):
            continue
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant):
            continue
        raise FactorCodeError("模块级只允许定义 compute 函数与常量赋值")

    if entry is None:
        raise FactorCodeError(f"必须定义 {ENTRY_NAME}(data) 函数")

    args = entry.args
    if len(args.args) != 1 or args.vararg or args.kwarg or args.posonlyargs:
        raise FactorCodeError(f"{ENTRY_NAME} 必须且只能接收一个参数")
    return entry


def validate_factor_code(code: str) -> str | None:
    """校验因子代码；通过返回 None，否则返回失败原因。"""
    text = (code or "").strip()
    if not text:
        return "代码为空"
    if len(text) > MAX_CODE_LENGTH:
        return f"代码过长（上限 {MAX_CODE_LENGTH} 字符）"
    try:
        tree = ast.parse(text, mode="exec")
    except SyntaxError as e:
        return f"语法错误：{e.msg}（第 {e.lineno} 行）"
    try:
        _validate_ast(tree)
        _find_entry(tree)
    except FactorCodeError as e:
        return str(e)
    return None


# ============================================================================
# 受限执行环境
# ============================================================================

_SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs,
    "min": min,
    "max": max,
    "sum": sum,
    "len": len,
    "range": range,
    "float": float,
    "int": int,
    "bool": bool,
    "str": str,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "set": set,
    "sorted": sorted,
    "round": round,
    "enumerate": enumerate,
    "zip": zip,
    "map": map,
    "filter": filter,
    "any": any,
    "all": all,
    "pow": pow,
    "divmod": divmod,
    "reversed": reversed,
    "isinstance": isinstance,
    "Exception": Exception,
    "ValueError": ValueError,
    "TypeError": TypeError,
    "ZeroDivisionError": ZeroDivisionError,
    "KeyError": KeyError,
    "IndexError": IndexError,
    "ArithmeticError": ArithmeticError,
}


class _Timeout(Exception):
    """行级看门狗触发（内部信号）。"""


def _compile_entry(code: str) -> Any:
    """校验并编译因子代码，返回可调用的 compute。"""
    reason = validate_factor_code(code)
    if reason:
        raise FactorCodeError(reason)

    namespace: dict[str, Any] = {"__builtins__": _SAFE_BUILTINS, "np": np, "math": math}
    try:
        exec(compile(code, "<factor>", "exec"), namespace)  # noqa: S102 - 受限命名空间
    except Exception as e:  # 模块级赋值出错
        raise FactorCodeError(f"代码执行失败：{e}") from e

    entry = namespace.get(ENTRY_NAME)
    if not callable(entry):
        raise FactorCodeError(f"{ENTRY_NAME} 不是可调用对象")
    return entry


def _to_series(value: Any, expected_len: int) -> list[float | None]:
    """把 compute 的返回值规整为 float/None 列表。"""
    if value is None:
        return [None] * expected_len

    if isinstance(value, (int, float, np.integer, np.floating)):
        return [float(value)]

    try:
        arr = np.asarray(value, dtype=float).ravel()
    except (TypeError, ValueError) as e:
        raise FactorCodeError(f"返回值无法转为数值序列：{e}") from e

    out: list[float | None] = []
    for v in arr:
        fv = float(v)
        out.append(None if (math.isnan(fv) or math.isinf(fv)) else fv)
    return out


def run_factor_code(
    code: str,
    data_by_symbol: dict[str, dict[str, np.ndarray]],
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, list[float | None]]:
    """在受限环境中执行用户因子代码，逐标的求值。

    Args:
        code: 用户 Python 源码（须定义 compute(data)）
        data_by_symbol: {symbol: {close/high/low/volume/amount...: np.ndarray}}
        timeout: 整批执行的挂钟时间上限（秒）

    Returns:
        {symbol: [因子值...]}（NaN/Inf → None，缺失标的返回空列表）

    Raises:
        FactorCodeError: 校验失败、执行异常或超时
    """
    entry = _compile_entry(code)

    deadline = time.perf_counter() + timeout
    budget = [MAX_LINE_EVENTS]

    def _local_trace(frame: Any, event: str, arg: Any) -> Any:
        if event == "line":
            budget[0] -= 1
            if budget[0] <= 0 or time.perf_counter() > deadline:
                raise _Timeout
        return _local_trace

    results: dict[str, list[float | None]] = {}
    first_error: str | None = None

    sys.settrace(_local_trace)
    try:
        for symbol, data in data_by_symbol.items():
            try:
                value = entry(data)
            except _Timeout as e:
                sys.settrace(None)
                raise FactorCodeError(f"Python 因子执行超时（>{timeout:.0f}s）") from e
            except FactorCodeError:
                raise
            except Exception as e:
                # 单个标的失败不拖垮整批：记录首个错误，全部失败时再上抛
                if first_error is None:
                    first_error = f"{type(e).__name__}: {e}"
                continue
            results[symbol] = _to_series(value, len(data.get("close", [])))
    finally:
        sys.settrace(None)

    if not results and first_error is not None:
        raise FactorCodeError(f"compute 执行异常：{first_error}")
    return results


def latest_values(series_by_symbol: dict[str, list[float | None]]) -> dict[str, float]:
    """取每个标的序列中最后一个有效值（供横截面排名使用）。"""
    out: dict[str, float] = {}
    for symbol, series in series_by_symbol.items():
        for v in reversed(series):
            if v is not None:
                out[symbol] = float(v)
                break
    return out
