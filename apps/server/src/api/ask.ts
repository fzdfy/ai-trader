import { Hono } from "hono";
import { ok, badRequest, serverError } from "../lib/response";
import { mastra } from "../agent/mastra";

const askRoute = new Hono();

askRoute.post("/", async (c) => {
  const { question } = await c.req.json<{ question: string }>();
  if (!question) return badRequest(c, "question is required");

  const agent = mastra.getAgent("stockAnalyst");

  try {
    const response = await agent.generate(question);

    return ok(c, {
      id: crypto.randomUUID(),
      question,
      answer: response.text,
      steps: response.toolResults.map((t) => ({
        tool: t.toolName,
        result: t.result,
      })),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[ask] agent error:", err);
    return serverError(c, "AI 分析服务暂时不可用，请稍后重试。");
  }
});

export { askRoute };
