import { createMiddleware } from "hono/factory";
import { createLogger } from "../lib/logger";

const log = createLogger("http");

/**
 * Request ID + 请求日志中间件
 * - 从请求头 X-Request-Id 提取（nginx 传入），若无则生成 UUID
 * - 记录请求/响应日志（method、path、status、耗时）
 * - 注入 `c.get("requestId")` 和 `c.get("log")` 供下游使用
 */
export const requestId = createMiddleware(async (c, next) => {
  let requestId = c.req.header("X-Request-Id");
  if (!requestId) {
    requestId = crypto.randomUUID();
  }

  const reqLog = createLogger("http", { requestId });
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  reqLog.info({ method, path }, "→ 请求");

  // 注入到 context
  c.set("requestId", requestId);
  c.set("log", createLogger("api", { requestId }));

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  c.res.headers.set("X-Request-Id", requestId);

  if (status >= 500) {
    reqLog.error({ method, path, status, duration: `${duration}ms` }, "← 响应");
  } else if (status >= 400) {
    reqLog.warn({ method, path, status, duration: `${duration}ms` }, "← 响应");
  } else {
    reqLog.info({ method, path, status, duration: `${duration}ms` }, "← 响应");
  }
});
