"""把 qlib 因子库（Alpha158 + Alpha360）导入本地 ``factor_registry``。

qlib 未安装进 ``apps/quant`` 的 venv（设计如此，见 ``export_to_qlib.py``），因此
本脚本**内联** qlib ``contrib/data/loader.py`` 里 Alpha158DL / Alpha360DL 的因子
定义，逐条翻译成 AKQuant 表达式后写库，供选股/因子页直接使用。

翻译规则（qlib 表达式 → AKQuant 白名单）
----------------------------------------
- 行情列：``$close/$open/$high/$low/$volume`` → ``Close/Open/High/Low/Volume``；
  ``$vwap`` 无对应列 → 该因子不可翻译（跳过）。
- 同名算子：``Ref / Mean / Std / Max / Min / Sum / Corr / Abs / Log``。
- ``Rank(x, d)``（时序滚动排名）→ ``Ts_Rank(x, d)``。
- ``IdxMax`` → ``ArgMax``，``IdxMin`` → ``ArgMin``（二者语义一致：0 = 今天）。
- ``Greater(a, b)``（逐元素取大）→ ``If(a > b, a, b)``。
- ``Less(a, b)``（逐元素取小）→ ``If(a < b, a, b)``。
- 无对应实现 → 跳过：``Slope``(BETA)、``Rsquare``(RSQR)、``Resi``(RESI)、
  ``Quantile``(QTLU/QTLD)。

分类（category）沿用 qlib 原生分组：``qlib/alpha158/{kbar,price,rolling/<OP>}``
与 ``qlib/alpha360/{CLOSE,OPEN,HIGH,LOW,VOLUME}``。

导入口径：``kind='expression'``、``created_by='system'``、``is_public=true``、
``direction=1``；``name`` 加源前缀（``alpha158_`` / ``alpha360_``）避免同名冲突
（如两源都有的 ``OPEN0``）。写库前逐条经 ``factor_validate`` 的
``validate_factor_expression_runnable`` 在真实日线样本上试跑，跑不通的不入库。

用法（在 apps/quant 目录下执行）：

    # 全量导入（翻译 + 逐条校验 + 写库）
    ./.venv/bin/python research/import_qlib_factors.py

    # 先看报告不写库；跳过运行校验（快，仅做翻译）
    ./.venv/bin/python research/import_qlib_factors.py --dry-run --skip-validate

    # 冒烟：只处理前 20 条
    ./.venv/bin/python research/import_qlib_factors.py --limit 20

    # 把跳过明细写到文件
    ./.venv/bin/python research/import_qlib_factors.py --report research/qlib_import_skipped.json
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Callable

import psycopg2

_QUANT_ROOT = Path(__file__).resolve().parent.parent
if str(_QUANT_ROOT) not in sys.path:
    sys.path.insert(0, str(_QUANT_ROOT))

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

# AKQuant 白名单行情列（与前端 / 服务端 factor-generator.ts 一致）
COLUMNS = {"Close", "Open", "High", "Low", "Volume", "Vwap"}

_FIELD_MAP = {
    "close": "Close",
    "open": "Open",
    "high": "High",
    "low": "Low",
    "volume": "Volume",
    "vwap": "Vwap",
}

# qlib 算子 → AKQuant 白名单算子（同名 + 改名）
_RENAME = {
    "Ref": "Ref",
    "Mean": "Mean",
    "Std": "Std",
    "Max": "Max",
    "Min": "Min",
    "Sum": "Sum",
    "Corr": "Corr",
    "Cov": "Cov",
    "Delta": "Delta",
    "Abs": "Abs",
    "Log": "Log",
    "Rank": "Ts_Rank",  # qlib 的 Rank 是时序滚动排名，不是截面
    "IdxMax": "ArgMax",
    "IdxMin": "ArgMin",
    "Slope": "Slope",
    "Rsquare": "Rsquare",
    "Resi": "Resi",
    "Quantile": "Quantile",
}

# 逐元素取大 / 取小 → If
_COND_MAP: dict[str, type[ast.cmpop]] = {"Greater": ast.Gt, "Less": ast.Lt}

# qlib 有、AKQuant 无对应实现的算子 → 跳过
# （Slope / Rsquare / Resi / Quantile 已由 factor_ext 扩展实现并纳入白名单，不再跳过）
_UNSUPPORTED_OPS: set[str] = set()

# 翻译结果允许出现的算子（服务端白名单全量），用于自检
_WHITELIST_OPS = {
    "Mean", "Ts_Mean", "Std", "Ts_Std", "Max", "Ts_Max", "Min", "Ts_Min",
    "Sum", "Ts_Sum", "Corr", "Ts_Corr", "Cov", "Ts_Cov", "Ref", "Delay",
    "Delta", "ArgMax", "Ts_ArgMax", "ArgMin", "Ts_ArgMin", "Ts_Rank", "Rank",
    "Scale", "Standardize", "ZScore", "Winsorize", "WinsorizeQuantile",
    "Neutralize", "IndNeutralize", "Log", "Abs", "Sign", "SignedPower", "If",
    "Quantile", "Slope", "Rsquare", "Resi", "Product", "DecayLinear",
}

ALPHA158_WINDOWS = [5, 10, 20, 30, 60]
ALPHA360_WINDOWS = list(range(59, -1, -1))


class Untranslatable(Exception):
    """该 qlib 因子无法翻译成 AKQuant 表达式。"""


# --------------------------------------------------------------------------- #
# qlib Alpha158 / Alpha360 因子定义（内联 loader.py）
# --------------------------------------------------------------------------- #

# (name, qlib_expr, 中文简介)
_ALPHA158_KBAR: list[tuple[str, str, str]] = [
    ("KMID", "($close-$open)/$open", "实体涨跌"),
    ("KLEN", "($high-$low)/$open", "实体振幅"),
    ("KMID2", "($close-$open)/($high-$low+1e-12)", "实体涨跌(振幅归一)"),
    ("KUP", "($high-Greater($open, $close))/$open", "上影线"),
    ("KUP2", "($high-Greater($open, $close))/($high-$low+1e-12)", "上影线(振幅归一)"),
    ("KLOW", "(Less($open, $close)-$low)/$open", "下影线"),
    ("KLOW2", "(Less($open, $close)-$low)/($high-$low+1e-12)", "下影线(振幅归一)"),
    ("KSFT", "(2*$close-$high-$low)/$open", "收盘偏移"),
    ("KSFT2", "(2*$close-$high-$low)/($high-$low+1e-12)", "收盘偏移(振幅归一)"),
]


def _alpha158_rolling_ops() -> list[tuple[str, str, Callable[[int], str]]]:
    """返回 Alpha158 滚动算子 (算子名, 中文, d -> qlib 表达式)，顺序同 loader.py。"""
    return [
        ("ROC", "变动率", lambda d: f"Ref($close, {d})/$close"),
        ("MA", "均线比", lambda d: f"Mean($close, {d})/$close"),
        ("STD", "波动率比", lambda d: f"Std($close, {d})/$close"),
        ("BETA", "斜率", lambda d: f"Slope($close, {d})/$close"),
        ("RSQR", "趋势R方", lambda d: f"Rsquare($close, {d})"),
        ("RESI", "回归残差", lambda d: f"Resi($close, {d})/$close"),
        ("MAX", "最高价比", lambda d: f"Max($high, {d})/$close"),
        ("MIN", "最低价比", lambda d: f"Min($low, {d})/$close"),
        ("QTLU", "80分位比", lambda d: f"Quantile($close, {d}, 0.8)/$close"),
        ("QTLD", "20分位比", lambda d: f"Quantile($close, {d}, 0.2)/$close"),
        ("RANK", "价格分位", lambda d: f"Rank($close, {d})"),
        (
            "RSV",
            "随机指标",
            lambda d: f"($close-Min($low, {d}))/(Max($high, {d})-Min($low, {d})+1e-12)",
        ),
        ("IMAX", "高点距今天数", lambda d: f"IdxMax($high, {d})/{d}"),
        ("IMIN", "低点距今天数", lambda d: f"IdxMin($low, {d})/{d}"),
        (
            "IMXD",
            "高低点间隔",
            lambda d: f"(IdxMax($high, {d})-IdxMin($low, {d}))/{d}",
        ),
        ("CORR", "价量相关", lambda d: f"Corr($close, Log($volume+1), {d})"),
        (
            "CORD",
            "价量变化相关",
            lambda d: f"Corr($close/Ref($close,1), Log($volume/Ref($volume, 1)+1), {d})",
        ),
        ("CNTP", "上涨天数占比", lambda d: f"Mean($close>Ref($close, 1), {d})"),
        ("CNTN", "下跌天数占比", lambda d: f"Mean($close<Ref($close, 1), {d})"),
        (
            "CNTD",
            "涨跌天数差",
            lambda d: f"Mean($close>Ref($close, 1), {d})-Mean($close<Ref($close, 1), {d})",
        ),
        (
            "SUMP",
            "涨幅占比",
            lambda d: f"Sum(Greater($close-Ref($close, 1), 0), {d})"
            f"/(Sum(Abs($close-Ref($close, 1)), {d})+1e-12)",
        ),
        (
            "SUMN",
            "跌幅占比",
            lambda d: f"Sum(Greater(Ref($close, 1)-$close, 0), {d})"
            f"/(Sum(Abs($close-Ref($close, 1)), {d})+1e-12)",
        ),
        (
            "SUMD",
            "涨跌占比差",
            lambda d: f"(Sum(Greater($close-Ref($close, 1), 0), {d})"
            f"-Sum(Greater(Ref($close, 1)-$close, 0), {d}))"
            f"/(Sum(Abs($close-Ref($close, 1)), {d})+1e-12)",
        ),
        ("VMA", "量均线比", lambda d: f"Mean($volume, {d})/($volume+1e-12)"),
        ("VSTD", "量波动比", lambda d: f"Std($volume, {d})/($volume+1e-12)"),
        (
            "WVMA",
            "量价波动",
            lambda d: f"Std(Abs($close/Ref($close, 1)-1)*$volume, {d})"
            f"/(Mean(Abs($close/Ref($close, 1)-1)*$volume, {d})+1e-12)",
        ),
        (
            "VSUMP",
            "增量占比",
            lambda d: f"Sum(Greater($volume-Ref($volume, 1), 0), {d})"
            f"/(Sum(Abs($volume-Ref($volume, 1)), {d})+1e-12)",
        ),
        (
            "VSUMN",
            "减量占比",
            lambda d: f"Sum(Greater(Ref($volume, 1)-$volume, 0), {d})"
            f"/(Sum(Abs($volume-Ref($volume, 1)), {d})+1e-12)",
        ),
        (
            "VSUMD",
            "增减量占比差",
            lambda d: f"(Sum(Greater($volume-Ref($volume, 1), 0), {d})"
            f"-Sum(Greater(Ref($volume, 1)-$volume, 0), {d}))"
            f"/(Sum(Abs($volume-Ref($volume, 1)), {d})+1e-12)",
        ),
    ]


_ALPHA360_GROUPS: list[tuple[str, str, str]] = [
    ("CLOSE", "close", "收盘价"),
    ("OPEN", "open", "开盘价"),
    ("HIGH", "high", "最高价"),
    ("LOW", "low", "最低价"),
    ("VWAP", "vwap", "均价"),
    ("VOLUME", "volume", "成交量"),
]


def build_items() -> list[dict[str, str]]:
    """构造全量 qlib 因子条目（含不可翻译项，由 translate 阶段筛掉）。"""
    items: list[dict[str, str]] = []

    def add(source: str, name: str, expr: str, category: str, zh: str) -> None:
        items.append(
            {
                "source": source,
                "name": f"{source}_{name}",
                "qlib_name": name,
                "qlib_expr": expr,
                "category": category,
                "zh": zh,
                "label": f"{name} · {zh}",
            }
        )

    # Alpha158 · kbar
    for name, expr, zh in _ALPHA158_KBAR:
        add("alpha158", name, expr, "qlib/alpha158/kbar", zh)

    # Alpha158 · price（默认 windows=[0]，feature=OPEN/HIGH/LOW/VWAP）
    for field, zh in (("open", "开盘价"), ("high", "最高价"), ("low", "最低价"), ("vwap", "均价")):
        add("alpha158", field.upper() + "0", f"${field}/$close", "qlib/alpha158/price", f"{zh}/收盘价")

    # Alpha158 · rolling（默认 windows=[5,10,20,30,60]，全部算子）
    for op, zh, build in _alpha158_rolling_ops():
        for d in ALPHA158_WINDOWS:
            add("alpha158", f"{op}{d}", build(d), f"qlib/alpha158/rolling/{op}", zh)

    # Alpha360 · 6 组 × 60 日
    for gname, field, zh in _ALPHA360_GROUPS:
        for d in ALPHA360_WINDOWS:
            if field == "volume":
                expr = (
                    f"Ref($volume, {d})/($volume+1e-12)"
                    if d != 0
                    else "$volume/($volume+1e-12)"
                )
            else:
                expr = f"Ref(${field}, {d})/$close" if d != 0 else f"${field}/$close"
            add("alpha360", f"{gname}{d}", expr, f"qlib/alpha360/{gname}", f"{zh}({d}日前)")

    return items


# --------------------------------------------------------------------------- #
# 翻译：qlib 表达式 → AKQuant 表达式
# --------------------------------------------------------------------------- #


def _substitute_fields(expr: str) -> str:
    def repl(m: re.Match[str]) -> str:
        raw = m.group(1)
        return _FIELD_MAP.get(raw.lower(), raw.capitalize())

    return re.sub(r"\$([A-Za-z_][A-Za-z0-9_]*)", repl, expr)


def _call(name: str, args: list[ast.expr]) -> ast.Call:
    return ast.Call(func=ast.Name(id=name, ctx=ast.Load()), args=args, keywords=[])


class _Translator(ast.NodeTransformer):
    def visit_Call(self, node: ast.Call) -> ast.AST:
        self.generic_visit(node)
        if not isinstance(node.func, ast.Name):
            raise Untranslatable("仅支持简单函数调用")
        fn = node.func.id

        if fn in _UNSUPPORTED_OPS:
            raise Untranslatable(f"算子 {fn} 在 AKQuant 中无对应实现")

        if fn in _COND_MAP:
            if len(node.args) != 2:
                raise Untranslatable(f"{fn} 需要 2 个参数")
            a, b = node.args
            cond = ast.Compare(left=a, ops=[_COND_MAP[fn]()], comparators=[b])
            return _call("If", [cond, a, b])

        if fn in _RENAME:
            return _call(_RENAME[fn], list(node.args))

        raise Untranslatable(f"未知算子 {fn}")


def _columns_of(node: ast.AST) -> set[str]:
    func_ids = {
        id(n.func)
        for n in ast.walk(node)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
    }
    return {
        n.id
        for n in ast.walk(node)
        if isinstance(n, ast.Name) and id(n) not in func_ids
    }


def _func_names_of(node: ast.AST) -> set[str]:
    return {
        n.func.id
        for n in ast.walk(node)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)
    }


def translate(qlib_expr: str) -> str:
    """把一条 qlib 表达式翻译成 AKQuant 表达式；不可翻译时抛 Untranslatable。"""
    src = _substitute_fields(qlib_expr)
    try:
        tree = ast.parse(src, mode="eval")
    except SyntaxError as exc:
        raise Untranslatable(f"语法解析失败: {exc}") from exc

    body = _Translator().visit(tree.body)

    unknown_cols = _columns_of(body) - COLUMNS
    if unknown_cols:
        raise Untranslatable("引用了不支持的行情列 " + "/".join(sorted(unknown_cols)))

    unknown_ops = _func_names_of(body) - _WHITELIST_OPS
    if unknown_ops:
        raise Untranslatable("产物含白名单外算子 " + "/".join(sorted(unknown_ops)))

    expr = ast.Expression(body=body)
    ast.fix_missing_locations(expr)
    return ast.unparse(expr)


# --------------------------------------------------------------------------- #
# 写库
# --------------------------------------------------------------------------- #

_INSERT_SQL = """
INSERT INTO factor_registry
    (name, label, category, direction, default_params, description,
     created_by, expression, is_public, kind)
