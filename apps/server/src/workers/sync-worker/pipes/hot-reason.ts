/**
 * hot-reason 管道 — 同步同花顺强势股 + 题材归因到 hot_reason 表。
 *
 * 数据源：quant 数据服务同花顺强势股题材归因：
 *   quant.hotReason(today)
 *
 * 写入策略：upsert（date + symbol 主键，同日覆盖为当天最后一次同步结果）。
 * 上游返回 6 位裸代码（如 600519），落库前转换为标准 symbol（600519.SH）。
 */

import { quant } from "../../../lib/quant";
import type { HotReasonItem } from "../../../lib/quant";
import { db } from "../../../db";
import { hotReason } from "../../../db/schema";
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

/** upsert 同花顺强势股 + 题材归因到 hot_reason，返回写入条数 */
async function upsertHotReason(today: string, rows: HotReasonItem[]): Promise<number> {
  const values = rows.map((r) => ({
    date: today,
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

export async function hotReasonPipeRun(): Promise<void> {
  const today = localDateStr();

  updateProgress(0, 1, "开始同步题材归因");
  try {
    const rows = await quant.hotReason(today);
    console.log(`[hot-reason] got ${rows.length} rows (snapshot ${today})`);

    if (rows.length === 0) {
      // marketCloseOnly 已保证进入此处必为交易日收盘后，空列表几乎只会是「数据未就绪」；
      // throw 让 wrapJob 标记 failed 触发重试，避免空列表静默 success 后 hasSuccessToday 幂等
      // 导致当天后续重试全部跳过、题材归因数据永久缺失。
      throw new Error("[hot-reason] 题材归因为空（数据未就绪），等待重试");
    }

    const count = await upsertHotReason(today, rows);
    updateProgress(1, 1, `题材归因同步完成（${count} 条）`);
    console.log(`[hot-reason] done. ${count} rows upserted (snapshot ${today})`);
  } catch (error) {
    console.error("[hot-reason] failed:", (error as Error).message ?? error);
    updateProgress(1, 1, `题材归因同步失败：${(error as Error).message ?? error}`);
    throw error;
  }
}
