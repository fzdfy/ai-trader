/**
 * Mastra 实例入口 — 注册 agent 及其工具
 */
import { Mastra } from "@mastra/core";
import { stockAnalyst } from "./agents/stock-analyst";
import { instrumentTool, quoteTool, klineTool, boardTool } from "./tools";

export const mastra = new Mastra({
  agents: { stockAnalyst },
  tools: { instrumentTool, quoteTool, klineTool, boardTool },
});
