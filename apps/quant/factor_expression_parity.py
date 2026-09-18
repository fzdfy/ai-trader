"""白名单与 AKQuant 表达式引擎的一致性自测。

背景：`apps/server/src/agent/mastra/agents/factor-generator.ts` 把引擎的
「行情列 / 算子 / 运算符与语法」镜像到了 TypeScript 里，用于生成侧的输出强制校验。
本脚本用真实的 `akquant.factor.ExpressionParser` 把同一份白名单验一遍，
防止两边漂移（典型场景：升级 akquant 后算子被改名 / 删除 / 收紧参数）。

口径分三类：
- whitelist：白名单里合法的表达式，引擎必须全部接受。
  这是最重要的安全不变量——校验器绝不能放行引擎执行不了的东西（假阳性）。
- permissive：白名单明确排除、但引擎因惰性求值而放行的写法。
  属于已知差异（引擎只保证"能编译"，白名单额外保证"在白名单内"），不视为失败。
- rejected：白名单与引擎都应拒绝的写法。
- 源码对账：直接读 TS 侧的 OPERATOR_SPECS，逐个与引擎的 OPS_MAP 核对存在性与参数个数。
  这一段是为了抓住反方向的漂移——有人在 TS 里加了引擎根本没有的算子。

运行：cd apps/quant && ./.venv/bin/python factor_expression_parity.py
任一用例不符合预期时以非 0 退出码结束。
"""
import inspect
import re
from pathlib import Path
from typing import TypedDict

from akquant.factor import ExpressionParser
from akquant.factor.ops import OPS_MAP

SERVER_FACTOR_GENERATOR = (
    Path(__file__).resolve().parents[1]
    / "server/src/agent/mastra/agents/factor-generator.ts"
)

OPERATOR_SPEC_PATTERN = re.compile(
    r'name:\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*,\s*'
    r'(?:alias:\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*,\s*)?'
    r"params:\s*\[([^\]]*)\]"
)


class _Case(TypedDict):
    expression: str
    note: str


PARAM_SAMPLES: dict[str, str] = {
    "x": "Close",
    "y": "Open",
    "d": "5",
    "limit": "0.05",
    "lo": "0.01",
    "hi": "0.99",
    "e": "2",
    "cond": "Close > Open",
    "t": "1",
    "f": "0",
    "group": "Close",
}

OPERATORS: list[tuple[str, str | None, list[str]]] = [
    ("Mean", "Ts_Mean", ["x", "d"]),
    ("Std", "Ts_Std", ["x", "d"]),
    ("Max", "Ts_Max", ["x", "d"]),
    ("Min", "Ts_Min", ["x", "d"]),
    ("Sum", "Ts_Sum", ["x", "d"]),
    ("Corr", "Ts_Corr", ["x", "y", "d"]),
    ("Cov", "Ts_Cov", ["x", "y", "d"]),
    ("Ref", "Delay", ["x", "d"]),
    ("Delta", None, ["x", "d"]),
    ("ArgMax", "Ts_ArgMax", ["x", "d"]),
    ("ArgMin", "Ts_ArgMin", ["x", "d"]),
    ("Ts_Rank", None, ["x", "d"]),
    ("Rank", None, ["x"]),
    ("Scale", None, ["x"]),
    ("Standardize", "ZScore", ["x"]),
    ("Winsorize", None, ["x", "limit"]),
    ("WinsorizeQuantile", None, ["x", "lo", "hi"]),
    ("Neutralize", "IndNeutralize", ["x", "group"]),
    ("Log", None, ["x"]),
    ("Abs", None, ["x"]),
    ("Sign", None, ["x"]),
    ("SignedPower", None, ["x", "e"]),
    ("If", None, ["cond", "t", "f"]),
]

SYNTAX_CASES: list[_Case] = [
    {"expression": "Close / Ref(Close, 5) - 1", "note": "二元运算 + 算子嵌套"},
    {"expression": "Mean(Close, 12) - Mean(Close, 26) - Mean(Mean(Close, 12) - Mean(Close, 26), 9)", "note": "MACD 结构"},
    {"expression": "(Close - Min(Low, 20)) / (Max(High, 20) - Min(Low, 20))", "note": "括号优先"},
    {
        "expression": "Mean(If(Delta(Close,1) > 0, Delta(Close,1), 0), 14) / Mean(If(Delta(Close,1) < 0, -Delta(Close,1), 0), 14)",
        "note": "比较 + 三元分支 + 一元负号",
    },
    {"expression": "Close ** 2 % 3", "note": "幂与取模"},
    {"expression": "1e-3 * Close", "note": "科学计数法字面量"},
    {"expression": "Mean(If(Mean(Close, 5) > Mean(Close, 20), 1, 0), 10)", "note": "MA5 连续站上 MA20 的计数"},
    {"expression": "0 if Close > Open else 1", "note": "Python 三元表达式（引擎的 IfExp）"},
    {"expression": "WinsorizeQuantile(Neutralize(Rank(Close), Close), 0.01, 0.99)", "note": "多算子串联"},
    {"expression": "close / Ref(close, 5) - 1", "note": "列名走 .lower() 匹配"},
]

