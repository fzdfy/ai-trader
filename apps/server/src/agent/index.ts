/**
 * AI Agent 模块 — 基于 Mastra 框架
 *
 * 提供智能问股、信号解释、回测策略生成等能力。
 * 当前为骨架，接入 Mastra 后替换。
 */

export interface AgentConfig {
  name: string;
  model: string;
  instructions: string;
}

const stockAnalystConfig: AgentConfig = {
  name: "stock-analyst",
  model: "gpt-4o-mini",
  instructions: `你是一位专业的 A 股分析师。基于提供的行情数据、技术指标、
新闻事件和历史回测结果，回答用户问题并给出分析建议。`,
};

/**
 * 调用 AI agent 回答问题
 *
 * TODO: 接入 Mastra agent runtime
 */
export async function askAgent(
  question: string,
  context?: Record<string, unknown>,
): Promise<{ answer: string; sources: string[] }> {
  console.log("[agent] received question:", question);

  // Placeholder: 实际接入后调用 mastra agent
  return {
    answer: `关于 "${question}" 的分析结果将在接入 Mastra AI agent 后提供。`,
    sources: [],
  };
}

export { stockAnalystConfig };
