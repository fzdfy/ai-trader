import { Hono } from "hono";
import { loadDashboardSnapshot } from "../lib/dashboard/dashboard-snapshot";
import { ok, serverError } from "../lib/response";

const dashboardRoute = new Hono();

dashboardRoute.get("/", async (c) => {
  try {
    return ok(c, await loadDashboardSnapshot());
  } catch (error) {
    console.error("[dashboard] failed:", error);
    return serverError(c, "每日看板数据获取失败，请稍后重试。");
  }
});

export { dashboardRoute };
