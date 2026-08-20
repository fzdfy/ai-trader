/**
 * Mastra 实例入口 — 注册 agent 及其工具
 */
import { Mastra } from "@mastra/core";
import { stockAnalyst } from "./agents/stock-analyst";
import { factorGenerator } from "./agents/factor-generator";
import { reviewAnalyst } from "./agents/review-analyst";
import { instrumentTool, quoteTool, klineTool, boardTool } from "./tools";
import { storage } from "./storage";

export const mastra = new Mastra({
  agents: { stockAnalyst, factorGenerator, reviewAnalyst },
  storage: storage,
});

export { memory } from "./memory";
