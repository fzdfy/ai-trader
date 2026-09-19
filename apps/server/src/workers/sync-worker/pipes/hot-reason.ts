/**
 * hot-reason 管道 — 同步同花顺强势股 + 题材归因到 hot_reason 表。
 *
 * 数据源：quant 数据服务同花顺强势股题材归因（可按交易日查询历史快照）：
 *   quant.hotReason(date)
 *
 * 时间语义：当日与回补分离，由调度层分别触发（同花顺 getharden/date/{date} 支持历史日，
 * 但受上游保留期限制，见 snapshot-backfill）：
 *   - hotReasonPipeRun      —— 只同步目标交易日当天，空数据抛错触发重试。
 *   - hotReasonBackfillRun  —— 只回补窗口内缺失的历史交易日，空数据跳过。
 *
 * 写入策略：upsert（date + symbol 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH）。
 */

import { quant } from "../../../lib/quant";
import type { HotReasonItem } from "../../../lib/quant";
import { db } from "../../../db";
import { hotReason } from "../../../db/schema";
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

/** upsert 同花顺强势股 + 题材归因到 hot_reason，返回写入条数 */
async function upsertHotReason(date: string, rows: HotReasonItem[]): Promise<number> {
  const values = rows.map((r) => ({
    date,
    symbol: codeToSymbol(r.code),
    name: r.name,
    reason: r.reason || null,
    close: toStr(r.close),
    change: toStr(r.change),
    changePercent: toStr(r.change_pct),
    turnoverRate: toStr(r.turnover_rate),
    amount: toStr(r.amount),
    volume: toStr(r.volume),
    largeOrderNet: toStr(r.large_order_net),
    market: r.market || null,
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(hotReason)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [hotReason.date, hotReason.symbol],
        set: {
          name: sql.raw("excluded.name"),
          reason: sql.raw("excluded.reason"),
          close: sql.raw("excluded.close"),
          change: sql.raw("excluded.change"),
          changePercent: sql.raw("excluded.change_percent"),
          turnoverRate: sql.raw("excluded.turnover_rate"),
          amount: sql.raw("excluded.amount"),
          volume: sql.raw("excluded.volume"),
          largeOrderNet: sql.raw("excluded.large_order_net"),
          market: sql.raw("excluded.market"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

/** 组装共享配置：当日入口与回补入口复用同一套「取数 / 查已落库 / 写入」逻辑 */
function hotReasonOpts(label: string, date?: string): SnapshotSyncOpts<HotReasonItem> {
  return {
    label,
    title: "题材归因",
    date,
    existingDates: async (dates) => {
      const rows = await db
        .selectDistinct({ date: hotReason.date })
        .from(hotReason)
        .where(inArray(hotReason.date, dates));
      return new Set(rows.map((r) => r.date));
    },
    fetchDate: (d) => quant.hotReason(d),
    upsert: (d, rows) => upsertHotReason(d, rows),
  };
}

/** 当日同步：只处理目标交易日 */
export async function hotReasonPipeRun(date?: string): Promise<void> {
  try {
    await runDailySnapshot(hotReasonOpts("hot-reason", date));
  } catch (error) {
    // 拉取 / 写入失败需 rethrow，让 wrapJob 标记 failed 触发重试，避免静默"假成功"
    console.error("[hot-reason] failed:", (error as Error).message ?? error);
    throw error;
  }
}

/** 历史回补：只补窗口内缺失的历史交易日（独立调度，与当日任务互不重叠） */
export async function hotReasonBackfillRun(date?: string): Promise<void> {
  try {
    await runSnapshotBackfill(hotReasonOpts("hot-reason-backfill", date));
  } catch (error) {
    console.error("[hot-reason-backfill] failed:", (error as Error).message ?? error);
    throw error;
  }
}
