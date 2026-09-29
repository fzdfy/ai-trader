/**
 * kline-tool — 获取日 K 线数据
 *
 * 从 bar1d_qfq 表读取指定标的的日 K 线（OHLCV），支持限制返回条数。
 * 返回最近 N 个交易日的数据，供 agent 分析趋势和形态。
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db";
import { bar1dQfq } from "../../../db/schema/md";
import { eq, desc } from "drizzle-orm";

export const klineTool = createTool({
  id: "getKline",
  description:
    "获取个股日 K 线数据（OHLCV），返回最近 N 个交易日的开盘价、最高价、最低价、收盘价、成交量、成交额。" +
    "可用于技术分析、趋势判断、形态识别。limit 最大 120。",
  inputSchema: z.object({
    symbol: z.string().describe("股票代码，格式如 000001.SZ 或 600519.SH"),
    limit: z.number().default(60).describe("返回最近 N 根日 K 线，最大 120"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    bars: z.array(
      z.object({
        time: z.string(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number(),
        amount: z.number().nullable(),
      }),
    ),
  }),
  execute: async ({ symbol, limit: _limit }) => {
    const limit = Math.min(_limit, 120);

    const rows = await db
      .select({
        time: bar1dQfq.time,
        open: bar1dQfq.open,
        high: bar1dQfq.high,
        low: bar1dQfq.low,
        close: bar1dQfq.close,
        volume: bar1dQfq.volume,
        amount: bar1dQfq.amount,
      })
      .from(bar1dQfq)
      .where(eq(bar1dQfq.symbol, symbol))
      .orderBy(desc(bar1dQfq.time))
      .limit(limit);

    // 反转顺序：按时间升序
    rows.reverse();

    return {
      symbol,
      bars: rows.map((r) => ({
        time: r.time.toISOString(),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
        amount: r.amount ? Number(r.amount) : null,
      })),
    };
  },
});
