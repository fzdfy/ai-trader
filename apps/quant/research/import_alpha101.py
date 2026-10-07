"""把 WorldQuant Alpha101 因子导入本地 ``factor_registry``。

Alpha101 原始公式来自 "101 Formulaic Alphas"（Zura Kakushadze, 2015）。本脚本内联
DolphinDB ``wq101alpha.dos`` 中 **82 条无行业中性化** 因子的语义，逐条手工翻译成
AKQuant 表达式后写库，供选股/因子页直接使用。

为什么手工翻译而非解析 DolphinDB
--------------------------------
``akquant`` 的 ``ExpressionParser`` 只接受 **单一表达式**（``ast.parse(mode="eval")``），
而 DolphinDB 源码是带中间变量赋值的多行函数体。中间变量在此已被 **内联展开**，
因此每条因子直接给出等价的 AKQuant 单表达式。

翻译规则（DolphinDB → AKQuant）
-------------------------------
- ``ratios(close)`` → ``Close/Ref(Close,1)``；``returns`` = ``Close/Ref(Close,1)-1``（内联）。
- ``adv{d}`` → ``Mean(Volume, d)``。
- ``mfirst(x, n)``（窗首，n-1 根前）→ ``Ref(x, n-1)``。
- ``delay(x, d)`` → ``Ref(x, d)``。
- ``mavg(x, 1..d)``（线性衰减均）→ ``DecayLinear(x, d)``。
- ``mcorr`` → ``Corr``；``mcovar`` → ``Cov``；``msum`` → ``Sum``；``mstd`` → ``Std``；
  ``mmin`` → ``Min``；``mmax`` → ``Max``；``mprod`` → ``Product``。
- ``mrank(x, true, d)`` → ``Ts_Rank(x, d)``；``rowRank(x, true)`` → ``Rank``（截面）。
- ``mimax`` → ``ArgMax``；``mimin`` → ``ArgMin``（0 = 今天）。
- ``iif`` → ``If``；``sign`` → ``Sign``；``abs`` → ``Abs``；``log`` → ``Log``。
- ``pow(a, b)`` / ``a^b`` → ``a ** b``；DolphinDB 整除符 ``\\`` → ``/``。
- ``x / rowSum(abs(x))`` → ``Scale(x)``（截面归一）。
- ``||`` 逻辑或按等价改写为比较（如 ``(1 < x) || (x == 1)`` → ``x >= 1``）。
- 逐元素 ``max(a, b)`` / ``min(a, b)`` → ``If(a > b, a, b)`` / ``If(a < b, a, b)`
  （**绝不可**用滚动 ``Max``/``Min``）。
- 布尔值参与数值运算前用 ``If(cond, 1, 0)`` 显式转数值。
- 非整数窗口四舍五入到最近整数。

跳过的因子（19 条）
------------------
含行业中性化（``IndNeutralize`` / ``IndClass`` / ``contextby``）或需要市值 ``cap`` 的
因子，本项目无行业分类与市值数据，一律跳过：
alpha 48, 56, 58, 59, 63, 67, 69, 70, 76, 79, 80, 82, 87, 89, 90, 91, 93, 97, 100。

导入口径：``kind='expression'``、``created_by='system'``、``is_public=true``、
``direction=1``；``name`` 前缀 ``alpha101_``。写库前逐条经 ``factor_validate`` 的
``validate_factor_expression_runnable`` 在真实日线样本上试跑，跑不通的不入库。

用法（在 apps/quant 目录下执行）：

    # 全量导入（自检 + 逐条校验 + 写库）
    ./.venv/bin/python research/import_alpha101.py

    # 先看报告不写库；跳过运行校验（快，仅做语法/白名单自检）
    ./.venv/bin/python research/import_alpha101.py --dry-run --skip-validate

    # 冒烟：只处理前 20 条
    ./.venv/bin/python research/import_alpha101.py --limit 20

    # 把跳过明细写到文件
    ./.venv/bin/python research/import_alpha101.py --report research/alpha101_import_skipped.json
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import sys
from pathlib import Path
from typing import Any

import psycopg2

_QUANT_ROOT = Path(__file__).resolve().parent.parent
if str(_QUANT_ROOT) not in sys.path:
    sys.path.insert(0, str(_QUANT_ROOT))

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgres://ai-trader:aitrader123@localhost:5432/aitrader"
)

# AKQuant 白名单行情列（与前端 / 服务端 factor-generator.ts 一致）
COLUMNS = {"Close", "Open", "High", "Low", "Volume", "Vwap"}

# 翻译结果允许出现的算子（服务端白名单全量），用于自检
_WHITELIST_OPS = {
    "Mean", "Ts_Mean", "Std", "Ts_Std", "Max", "Ts_Max", "Min", "Ts_Min",
    "Sum", "Ts_Sum", "Corr", "Ts_Corr", "Cov", "Ts_Cov", "Ref", "Delay",
    "Delta", "ArgMax", "Ts_ArgMax", "ArgMin", "Ts_ArgMin", "Ts_Rank", "Rank",
    "Scale", "Standardize", "ZScore", "Winsorize", "WinsorizeQuantile",
    "Neutralize", "IndNeutralize", "Log", "Abs", "Sign", "SignedPower", "If",
    "Quantile", "Slope", "Rsquare", "Resi", "Product", "DecayLinear",
}

SOURCE = "alpha101"
CATEGORY = "alpha101"


class Untranslatable(Exception):
    """该因子无法翻译成合法的 AKQuant 表达式。"""


# --------------------------------------------------------------------------- #
# Alpha101 因子定义（n, 中文简介, 原始公式, AKQuant 表达式）
# --------------------------------------------------------------------------- #
_FACTORS: list[tuple[int, str, str, str]] = [
    (
        1,
        "条件波动率排名",
        "rank(Ts_ArgMax(SignedPower((returns<0?stddev(returns,20):close), 2), 5))-0.5",
        "Rank(ArgMax(If((Close/Ref(Close,1)-1) < 0, Std(Close/Ref(Close,1)-1, 20), Close) ** 2, 5)) - 0.5",
    ),
    (
        2,
        "量变动与涨跌相关",
        "(-1 * correlation(rank(delta(log(volume), 2)), rank(((close - open) / open)), 6))",
        "-Corr(Rank(Log(Volume) - Log(Ref(Volume,2))), Rank((Close - Open)/Open), 6)",
    ),
    (
        3,
        "开盘量排名相关",
        "(-1 * correlation(rank(open), rank(volume), 10))",
        "-Corr(Rank(Open), Rank(Volume), 10)",
    ),
    (
        4,
        "低价时序排名",
        "(-1 * Ts_Rank(rank(low), 9))",
        "-Ts_Rank(Rank(Low), 9)",
    ),
    (
        5,
        "开盘偏离×收盘偏位",
        "(rank((open - (sum(vwap, 10) / 10))) * (-1 * abs(rank((close - vwap)))))",
        "Rank(Open - Sum(Vwap,10)/10) * (-1 * Abs(Rank(Close - Vwap)))",
    ),
    (
        6,
        "开盘量相关",
        "(-1 * correlation(open, volume, 10))",
        "-Corr(Open, Volume, 10)",
    ),
    (
        7,
        "量能动量",
        "((adv20 < volume) ? ((-1 * ts_rank(abs(delta(close, 7)), 60)) * sign(delta(close, 7))) : (-1 * 1))",
        "If(Mean(Volume,20) < Volume, -Ts_Rank(Abs(Close - Ref(Close,7)),60) * Sign(Close - Ref(Close,7)), -1)",
    ),
    (
        8,
        "开仓动量延迟差",
        "(-1 * rank(((sum(open, 5) * sum(returns, 5)) - delay((sum(open, 5) * sum(returns, 5)), 10))))",
        "-Rank(Sum(Open,5) * Sum(Close/Ref(Close,1)-1,5) - Ref(Sum(Open,5) * Sum(Close/Ref(Close,1)-1,5), 10))",
    ),
    (
        9,
        "收盘价变动方向",
        "((0 < ts_min(delta(close, 1), 5)) ? delta(close, 1) : ((ts_max(delta(close, 1), 5) < 0) ? delta(close, 1) : (-1 * delta(close, 1))))",
        "If(0 < Min(Close - Ref(Close,1),5), Close - Ref(Close,1), If(Max(Close - Ref(Close,1),5) < 0, Close - Ref(Close,1), -(Close - Ref(Close,1))))",
    ),
    (
        10,
        "收盘价变动方向排名",
        "rank(((0 < ts_min(delta(close, 1), 4)) ? delta(close, 1) : ((ts_max(delta(close, 1), 4) < 0) ? delta(close, 1) : (-1 * delta(close, 1)))))",
        "Rank(If(0 < Min(Close - Ref(Close,1),4), Close - Ref(Close,1), If(Max(Close - Ref(Close,1),4) < 0, Close - Ref(Close,1), -(Close - Ref(Close,1)))))",
    ),
    (
        11,
        "均价偏离与量变",
        "((rank(ts_max((vwap - close), 3)) + rank(ts_min((vwap - close), 3))) * rank(delta(volume, 3)))",
        "(Rank(Max(Vwap - Close,3)) + Rank(Min(Vwap - Close,3))) * Rank(Volume - Ref(Volume,3))",
    ),
    (
        12,
        "量价方向",
        "(sign(delta(volume, 1)) * (-1 * delta(close, 1)))",
        "Sign(Volume - Ref(Volume,1)) * (-1 * (Close - Ref(Close,1)))",
    ),
    (
        13,
        "收盘量协方差排名",
        "(-1 * rank(covariance(rank(close), rank(volume), 5)))",
        "-Rank(Cov(Rank(Close), Rank(Volume), 5))",
    ),
    (
        14,
        "收益变动与开量协方差",
        "((-1 * rank(delta(returns, 3))) * correlation(open, volume, 10))",
        "-Rank(Close/Ref(Close,1)-1 - Ref(Close/Ref(Close,1)-1, 3)) * Cov(Open, Volume, 10)",
    ),
    (
        15,
        "高价量相关求和",
        "(-1 * sum(rank(correlation(rank(high), rank(volume), 3)), 3))",
        "-Sum(Rank(Corr(Rank(High), Rank(Volume), 3)), 3)",
    ),
    (
        16,
        "高价量协方差排名",
        "(-1 * rank(covariance(rank(high), rank(volume), 5)))",
        "-Rank(Cov(Rank(High), Rank(Volume), 5))",
    ),
    (
        17,
        "量价三因子",
        "(((-1 * rank(ts_rank(close, 10))) * rank(delta(delta(close, 1), 1))) * rank(ts_rank((volume / adv20), 5)))",
        "-Rank(Ts_Rank(Close,10)) * Rank((Close - Ref(Close,1)) - Ref(Close - Ref(Close,1),1)) * Rank(Ts_Rank(Volume/Mean(Volume,20),5))",
    ),
    (
        18,
        "振幅相关",
        "(-1 * rank(((stddev(abs((close - open)), 5) + (close - open)) + correlation(close, open, 10))))",
        "-Rank(Std(Abs(Close - Open),5) + Close - Open + Corr(Close, Open, 10))",
    ),
    (
        19,
        "收盘动量",
        "((-1 * sign(((close - delay(close, 7)) + delta(close, 7)))) * (1 + rank((1 + sum(returns, 250)))))",
        "-Sign(Close - Ref(Close,7) + Close - Ref(Close,7)) * (1 + Rank(1 + Sum(Close/Ref(Close,1)-1, 250)))",
    ),
    (
        20,
        "开盘跳空排名",
        "(((-1 * rank((open - delay(high, 1)))) * rank((open - delay(close, 1)))) * rank((open - delay(low, 1))))",
        "-Rank(Open - Ref(High,1)) * Rank(Open - Ref(Close,1)) * Rank(Open - Ref(Low,1))",
    ),
    (
        21,
        "均线量能条件",
        "((((sum(close, 8) / 8) + stddev(close, 8)) < (sum(close, 2) / 2)) ? (-1 * 1) : (((sum(close, 2) / 2) < ((sum(close, 8) / 8) - stddev(close, 8))) ? 1 : (((1 < (volume / adv20)) || ((volume / adv20) == 1)) ? 1 : (-1 * 1))))",
        "If((Sum(Close,8)/8 + Std(Close,8)) < (Sum(Close,2)/2), -1, If((Sum(Close,2)/2) < (Sum(Close,8)/8 - Std(Close,8)), 1, If(Volume/Mean(Volume,20) >= 1, 1, -1)))",
    ),
    (
        22,
        "量价相关变动",
        "(-1 * (delta(correlation(high, volume, 5), 5) * rank(stddev(close, 20))))",
        "-(Corr(High, Volume, 5) - Ref(Corr(High, Volume, 5),5)) * Rank(Std(Close,20))",
    ),
    (
        23,
        "高价偏离",
        "(((sum(high, 20) / 20) < high) ? (-1 * delta(high, 2)) : 0)",
        "If(Sum(High,20)/20 < High, -(High - Ref(High,2)), 0)",
    ),
    (
        24,
        "长期收盘偏离",
        "((((delta((sum(close, 100) / 100), 100) / delay(close, 100)) < 0.05) || ((delta((sum(close, 100) / 100), 100) / delay(close, 100)) == 0.05)) ? (-1 * (close - ts_min(close, 100))) : (-1 * delta(close, 3)))",
        "If((Sum(Close,100)/100 - Ref(Sum(Close,100)/100,100)) / Ref(Close,100) <= 0.05, -(Close - Min(Close,100)), -(Close - Ref(Close,3)))",
    ),
    (
        25,
        "收益量价",
        "rank(((((-1 * returns) * adv20) * vwap) * (high - close)))",
        "Rank(-(Close/Ref(Close,1)-1) * Mean(Volume,20) * Vwap * (High - Close))",
    ),
    (
        26,
        "量高价时序排名相关",
        "(-1 * ts_max(correlation(ts_rank(volume, 5), ts_rank(high, 5), 5), 3))",
        "-Max(Corr(Ts_Rank(Volume,5), Ts_Rank(High,5), 5), 3)",
    ),
    (
        27,
        "量价相关排名",
        "((0.5 < rank((sum(correlation(rank(volume), rank(vwap), 6), 2) / 2.0))) ? (-1 * 1) : 1)",
        "If(0.5 < Rank(Sum(Corr(Rank(Volume), Rank(Vwap), 6), 2)/2.0), -1, 1)",
    ),
    (
        28,
        "均量低价相关",
        "scale(((correlation(adv20, low, 5) + ((high + low) / 2)) - close))",
        "Scale(Corr(Mean(Volume,20), Low, 5) + (High + Low)/2 - Close)",
    ),
    (
        29,
        "多层排名对数",
        "(min(product(rank(rank(scale(log(sum(ts_min(rank(rank((-1 * rank(delta((close - 1), 5))))), 2), 1))))), 1), 5) + ts_rank(delay((-1 * returns), 6), 5))",
        "Min(Rank(Rank(Scale(Log(Min(Rank(Rank(-Rank((Close - 1) - Ref(Close - 1, 5)))),2))))),5) + Ts_Rank(Ref(-(Close/Ref(Close,1)-1), 6), 5)",
    ),
    (
        30,
        "收盘方向量比",
        "(((1.0 - rank(((sign((close - delay(close, 1))) + sign((delay(close, 1) - delay(close, 2)))) + sign((delay(close, 2) - delay(close, 3)))))) * sum(volume, 5)) / sum(volume, 20))",
        "(1.0 - Rank(Sign(Close - Ref(Close,1)) + Sign(Ref(Close,1) - Ref(Close,2)) + Sign(Ref(Close,2) - Ref(Close,3)))) * Sum(Volume,5) / Sum(Volume,20)",
    ),
    (
        31,
        "衰减线性复合",
        "((rank(rank(rank(decay_linear((-1 * rank(rank(delta(close, 10)))), 10)))) + rank((-1 * delta(close, 3)))) + sign(scale(correlation(adv20, low, 12))))",
        "Rank(Rank(Rank(DecayLinear(-Rank(Rank(Close - Ref(Close,10))), 10)))) + Rank(-(Close - Ref(Close,3))) + Sign(Scale(Corr(Mean(Volume,20), Low, 12)))",
    ),
    (
        32,
        "收盘偏离与均价相关",
        "(scale(((sum(close, 7) / 7) - close)) + (20 * scale(correlation(vwap, delay(close, 5), 230))))",
        "Scale(Sum(Close,7)/7 - Close) + 20 * Scale(Corr(Vwap, Ref(Close,5), 230))",
    ),
    (
        33,
        "开盘收盘比",
        "rank((-1 * ((1 - (open / close))^1)))",
        "Rank(Open/Close - 1)",
    ),
    (
        34,
        "收益波动比排名",
        "rank(((1 - rank((stddev(returns, 2) / stddev(returns, 5)))) + (1 - rank(delta(close, 1)))))",
        "Rank(1 - Rank(Std(Close/Ref(Close,1)-1,2)/Std(Close/Ref(Close,1)-1,5)) + 1 - Rank(Close - Ref(Close,1)))",
    ),
    (
        35,
        "量价时序排名",
        "((Ts_Rank(volume, 32) * (1 - Ts_Rank(((close + high) - low), 16))) * (1 - Ts_Rank(returns, 32)))",
        "Ts_Rank(Volume,32) * (1 - Ts_Rank(Close + High - Low,16)) * (1 - Ts_Rank(Close/Ref(Close,1)-1,32))",
    ),
    (
        36,
        "价量多因子",
        "(((((2.21 * rank(correlation((close - open), delay(volume, 1), 15))) + (0.7 * rank((open - close)))) + (0.73 * rank(Ts_Rank(delay((-1 * returns), 6), 5)))) + rank(abs(correlation(vwap, adv20, 6)))) + (0.6 * rank((((sum(close, 200) / 200) - open) * (close - open)))))",
        "2.21 * Rank(Corr(Close - Open, Ref(Volume,1), 15)) + 0.7 * Rank(Open - Close) + 0.73 * Rank(Ts_Rank(Ref(-(Close/Ref(Close,1)-1),6),5)) + Rank(Abs(Corr(Vwap, Mean(Volume,20), 6))) + 0.6 * Rank((Sum(Close,200)/200 - Open) * (Close - Open))",
    ),
    (
        37,
        "开收差相关",
        "(rank(correlation(delay((open - close), 1), close, 200)) + rank((open - close)))",
        "Rank(Corr(Ref(Open - Close,1), Close, 200)) + Rank(Open - Close)",
    ),
    (
        38,
        "收盘时序排名与开收比",
        "((-1 * rank(Ts_Rank(close, 10))) * rank((close / open)))",
        "-Rank(Ts_Rank(Close,10)) * Rank(Close/Open)",
    ),
    (
        39,
        "量比衰减与收益",
        "((-1 * rank((delta(close, 7) * (1 - rank(decay_linear((volume / adv20), 9)))))) * (1 + rank(sum(returns, 250))))",
        "-Rank((Close - Ref(Close,7)) * (1 - Rank(DecayLinear(Volume/Mean(Volume,20),9)))) * (1 + Rank(Sum(Close/Ref(Close,1)-1,250)))",
    ),
    (
        40,
        "高价波动与量相关",
        "((-1 * rank(stddev(high, 10))) * correlation(high, volume, 10))",
        "-Rank(Std(High,10)) * Corr(High, Volume, 10)",
    ),
    (
        41,
        "几何均值偏离",
        "(((high * low)^0.5) - vwap)",
        "(High * Low) ** 0.5 - Vwap",
    ),
    (
        42,
        "均价偏位比",
        "(rank((vwap - close)) / rank((vwap + close)))",
        "Rank(Vwap - Close) / Rank(Vwap + Close)",
    ),
    (
        43,
        "量比与收盘变动排名",
        "(ts_rank((volume / adv20), 20) * ts_rank((-1 * delta(close, 7)), 8))",
        "Ts_Rank(Volume/Mean(Volume,20),20) * Ts_Rank(-(Close - Ref(Close,7)),8)",
    ),
    (
        44,
        "高价与量排名相关",
        "(-1 * correlation(high, rank(volume), 5))",
        "-Corr(High, Rank(Volume), 5)",
    ),
    (
        45,
        "多相关量价",
        "(-1 * ((rank((sum(delay(close, 5), 20) / 20)) * correlation(close, volume, 2)) * rank(correlation(sum(close, 5), sum(close, 20), 2))))",
        "-Rank(Sum(Ref(Close,5),20)/20) * Corr(Close, Volume, 2) * Rank(Corr(Sum(Close,5), Sum(Close,20), 2))",
    ),
    (
        46,
        "收盘趋势条件",
        "((0.25 < (((delay(close, 20) - delay(close, 10)) / 10) - ((delay(close, 10) - close) / 10))) ? (-1 * 1) : (((((delay(close, 20) - delay(close, 10)) / 10) - ((delay(close, 10) - close) / 10)) < 0) ? 1 : ((-1 * 1) * (close - delay(close, 1)))))",
        "If(0.25 < ((Ref(Close,20) - Ref(Close,10))/10 - (Ref(Close,10) - Close)/10), -1, If(((Ref(Close,20) - Ref(Close,10))/10 - (Ref(Close,10) - Close)/10) < 0, 1, Ref(Close,1) - Close))",
    ),
    (
        47,
        "价格量比复合",
        "((((rank((1 / close)) * volume) / adv20) * ((high * rank((high - close))) / (sum(high, 5) / 5))) - rank((vwap - delay(vwap, 5))))",
        "Rank(1/Close) * Volume / Mean(Volume,20) * (High * Rank(High - Close) / (Sum(High,5)/5)) - Rank(Vwap - Ref(Vwap,5))",
    ),
    (
        49,
        "收盘趋势条件",
        "(((((delay(close, 20) - delay(close, 10)) / 10) - ((delay(close, 10) - close) / 10)) < (-1 * 0.1)) ? 1 : ((-1 * 1) * (close - delay(close, 1))))",
        "If(((Ref(Close,20) - Ref(Close,10))/10 - (Ref(Close,10) - Close)/10) < -0.1, 1, Ref(Close,1) - Close)",
    ),
    (
        50,
        "量价相关排名最大",
        "(-1 * ts_max(rank(correlation(rank(volume), rank(vwap), 5)), 5))",
        "-Max(Rank(Corr(Rank(Volume), Rank(Vwap), 5)), 5)",
    ),
    (
        51,
        "收盘趋势条件",
        "(((((delay(close, 20) - delay(close, 10)) / 10) - ((delay(close, 10) - close) / 10)) < (-1 * 0.05)) ? 1 : ((-1 * 1) * (close - delay(close, 1))))",
        "If(((Ref(Close,20) - Ref(Close,10))/10 - (Ref(Close,10) - Close)/10) < -0.05, 1, -(Close - Ref(Close,1)))",
    ),
    (
        52,
        "最低价与收益",
        "((((-1 * ts_min(low, 5)) + delay(ts_min(low, 5), 5)) * rank(((sum(returns, 240) - sum(returns, 20)) / 220))) * ts_rank(volume, 5))",
        "(-Min(Low,5) + Ref(Min(Low,5),5)) * Rank((Sum(Close/Ref(Close,1)-1,240) - Sum(Close/Ref(Close,1)-1,220))/220) * Ts_Rank(Volume,5)",
    ),
    (
        53,
        "收盘位置变化",
        "(-1 * delta((((close - low) - (high - close)) / (close - low)), 9))",
        "-((Close - Low - (High - Close))/(Close - Low) - Ref((Close - Low - (High - Close))/(Close - Low),9))",
    ),
    (
        54,
        "开收幂比",
        "((-1 * ((low - close) * (open^5))) / ((low - high) * (close^5)))",
        "-(Low - Close) * Open ** 5 / ((Low - High) * Close ** 5)",
    ),
    (
        55,
        "收盘位置排名相关",
        "(-1 * correlation(rank(((close - ts_min(low, 12)) / (ts_max(high, 12) - ts_min(low, 12)))), rank(volume), 6))",
        "-Corr(Rank((Close - Min(Low,12))/(Max(High,12) - Min(Low,12))), Rank(Volume), 6)",
    ),
    (
        57,
        "均价偏位与收盘排名",
        "(0 - (1 * ((close - vwap) / decay_linear(rank(ts_argmax(close, 30)), 2))))",
        "-(Close - Vwap) / DecayLinear(Rank(ArgMax(Close,30)), 2)",
    ),
    (
        60,
        "收盘位置与最高点",
        "(0 - (1 * ((2 * scale(rank(((((close - low) - (high - close)) / (high - low)) * volume)))) - scale(rank(ts_argmax(close, 10))))))",
        "-(2 * Scale(Rank((Close - Low - (High - Close))/(High - Low) * Volume)) - Scale(Rank(ArgMax(Close,10))))",
    ),
    (
        61,
        "均价与量相关",
        "(rank((vwap - ts_min(vwap, 16.1219))) < rank(correlation(vwap, adv180, 17.9282)))",
        "If(Rank(Vwap - Min(Vwap,16)) < Rank(Corr(Vwap, Mean(Volume,180), 18)), 1, 0)",
    ),
    (
        62,
        "均价量相关比较",
        "((rank(correlation(vwap, sum(adv20, 22.4101), 9.91009)) < rank(((rank(open) + rank(open)) < (rank(((high + low) / 2)) + rank(high))))) * -1)",
        "(Rank(Corr(Vwap, Sum(Mean(Volume,20),22), 10)) < Rank(If((Rank(Open) + Rank(Open)) < (Rank((High + Low)/2) + Rank(High)), 1, 0))) * (-1)",
    ),
    (
        64,
        "加权价格相关",
        "((rank(correlation(sum(((open * 0.178404) + (low * (1 - 0.178404))), 12.7054), sum(adv120, 12.7054), 16.6208)) < rank(delta(((((high + low) / 2) * 0.178404) + (vwap * (1 - 0.178404))), 3.69741))) * -1)",
        "(Rank(Corr(Sum(Open * 0.178404 + Low * (1 - 0.178404),13), Sum(Mean(Volume,120),13), 17)) < Rank(((High + Low)/2 * 0.178404 + Vwap * (1 - 0.178404)) - Ref((High + Low)/2 * 0.178404 + Vwap * (1 - 0.178404),4))) * (-1)",
    ),
    (
        65,
        "加权价与开盘",
        "((rank(correlation(((open * 0.00817205) + (vwap * (1 - 0.00817205))), sum(adv60, 8.6911), 6.40374)) < rank((open - ts_min(open, 13.635)))) * -1)",
        "(Rank(Corr(Open * 0.00817205 + Vwap * (1 - 0.00817205), Sum(Mean(Volume,60),9), 6)) < Rank(Open - Min(Open,14))) * (-1)",
    ),
    (
        66,
        "衰减相关",
        "((rank(decay_linear(delta(vwap, 3.51013), 7.23052)) + Ts_Rank(decay_linear(((((low * 0.96633) + (low * (1 - 0.96633))) - vwap) / (open - ((high + low) / 2))), 11.4157), 6.72611)) * -1)",
        "(Rank(DecayLinear(Vwap - Ref(Vwap,4), 7)) + Ts_Rank(DecayLinear((Low - Vwap)/(Open - (High - Low)/2), 11), 11)) * (-1)",
    ),
    (
        68,
        "高价量相关",
        "((Ts_Rank(correlation(rank(high), rank(adv15), 8.91644), 13.9333) < rank(delta(((close * 0.518371) + (low * (1 - 0.518371))), 1.06157))) * -1)",
        "(Ts_Rank(Corr(Rank(High), Rank(Mean(Volume,15)), 9), 14) < Rank((Close * 0.518371 + Low * (1 - 0.518371)) - Ref(Close * 0.518371 + Low * (1 - 0.518371),1))) * (-1)",
    ),
    (
        71,
        "衰减相关最大",
        "max(Ts_Rank(decay_linear(correlation(Ts_Rank(close, 3.43976), Ts_Rank(adv180, 12.0647), 18.0175), 4.20501), 15.6948), Ts_Rank(decay_linear((rank(((low + open) - (vwap + vwap)))^2), 16.4662), 4.4388))",
        "If(Ts_Rank(DecayLinear(Corr(Ts_Rank(Close,3), Ts_Rank(Mean(Volume,180),12), 18), 4), 16) > Ts_Rank(DecayLinear(Rank(Low + Open - (Vwap + Vwap)) ** 2, 16), 4), Ts_Rank(DecayLinear(Corr(Ts_Rank(Close,3), Ts_Rank(Mean(Volume,180),12), 18), 4), 16), Ts_Rank(DecayLinear(Rank(Low + Open - (Vwap + Vwap)) ** 2, 16), 4))",
    ),
    (
        72,
        "衰减相关比",
        "(rank(decay_linear(correlation(((high + low) / 2), adv40, 8.93345), 10.1519)) / rank(decay_linear(correlation(Ts_Rank(vwap, 3.72469), Ts_Rank(volume, 18.5188), 6.86671), 2.95011)))",
        "Rank(DecayLinear(Corr((High + Low)/2, Mean(Volume,40), 9), 10)) / Rank(DecayLinear(Corr(Ts_Rank(Vwap,4), Ts_Rank(Volume,19), 7), 3))",
    ),
    (
        73,
        "衰减排名最大",
        "(max(rank(decay_linear(delta(vwap, 4.72775), 2.91864)), Ts_Rank(decay_linear(((delta(((open * 0.147155) + (low * (1 - 0.147155))), 2.03608) / ((open * 0.147155) + (low * (1 - 0.147155)))) * -1), 3.33829), 16.7411)) * -1)",
        "If(Rank(DecayLinear(Vwap - Ref(Vwap,5), 3)) > Ts_Rank(DecayLinear(((Open * 0.147155 + Low * (1 - 0.147155)) - Ref(Open * 0.147155 + Low * (1 - 0.147155),2)) / (Open * 0.147155 + Low * (1 - 0.147155)) * (-1), 3), 17), Rank(DecayLinear(Vwap - Ref(Vwap,5), 3)), Ts_Rank(DecayLinear(((Open * 0.147155 + Low * (1 - 0.147155)) - Ref(Open * 0.147155 + Low * (1 - 0.147155),2)) / (Open * 0.147155 + Low * (1 - 0.147155)) * (-1), 3), 17)) * (-1)",
    ),
    (
        74,
        "相关比较",
        "((rank(correlation(close, sum(adv30, 37.4843), 15.1365)) < rank(correlation(rank(((high * 0.0261661) + (vwap * (1 - 0.0261661)))), rank(volume), 11.4791))) * -1)",
        "(Rank(Corr(Close, Sum(Mean(Volume,30),37), 15)) < Rank(Corr(Rank(Rank(High * 0.0261661 + Vwap * (1 - 0.0261661))), Rank(Volume), 11))) * (-1)",
    ),
    (
        75,
        "均价量相关比较",
        "(rank(correlation(vwap, volume, 4.24304)) < rank(correlation(rank(low), rank(adv50), 12.4413)))",
        "If(Rank(Corr(Vwap, Volume, 4)) < Rank(Corr(Rank(Low), Rank(Mean(Volume,50)), 12)), 1, 0)",
    ),
    (
        77,
        "衰减相关最小",
        "min(rank(decay_linear(((((high + low) / 2) + high) - (vwap + high)), 20.0451)), rank(decay_linear(correlation(((high + low) / 2), adv40, 3.1614), 5.64125)))",
        "If(Rank(DecayLinear((High + Low)/2 - Vwap, 20)) < Rank(DecayLinear(Corr((High + Low)/2, Mean(Volume,40), 3), 6)), Rank(DecayLinear((High + Low)/2 - Vwap, 20)), Rank(DecayLinear(Corr((High + Low)/2, Mean(Volume,40), 3), 6)))",
    ),
    (
        78,
        "相关幂",
        "(rank(correlation(sum(((low * 0.352233) + (vwap * (1 - 0.352233))), 19.7428), sum(adv40, 19.7428), 6.83313))^rank(correlation(rank(vwap), rank(volume), 5.77492)))",
        "Rank(Corr(Sum(Low * 0.352233 + Vwap * (1 - 0.352233),20), Sum(Mean(Volume,40),20), 7)) ** Rank(Corr(Rank(Vwap), Rank(Volume), 6))",
    ),
    (
        81,
        "相关幂与量价",
        "((rank(Log(product(rank((rank(correlation(vwap, sum(adv10, 49.6054), 8.47743))^4)), 14.9655))) < rank(correlation(rank(vwap), rank(volume), 5.07914))) * -1)",
        "(Rank(Log(Product(Rank(Rank(Corr(Vwap, Sum(Mean(Volume,10),49), 8)) ** 4), 15))) < Rank(Corr(Rank(Vwap), Rank(Volume), 5))) * (-1)",
    ),
    (
        83,
        "量价复合",
        "((rank(delay(((high - low) / (sum(close, 5) / 5)), 2)) * rank(rank(volume))) / (((high - low) / (sum(close, 5) / 5)) / (vwap - close)))",
        "Rank(Ref((High - Low)/(Sum(Close,5)/5),2)) * Rank(Rank(Volume)) / (((High - Low)/(Sum(Close,5)/5))/(Vwap - Close))",
    ),
    (
        84,
        "均价偏离幂",
        "SignedPower(Ts_Rank((vwap - ts_max(vwap, 15.3217)), 20.7127), delta(close, 4.96796))",
        "Ts_Rank(Vwap - Max(Vwap,15), 20) ** (Close - Ref(Close,5))",
    ),
    (
        85,
        "相关幂",
        "(rank(correlation(((high * 0.876703) + (close * (1 - 0.876703))), adv30, 9.61331))^rank(correlation(Ts_Rank(((high + low) / 2), 3.70596), Ts_Rank(volume, 10.1595), 7.11408)))",
        "Rank(Corr(High * 0.876703 + Close * (1 - 0.876703), Mean(Volume,30), 10)) ** Rank(Corr(Ts_Rank((High + Low)/2,4), Ts_Rank(Volume,10), 7))",
    ),
    (
        86,
        "相关比较",
        "((Ts_Rank(correlation(close, sum(adv20, 14.7444), 6.00049), 20.4195) < rank(((open + close) - (vwap + open)))) * -1)",
        "(Ts_Rank(Corr(Close, Sum(Mean(Volume,20),15), 6), 20) < Rank(Close - Vwap)) * (-1)",
    ),
    (
        88,
        "衰减最小",
        "min(rank(decay_linear(((rank(open) + rank(low)) - (rank(high) + rank(close))), 8.06882)), Ts_Rank(decay_linear(correlation(Ts_Rank(close, 8.44728), Ts_Rank(adv60, 20.6966), 8.01266), 6.65053), 2.61957))",
        "If(Rank(DecayLinear(Rank(Open) + Rank(Low) - (Rank(High) + Rank(Close)), 8)) < Ts_Rank(DecayLinear(Corr(Ts_Rank(Close,8), Ts_Rank(Mean(Volume,60),21), 8), 7), 3), Rank(DecayLinear(Rank(Open) + Rank(Low) - (Rank(High) + Rank(Close)), 8)), Ts_Rank(DecayLinear(Corr(Ts_Rank(Close,8), Ts_Rank(Mean(Volume,60),21), 8), 7), 3))",
    ),
    (
        92,
        "衰减相关最小",
        "min(Ts_Rank(decay_linear(((((high + low) / 2) + close) < (low + open)), 14.7221), 18.8683), Ts_Rank(decay_linear(correlation(rank(low), rank(adv30), 7.58555), 6.94024), 6.80584))",
        "If(Ts_Rank(DecayLinear(If(((High + Low)/2 + Close) < (Low + Open), 1, 0), 15), 19) < Ts_Rank(DecayLinear(Corr(Rank(Low), Rank(Mean(Volume,30)), 8), 7), 7), Ts_Rank(DecayLinear(If(((High + Low)/2 + Close) < (Low + Open), 1, 0), 15), 19), Ts_Rank(DecayLinear(Corr(Rank(Low), Rank(Mean(Volume,30)), 8), 7), 7))",
    ),
    (
        94,
        "均价偏离幂",
        "((rank((vwap - ts_min(vwap, 11.5783)))^Ts_Rank(correlation(Ts_Rank(vwap, 19.6462), Ts_Rank(adv60, 4.02992), 18.0926), 2.70756)) * -1)",
        "(Rank(Vwap - Min(Vwap,12)) ** Ts_Rank(Corr(Ts_Rank(Vwap,20), Ts_Rank(Mean(Volume,60),4), 18), 3)) * (-1)",
    ),
    (
        95,
        "开盘偏离比较",
        "(rank((open - ts_min(open, 12.4105))) < Ts_Rank((rank(correlation(sum(((high + low) / 2), 19.1351), sum(adv40, 19.1351), 12.8742))^5), 11.7584))",
        "If(Rank(Open - Min(Open,12)) < Ts_Rank(Rank(Corr(Sum((High + Low)/2,19), Sum(Mean(Volume,40),19), 13)) ** 5, 12), 1, 0)",
    ),
    (
        96,
        "衰减相关最大",
        "(max(Ts_Rank(decay_linear(correlation(rank(vwap), rank(volume), 3.83878), 4.16783), 8.38151), Ts_Rank(decay_linear(Ts_ArgMax(correlation(Ts_Rank(close, 7.45404), Ts_Rank(adv60, 4.13242), 3.65459), 12.6556), 14.0365), 13.4143)) * -1)",
        "If(Ts_Rank(DecayLinear(Corr(Rank(Vwap), Rank(Volume), 4), 4), 8) > Ts_Rank(DecayLinear(ArgMax(Corr(Ts_Rank(Close,7), Ts_Rank(Mean(Volume,60),4), 4), 13), 14), 13), Ts_Rank(DecayLinear(Corr(Rank(Vwap), Rank(Volume), 4), 4), 8), Ts_Rank(DecayLinear(ArgMax(Corr(Ts_Rank(Close,7), Ts_Rank(Mean(Volume,60),4), 4), 13), 14), 13)) * (-1)",
    ),
    (
        98,
        "衰减相关差",
        "(rank(decay_linear(correlation(vwap, sum(adv5, 26.4719), 4.58418), 7.18088)) - rank(decay_linear(Ts_Rank(Ts_ArgMin(correlation(rank(open), rank(adv15), 20.8187), 8.62571), 6.95668), 8.07206)))",
        "Rank(DecayLinear(Corr(Vwap, Sum(Mean(Volume,5),26), 5), 7)) - Rank(DecayLinear(Ts_Rank(9 - ArgMin(Corr(Rank(Open), Rank(Mean(Volume,15)), 21), 9), 7), 8))",
    ),
    (
        99,
        "相关比较",
        "((rank(correlation(sum(((high + low) / 2), 19.8975), sum(adv60, 19.8975), 8.8136)) < rank(correlation(low, volume, 6.28259))) * -1)",
        "(Rank(Corr(Sum((High + Low)/2,20), Sum(Mean(Volume,60),20), 9)) < Rank(Corr(Low, Volume, 6))) * (-1)",
    ),
    (
        101,
        "开收振幅比",
        "((close - open) / ((high - low) + .001))",
        "(Close - Open) / (High - Low + 0.001)",
    ),
]

# 含行业中性化 / IndClass / contextby 或需要市值 cap 的因子（本项目无对应数据，跳过）
_SKIPPED_ALPHAS = [48, 56, 58, 59, 63, 67, 69, 70, 76, 79, 80, 82, 87, 89, 90, 91, 93, 97, 100]

_SKIP_REASON = "含行业中性化(IndNeutralize/IndClass)/市值(cap)，本项目无行业分类与市值数据"


# --------------------------------------------------------------------------- #
# 自检：语法 + 列白名单 + 算子白名单
# --------------------------------------------------------------------------- #


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


def build_items() -> list[dict[str, Any]]:
    """构造全量 Alpha101 因子条目。"""
    items: list[dict[str, Any]] = []
    for n, zh, formula, expr in _FACTORS:
        items.append(
            {
                "alpha": n,
                "name": f"{SOURCE}_{n}",
                "label": f"Alpha{n} · {zh}",
                "category": CATEGORY,
                "expression": expr,
                "formula": formula,
                "zh": zh,
            }
        )
    return items


def check_expression(expr: str) -> None:
    """校验表达式为合法单表达式，且仅引用白名单列/算子；不合规则抛 Untranslatable。"""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        raise Untranslatable(f"语法解析失败: {exc}") from exc

    unknown_cols = _columns_of(tree) - COLUMNS
    if unknown_cols:
        raise Untranslatable("引用了不支持的行情列 " + "/".join(sorted(unknown_cols)))

    unknown_ops = _func_names_of(tree) - _WHITELIST_OPS
    if unknown_ops:
        raise Untranslatable("产物含白名单外算子 " + "/".join(sorted(unknown_ops)))


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
                        f"WorldQuant Alpha101 · {it['zh']} · {it['formula']}",
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
    parser = argparse.ArgumentParser(description="导入 WorldQuant Alpha101 因子到 factor_registry")
    parser.add_argument("--dry-run", action="store_true", help="只输出报告，不写库")
    parser.add_argument("--skip-validate", action="store_true", help="跳过真实日线试跑（仅自检）")
    parser.add_argument("--limit", type=int, default=None, help="只处理前 N 条可翻译因子（冒烟）")
    parser.add_argument("--report", default=None, help="把跳过明细写成 JSON 到该路径")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    built = build_items()
    checked: list[dict[str, Any]] = []
    check_failed = 0
    skipped: list[dict[str, Any]] = [
        {"name": f"{SOURCE}_{n}", "alpha": n, "reason": f"skip: {_SKIP_REASON}"}
        for n in _SKIPPED_ALPHAS
    ]

    for it in built:
        try:
            check_expression(it["expression"])
        except Untranslatable as exc:
            skipped.append({**it, "reason": f"check: {exc}"})
            check_failed += 1
            continue
        checked.append(it)

    print(
        f"[import_alpha101] Alpha101 定义 {len(built)} 条 → 自检通过 {len(checked)}，"
        f"自检阶段跳过 {check_failed}"
    )

    if args.limit:
        checked = checked[: args.limit]

    if not args.skip_validate:
        from factor_validate import validate_factor_expression_runnable

        validated: list[dict[str, Any]] = []
        for i, it in enumerate(checked, 1):
            res = validate_factor_expression_runnable(it["expression"])
            if res["valid"]:
                validated.append(it)
            else:
                skipped.append(
                    {**it, "reason": f"validate:{res['stage']}: {res['reason']}"}
                )
            if i % 20 == 0:
                print(f"  校验进度 {i}/{len(checked)} …")
        print(f"[import_alpha101] 运行校验通过 {len(validated)}/{len(checked)}")
        checked = validated

    print(f"[import_alpha101] 分类 {CATEGORY} 可入库数量：{len(checked)}")

    if args.report:
        report_path = Path(args.report).expanduser()
        report_path.write_text(
            json.dumps(
                {
                    "built": len(built),
                    "checked": len(checked),
                    "skipped": skipped,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"[import_alpha101] 跳过明细已写入 {report_path.resolve()}")

    if skipped:
        print("[import_alpha101] 跳过明细（前 40 条）：")
        for it in skipped[:40]:
            print(f"  - {it['name']} → {it['reason']}")
        if len(skipped) > 40:
            print(f"  … 其余 {len(skipped) - 40} 条见 --report")

    if args.dry_run:
        print("[import_alpha101] dry-run：未写入数据库")
        return 0

    written = upsert(checked)
    print(f"[import_alpha101] 已写入 factor_registry：{written} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
