import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { api } from "./api";
import { auth } from "./auth";
import { requestId } from "./middleware/request-id";
import { createLogger } from "./lib/logger";

const log = createLogger("server");
const app = new Hono();

// 请求 ID 中间件（必须在 cors 之前，确保 traceId 贯穿全链路）
app.use("*", requestId);

app.use("*", cors({
  origin: (origin) => origin ?? "http://localhost:8080",
  credentials: true,
}));

// Mount auth routes
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// 静态资源：头像等上传文件（root 相对服务进程 cwd，即 apps/server）
app.use("/uploads/*", serveStatic({ root: "./" }));

// Mount API v1 routes
app.route("/api/v1", api);

// Health check
app.get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

const port = 3001;

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  log.info({ port }, "listening");
});
