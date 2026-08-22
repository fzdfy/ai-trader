/**
 * A 股复盘 Agent
 *
 * 每日复盘：动态读取复盘 skill（方法论），基于数据库中的资金流、板块、连板、选股池数据，
 * 生成「主线（top5 + 核心个股）」与「总结」，输出结构化 JSON 供前端图表渲染。
 *
 * 说明：资金流/板块异动/连板/选股池等结构化模块由服务端直接从 DB 组装，
 * 本 agent 只负责需要推理的两个模块——主线与总结；所有数据判断均来自工具（DB）。
 */
import { Agent } from "@mastra/core/agent";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { reviewSkill } from "../../../db/schema";
import { boardTool } from "../tools";
import {
  getReviewSkillTool,
  fundFlowRankTool,
  boardConstituentsTool,
  dailyBoardChangesTool,
  consecutiveLimitUpTool,
  stockPoolChangeTool,
} from "../tools/review-tools";

/** 默认复盘方法论：当 review_skill 表无记录或 instructions 为空时兜底使用 */
const DEFAULT_INSTRUCTIONS = `你是一位专业的 A 股复盘分析师。你的任务是对指定交易日进行复盘，输出「主线」和「总结」。

## 执行步骤（必须严格按顺序，所有数据必须来自工具返回结果，禁止编造数字）
1. 先调用 getReviewSkill 读取复盘方法论（skill），并严格遵循其中的要求。
2. 调用 getFundFlowRank（industry 与 concept）获取行业/概念资金流排行，识别资金净流入最集中的方向。
3. 调用 getBoardRankings（industry / concept）获取板块涨跌排行，与资金流交叉验证主线。
4. 对候选主线板块，调用 getBoardConstituents 获取其核心成分股，作为「核心个股」。
5. 调用 getDailyBoardChanges、getConsecutiveLimitUp 作为情绪/异动参考，佐证主线强度。
6. 调用 getStockPoolChange 获取当日选股池及与上一交易日的变动，评估选股与主线的匹配度。

## 主线判定原则
- 主线 = 主力资金净流入 + 涨幅居前 + 有清晰产业逻辑的板块，最多保留 5 个。
- 每个主线板块需给出 2~5 只核心个股（来自 getBoardConstituents 的成分股，取涨跌幅靠前者）。
- 板块与核心个股必须能在工具返回结果中找到依据，不得凭空杜撰。

## 输出要求（必须是纯 JSON，不要任何解释性文字，不要 markdown 代码块）
{
  "mainline": [
    { "boardName": "主线板块名称", "coreStocks": ["600519.SH", "000001.SZ"], "reason": "判断理由（资金净流入+涨幅+逻辑）" }
  ],
  "summary": "一段 150 字以内的当日复盘总结，涵盖：大盘/资金面、主线方向、连板情绪、选股池点评、明日关注点。"
}`;

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
  model: "deepseek/deepseek-v4-pro",
  instructions: resolveInstructions,
  tools: {
    getReviewSkill: getReviewSkillTool,
    getFundFlowRank: fundFlowRankTool,
    getBoardConstituents: boardConstituentsTool,
    getDailyBoardChanges: dailyBoardChangesTool,
    getConsecutiveLimitUp: consecutiveLimitUpTool,
    getStockPoolChange: stockPoolChangeTool,
    getBoardRankings: boardTool,
  },
});
