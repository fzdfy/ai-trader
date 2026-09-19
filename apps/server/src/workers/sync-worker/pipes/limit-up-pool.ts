/**
 * limit-up-pool 管道 — 同步涨停池到 limit_up_pool 表。
 *
 * 数据源：quant 数据服务东方财富涨停池接口（可按交易日查询历史快照）：
 *   quant.limitUpPool(date)
 *
 * 时间语义：当日与回补分离，由调度层分别触发（东财 getTopicZTPool 支持任意历史日，见 snapshot-backfill）：
 *   - limitUpPoolPipeRun      —— 只同步目标交易日当天，空数据抛错触发重试。
 *   - limitUpPoolBackfillRun  —— 只回补窗口内缺失的历史交易日，空数据跳过。
 *
 * 写入策略：upsert（date + symbol 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH），
 * 便于直接 JOIN quote_latest / bar1d_adj 等行情表。
 */

import { quant } from "../../../lib/quant";
import type { LimitUpPoolItem } from "../../../lib/quant";
import { db } from "../../../db";
import { limitUpPool } from "../../../db/schema";
import { sql, inArray } from "drizzle-orm";
import { runDailySnapshot, runSnapshotBackfill, type SnapshotSyncOpts } from "../snapshot-backfill";

/** 东财原始 6 位代码 → 标准 symbol（60x/68x→.SH，00x/30x→.SZ，43/83/87/88/92→.BJ） */
function codeToSymbol(code: string): string {
  if (code.includes(".")) return code;
  if (/^(60|68)/.test(code)) return `${code}.SH`;
  if (/^(00|30)/.test(code)) return `${code}.SZ`;
  if (/^(43|83|87|88|92)/.test(code)) return `${code}.BJ`;
  return `${code}.SH`;
}

/** 数值统一为 string | null，与 drizzle numeric 列的插入类型保持一致 */
function toStr(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

/** "YYYY-MM-DD HH:MM:SS" → Date（转 ISO 本地时间，兼容 V8 Date 解析） */
function toDateTime(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** upsert 涨停池到 limit_up_pool，返回写入条数 */
async function upsertPool(date: string, rows: LimitUpPoolItem[]): Promise<number> {
  const values = rows.map((r) => ({
    date,
    symbol: codeToSymbol(r.code),
    name: r.name,
    limitUpCount: r.limit_up_count,
    isLimitUp: r.is_limit_up,
    firstLimitTime: toDateTime(r.first_limit_time),
    openCount: r.open_count,
    sealAmount: toStr(r.seal_amount),
    limitType: r.limit_type,
    industry: r.industry,
    concepts: r.concepts,
    turnoverRate: toStr(r.turnover_rate),
    amount: toStr(r.amount),
    floatMarketCap: toStr(r.float_market_cap),
    updatedAt: new Date(),
  }));

  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(limitUpPool)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [limitUpPool.date, limitUpPool.symbol],
        set: {
          name: sql.raw("excluded.name"),
          limitUpCount: sql.raw("excluded.limit_up_count"),
          isLimitUp: sql.raw("excluded.is_limit_up"),
          firstLimitTime: sql.raw("excluded.first_limit_time"),
          openCount: sql.raw("excluded.open_count"),
          sealAmount: sql.raw("excluded.seal_amount"),
          limitType: sql.raw("excluded.limit_type"),
          industry: sql.raw("excluded.industry"),
          concepts: sql.raw("excluded.concepts"),
          turnoverRate: sql.raw("excluded.turnover_rate"),
          amount: sql.raw("excluded.amount"),
          floatMarketCap: sql.raw("excluded.float_market_cap"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }

  return values.length;
}

/** 组装共享配置：当日入口与回补入口复用同一套「取数 / 查已落库 / 写入」逻辑 */
function limitUpPoolOpts(label: string, date?: string): SnapshotSyncOpts<LimitUpPoolItem> {
  return {
    label,
    title: "涨停池",
    date,
    existingDates: async (dates) => {
      const rows = await db
        .selectDistinct({ date: limitUpPool.date })
        .from(limitUpPool)
        .where(inArray(limitUpPool.date, dates));
      return new Set(rows.map((r) => r.date));
    },
    fetchDate: (d) => quant.limitUpPool(d),
    upsert: (d, rows) => upsertPool(d, rows),
  };
}

/** 当日同步：只处理目标交易日（cron 收盘后 / 手动同步） */
export async function limitUpPoolPipeRun(date?: string): Promise<void> {
  try {
    await runDailySnapshot(limitUpPoolOpts("limit-up-pool", date));
  } catch (error) {
    // 拉取 / 写入失败需 rethrow，让 wrapJob 标记 failed 触发重试，避免静默"假成功"
    console.error("[limit-up-pool] failed:", (error as Error).message ?? error);
    throw error;
  }
}

/** 历史回补：只补窗口内缺失的历史交易日（独立调度，与当日任务互不重叠） */
export async function limitUpPoolBackfillRun(date?: string): Promise<void> {
  try {
    await runSnapshotBackfill(limitUpPoolOpts("limit-up-pool-backfill", date));
  } catch (error) {
    console.error("[limit-up-pool-backfill] failed:", (error as Error).message ?? error);
    throw error;
  }
}
