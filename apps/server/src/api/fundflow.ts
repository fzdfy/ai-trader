/**
 * 资金流向 API — 通过 quant 数据服务拉取东方财富个股资金流（主力/超大/大/中/小单）。
 *
 * 数据来源：quant /fund-flow-120d（东财日级资金流，最近 120 个交易日），实时返回，不落库。
 * quant 返回 snake_case，此处映射为前端图表需要的 camelCase。
 */

import { Hono } from "hono";
import { quant } from "../lib/quant";
import { ok, badRequest } from "../lib/response";

const fundflowRoute = new Hono();

// GET /api/v1/fundflow?symbol=002594.SZ&period=daily&limit=30
fundflowRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const period = c.req.query("period") ?? "daily";
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "30"), 1), 120);

  if (!symbol) return badRequest(c, "symbol is required");
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return badRequest(c, "period must be daily|weekly|monthly");
  }

  try {
    const rows = await quant.fundFlow120d(symbol);
    // quant 仅提供日级资金流（最近 120 个交易日），映射 snake_case → 前端 camelCase
    const mapped = rows.slice(-limit).map((r) => ({
      date: r.date,
      close: r.close,
      changePercent: r.change_pct,
      mainNetInflow: r.main_net,
      superLargeNetInflow: r.super_net,
      largeNetInflow: r.large_net,
      mediumNetInflow: r.mid_net,
      smallNetInflow: r.small_net,
    }));
    return ok(c, mapped);
  } catch (error) {
    console.error(`[fundflow] ${symbol} failed:`, error);
    return ok(c, []);
  }
});

export { fundflowRoute };
