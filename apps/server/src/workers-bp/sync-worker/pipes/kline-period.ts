/**
 * kline-period 管道 — 由 bar1d_adj 日线聚合生成 5日/周/月 周期 K 线。
 *
 * 设计要点：
 * - 只从日线表本地聚合，不调上游 API，保证复权口径一致。
 * - 增量：只重算"包含最新交易日的那一个周期"，其余周期不动。
 * - 全量：删除该 symbol 该 period 的全部记录后重建（scripts/sync-kline-period.ts 调用）。
 *
 * 周期归属：
 * - 5d  : 按交易序号每 5 根日线一组（(ROW_NUMBER - 1) / 5）
 * - 1w  : 自然周（DATE_TRUNC('week', time)）
 * - 1mo : 自然月（DATE_TRUNC('month', time)）
 *
 * 聚合规则：
 *   open=首根 open, high=MAX, low=MIN, close=末根 close,
 *   volume/amount=SUM, bar_count=COUNT, first_day=MIN(time)
 */

import { db } from "../../../db";
import { instrument } from "../../../db/schema";
import { sql, eq } from "drizzle-orm";

export type Period = "5d" | "1w" | "1mo";

export const PERIODS: Period[] = ["5d", "1w", "1mo"];

/**
 * 计算某 symbol 最新交易日所属周期的起点（该周期内第一根日线的日期）。
 *
 * - 1w : 最新交易日所在自然周的周一
 * - 1mo: 最新交易日所在自然月的 1 号
 * - 5d : 最新一根日线所在滚动组的第一根日线日期
 */
async function periodStart(symbol: string, period: Period): Promise<Date | null> {
  const trunc =
    period === "1w"
      ? "DATE_TRUNC('week', MAX(time))"
      : period === "1mo"
        ? "DATE_TRUNC('month', MAX(time))"
        : null;

  let start: unknown;
  if (trunc === null) {
    // 5d 需要按交易序号反推组内起点
    const res = await db.execute(sql`
      SELECT MIN(t.time) AS start
      FROM (
        SELECT time, (ROW_NUMBER() OVER (ORDER BY time) - 1) / 5 AS grp
        FROM bar1d_adj
        WHERE symbol = ${symbol}
      ) t
      WHERE t.grp = (SELECT (COUNT(*) - 1) / 5 FROM bar1d_adj WHERE symbol = ${symbol})
    `);
    start = res.rows[0]?.start;
  } else {
    const res = await db.execute(sql`
      SELECT ${sql.raw(trunc)} AS start
      FROM bar1d_adj
      WHERE symbol = ${symbol}
    `);
    start = res.rows[0]?.start;
  }

  return start == null ? null : new Date(String(start));
}

/**
 * 对单个 symbol 聚合某个周期。
 *
 * @param symbol   标的代码
 * @param period   周期类型
 * @param start    增量模式：只聚合 >= start 的日线（该周期起点）；
 *                 全量模式：null，聚合全部日线并先清空该 symbol 旧记录
 *
 * 实现说明：
 * - 5d 的窗口函数 ROW_NUMBER 不能出现在 GROUP BY 中（PG 限制），
 *   所以先子查询算出滚动组号 grp，外层再按 (symbol, grp) 分组。
 * - 1w / 1mo 的 DATE_TRUNC 是普通标量函数，可直接 GROUP BY。
 */
