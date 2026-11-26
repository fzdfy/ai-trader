import { Hono } from "hono";
import { z } from "zod";
import { getSystemFeatures } from "../lib/system-features";
import {
  loadMarketCenterOverview,
  loadMarketRotation,
} from "../lib/market-center/rotation";
import { badRequest, ok, serverError } from "../lib/response";

const rotationQuery = z.object({
  scope: z.enum(["growth-defense", "industry", "concept", "asset", "main-benchmark"]),
  window: z.enum(["5D", "20D", "60D"]).default("20D"),
});

export function createMarketCenterRoute(
  overview: typeof loadMarketCenterOverview = loadMarketCenterOverview,
  rotation: typeof loadMarketRotation = loadMarketRotation,
  isEnabled: () => boolean = () => true,
) {
  const route = new Hono();
  route.get("/overview", async (c) => {
    if (!isEnabled()) return c.json({ success: false, error: "行情中心未启用" }, 404);
    try {
      return ok(c, await overview());
    } catch (error) {
      console.error("[market-center] overview failed:", error);
      return serverError(c, "行情中心总览读取失败");
    }
  });
  route.get("/rotation", async (c) => {
    if (!isEnabled()) return c.json({ success: false, error: "行情中心未启用" }, 404);
    const parsed = rotationQuery.safeParse(c.req.query());
    if (!parsed.success) return badRequest(c, parsed.error.issues[0]?.message ?? "轮动参数不正确");
    try {
      return ok(c, await rotation(parsed.data.scope, parsed.data.window));
    } catch (error) {
      console.error("[market-center] rotation failed:", error);
      return serverError(c, "轮动数据读取失败");
    }
  });
  return route;
}

export const marketCenterRoute = createMarketCenterRoute(
  loadMarketCenterOverview,
  loadMarketRotation,
  () => getSystemFeatures().marketCenter,
);
