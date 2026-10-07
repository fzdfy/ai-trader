"""AKQuant 表达式引擎的算子扩展（运行期注入）。

AKQuant 以 wheel 形式安装（非 editable），其 ``OPS_MAP`` / ``OP_CATEGORY`` 是模块级
可变 dict，``ExpressionParser`` 在 ``parse`` / ``plan`` 时按名字查表（调用时查找），
因此可在运行期安全注册新算子——无需改动 akquant 源码。

本模块补齐 qlib Alpha158/360 回填与 Alpha101 翻译所需的 6 个时序算子：

    Quantile(x, d, q)    滚动分位数（线性插值）
    Slope(x, d)          滚动线性回归斜率
    Rsquare(x, d)        滚动线性回归 R²
    Resi(x, d)           滚动线性回归残差（最新点残差）
    Product(x, d)        滚动连乘
    DecayLinear(x, d)    线性衰减加权均值（越近权重越大）

导入本模块即完成注册（幂等）；使用方只需保证 ``import factor_ext`` 早于任何
``parse`` / ``plan`` 调用。``screener`` 在模块顶部导入本模块，故
``screener`` / ``factor_validate`` / ``factor_eval`` 全链路自动生效。

口径（与 qlib ``qlib/data/ops.py`` 对齐）：
- ``Slope`` —— 窗口内 y 对 t=[0..d-1] 的一元线性回归斜率，等价 ``np.polyfit(t, y, 1)[0]``；
- ``Rsquare`` —— 一元回归 R² 等于 ``Corr(y, t)²``，而相关系数对 t 的平移 / 缩放不变，
  故用全局连续序号做自变量即可，无需逐窗口构造 t；
- ``Resi`` —— 回归线在最新点 t=d-1 的拟合值为 ``mean(y) + slope·(d-1)/2``，
  残差即 ``y - 该值``；
- ``DecayLinear`` —— 权重 [1..d]（最新的权重最大）归一化后的加权均值。
``Slope`` / ``Resi`` / ``DecayLinear`` 走加权 ``rolling_sum`` 向量化，避免
``rolling_map`` 逐窗口 Python 调用。
"""

from __future__ import annotations

from typing import Union

import polars as pl

from akquant.factor.ops import OP_CATEGORY, OPS_MAP, _to_expr


def _time_index() -> pl.Expr:
    """连续整数序号；配合 ``.over("symbol")`` 时在每个标的窗口内即 t=[0..d-1]。"""
    return pl.int_range(pl.len())


def _all_valid_window(x_expr: pl.Expr, d: int) -> pl.Expr:
    """窗口是否齐备：1=全非空、0=含空值、null=窗口未满。

    polars 的加权 ``rolling_sum`` 遇到 null 会 panic（``weights not yet supported
    on array with null values``），故先以 0 填充再算，并用本掩码把「含空 / 未满」
    的窗口还原为 null（与 qlib 的 NaN 传播一致）。被保留的窗口内全为非空，
    填充值实际不参与结果。
    """
    return x_expr.is_not_null().cast(pl.Int32).rolling_min(window_size=d)


def ts_quantile(x: Union[pl.Expr, float], d: int, q: float) -> pl.Expr:
    """滚动分位数（线性插值）。"""
    return (
        _to_expr(x)
        .rolling_quantile(q, interpolation="linear", window_size=d)
        .over("symbol")
    )


def ts_slope(x: Union[pl.Expr, float], d: int) -> pl.Expr:
    """窗口内 y 对 t=[0..d-1] 的线性回归斜率。"""
    x_expr = _to_expr(x).cast(pl.Float64)
    mean_y = x_expr.rolling_mean(window_size=d)
    sum_ty = x_expr.fill_null(0.0).rolling_sum(window_size=d, weights=list(range(d)))
    mean_t = (d - 1) / 2.0
    var_t = d * (d * d - 1) / 12.0
    slope = (sum_ty - d * mean_t * mean_y) / var_t
    guard = _all_valid_window(x_expr, d)
    return pl.when(guard == 1).then(slope).over("symbol")


def ts_resi(x: Union[pl.Expr, float], d: int) -> pl.Expr:
    """最新点相对窗口回归线的残差 ``y - mean(y) - slope·(d-1)/2``。"""
    x_expr = _to_expr(x).cast(pl.Float64)
    mean_y = x_expr.rolling_mean(window_size=d).over("symbol")
    slope = ts_slope(x_expr, d)
    return x_expr - mean_y - slope * ((d - 1) / 2.0)


def ts_rsquare(x: Union[pl.Expr, float], d: int) -> pl.Expr:
    """窗口内线性回归的 R²（等价 ``Corr(y, t)²``）。"""
    x_expr = _to_expr(x).cast(pl.Float64)
    corr = pl.rolling_corr(x_expr, _time_index(), window_size=d).over("symbol")
    return corr**2


def ts_product(x: Union[pl.Expr, float], d: int) -> pl.Expr:
    """滚动连乘。"""
    return (
        _to_expr(x)
        .cast(pl.Float64)
        .rolling_map(lambda s: float(s.product()), window_size=d)
        .over("symbol")
    )


def ts_decay_linear(x: Union[pl.Expr, float], d: int) -> pl.Expr:
    """线性衰减加权均值：权重 [1..d]（越近越大），按权重和归一。"""
    weights = list(range(1, d + 1))
    denom = d * (d + 1) / 2.0
    x_expr = _to_expr(x).cast(pl.Float64)
    decayed = x_expr.fill_null(0.0).rolling_sum(window_size=d, weights=weights) / denom
    guard = _all_valid_window(x_expr, d)
    return pl.when(guard == 1).then(decayed).over("symbol")


EXTENSION_OPS = {
    "Quantile": ts_quantile,
    "Slope": ts_slope,
    "Rsquare": ts_rsquare,
    "Resi": ts_resi,
    "Product": ts_product,
    "DecayLinear": ts_decay_linear,
}


def register_extensions() -> None:
    """把扩展算子注入 akquant 的 OPS_MAP / OP_CATEGORY（幂等，均为时序算子）。"""
    for name, func in EXTENSION_OPS.items():
        OPS_MAP[name] = func
        OP_CATEGORY[name] = "TS"


register_extensions()