async function aggregateSymbol(
  symbol: string,
  period: Period,
  start: Date | null,
): Promise<number> {
  if (start === null) {
    // 全量：先清空该 symbol 该周期的旧记录，保证与日线严格一致
    await db.execute(sql`
      DELETE FROM bar_period_adj WHERE period = ${period} AND symbol = ${symbol}
    `);
  } else {
    // 增量：删除旧周期记录后重灌（周期归属随时间不可变，直接重算）
    await db.execute(sql`
      DELETE FROM bar_period_adj
      WHERE period = ${period} AND symbol = ${symbol} AND time >= ${start}
    `);
  }

  const where =
    start === null
      ? sql`WHERE d.symbol = ${symbol}`
      : sql`WHERE d.symbol = ${symbol} AND d.time >= ${start}`;

  const result =
    period === "5d"
      ? await db.execute(sql`
          INSERT INTO bar_period_adj (
            period, time, symbol, open, high, low, close, volume, amount,
            bar_count, first_day, source_updated_at
          )
          SELECT
            ${period},
            MAX(t.time),
            t.symbol,
            (ARRAY_AGG(t.open ORDER BY t.time))[1],
            MAX(t.high),
            MIN(t.low),
            (ARRAY_AGG(t.close ORDER BY t.time DESC))[1],
            SUM(t.volume),
            SUM(t.amount),
            COUNT(*),
            MIN(t.time)::date,
            MAX(t.source_updated_at)
          FROM (
            SELECT d.*, (ROW_NUMBER() OVER (ORDER BY d.time) - 1) / 5 AS grp
            FROM bar1d_adj d
            ${where}
          ) t
          GROUP BY t.symbol, t.grp
        `)
      : await db.execute(sql`
          INSERT INTO bar_period_adj (
            period, time, symbol, open, high, low, close, volume, amount,
            bar_count, first_day, source_updated_at
          )
          SELECT
            ${period},
            MAX(d.time),
            d.symbol,
            (ARRAY_AGG(d.open ORDER BY d.time))[1],
            MAX(d.high),
            MIN(d.low),
            (ARRAY_AGG(d.close ORDER BY d.time DESC))[1],
            SUM(d.volume),
            SUM(d.amount),
            COUNT(*),
            MIN(d.time)::date,
            MAX(d.source_updated_at)
          FROM bar1d_adj d
          ${where}
          GROUP BY d.symbol, ${sql.raw(period === "1w" ? "DATE_TRUNC('week', d.time)" : "DATE_TRUNC('month', d.time)")}
        `);

  const affected = Number(result.rowCount ?? 0);
  if (affected > 0) console.log(`[kline-period] ${period} ${symbol}: ${affected} bars`);
  return affected;
}

/**
 * 增量运行：对每个上市标的，重算包含最新交易日的各周期。
 *
 * 只在 kline-1d 管道写入完成后调用（由 sync-worker 编排）。
 */
export async function klinePeriodPipeRun(): Promise<void> {
  const symbols = await db
    .select({ symbol: instrument.symbol })
    .from(instrument)
    .where(eq(instrument.status, "listed"));
  if (symbols.length === 0) {
    console.log("[kline-period] no listed symbols, skip");
    return;
  }

  console.log(`[kline-period] incremental for ${symbols.length} symbols`);
  let total = 0;
  for (const { symbol } of symbols) {
    for (const period of PERIODS) {
      const start = await periodStart(symbol, period);
      if (start === null) continue;
      total += await aggregateSymbol(symbol, period, start);
    }
  }
  console.log(`[kline-period] done. ${total} bars total`);
}

/**
 * 全量重建：对所有上市标的的 5d/1w/1mo 周期线完整重建。
 * 由 scripts/sync-kline-period.ts 手动调用。
 */
export async function klinePeriodRebuildAll(): Promise<void> {
  const symbols = await db
    .select({ symbol: instrument.symbol })
    .from(instrument)
    .where(eq(instrument.status, "listed"));
  if (symbols.length === 0) {
    console.log("[kline-period] no listed symbols, skip");
    return;
  }

  console.log(`[kline-period] full rebuild for ${symbols.length} symbols`);
  let total = 0;
  for (const { symbol } of symbols) {
    for (const period of PERIODS) {
      total += await aggregateSymbol(symbol, period, null);
    }
  }
  console.log(`[kline-period] full rebuild done. ${total} bars total`);
}
