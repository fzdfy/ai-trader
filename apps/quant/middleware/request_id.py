"""FastAPI Request ID 中间件。

从请求头 X-Request-Id 提取（nginx 传入），若无则生成 UUID。
注入到 logger context，响应头回传。
"""

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from logger import get_logger


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-Id")
        if not request_id:
            request_id = str(uuid.uuid4())

        # 注入到请求状态，下游通过 request.state.request_id 获取
        request.state.request_id = request_id

        response = await call_next(request)

        # 响应头回传，方便前端/上游排查
        response.headers["X-Request-Id"] = request_id
        return response
