import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./api";
import { auth } from "./auth";

const app = new Hono();
app.use("*", cors({
  origin: (origin) => origin ?? "http://localhost:5173",
  credentials: true,
}));

// Mount auth routes
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Mount API v1 routes
app.route("/api/v1", api);

// Health check
app.get("/health", (c) => c.json({ status: "ok", time: new Date().toISOString() }));

// ---- Production: 托管 web dist 静态文件（SPA 回退） ----
const distDir = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");

if (existsSync(distDir)) {
  console.log(`[server] serving static files from ${distDir}`);
  app.get("*", (c) => {
    const requestPath = c.req.path === "/" ? "/index.html" : c.req.path;
    let filePath = join(distDir, requestPath);

    // SPA fallback：非 API 路径不存在时返回 index.html
    if (!existsSync(filePath)) {
      filePath = join(distDir, "index.html");
    }

    if (!existsSync(filePath)) {
      return c.notFound();
    }

    // 简单的 MIME 映射
    const ext = filePath.split(".").pop() ?? "";
    const mime: Record<string, string> = {
      html: "text/html", js: "application/javascript", css: "text/css",
      svg: "image/svg+xml", png: "image/png", ico: "image/x-icon",
      json: "application/json", woff2: "font/woff2",
    };
    c.header("Content-Type", mime[ext] ?? "text/plain");
    return c.body(readFileSync(filePath));
  });
}

const port = 3001;

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
