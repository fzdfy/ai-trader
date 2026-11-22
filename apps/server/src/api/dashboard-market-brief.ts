import { Hono } from "hono";
import { z } from "zod";
import {
  loadMarketBrief,
  type MarketBriefQuery,
  type MarketBriefResponse,
} from "../lib/dashboard/market-brief";
import { badRequest, ok, serverError } from "../lib/response";

const querySchema = z.object({
  symbol: z.enum(["000001.SH", "399006.SZ"]).default("000001.SH"),
  range: z.enum(["1D", "5D", "1M", "YTD"]).default("1D"),
  etfSymbol: z.enum(["510300.SH", "588000.SH", "159992.SZ"]).default("510300.SH"),
  etfRange: z.enum(["1D", "5D", "1M", "YTD"]).default("1D"),
  globalSymbol: z.enum(["XAUUSD", "IXIC"]).default("XAUUSD"),
  globalRange: z.enum(["1D", "5D", "1M", "YTD"]).default("1D"),
});

export function createDashboardMarketBriefRoute(
  loadBrief: (query: MarketBriefQuery) => Promise<MarketBriefResponse> = loadMarketBrief,
) {
  const route = new Hono();
  route.get("/", async (c) => {
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return badRequest(c, parsed.error.issues[0]?.message ?? "行情参数不正确");
    }
    try {
      return ok(c, await loadBrief(parsed.data));
    } catch (error) {
      console.error("[dashboard-market-brief] failed:", error);
      return serverError(c, "行情雷达数据获取失败");
    }
  });
  return route;
}

export const dashboardMarketBriefRoute = createDashboardMarketBriefRoute();
