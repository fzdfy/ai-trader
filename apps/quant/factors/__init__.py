"""因子模块。

提供因子注册表与内置因子计算函数，供 CompositeStrategy 多因子策略使用。
"""

from .registry import FACTOR_REGISTRY, Factor, get_factor_list

__all__ = ["FACTOR_REGISTRY", "Factor", "get_factor_list"]
