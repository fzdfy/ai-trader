import { Hono } from "hono";
import { ok, badRequest, serverError } from "../lib/response";
import { mastra } from "../agent/mastra";

const askRoute = new Hono();

askRoute.post("/", async (c) => {
  const { question, threadId } = await c.req.json<{ question: string; threadId?: string }>();
  if (!question) return badRequest(c, "question is required");

  const agent = mastra.getAgent("stockAnalyst");

  // 没有传 threadId 时自动生成（新建会话）
  const thread = threadId ?? crypto.randomUUID();
  // resourceId 使用固定值（未来接入用户系统后替换为 userId）
  const resourceId = "default-user";

  try {
    const response = await agent.generate(question, {
      memory: {
        thread,
        resource: resourceId,
      },
    });

    // Mastra 的 toolResults 使用 chunk 格式：{ payload: { toolName, result } }
    const steps = (response.toolResults ?? []).map((t: any) => ({
      tool: t.payload?.toolName ?? t.toolName ?? "unknown",
      result: t.payload?.result ?? t.result ?? null,
    }));

    return ok(c, {
      id: crypto.randomUUID(),
      question,
      answer: response.text,
      threadId: thread,
      steps,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[ask] agent error:", err);
    return serverError(c, "AI 分析服务暂时不可用，请稍后重试。");
  }
});

// 获取指定 thread 的历史消息
askRoute.get("/threads/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  if (!threadId) return badRequest(c, "threadId is required");

  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    if (!mem) return ok(c, { messages: [] });

    // 使用 recall 获取 thread 中的消息
    const result = await mem.recall({
      threadId,
      resourceId: "default-user",
      perPage: false, // 不分页，全部返回
    });

    return ok(c, {
      messages: result?.messages ?? [],
    });
  } catch (err) {
    console.error("[ask] query thread error:", err);
    return serverError(c, "获取会话历史失败");
  }
});

// 列出所有 threads（从 memory 存储中查询）
askRoute.get("/threads", async (c) => {
  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    if (!mem) return ok(c, { threads: [] });

    // 查询该 resource 下的 threads
    const result = await mem.listThreads({
      perPage: false,
      filter: {
        resourceId: "default-user",
      },
    });

    const threads = (result?.threads ?? []).map((t: any) => ({
      id: t.id,
      title: t.title ?? "新会话",
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return ok(c, { threads });
  } catch (err) {
    console.error("[ask] list threads error:", err);
    return serverError(c, "获取会话列表失败");
  }
});

// 删除指定 thread
askRoute.delete("/threads/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  if (!threadId) return badRequest(c, "threadId is required");

  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    if (!mem) return ok(c, { deleted: true });

    await mem.deleteThread(threadId);
    return ok(c, { deleted: true });
  } catch (err) {
    console.error("[ask] delete thread error:", err);
    return serverError(c, "删除会话失败");
  }
});

export { askRoute };
