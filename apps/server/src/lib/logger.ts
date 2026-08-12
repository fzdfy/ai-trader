import pino from "pino";

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