PERMISSIVE_CASES: list[_Case] = [
    {"expression": "AdjClose / Close", "note": "引擎不校验列是否存在，执行阶段才会报错"},
    {"expression": "'abc'", "note": "引擎把字符串常量原样返回"},
    {"expression": "not Close", "note": "引擎把 Not 映射成 ~operand"},
]

REJECTED_CASES: list[_Case] = [
    {"expression": "ref(Close, 5)", "note": "算子名大小写错误"},
    {"expression": "Mean(Close)", "note": "参数个数不足"},
    {"expression": "Mean(Close, 5, 6)", "note": "参数个数过多"},
    {"expression": "Close > Open > Low", "note": "链式比较"},
    {"expression": "Close[0]", "note": "下标访问"},
    {"expression": "Close.close", "note": "属性访问"},
    {"expression": "Close and Open", "note": "布尔运算"},
    {"expression": "~Close", "note": "按位取反"},
    {"expression": "Close if Open", "note": "语法错误"},
]


def _call(name: str, params: list[str]) -> str:
    args = ", ".join(PARAM_SAMPLES[param] for param in params)
    return f"{name}({args})"


def _operator_cases() -> list[_Case]:
    cases: list[_Case] = []
    for name, alias, params in OPERATORS:
        cases.append({"expression": _call(name, params), "note": f"算子 {name}"})
        if alias is not None:
            cases.append({"expression": _call(alias, params), "note": f"算子别名 {alias}"})
    return cases


def _accepts(parser: ExpressionParser, expression: str) -> tuple[bool, str]:
    try:
        parser.parse(expression)
    except Exception as error:  # noqa: BLE001 - 引擎会抛多种异常，统一归类为"拒绝"
        return False, f"{type(error).__name__}: {error}"
    return True, ""


def _run(parser: ExpressionParser, cases: list[_Case], expect_accept: bool) -> list[str]:
    failures: list[str] = []
    for case in cases:
        accepted, error = _accepts(parser, case["expression"])
        if accepted != expect_accept:
            expectation = "应接受" if expect_accept else "应拒绝"
            actual = "接受" if accepted else f"拒绝（{error}）"
            failures.append(f"{case['expression']}\n    期望：{expectation}｜实际：{actual}｜{case['note']}")
    return failures


def _check_ts_whitelist() -> tuple[int, list[str]]:
    """直接读 TS 侧白名单源码，与引擎的 OPS_MAP 对账（含别名与参数个数）。"""
    if not SERVER_FACTOR_GENERATOR.is_file():
        return 0, [f"未找到 TS 白名单源文件：{SERVER_FACTOR_GENERATOR}"]

    specs = OPERATOR_SPEC_PATTERN.findall(SERVER_FACTOR_GENERATOR.read_text(encoding="utf-8"))
    if not specs:
        return 0, [f"未能从 {SERVER_FACTOR_GENERATOR.name} 中解析出算子白名单，正则可能已失效"]

    failures: list[str] = []
    for name, alias, params_raw in specs:
        arity = len([param for param in params_raw.split(",") if param.strip()])
        for operator in (name, alias):
            if not operator:
                continue
            func = OPS_MAP.get(operator)
            if func is None:
                failures.append(f"{operator} 只存在于 TS 白名单，AKQuant 的 OPS_MAP 里没有")
                continue
            engine_arity = len(inspect.signature(func).parameters)
            if engine_arity != arity:
                failures.append(
                    f"{operator} 参数个数不一致：TS 白名单 {arity} 个，引擎 {engine_arity} 个"
                )

    return len(specs), failures


def main() -> int:
    parser = ExpressionParser()

    groups = [
        ("白名单合法表达式（引擎必须接受）", _operator_cases() + SYNTAX_CASES, True),
        ("引擎宽松放行（已知差异，白名单拒绝）", PERMISSIVE_CASES, True),
        ("白名单与引擎都拒绝", REJECTED_CASES, False),
    ]

    total = 0
    failures: list[str] = []

    for title, cases, expect_accept in groups:
        group_failures = _run(parser, cases, expect_accept)
        total += len(cases)
        status = "PASS" if not group_failures else "FAIL"
        print(f"[{status}] {title}（{len(cases)} 例）")
        for expression in group_failures:
            print(f"  - {expression}")
        failures.extend(group_failures)

    spec_count, spec_failures = _check_ts_whitelist()
    total += spec_count
    status = "PASS" if not spec_failures else "FAIL"
    print(f"[{status}] TS 白名单源码 与 引擎 OPS_MAP 对账（{spec_count} 个算子）")
    for failure in spec_failures:
        print(f"  - {failure}")
    failures.extend(spec_failures)

    print(f"\n共 {total} 例，失败 {len(failures)} 例。")
    if failures:
        print("白名单与 AKQuant 引擎出现漂移，请核对 factor-generator.ts 的算子 / 语法白名单。")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
