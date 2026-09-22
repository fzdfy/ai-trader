"""FastAPI 统一可观测中间件（纯 ASGI）。

职责：
1. 解析链路头（X-Request-Id / X-Parent-Request-Id / X-Log-Source /
   X-Job-Name / X-Job-Run-Id / X-Trade-Date），缺失时生成 request_id。
2. 写入 structlog contextvars，使该请求链路内所有日志（含线程池中的
   同步路由）自动携带 request_id / job_run_id / source 等字段。
3. 请求结束输出单条 event=http_access 结构化访问日志，字段与 server 侧
   完全对齐，供 Grafana Alloy 统一解析为 Loki structured metadata。
4. 响应头回传 X-Request-Id。

用纯 ASGI 而非 BaseHTTPMiddleware：BaseHTTPMiddleware 会把下游放进子任务，
contextvars 传播与清理都更脆弱；纯 ASGI 在同一任务内顺序执行，contextvars
天然贯通到下游（anyio 线程池亦会拷贝上下文）。
"""

import time
import uuid
from typing import Any

from structlog.contextvars import bind_contextvars, clear_contextvars
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from logger import get_logger

log = get_logger("http")

# 与 server 侧保持一致的来源枚举
_VALID_SOURCES = {"external", "manual", "scheduled", "internal"}


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }

        request_id = headers.get("x-request-id") or str(uuid.uuid4())
        parent_request_id = headers.get("x-parent-request-id")
        declared_source = headers.get("x-log-source")
        source = declared_source if declared_source in _VALID_SOURCES else "external"
        job_name = headers.get("x-job-name")
        job_run_id = headers.get("x-job-run-id")
        trade_date = headers.get("x-trade-date")

        # 注入 structlog 上下文：链路内所有日志自动携带
        ctx: dict[str, Any] = {"request_id": request_id, "source": source}
        if parent_request_id:
            ctx["parent_request_id"] = parent_request_id
        if job_name:
            ctx["job_name"] = job_name
        if job_run_id:
            ctx["job_run_id"] = job_run_id
        if trade_date:
            ctx["trade_date"] = trade_date
        bind_contextvars(**ctx)

        # 兼容下游 `request.state.request_id` 的读取方式
        scope.setdefault("state", {})["request_id"] = request_id

        method = scope.get("method", "")
        path = scope.get("path", "")
        client = scope.get("client")
        ip = client[0] if client else None

        start = time.perf_counter()
        status = 500
        body_bytes = 0
        error_type: str | None = None

        async def send_wrapper(message: Message) -> None:
            nonlocal status, body_bytes
            if message["type"] == "http.response.start":
                status = message["status"]
                out_headers = list(message.get("headers", []))
                for key, value in out_headers:
                    if key == b"content-length":
                        try:
                            body_bytes = int(value)
                        except ValueError:
                            pass
                out_headers.append((b"x-request-id", request_id.encode("latin-1")))
                message["headers"] = out_headers
            elif message["type"] == "http.response.body" and not body_bytes:
                body_bytes += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            error_type = type(exc).__name__
            raise
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            # 路由已匹配则取模板路径（/api/v1/data/kline/{symbol}），未命中退回实际 path
            route = getattr(scope.get("route"), "path", None) or path
            level = "error" if status >= 500 else "warn" if status >= 400 else "info"
            extra: dict[str, Any] = {
                "route": route,
                "method": method,
                "status": status,
                "duration_ms": duration_ms,
                "path": path,
            }
            if body_bytes > 0:
                extra["bytes"] = body_bytes
            if ip:
                extra["ip"] = ip
            if error_type:
                extra["error_type"] = error_type
            getattr(log, level)("http_access", **extra)
            clear_contextvars()
