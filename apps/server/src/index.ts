import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
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

const port = 3001;

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
