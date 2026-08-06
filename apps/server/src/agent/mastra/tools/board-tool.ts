/**
 * board-tool — 获取板块排行 / 热度数据
 *
 * 从 board 表读取行业/概念板块的涨跌排行，供热力图/轮动分析。
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "../../../db";
import { board } from "../../../db/schema/md";
import { eq } from "drizzle-orm";

export const boardTool = createTool({
  id: "getBoardRankings",
  description:
    "获取 A 股行业板块或概念板块的涨跌排行，包括板块名称、代码、涨跌幅、总市值。" +
    "可用于分析市场热点、板块轮动。type 为 'industry' 或 'concept'。",
  inputSchema: z.object({
    type: z
      .enum(["industry", "concept"])
      .default("industry")
      .describe("板块类型：industry（行业）或 concept（概念）"),
    limit: z.number().default(20).describe("返回前 N 名，最大 50"),
  }),
  outputSchema: z.object({
    type: z.string(),
    boards: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        rank: z.string(),
        changePercent: z.string().nullable(),
        popularity: z.string().nullable(),
        totalMarketCap: z.number().nullable(),
      }),
    ),
  }),
  execute: async ({ type, limit: _limit }) => {
    const limit = Math.min(_limit, 50);

    const rows = await db
      .select({
        code: board.code,
        name: board.name,
        rank: board.rank,
        changePercent: board.changePercent,
        popularity: board.popularity,
        totalMarketCap: board.totalMarketCap,
      })
      .from(board)
      .where(eq(board.type, type))
      .orderBy(board.rank)
      .limit(limit);

    return {
      type,
      boards: rows.map((r) => ({
        code: r.code,
        name: r.name,
        rank: r.rank,
        changePercent: r.changePercent,
        popularity: r.popularity,
        totalMarketCap: r.totalMarketCap ? Number(r.totalMarketCap) : null,
      })),
    };
  },
});
