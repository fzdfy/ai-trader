import { Hono } from "hono";
import { ok, badRequest, serverError } from "../../lib/response";
import { mastra } from "../../agent/mastra";

/**
 * threads 路由 — 线程 CRUD，挂载于 /api/v1/agents/threads
 *
 * POST   /              创建空线程（返回 threadId）
 * GET    /              列出所有线程
 * GET    /:threadId     获取线程历史消息
 * DELETE /:threadId     删除线程
 */
const threadsRoute = new Hono();

// 创建空线程（通过 Mastra Memory.createThread 在存储层创建）
threadsRoute.post("/", async (c) => {
  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    const thread = await mem?.createThread({
      resourceId: "default-user",
    });
    return ok(c, { threadId: thread?.id ?? crypto.randomUUID() });
  } catch (err) {
    console.error("[threads] create error:", err);
    return serverError(c, "创建会话失败");
  }
});

// 列出所有线程
threadsRoute.get("/", async (c) => {
  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    if (!mem) return ok(c, { threads: [] });

    const result = await mem.listThreads({
      perPage: false,
      filter: { resourceId: "default-user" },
    });

    const threads = (result?.threads ?? []).map((t: any) => ({
      id: t.id,
      title: t.title ?? "新会话",
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return ok(c, { threads });
  } catch (err) {
    console.error("[threads] list error:", err);
    return serverError(c, "获取会话列表失败");
  }
});

// 获取指定线程的历史消息
threadsRoute.get("/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  if (!threadId) return badRequest(c, "threadId is required");

  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    if (!mem) return ok(c, { messages: [] });

    const result = await mem.recall({
      threadId,
      resourceId: "default-user",
      perPage: false,
    });

    return ok(c, { messages: result?.messages ?? [] });
  } catch (err) {
    console.error("[threads] query error:", err);
    return serverError(c, "获取会话历史失败");
  }
});

// 删除指定线程
threadsRoute.delete("/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  if (!threadId) return badRequest(c, "threadId is required");

  try {
    const agent = mastra.getAgent("stockAnalyst");
    const mem = await agent.getMemory();
    if (!mem) return ok(c, { deleted: true });

    await mem.deleteThread(threadId);
    return ok(c, { deleted: true });
  } catch (err) {
    console.error("[threads] delete error:", err);
    return serverError(c, "删除会话失败");
  }
});

export { threadsRoute };