VALUES (%s, %s, %s, 1, NULL, %s, 'system', %s, true, 'expression')
ON CONFLICT (name) DO UPDATE SET
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    expression = EXCLUDED.expression,
    is_public = EXCLUDED.is_public,
    kind = EXCLUDED.kind
"""


def upsert(items: list[dict[str, str]]) -> int:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            for it in items:
                cur.execute(
                    _INSERT_SQL,
                    (
                        it["name"],
                        it["label"],
                        it["category"],
                        f"qlib {it['source']} · {it['qlib_expr']}",
                        it["expression"],
                    ),
                )
        conn.commit()
    finally:
        conn.close()
    return len(items)


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导入 qlib Alpha158/Alpha360 因子到 factor_registry")
    parser.add_argument("--dry-run", action="store_true", help="只输出报告，不写库")
    parser.add_argument("--skip-validate", action="store_true", help="跳过真实日线试跑（仅翻译）")
    parser.add_argument("--limit", type=int, default=None, help="只处理前 N 条可翻译因子（冒烟）")
    parser.add_argument("--report", default=None, help="把跳过明细写成 JSON 到该路径")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    built = build_items()
    translated: list[dict[str, str]] = []
    skipped: list[dict[str, str]] = []

    for it in built:
        try:
            it = {**it, "expression": translate(it["qlib_expr"])}
        except Untranslatable as exc:
            skipped.append({**it, "reason": f"translate: {exc}"})
            continue
        translated.append(it)

    print(
        f"[import_qlib_factors] qlib 定义 {len(built)} 条 → 可翻译 {len(translated)}，"
        f"翻译阶段跳过 {len(skipped)}"
    )

    if args.limit:
        translated = translated[: args.limit]

    if not args.skip_validate:
        from factor_validate import validate_factor_expression_runnable

        validated: list[dict[str, str]] = []
        for i, it in enumerate(translated, 1):
            res = validate_factor_expression_runnable(it["expression"])
            if res["valid"]:
                validated.append(it)
            else:
                skipped.append(
                    {**it, "reason": f"validate:{res['stage']}: {res['reason']}"}
                )
            if i % 50 == 0:
                print(f"  校验进度 {i}/{len(translated)} …")
        print(f"[import_qlib_factors] 运行校验通过 {len(validated)}/{len(translated)}")
        translated = validated

    # 分类汇总
    by_category: dict[str, int] = {}
    for it in translated:
        by_category[it["category"]] = by_category.get(it["category"], 0) + 1
    print("[import_qlib_factors] 各分类可入库数量：")
    for cat in sorted(by_category):
        print(f"  {cat}: {by_category[cat]}")

    if args.report:
        report_path = Path(args.report).expanduser()
        report_path.write_text(
            json.dumps(
                {
                    "built": len(built),
                    "translated": len(translated),
                    "skipped": skipped,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"[import_qlib_factors] 跳过明细已写入 {report_path.resolve()}")

    if skipped:
        print("[import_qlib_factors] 跳过明细（前 40 条）：")
        for it in skipped[:40]:
            print(f"  - {it['name']} ({it['qlib_expr']}) → {it['reason']}")
        if len(skipped) > 40:
            print(f"  … 其余 {len(skipped) - 40} 条见 --report")

    if args.dry_run:
        print("[import_qlib_factors] dry-run：未写入数据库")
        return 0

    written = upsert(translated)
    print(f"[import_qlib_factors] 已写入 factor_registry：{written} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
