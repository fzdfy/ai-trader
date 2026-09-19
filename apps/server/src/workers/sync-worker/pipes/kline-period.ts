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
import { getPrevTradeDate, getSyncTradeDate } from "../calendar";
import { instrument } from "../../../db/schema";
import { sql, eq } from "drizzle-orm";
import { updateProgress } from "../progress";
import dayjs from "dayjs";

export type Period = "5d" | "1w" | "1mo";

export const PERIODS: Period[] = ["5d", "1w", "1mo"];

/** 全量覆盖容差：可交易标的中未聚合出当日周期线的数量 ≤ 该值仍判成功 */
const MISSING_TOLERANCE = 10;

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

  // 期望落库到的最新交易日（口径与 kline-1d / board-kline 一致）
  const expectedDate = (await getSyncTradeDate()) ?? dayjs().format("YYYY-MM-DD");

  // 一次性查出所有标的的最新日线日期：用于确定「可交易标的」分母与「当日已同步」分子。
  // 周期线由日线聚合而来，其最新日期不会超过日线；故以日线是否到达期望交易日为准。
  const latestRes = await db.execute(sql`
    SELECT symbol, MAX(time) AS latest FROM bar1d_adj GROUP BY symbol
  `);
  const latestBySymbol = new Map<string, string>();
  for (const row of latestRes.rows) {
    const r = row as { symbol: string; latest: Date | string | null };
    if (r.latest == null) continue;
    latestBySymbol.set(r.symbol, dayjs(r.latest).format("YYYY-MM-DD"));
  }

  // 「可交易标的」基准（分母）：上一交易日仍有日线的标的（停牌/长期无行情不计入）。
  const prevTradeDate = await getPrevTradeDate(expectedDate);
  const tradable = new Set<string>();
  for (const { symbol } of symbols) {
    const latest = latestBySymbol.get(symbol);
    if (latest == null) continue;
    if (prevTradeDate == null || latest >= prevTradeDate) tradable.add(symbol);
  }
  // 兜底：无任何日线（首次同步）或交易日历缺失时，退化为全部上市标的
  if (tradable.size === 0) for (const { symbol } of symbols) tradable.add(symbol);
  const tradableTotal = tradable.size;
  console.log(
    `[kline-period] 可交易标的 ${tradableTotal} 只（上市 ${symbols.length} 只，上一交易日 ${prevTradeDate ?? "未知"}）`,
  );

  console.log(`[kline-period] incremental for ${symbols.length} symbols`);
  updateProgress(0, tradableTotal, "开始同步周期 K 线");
  let total = 0;
  let done = 0;
  let synced = 0;
  const missingSample: string[] = [];
  for (const { symbol } of symbols) {
    for (const period of PERIODS) {
      const start = await periodStart(symbol, period);
      if (start === null) continue;
      total += await aggregateSymbol(symbol, period, start);
    }
    done++;
    // 仅统计可交易标的：日线已到达期望交易日者，其周期线必然已聚合出当日数据。
    if (tradable.has(symbol)) {
      const latest = latestBySymbol.get(symbol)!;
      if (latest >= expectedDate) synced++;
      else if (missingSample.length < 20) missingSample.push(symbol);
    }
    // 每处理 50 个标的上报一次进度（全市场 5000+ 标的，逐条上报写库过频）
    if (done % 50 === 0 || done === symbols.length) {
      updateProgress(synced, tradableTotal, `已同步周期线 ${synced}/${tradableTotal}`);
    }
  }

  if (synced === 0) {
    throw new Error(`[kline-period] 未聚合出 ${expectedDate} 当日任何周期线数据，未写入有效记录`);
  }

  // 全量覆盖判据：可交易标的中只要未同步数超出容差即判失败，抛错触发上层 deadline 重试，
  // 杜绝「部分标的周期线断更但任务仍报 success」的假成功。
  const missing = tradableTotal - synced;
  if (missing > MISSING_TOLERANCE) {
    throw new Error(
      `[kline-period] 可交易标的 ${tradableTotal} 只中仍有 ${missing} 只未聚合出 ${expectedDate} 当日周期线（容差 ${MISSING_TOLERANCE}），任务未完全成功` +
        (missingSample.length > 0 ? `。示例：${missingSample.slice(0, 5).join(", ")}` : ""),
    );
  }

  console.log(`[kline-period] done. 已同步 ${synced}/${tradableTotal} 只可交易标的，${total} bars total`);
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
