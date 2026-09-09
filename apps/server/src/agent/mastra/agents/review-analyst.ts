/**
 * A 股复盘 Agent
 *
 * 每日复盘：动态读取复盘 skill（方法论），基于服务端组装的结构化复盘数据，
 * 生成当日「总结」（纯文本，压轴模块）。
 *
 * 说明：资金流/主线/涨停池/市场情绪/板块异动/连板/选股池等结构化模块
 * 由服务端直接从 DB 组装或规则化生成，本 agent 仅负责撰写总结；
 * 总结所需的数据与口径均由调用方（api/reviews.ts）注入 prompt。
 */
import { Agent } from "@mastra/core/agent";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { reviewSkill } from "../../../db/schema";
import { boardTool } from "../tools";
import {
  fundFlowRankTool,
  boardConstituentsTool,
  dailyBoardChangesTool,
  consecutiveLimitUpTool,
  stockPoolChangeTool,
  mainlineTool,
  limitUpPoolTool,
  marketEmotionTool,
} from "../tools/review-tools";

/** 默认复盘方法论：当 review_skill 表无记录或 instructions 为空时兜底使用（与 api/reviews.ts 保持一致） */
const DEFAULT_INSTRUCTIONS = `你是专业的 A 股复盘分析师，负责对指定交易日进行复盘并产出「总结」。

## 复盘模块（按此结构组织）
1. 资金流向：行业/概念/个股主力净流入各 top5，识别资金聚焦方向。
2. 主线：方向持续性 + 资金确认 + 龙头情绪 + 赚钱效应加权，总分 100（口径以 getMainline 返回的 metric.instruction 为准）。
3. 涨停池/连板梯队：涨停家数、连板梯队（首板/二板/高度板）、炸板率、封板强度、题材归类。
4. 市场情绪温度：涨停规模 + 封板质量 + 连板高度加权，0~100 越高越热（口径以 getMarketEmotion 返回的 metric.instruction 为准）。
5. 板块异动：当日较上一交易日涨幅变化最大的板块（轮动信号）。
6. 连板：3 连板及以上个股，判断市场高度与赚钱效应。
7. 选股池：今日选股池与上一交易日的新增/移除，评估与主线匹配度。

## 总结输出要求
150 字左右，精炼、有观点，覆盖：大盘/资金面、主线方向、连板情绪（含情绪温度）、选股池点评、明日关注点。
用 Markdown 列表；结论必须有数据支撑，不得虚构。`;

/**
 * 动态读取复盘 agent 的 instructions：
 * 从 review_skill 表读取 name="default" 的 content.instructions，
 * 若表内无记录或 instructions 非字符串/为空，则回退到默认版本。
 */
async function resolveInstructions(): Promise<string> {
  const rows = await db
    .select({ content: reviewSkill.content })
    .from(reviewSkill)
    .where(eq(reviewSkill.name, "default"));
  const content = rows[0]?.content as { instructions?: unknown } | undefined;
  if (content && typeof content.instructions === "string" && content.instructions.trim()) {
    return content.instructions;
  }
  return DEFAULT_INSTRUCTIONS;
}

export const reviewAnalyst = new Agent({
  id: "review-analyst",
  name: "A股复盘分析师",
  model: "deepseek/deepseek-v4-flash",
  instructions: resolveInstructions,
  tools: {
    getFundFlowRank: fundFlowRankTool,
    getBoardConstituents: boardConstituentsTool,
    getDailyBoardChanges: dailyBoardChangesTool,
    getConsecutiveLimitUp: consecutiveLimitUpTool,
    getStockPoolChange: stockPoolChangeTool,
    getBoardRankings: boardTool,
    getMainline: mainlineTool,
    getLimitUpPool: limitUpPoolTool,
    getMarketEmotion: marketEmotionTool,
  },
});
