/**
 * review-tools — 复盘 agent 的专用工具
 *
 * 提供复盘所需的三类动态数据源：
 *   1. getReviewSkill     从 review_skill 表动态读取复盘方法论（前端可编辑）
 *   2. getSectorFundFlow  拉取行业资金流排行（东方财富）
 *   3. getStockPoolForDate 读取某交易日的选股池
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { createSdk, withSdkRetry } from "../../../lib/sdk";
import { db } from "../../../db";
import { reviewSkill, stockPool } from "../../../db/schema";
import { eq } from "drizzle-orm";

/** 读取复盘 skill（方法论 + UI 模块配置），前端可展示/编辑 */
export const getReviewSkillTool = createTool({
  id: "getReviewSkill",
  description:
    "读取复盘 skill（复盘方法论提示词 + UI 模块配置）。生成复盘前必须先调用本工具，严格遵循其中的方法论。",
  inputSchema: z.object({
    name: z.string().default("default").describe("skill 名称，默认 default"),
  }),
  outputSchema: z.object({
    name: z.string(),
    content: z.unknown(),
  }),
  execute: async ({ name }) => {
    const rows = await db
      .select({ content: reviewSkill.content })
      .from(reviewSkill)
      .where(eq(reviewSkill.name, name));
    return {
      name,
      content: rows[0]?.content ?? null,
    };
  },
});

/** 拉取行业资金流排行（主力净流入降序） */
export const sectorFundFlowTool = createTool({
  id: "getSectorFundFlow",
  description:
    "获取 A 股行业板块资金流排行，包含主力/超大/大/中/小单净流入与涨跌幅，用于判断当日资金主线方向。",
  inputSchema: z.object({
    sectorType: z
      .enum(["industry", "concept"])
      .default("industry")
      .describe("板块类型：industry（行业）或 concept（概念）"),
    indicator: z.enum(["today", "3day", "5day", "10day"]).default("today").describe("排名周期"),
  }),
  outputSchema: z.object({
    sectorType: z.string(),
    items: z.array(
      z.object({
        code: z.string(),
        name: z.string(),
        changePercent: z.number().nullable(),
        mainNetInflow: z.number().nullable(),
        mainNetInflowPercent: z.number().nullable(),
        superLargeNetInflow: z.number().nullable(),
        largeNetInflow: z.number().nullable(),
        mediumNetInflow: z.number().nullable(),
        smallNetInflow: z.number().nullable(),
        topStockName: z.string().nullable(),
        topStockCode: z.string().nullable(),
      }),
    ),
  }),
  execute: async ({ sectorType, indicator }) => {
    // sectorRank 内部走多 provider 重试/降级，业务层再加有限重试兜底
    const rows = await withSdkRetry(
      () => createSdk().fundFlow.sectorRank({ sectorType, indicator }),
      { label: "reviewTool.sectorFundFlow" },
    );
    console.log("sectorFundFlowTool rows", rows);
    return {
      sectorType,
      items: rows.map((r) => ({
        code: r.code,
        name: r.name,
        changePercent: r.changePercent,
        mainNetInflow: r.mainNetInflow,
        mainNetInflowPercent: r.mainNetInflowPercent,
        superLargeNetInflow: r.superLargeNetInflow,
        largeNetInflow: r.largeNetInflow,
        mediumNetInflow: r.mediumNetInflow,
        smallNetInflow: r.smallNetInflow,
        topStockName: r.topStockName ?? null,
        topStockCode: r.topStockCode ?? null,
      })),
    };
  },
});

/** 读取某交易日的选股池 */
export const stockPoolTool = createTool({
  id: "getStockPoolForDate",
  description: "读取指定交易日的选股池（从选股结果中勾选加入的股票），用于复盘当日的选股标的。",
  inputSchema: z.object({
    date: z.string().describe("交易日，格式 YYYY-MM-DD"),
  }),
  outputSchema: z.object({
    date: z.string(),
    items: z.array(
      z.object({
        symbol: z.string(),
        name: z.string(),
        source: z.string().nullable(),
        score: z.string().nullable(),
      }),
    ),
  }),
  execute: async ({ date }) => {
    const rows = await db
      .select({
        symbol: stockPool.symbol,
        name: stockPool.name,
        source: stockPool.source,
        score: stockPool.score,
      })
      .from(stockPool)
      .where(eq(stockPool.date, date));
    return {
      date,
      items: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        source: r.source,
        score: r.score,
      })),
    };
  },
});
