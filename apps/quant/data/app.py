"""
stock-sdk 数据源 API 声明服务（独立 FastAPI 入口）。

运行方式：
    uv run uvicorn data.app:app --reload --port 3003

说明：
- 本服务只声明 stock-sdk 的全部数据接口契约（参数 / 返回），端点均抛
  `NotImplementedError`，用于后续切换 / 接入数据源时对照实现。
- 可通过访问 `/openapi.json` 或 `/docs` 查看完整契约。
"""

from fastapi import FastAPI

from .router import router

app = FastAPI(title="AI Trader Data (stock-sdk 契约)", version="0.1.0")

app.include_router(router, prefix="/api/data")
