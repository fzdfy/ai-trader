/**
 * adj-factor 管道 — 反解仿射复权参数并落库（Route A：复刻腾讯仿射复权）。
 *
 * 数据源：quant 数据服务 `GET /api/v1/data/adjust-params`（沪深固定腾讯源，北交所固定
 * 东财源——腾讯无 BJ 历史）。每个标的取同 symbol 的 raw / qfq / hfq 三份日线并对齐，
 * 反解分段仿射参数：
 *   qfq_t = qfq_ratio · raw_t + qfq_offset   （分段；qfq_ratio 为送转/拆股累计比）
 *   hfq_t = scale · qfq_t + hfq_base          （全局，标的级常量）
 *
 * 落库：
 *   - adj_factor         每 (symbol, date) 一段（date 为段起始日）。按 PK 幂等 upsert，
 *                        并在每次同步后删除不在本次快照内的旧段，使表恒等于最新快照。
 *   - adj_factor_latest  每 symbol 一行（scale / hfq_base），供 hfq 视图 hash join。
 *
 * 口径铁律：源按市场固定（沪深 tencent / 北交所 eastmoney），失败退避重试后仍失败按
 * 「缺失」计数，绝不降级到其他源，否则会污染 qfq 口径。
 *
 * 已知限制：腾讯 fqkline 单次最多返回约 800 根日线，参数只覆盖最近窗口；更早历史无法从
 * 腾讯仿射式直接反解（详见 quant/data/adjust.py 模块文档）。
 */

import { db } from "../../../db";
import { adjFactor, adjFactorLatest, instrument } from "../../../db/schema";
import { quant, type AdjustParams } from "../../../lib/quant";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { updateProgress } from "../progress";

/** 按市场选反解源：北交所腾讯无历史改走东财，其余固定腾讯。 */
function adjustSource(symbol: string): "tencent" | "eastmoney" {
  return symbol.endsWith(".BJ") ? "eastmoney" : "tencent";
}

/** 单标的拉取窗口（腾讯 fqkline 单次上限约 800 根；东财同样支持） */
const PARAM_LIMIT = 800;
/** 受控并发：每标的 3 次上游请求（none/qfq/hfq），压到限流阈值之下 */
const CONCURRENCY = 2;
/** 限流降速：上游持续高频请求会触发限流（返回空/超时），标的间留出间隔 */
const THROTTLE_MS = 800;
/** 拉取重试次数（上游限流返回空/异常，退避重试） */
const MAX_ATTEMPTS = 3;
/** 缺失容差：少数标的上游失败可容忍，超过则判任务失败触发 deadline 重试 */
const MISSING_TOLERANCE = 10;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 拉取单标的复权参数（退避重试）；重试耗尽返回 null（按缺失计）。 */
async function fetchParams(symbol: string): Promise<AdjustParams | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await quant.adjustParams(symbol, PARAM_LIMIT, adjustSource(symbol));
    } catch (error) {
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[adj-factor] ${symbol} 拉取失败，${attempt}/${MAX_ATTEMPTS} 次后退避重试:`, error);
      } else {
        console.error(`[adj-factor] ${symbol} 重试 ${MAX_ATTEMPTS} 次后仍失败:`, error);
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleep(5000 * attempt);
  }
  return null;
}

/** 幂等落库单标的参数（快照式：先 upsert 本次段，再删除不在本次快照内的旧段）。返回段数。 */
async function upsertParams(params: AdjustParams): Promise<number> {
  const dates = params.points.map((p) => p.date);
  if (dates.length === 0) return 0;
  const now = new Date();

  await db
    .insert(adjFactor)
    .values(
      params.points.map((p) => ({
        symbol: params.symbol,
        date: p.date,
        qfqRatio: String(p.qfq_ratio),
        qfqOffset: String(p.qfq_offset),
        source: params.source,
        sourceUpdatedAt: now,
        ingestedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [adjFactor.symbol, adjFactor.date],
      set: {
        qfqRatio: sql.raw("excluded.qfq_ratio"),
        qfqOffset: sql.raw("excluded.qfq_offset"),
        source: sql.raw("excluded.source"),
        sourceUpdatedAt: sql.raw("excluded.source_updated_at"),
        ingestedAt: sql.raw("excluded.ingested_at"),
      },
    });

  // 快照式收敛：删除不在本次参数集合内的旧段，避免窗口前移后遗留陈旧分段
  await db
    .delete(adjFactor)
    .where(and(eq(adjFactor.symbol, params.symbol), notInArray(adjFactor.date, dates)));

  if (params.latest_date !== "") {
    await db
      .insert(adjFactorLatest)
      .values({
        symbol: params.symbol,
        date: params.latest_date,
        scale: String(params.scale),
        hfqBase: String(params.hfq_base),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: adjFactorLatest.symbol,
        set: {
          date: sql.raw("excluded.date"),
          scale: sql.raw("excluded.scale"),
          hfqBase: sql.raw("excluded.hfq_base"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }

  return dates.length;
}

/**
 * 反解并同步全部上市标的的复权仿射参数。
 * opts.symbols：只同步指定标的（用于局部验证 / 定向回填），默认全部上市标的。
 */
export async function adjFactorPipeRun(opts?: { symbols?: string[] }): Promise<void> {
  let symbols = opts?.symbols;
  if (symbols == null) {
    const rows = await db
      .select({ symbol: instrument.symbol })
      .from(instrument)
      .where(eq(instrument.status, "listed"));
    symbols = rows.map((r) => r.symbol);
  }

  if (symbols.length === 0) {
    console.log("[adj-factor] no listed symbols, skip");
    return;
  }

  const total = symbols.length;
  console.log(`[adj-factor] syncing ${total} symbols`);
  updateProgress(0, total, "开始反解复权仿射参数");

  let done = 0;
  let synced = 0;
  let segments = 0;
  const missingSample: string[] = [];

  let idx = 0;
  const worker = async () => {
    while (idx < symbols.length) {
      const symbol = symbols[idx++]!;
      const params = await fetchParams(symbol);
      if (params != null && params.points.length > 0) {
        segments += await upsertParams(params);
        synced++;
      } else {
        if (missingSample.length < 20) missingSample.push(symbol);
        console.warn(`[adj-factor] ${symbol} 无有效复权参数，记为未同步`);
      }
      done++;
      // 全市场 5000+ 标的，逐条上报写库过频，每 50 条上报一次
      if (done % 50 === 0 || done === total) {
        updateProgress(synced, total, `已反解复权参数 ${synced}/${total}`);
      }
      await sleep(THROTTLE_MS);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()));

  if (synced === 0) {
    throw new Error("[adj-factor] 未取到任何标的的复权参数，未写入有效记录");
  }

  // 覆盖判据：缺失超出容差即判失败，抛错触发上层 deadline 重试，杜绝假成功
  const missing = total - synced;
  if (missing > MISSING_TOLERANCE) {
    throw new Error(
      `[adj-factor] ${total} 只标的中仍有 ${missing} 只未取到复权参数（容差 ${MISSING_TOLERANCE}），任务未完全成功` +
        (missingSample.length > 0 ? `。示例：${missingSample.slice(0, 5).join(", ")}` : ""),
    );
  }

  console.log(`[adj-factor] done. 已同步 ${synced}/${total} 只，写入 ${segments} 个参数段`);
}
