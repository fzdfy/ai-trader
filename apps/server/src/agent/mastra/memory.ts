/**
 * Mastra Memory 配置 — 使用项目已有 PostgreSQL 存储会话历史。
 *
 * Thread 概念：
 *   - threadId: 一个会话（conversation）对应一个 thread
 *   - resourceId: 一个用户（user）对应一个 resource，共享跨 thread 的记忆
 *
 * 用法：
 *   agent.generate(msg, { memory: { thread: threadId, resource: userId } })
 *   memory.query({ threadId }) → 获取该 thread 的 UI 消息
 */
import { Memory } from "@mastra/memory";
import { storage } from "./storage";

export const memory = new Memory({
  storage: storage,
  options: {
    // 每次请求注入最近 20 条历史消息到上下文
    lastMessages: 20,
    generateTitle: {
      model: "deepseek/deepseek-v4-pro",
    },
  },
});
