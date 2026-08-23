"""
quant 统一数据获取包。

提供「统一接口 + 多平台数据源 + 降级策略」的数据获取层：
- `base`      统一接口协议（MarketProvider 抽象基类 + 能力常量）
- `schemas`   统一返回模型（snake_case，对齐 server 端 DB 表字段）
- `common`    公共工具（代码归一化 / 市场前缀 / 通达信客户端）
- `registry`  数据源注册表 + 降级选择（增删平台只需改这里 + providers）
- `providers` 各数据源实现（每源独立子文件夹：mootdx / tencent / baidu / sina）
- `router`    统一 API 路由（挂载于 /api/v1/data）

增删平台：在 `providers/` 下新增子文件夹实现 provider，在 `providers/__init__.py`
导出，再在 `registry.py` 登记其能力与降级优先级即可。
"""
from . import base, common, registry, router, schemas
from .providers import (
    BaiduProvider,
    EastmoneyProvider,
    MootdxProvider,
    SinaProvider,
    TencentProvider,
    ThsProvider,
)

__all__ = [
    "base",
    "common",
    "registry",
    "router",
    "schemas",
    "MootdxProvider",
    "TencentProvider",
    "BaiduProvider",
    "SinaProvider",
    "ThsProvider",
    "EastmoneyProvider",
]
