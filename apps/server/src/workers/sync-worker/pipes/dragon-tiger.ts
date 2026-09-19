/**
 * dragon-tiger 管道 — 同步全市场龙虎榜到 dragon_tiger_daily 表。
 *
 * 数据源：quant 数据服务东方财富龙虎榜（RPT_DAILYBILLBOARD_DETAILSNEW，支持按 TRADE_DATE 查询历史）：
 *   quant.dailyDragonTiger(date)
 *
 * 时间语义：当日与回补分离，由调度层分别触发（东财该报表可按交易日回查，见 snapshot-backfill）：
 *   - dragonTigerPipeRun      —— 只同步目标交易日当天，空数据抛错触发重试。
 *   - dragonTigerBackfillRun  —— 只回补窗口内缺失的历史交易日，空数据跳过。
 *
 * 写入策略：upsert（date + symbol 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH）。金额单位：万元。
 */

import { quant } from "../../../lib/quant";
import type { DragonTigerStock } from "../../../lib/quant";
import { db } from "../../../db";
import { dragonTigerDaily } from "../../../db/schema";
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

/** upsert 全市场龙虎榜到 dragon_tiger_daily，返回写入条数 */
async function upsertDragonTiger(date: string, stocks: DragonTigerStock[]): Promise<number> {
  // 东财龙虎榜同一股票当天可能因多个榜单（如「日涨幅偏离值达7%」「日换手率达20%」）
  // 返回多条记录，而表主键为 (date, symbol)；若不先去重，同一批次会因重复冲突键触发
  // PostgreSQL「ON CONFLICT DO UPDATE command cannot affect row a second time」。
  // 这里按 symbol 合并：保留首条数值字段，多个上榜原因去重后拼接。
  const bySymbol = new Map<string, DragonTigerStock & { reasons: string[] }>();
  for (const r of stocks) {
    const symbol = codeToSymbol(r.code);
    const prev = bySymbol.get(symbol);
    if (!prev) {
      bySymbol.set(symbol, { ...r, code: symbol, reasons: r.reason ? [r.reason] : [] });
    } else if (r.reason && !prev.reasons.includes(r.reason)) {
      prev.reasons.push(r.reason);
    }
  }

  const values = [...bySymbol.values()].map((r) => ({
    date,
    symbol: r.code,
    name: r.name,
    reason: r.reasons.length > 0 ? r.reasons.join("；") : null,
    close: toStr(r.close),
    changePercent: toStr(r.change_pct),
    netBuyWan: toStr(r.net_buy_wan),
    buyWan: toStr(r.buy_wan),
    sellWan: toStr(r.sell_wan),
    turnoverPercent: toStr(r.turnover_pct),
    updatedAt: new Date(),
  }));
  for (let j = 0; j < values.length; j += 200) {
    await db
      .insert(dragonTigerDaily)
      .values(values.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [dragonTigerDaily.date, dragonTigerDaily.symbol],
        set: {
          name: sql.raw("excluded.name"),
          reason: sql.raw("excluded.reason"),
          close: sql.raw("excluded.close"),
          changePercent: sql.raw("excluded.change_percent"),
          netBuyWan: sql.raw("excluded.net_buy_wan"),
          buyWan: sql.raw("excluded.buy_wan"),
          sellWan: sql.raw("excluded.sell_wan"),
          turnoverPercent: sql.raw("excluded.turnover_percent"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
  }
  return values.length;
}

/** 组装共享配置：当日入口与回补入口复用同一套「取数 / 查已落库 / 写入」逻辑 */
function dragonTigerOpts(label: string, date?: string): SnapshotSyncOpts<DragonTigerStock> {
  return {
    label,
    title: "龙虎榜",
    date,
    existingDates: async (dates) => {
      const rows = await db
        .selectDistinct({ date: dragonTigerDaily.date })
        .from(dragonTigerDaily)
        .where(inArray(dragonTigerDaily.date, dates));
      return new Set(rows.map((r) => r.date));
    },
    fetchDate: async (d) => {
      const res = await quant.dailyDragonTiger(d);
      return res.stocks;
    },
    upsert: (d, rows) => upsertDragonTiger(d, rows),
  };
}

/** 当日同步：只处理目标交易日 */
export async function dragonTigerPipeRun(date?: string): Promise<void> {
  try {
    await runDailySnapshot(dragonTigerOpts("dragon-tiger", date));
  } catch (error) {
    console.error("[dragon-tiger] failed:", (error as Error).message ?? error);
    throw error;
  }
}

/** 历史回补：只补窗口内缺失的历史交易日（独立调度，与当日任务互不重叠） */
export async function dragonTigerBackfillRun(date?: string): Promise<void> {
  try {
    await runSnapshotBackfill(dragonTigerOpts("dragon-tiger-backfill", date));
  } catch (error) {
    console.error("[dragon-tiger-backfill] failed:", (error as Error).message ?? error);
    throw error;
  }
}
