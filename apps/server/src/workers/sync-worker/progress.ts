/**
 * 同步进度工具 — 关联当前 job_run 记录并实时上报进度。
 *
 * 机制：wrapJob（sync-worker 调度）与手动同步接口（api/sync.ts）创建 job_run 行后，
 * 用 runWithProgress(runId, fn) 包裹管道执行；管道内部任意位置调用 updateProgress()
 * 即可更新当前 runId 的 processed / total / message。
 *
 * 实现基于 AsyncLocalStorage：无需改动管道函数签名，运行上下文自动传播。
 * scripts/*.ts 直接调用管道（未包裹 runWithProgress）时，store 为空，
 * updateProgress 自动 no-op，不影响脚本执行。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { jobRun } from "../../db/schema";

/** 当前运行的 job_run 上下文 */
const progressStore = new AsyncLocalStorage<{ runId: number }>();

/** 在 job_run 上下文中执行同步管道，管道内 updateProgress 会写入该 runId */
export function runWithProgress<T>(runId: number, fn: () => Promise<T>): Promise<T> {
  return progressStore.run({ runId }, fn);
}

/**
 * 上报进度（异步落库，不阻塞管道执行）。
 *
 * @param processed 已完成量
 * @param total     预计总量
 * @param message   阶段说明（可选）
 */
export function updateProgress(processed: number, total: number, message?: string): void {
  const ctx = progressStore.getStore();
  if (!ctx) return; // 非 job_run 上下文（如 scripts 直跑），跳过
  // 注意：drizzle update builder 是 thenable，必须 .execute() 才会真正发 SQL；
  // 这里显式 execute + 丢弃结果，避免阻塞管道，同时 catch 防止未处理 rejection
  void db
    .update(jobRun)
    .set({ processed, total, message: message ?? null })
    .where(eq(jobRun.id, ctx.runId))
    .execute()
    .catch((error) => {
      console.error("[progress] update job_run failed:", error);
    });
}
