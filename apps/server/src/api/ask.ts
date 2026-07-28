import { Hono } from "hono";
import { ok, badRequest } from "../lib/response";

const askRoute = new Hono();

askRoute.post("/", async (c) => {
  const { question } = await c.req.json<{ question: string }>();
  if (!question) return badRequest(c, "question is required");

  // Placeholder: will integrate with RAG + mastra agent
  return ok(c, {
    id: crypto.randomUUID(),
    question,
    answer: "AI 助手正在建设中，请稍后再试。",
    sources: [],
    createdAt: new Date().toISOString(),
  });
});

export { askRoute };
