/**
 * dragon-tiger 管道 — 同步全市场龙虎榜到 dragon_tiger_daily 表。
 *
 * 数据源：quant 数据服务东方财富龙虎榜（RPT_DAILYBILLBOARD_DETAILSNEW）：
 *   quant.dailyDragonTiger(today)
 *
 * 写入策略：upsert（date + symbol 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH）。金额单位：万元。
 */

import { quant } from "../../../lib/quant";
import type { DragonTigerStock } from "../../../lib/quant";
import { db } from "../../../db";
import { dragonTigerDaily } from "../../../db/schema";
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

/** upsert 全市场龙虎榜到 dragon_tiger_daily，返回写入条数 */
async function upsertDragonTiger(today: string, stocks: DragonTigerStock[]): Promise<number> {
  const values = stocks.map((r) => ({
    date: today,
    symbol: codeToSymbol(r.code),
    name: r.name,
    reason: r.reason || null,
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

export async function dragonTigerPipeRun(): Promise<void> {
  const today = localDateStr();

  updateProgress(0, 1, "开始同步龙虎榜");
  try {
    const { stocks } = await quant.dailyDragonTiger(today);
    console.log(`[dragon-tiger] got ${stocks.length} stocks (snapshot ${today})`);

    if (stocks.length === 0) {
      // marketCloseOnly 已保证进入此处必为交易日收盘后，空榜几乎只会是「数据未就绪」；
      // throw 让 wrapJob 标记 failed 触发重试，避免空榜静默 success 后 hasSuccessToday 幂等
      // 导致当天后续重试全部跳过、龙虎榜数据永久缺失。
      throw new Error("[dragon-tiger] 龙虎榜为空（数据未就绪），等待重试");
    }

    const count = await upsertDragonTiger(today, stocks);
    updateProgress(1, 1, `龙虎榜同步完成（${count} 条）`);
    console.log(`[dragon-tiger] done. ${count} rows upserted (snapshot ${today})`);
  } catch (error) {
    console.error("[dragon-tiger] failed:", (error as Error).message ?? error);
    updateProgress(1, 1, `龙虎榜同步失败：${(error as Error).message ?? error}`);
    throw error;
  }
}
