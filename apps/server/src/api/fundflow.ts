/**
 * 资金流向 API — 通过 stock-sdk 拉取东方财富个股资金流（主力/超大/大/中/小单）。
 *
 * 数据来源：push2his.eastmoney.com 日级资金流接口，实时返回，不落库。
 */

import { Hono } from "hono";
import { StockSDK } from "stock-sdk";
import { ok, badRequest } from "../lib/response";

const fundflowRoute = new Hono();

/** symbol "002594.SZ" → 腾讯/东财格式 "sz002594" */
function toEastmoneyCode(symbol: string): string {
  const [code, exchange] = symbol.split(".");
  return `${(exchange ?? "").toLowerCase()}${code}`;
}

// GET /api/v1/fundflow?symbol=002594.SZ&period=daily&limit=30
fundflowRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const period = c.req.query("period") ?? "daily";
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? "30"), 1), 120);

  if (!symbol) return badRequest(c, "symbol is required");
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return badRequest(c, "period must be daily|weekly|monthly");
  }

  const sdk = new StockSDK();
  try {
    const rows = await sdk.fundFlow.individual(toEastmoneyCode(symbol), {
      period: period as "daily" | "weekly" | "monthly",
    });
    // 只保留最近 limit 条
    const sliced = rows.slice(-limit);
    return ok(c, sliced);
  } catch (error) {
    console.error(`[fundflow] ${symbol} failed:`, error);
    return ok(c, []);
  }
});

export { fundflowRoute };
