"""
quant 数据源契约层（对齐 stock-sdk）。

本包声明了 stock-sdk 全部数据接口的请求参数（params）、返回结构（schemas）
与 API 路由（router），仅作契约声明、不实现任何数据拉取逻辑，为后续切换
数据源提供统一的接口基线。

对外导出：
- `router`：FastAPI APIRouter，含全部数据端点（均抛 NotImplementedError）。
- `params`：请求参数 Pydantic 模型。
- `schemas`：返回数据 Pydantic 模型。
"""

from . import params, router, schemas

__all__ = ["params", "router", "schemas"]
