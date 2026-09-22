/**
 * 日志链路上下文（AsyncLocalStorage）。
 *
 * 目的：让「一次调用链」内所有日志自动带上同一组追踪字段，实现接口日志 ↔
 * 定时任务日志 ↔ quant 内部调用的全链路归集（Loki 里按 request_id / job_run_id 过滤）。
 *
 * 两个入口：
 *   1. HTTP 请求：middleware/request-id.ts 为每个请求建立上下文（source=external）；
 *   2. 定时任务：workers/sync-worker/wrapJob 通过 runWithJobContext 建立上下文
 *      （source=scheduled / manual）。
 *
 * 消费方：
 *   - lib/logger.ts 的 pino mixin：每条日志自动注入 request_id / job_run_id 等字段；
 *   - lib/quant.ts：把上下文体现在 X-Request-Id / X-Job-Run-Id 等请求头上发往 quant。
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** 触发来源：external=浏览器/外部调用；manual=界面手动同步；scheduled=定时任务；internal=服务间调用 */
export type LogSource = "external" | "manual" | "scheduled" | "internal";

export interface LogContext {
  /** 调用链追踪 ID（提交给下游的 X-Request-Id） */
  requestId: string;
  /** 上游调用链 ID（如 nginx 转发下来的父 ID） */
  parentRequestId?: string;
  /** 触发来源 */
  source: LogSource;
  /** 定时任务名（sync-worker 的 PipeName） */
  jobName?: string;
  /** job_run 主键，用于把 quant 内部调用挂回同一次任务 */
  jobRunId?: string;
  /** 交易日 YYYY-MM-DD */
  tradeDate?: string;
}

const store = new AsyncLocalStorage<LogContext>();

/** 在上下文内执行 fn（异步调用链自动传播，含未 await 的后台任务） */
export function runWithLogContext<T>(ctx: LogContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

/** 读取当前上下文；无上下文（如 scripts 直跑）时返回 undefined */
export function getLogContext(): LogContext | undefined {
  return store.getStore();
}

/** 就地补充上下文（不改动 requestId） */
export function patchLogContext(patch: Partial<Omit<LogContext, "requestId">>): void {
  const ctx = store.getStore();
  if (ctx) Object.assign(ctx, patch);
}

/** 构造发往 quant 的追踪请求头；无上下文时返回空对象，行为与改造前一致 */
export function traceHeaders(): Record<string, string> {
  const ctx = store.getStore();
  if (!ctx) return {};
  const headers: Record<string, string> = { "X-Request-Id": ctx.requestId };
  if (ctx.parentRequestId) headers["X-Parent-Request-Id"] = ctx.parentRequestId;
  if (ctx.source) headers["X-Log-Source"] = ctx.source;
  if (ctx.jobName) headers["X-Job-Name"] = ctx.jobName;
  if (ctx.jobRunId) headers["X-Job-Run-Id"] = ctx.jobRunId;
  if (ctx.tradeDate) headers["X-Trade-Date"] = ctx.tradeDate;
  return headers;
}
