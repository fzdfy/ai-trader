"""因子信号合成模块（信号层 combine）。

定义多因子「信号层」的合成方式与方向覆盖逻辑，供回测引擎（composite.py）
与选股模块（screener.py）复用，保证两处语义一致。

因子原始得分 s ∈ [0, 1]（0.5 中性、>0.5 看多、<0.5 看空），
合成后的综合得分同样落在 [0, 1]。

支持的 6 种 combine：
  - weighted_sum  加权平均：Σ(sᵢ·wᵢ) / Σwᵢ（权重自动归一化）
  - equal_weight  等权平均：mean(sᵢ)
  - voting        多数投票：看多因子占比 = Σ(sᵢ ≥ thrᵢ) / n（thrᵢ 为每因子阈值）
  - rank          排名打分：横截面百分位（依赖跨标的，由调用方处理）
  - and           全部看多：min(sᵢ)（最弱因子封顶，模糊 AND）
  - or            任一看多：max(sᵢ)（最强因子主导，模糊 OR）

方向覆盖：
  - 配置中因子 direction = -1 时反转得分（s → 1 - s），用于显式反向信号。
"""

from typing import Any

# 中性得分（无有效因子或无法合成时返回）
NEUTRAL = 0.5

# 合法的合成方式集合
COMBINE_MODES = frozenset({"weighted_sum", "equal_weight", "voting", "rank", "and", "or"})


def normalize_combine(mode: Any) -> str:
    """将非法/缺失的 combine 归一化为 weighted_sum。"""
    if mode in COMBINE_MODES:
        return mode
    return "weighted_sum"


def apply_direction(score: float, direction: Any) -> float:
    """按配置方向覆盖因子得分：direction == -1 时反转（1 - score）。"""
    try:
        return 1.0 - score if int(direction) < 0 else score
    except (TypeError, ValueError):
        return score


def combine_scores(
    scores: list[float],
    weights: list[float],
    thresholds: list[float],
    mode: str,
) -> float:
    """对一组因子得分做合成，返回综合得分 [0, 1]。

    Args:
        scores: 方向覆盖后的因子得分（长度 n，∈ [0, 1]）
        weights: 因子权重（相对值，weighted_sum 内部自动归一化）
        thresholds: 每因子阈值（∈ [0, 1]，voting 模式使用）
        mode: 合成方式（weighted_sum/equal_weight/voting/rank/and/or）

    Returns:
        综合得分 ∈ [0, 1]；无有效因子时返回 NEUTRAL。
    """
    n = len(scores)
    if n == 0:
        return NEUTRAL

    mode = normalize_combine(mode)

    # rank 依赖横截面信息，单标的场景下退化为等权平均；
    # 选股（screener）会在横截面上单独实现 rank，不经过此分支。
    if mode == "rank":
        mode = "equal_weight"

    if mode == "weighted_sum":
        total_w = sum(w for w in weights if w > 0)
        if total_w <= 0:
            return sum(scores) / n
        return sum(s * w for s, w in zip(scores, weights)) / total_w

    if mode == "equal_weight":
        return sum(scores) / n

    if mode == "voting":
        bullish = sum(1 for s, thr in zip(scores, thresholds) if s >= thr)
        return bullish / n

    if mode == "and":
        return min(scores)

    if mode == "or":
        return max(scores)

    # 兜底：等权平均
    return sum(scores) / n
