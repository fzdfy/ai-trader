import { Hono } from "hono";
import { serverError } from "../../lib/response";
import { mastra } from "../../agent/mastra";
import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";

/**
 * chat 路由 — 流式对话，挂载于 /api/v1/agents/chat
 *
 * POST /stream   AI SDK 格式流式对话，配合前端 useChat
 */
const chatRoute = new Hono();

chatRoute.post("/stream", async (c) => {
  try {
    const params = await c.req.json();
    const stream = await handleChatStream({
      mastra,
      agentId: "stockAnalyst",
      params,
      version: "v6",
      onError: (err) => {
        console.error("[chat] stream error:", err);
        return "AI 分析服务暂时不可用，请稍后重试。";
      },
    });
    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    console.error("[chat] fatal error:", err);
    return serverError(c, "流式对话服务暂时不可用");
  }
});

export { chatRoute };
