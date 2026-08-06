/**
 * instrument-tool — 搜索 A 股标的
 *
 * 根据名称或代码模糊匹配 instrument 表，返回标的列表供 agent 引用。
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db";
import { instrument } from "../../../db/schema/md";
import { like, or } from "drizzle-orm";

export const instrumentTool = createTool({
  id: "searchInstrument",
  description:
    "搜索 A 股标的。根据股票名称或代码模糊匹配，返回标的列表（symbol、名称、类型）。" +
    "当用户提到某个股票名称或代码时，先用此工具确认准确的 symbol。",
  inputSchema: z.object({
    keyword: z.string().describe("股票名称或代码关键词，如 '平安银行' 或 '000001'"),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        exchange: z.string(),
        status: z.string(),
      }),
    ),
  }),
  execute: async ({ keyword }) => {
    const rows = await db
      .select({
        symbol: instrument.symbol,
        name: instrument.name,
        exchange: instrument.exchange,
        status: instrument.status,
      })
      .from(instrument)
      .where(
        or(
          like(instrument.name, `%${keyword}%`),
          like(instrument.symbol, `%${keyword}%`),
        ),
      )
      .limit(10);

    return { results: rows };
  },
});
