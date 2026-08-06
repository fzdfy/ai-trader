/**
 * quote-tool — 获取个股最新行情
 *
 * 从 quote_latest 表读取最新价、涨跌幅、成交量、成交额、换手率、PE/PB 等核心行情数据。
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db";
import { quoteLatest } from "../../../db/schema/md";
import { eq } from "drizzle-orm";

export const quoteTool = createTool({
  id: "getQuote",
  description:
    "获取个股最新行情数据，包括最新价、涨跌幅、成交量、成交额、换手率、市盈率、市净率。" +
    "symbol 格式如 '000001.SZ'、'600519.SH'。",
  inputSchema: z.object({
    symbol: z.string().describe("股票代码，格式如 000001.SZ 或 600519.SH"),
  }),
  outputSchema: z.object({
    symbol: z.string(),
    name: z.string().nullable(),
    last: z.number().nullable(),
    changePct: z.number().nullable(),
    volume: z.number().nullable(),
    amount: z.number().nullable(),
    turnoverRate: z.number().nullable(),
    pe: z.number().nullable(),
    pb: z.number().nullable(),
    status: z.string().nullable(),
  }),
  execute: async ({ symbol }) => {
    const row = await db
      .select()
      .from(quoteLatest)
      .where(eq(quoteLatest.symbol, symbol))
      .limit(1);

    if (row.length === 0) {
      return {
        symbol,
        name: null,
        last: null,
        changePct: null,
        volume: null,
        amount: null,
        turnoverRate: null,
        pe: null,
        pb: null,
        status: "not_found",
      };
    }

    const q = row[0];
    return {
      symbol: q.symbol,
      name: q.name,
      last: q.last ? Number(q.last) : null,
      changePct: q.changePct ? Number(q.changePct) : null,
      volume: q.volume ? Number(q.volume) : null,
      amount: q.amount ? Number(q.amount) : null,
      turnoverRate: q.turnoverRate ? Number(q.turnoverRate) : null,
      pe: q.pe ? Number(q.pe) : null,
      pb: q.pb ? Number(q.pb) : null,
      status: q.status,
    };
  },
});
