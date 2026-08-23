/**
 * stock-sdk 请求治理封装。
 *
 * stock-sdk 的每个接口内部会调用多个 provider 并做重试/降级（fallback），
 * 部分 provider 请求失败是正常的 —— SDK 会汇总成功结果，只有全部 provider 都失败时
 * 才会向调用方抛错。因此：
 *   1. 显式配置 timeout + retry，让 SDK 内部重试更充分、单次超时更短（避免长时间 hang）；
 *   2. 业务层再包一层有限重试，把「偶发网络/超时抖动」与「接口真正不可用」区分开，
 *      只有可重试错误（网络/超时/限流/熔断/上游）才重试，其余错误直接抛出。
 */
import { StockSDK } from "stock-sdk";
import { getSdkErrorCode } from "stock-sdk/errors";
import { createLogger } from "./logger";

const log = createLogger("sdk");

/** 可重试的 SDK 错误码（瞬时/上游问题，重试有望恢复） */
const RETRYABLE_CODES = new Set([
  "NETWORK_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "CIRCUIT_OPEN",
  "UPSTREAM_ERROR",
]);

/** 正常浏览器 UA（东财风控要求带浏览器特征，避免被识别为爬虫） */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * 创建带请求治理的 StockSDK 实例。
 *
 * 东财风控（社区实测，2026-05）：
 *   - QPS > 5 / 单 IP 并发 ≥ 10 / 1min ≥ 200 / 5min ≥ 300 / 空 UA 无浏览器特征，均可能触发封禁。
 * 因此按「防封铁律」配置：
 *   - 串行不并发：eastmoney 令牌桶 requestsPerSecond=1 + maxBurst=1（每次间隔 ≥ 1s，QPS ≤ 2）；
 *   - 正常浏览器 UA（全局，Node 环境生效）+ 东财 Referer，避免被识别为爬虫；
 *   - 复用 HTTP 会话由 Node 全局 fetch（undici）默认 Keep-Alive 承担，无需额外参数；
 *   - 「随机抖动」SDK 令牌桶不提供，批量循环场景需业务层在每只股票之间额外 sleep。
 * timeout 缩短单次请求上限；retry 开启网络错误/超时重试（provider 级，SDK 内部生效）。
 */
export function createSdk(): StockSDK {
  return new StockSDK({
    timeout: 10_000,
    // 东财风控：空 UA / 无浏览器特征会被封，统一带正常浏览器 UA（非东财 provider 兜底）
    userAgent: BROWSER_UA,
    retry: {
      maxRetries: 1,
      baseDelay: 300,
      maxDelay: 300,
      retryOnNetworkError: true,
      retryOnTimeout: true,
    },
    providerPolicies: {
      eastmoney: {
        timeout: 10_000,
        // 串行不并发 + 每次间隔 ≥ 1s（QPS ≤ 2）
        rateLimit: { requestsPerSecond: 1, maxBurst: 1 },
        // 东财风控：显式带正常 UA + Referer
        headers: {
          "User-Agent": BROWSER_UA,
          Referer: "https://quote.eastmoney.com/",
          Accept: "application/json, text/plain, */*",
        },
      },
    },
  });
}

export interface RetryOptions {
  /** 最多尝试次数（含首次），默认 3 */
  maxAttempts?: number;
  /** 首次重试退避毫秒，默认 500，指数递增 */
  baseDelayMs?: number;
  /** 日志标签 */
  label?: string;
}

/**
 * 业务层有限重试：SDK 抛错说明其内部多 provider 重试/降级已耗尽，
 * 这里对可重试错误再做整体重试，避免偶发抖动被误判为接口不可用。
 * 明确不可重试的错误（参数/符号/解析等）会直接抛出，不做无意义重试。
 */
export async function withSdkRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, label = "sdk" } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = getSdkErrorCode(error);
      // 明确不可重试的错误码 → 直接放弃
      if (code && !RETRYABLE_CODES.has(code)) {
        throw error;
      }
      if (attempt < maxAttempts) {
        // const delay = baseDelayMs * 2 ** (attempt - 1);
        const delay = baseDelayMs;
        log.warn({ code, attempt, delay }, `[${label}] 第 ${attempt} 次失败，${delay}ms 后重试`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
