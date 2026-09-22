import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { createLogger } from "../lib/logger";
import { runWithLogContext, type LogSource } from "../lib/request-context";

const log = createLogger("http");

const VALID_SOURCES: readonly string[] = ["external", "manual", "scheduled", "internal"];

/**
 * 请求追踪 + 结构化访问日志中间件
 * - 从请求头 X-Request-Id 提取（nginx 传入），若无则生成 UUID；并透传 X-Parent-Request-Id
 * - 判定来源 source：服务间调用带 X-Log-Source 时沿用，否则视为 external（浏览器/外部）
 * - 建立日志链路上下文（runWithLogContext），使链路内所有 pino 日志自动带上
 *   request_id / source；发往 quant 的请求也会带上同名追踪头
 * - 请求结束输出单条 event=http_access 日志（status / duration_ms / route 等），
 *   由 Grafana Alloy 解析为 Loki structured metadata
 * - 注入 `c.get("requestId")` 和 `c.get("log")` 供下游使用
 */
export const requestId = createMiddleware(async (c, next) => {
  const requestId = c.req.header("X-Request-Id") ?? crypto.randomUUID();
  const parentRequestId = c.req.header("X-Parent-Request-Id");
  const declared = c.req.header("X-Log-Source");
  const source: LogSource = VALID_SOURCES.includes(declared ?? "")
    ? (declared as LogSource)
    : "external";

  const method = c.req.method;
  const path = c.req.path;
  const ip = c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP");
  const userAgent = c.req.header("User-Agent");

  // 注入到 context
  c.set("requestId", requestId);
  c.set("log", createLogger("api", { requestId }));

  const start = Date.now();

  await runWithLogContext(
    { requestId, ...(parentRequestId ? { parentRequestId } : {}), source },
    async () => {
      let error: unknown;
      try {
        await next();
      } catch (e) {
        error = e;
      }

      const durationMs = Date.now() - start;
      const status = error ? 500 : c.res.status;
      const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      // 路由已匹配，取模板路径（/api/v1/board/:code），未命中时退回实际 path
      const route = routePath(c) || path;
      const contentLength = Number(c.res.headers.get("content-length") ?? 0);

      c.res.headers.set("X-Request-Id", requestId);

      log[level](
        {
          event: "http_access",
          method,
          path,
          route,
          status,
          duration_ms: durationMs,
          ...(contentLength > 0 ? { bytes: contentLength } : {}),
          ...(ip ? { ip } : {}),
          ...(userAgent ? { user_agent: userAgent } : {}),
          ...(error
            ? {
                err: error,
                error_type: (error as Error)?.name ?? "Error",
                error_message: (error as Error)?.message ?? String(error),
              }
            : {}),
        },
        "http_access",
      );

      // 交回 Hono 的 onError / 默认处理，统一产出响应体
      if (error) throw error;
    },
  );
});
