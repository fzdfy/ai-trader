import pino from "pino";
import { getLogContext } from "./request-context";

const isProduction = process.env.NODE_ENV === "production";
const logFormat = process.env.LOG_FORMAT || (isProduction ? "json" : "pretty");

/**
 * 创建带 module 字段的子 logger
 *
 * 用法：
 *   const log = createLogger("kline-1d");
 *   log.info({ symbolCount: 500 }, "开始同步");
 *   log.error({ err: e }, "拉取失败");
 */
export function createLogger(module: string, extra?: Record<string, unknown>) {
  return logger.child({ module, ...extra });
}

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // 注入全局字段
  base: {
    service: process.env.SERVICE_NAME || "server",
  },
  /**
   * 数字 level → 字符串（info / warn / error）。
   * 采集侧（Grafana Alloy）把 level 提取为 Loki stream label，数字会变成 "30" 这类
   * 无意义取值，故在产出端就归一为语义化标签。
   */
  formatters: {
    level: (label) => ({ level: label }),
  },
  /**
   * 每条日志自动带上当前调用链上下文（request_id / job_run_id 等）。
   * 采集侧（Grafana Alloy）会把 request_id、job_run_id、route 等高基数字段
   * 放进 structured metadata，而不是 Loki label，避免索引爆炸。
   */
  mixin() {
    const ctx = getLogContext();
    if (!ctx) return {};
    return {
      source: ctx.source,
      request_id: ctx.requestId,
      ...(ctx.parentRequestId ? { parent_request_id: ctx.parentRequestId } : {}),
      ...(ctx.jobName ? { job_name: ctx.jobName } : {}),
      ...(ctx.jobRunId ? { job_run_id: ctx.jobRunId } : {}),
      ...(ctx.tradeDate ? { trade_date: ctx.tradeDate } : {}),
    };
  },
  // 开发模式 pretty print，生产模式 JSON
  ...(logFormat === "pretty"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname,service",
            messageFormat: "[{module}] {msg}",
          },
        },
      }
    : {}),
  // 错误对象自动序列化 message + stack
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});
