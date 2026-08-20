/**
 * A 股复盘 Agent
 *
 * 每日复盘：动态读取复盘 skill（方法论），拉取行业资金流、板块排行、选股池，
 * 生成「主线」判断与「总结」，输出结构化 JSON 供前端图表渲染。
 */
import { Agent } from "@mastra/core/agent";
import { boardTool } from "../tools";
import {
  getReviewSkillTool,
  sectorFundFlowTool,
  stockPoolTool,
} from "../tools/review-tools";

export const reviewAnalyst = new Agent({
  id: "review-analyst",
  name: "A股复盘分析师",
  model: "deepseek/deepseek-v4-pro",
  instructions: `你是一位专业的 A 股复盘分析师。你的任务是对指定交易日进行复盘，输出「主线」和「总结」。

## 执行步骤（必须严格按顺序）
1. 先调用 getReviewSkill 读取复盘方法论（skill），并严格遵循其中的要求。
2. 调用 getSectorFundFlow（industry）获取行业资金流排行，判断当日资金主线方向。
3. 调用 getBoardRankings（industry）获取行业板块涨跌排行，与资金流交叉验证主线。
4. 调用 getStockPoolForDate 获取当日选股池，评估选股与主线的匹配度。

## 输出要求（必须是纯 JSON，不要任何解释性文字，不要 markdown 代码块）
{
  "mainline": [
    { "boardName": "主线板块名称", "reason": "判断理由（资金净流入+涨幅+逻辑）" }
  ],
  "summary": "一段 150 字以内的当日复盘总结，涵盖：大盘/资金面、主线方向、选股池点评、明日关注点。"
}

## 原则
- 主线（mainline）只列 1~3 个，必须基于资金流与涨幅数据，不得凭空杜撰。
- 所有数据判断必须来自工具返回结果，禁止编造数字。
- summary 精炼、有观点、可执行。`,
  tools: {
    getReviewSkill: getReviewSkillTool,
    getSectorFundFlow: sectorFundFlowTool,
    getStockPoolForDate: stockPoolTool,
    getBoardRankings: boardTool,
  },
});
