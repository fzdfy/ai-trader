import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { and, eq, isNull } from "drizzle-orm";
import { api } from "./api";
import { auth } from "./auth";
import { db } from "./db";
import { jobRun } from "./db/schema";
import { requestId } from "./middleware/request-id";
import { createLogger } from "./lib/logger";

const log = createLogger("server");
const app = new Hono();

/**
 * 启动清理：手动同步任务由本进程后台执行，进程重启后任务中断且 status 停在 running，
 * 启动时统一标记为 failed，避免界面一直显示「运行中」。
 * 只清理 sync-manual（cron worker 的任务由 worker 进程管理，不受本进程重启影响）。
 */
async function cleanupInterruptedSyncs(): Promise<void> {
  try {
    await db
      .update(jobRun)
      .set({ status: "failed", error: "interrupted (server restart)", finishedAt: new Date() })
      .where(
        and(
          eq(jobRun.jobType, "sync-manual"),
          eq(jobRun.status, "running"),
          isNull(jobRun.finishedAt),
        ),
      );
  } catch (error) {
    log.error({ err: error }, "cleanup interrupted syncs failed");
  }
}

// 请求 ID 中间件（必须在 cors 之前，确保 traceId 贯穿全链路）
app.use("*", requestId);

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "http://localhost:9080",
    credentials: true,
  }),
);

// Mount auth routes
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// 静态资源：头像等上传文件（root 相对服务进程 cwd，即 apps/server）
app.use("/uploads/*", serveStatic({ root: "./" }));

// Mount API v1 routes
app.route("/api/v1", api);

// Health check
app.get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

// 统一 404：路由未命中时返回 JSON（避免默认 text/plain，便于前端与日志处理）
app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

// 统一错误出口：未捕获异常返回 JSON，并把 error_type 留给访问日志中间件记录
app.onError((err, c) => {
  log.error({ err, error_type: err.name, path: c.req.path }, "unhandled error");
  return c.json({ error: "internal_error", message: "服务器内部错误" }, 500);
});

const port = 3001;

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, async () => {
  // 启动时清理进程重启遗留的 running 手动同步（async，不阻塞监听）
  void cleanupInterruptedSyncs();
  log.info({ port }, "listening");
});
