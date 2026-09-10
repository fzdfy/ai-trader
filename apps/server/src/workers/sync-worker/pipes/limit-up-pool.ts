/**
 * limit-up-pool 管道 — 同步当日涨停池到 limit_up_pool 表。
 *
 * 数据源：quant 数据服务东方财富涨停池接口（收盘后同步为当日快照）：
 *   quant.limitUpPool(today)
 *
 * 写入策略：upsert（date + symbol 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH），
 * 便于直接 JOIN quote_latest / bar1d_adj 等行情表。
 */

import { quant } from "../../../lib/quant";
import type { LimitUpPoolItem } from "../../../lib/quant";
import { db } from "../../../db";
import { limitUpPool } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { updateProgress } from "../progress";
import { localDateStr } from "../calendar";

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
async function upsertPool(today: string, rows: LimitUpPoolItem[]): Promise<number> {
  const values = rows.map((r) => ({
    date: today,
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

export async function limitUpPoolPipeRun(): Promise<void> {
  const today = localDateStr();

  updateProgress(0, 1, "开始同步涨停池");
  try {
    const pool = await quant.limitUpPool(today);
    console.log(`[limit-up-pool] got ${pool.length} rows (snapshot ${today})`);

    if (pool.length === 0) {
      console.log("[limit-up-pool] empty pool (非交易日或盘后未更新)，跳过写入");
      updateProgress(1, 1, "涨停池为空（非交易日或未更新）");
      return;
    }

    const count = await upsertPool(today, pool);
    updateProgress(1, 1, `涨停池同步完成（${count} 条）`);
    console.log(`[limit-up-pool] done. ${count} rows upserted (snapshot ${today})`);
  } catch (error) {
    console.error("[limit-up-pool] failed:", (error as Error).message ?? error);
    updateProgress(1, 1, `涨停池同步失败：${(error as Error).message ?? error}`);
  }
}
