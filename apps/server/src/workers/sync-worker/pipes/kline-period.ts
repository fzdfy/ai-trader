/**
 * kline-period 管道 — 由 bar1d_adj 日线聚合生成 5日/周/月 周期 K 线。
 *
 * 设计要点：
 * - 只从日线表本地聚合，不调上游 API，保证复权口径一致。
 * - 增量：从「最后一个已聚合周期」的起点重算至最新周期 —— 既修正最后一个未完成周期，
 *   又把 kline-1d 回补中间断档后新出现的中间周期一并补齐。
 *   （此前只重算「包含最新交易日的那一个周期」，kline-1d 补档产生的中间周期会被漏掉。）
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
 * 计算某 symbol 在参考日 `at`（含）之前最后一根日线所属周期的起点。
 *
 * - 1w : 参考日所在自然周的周一
 * - 1mo: 参考日所在自然月的 1 号
 * - 5d : 参考日那根日线所在滚动组的第一根日线日期
 *
 * 传入 at = 最后一根日线 → 「包含最新交易日的周期」起点（种子 / 原行为）。
 * 传入 at = 最后一个已聚合周期的代表时间 → 「最后一个已聚合周期」起点（增量重算起点）。
 */
async function periodStart(symbol: string, period: Period, at: Date): Promise<Date | null> {
  const atIso = at.toISOString();

  let start: unknown;
  if (period === "5d") {
    // 参考日那根日线在整段序列中的序号 = 截至 at 的日线根数；其组号 = (count - 1) / 5。
    // 外层再用整段序列的 grp 反查该组的第一根日线。
    const res = await db.execute(sql`
      SELECT MIN(t.time) AS start
      FROM (
        SELECT time, (ROW_NUMBER() OVER (ORDER BY time) - 1) / 5 AS grp
        FROM bar1d_adj
        WHERE symbol = ${symbol}
      ) t
      WHERE t.grp = (
        SELECT (COUNT(*) - 1) / 5
        FROM bar1d_adj
        WHERE symbol = ${symbol} AND time <= ${atIso}
      )
    `);
    start = res.rows[0]?.start;
  } else {
    const trunc = period === "1w" ? "DATE_TRUNC('week', time)" : "DATE_TRUNC('month', time)";
    const res = await db.execute(sql`
      SELECT ${sql.raw(trunc)} AS start
      FROM bar1d_adj
      WHERE symbol = ${symbol} AND time <= ${atIso}
      ORDER BY time DESC
      LIMIT 1
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
  // 先删旧记录再重灌：全量模式清空该 symbol 该周期全部记录；增量模式只清 >= start 的周期
  await db.execute(
    start === null
      ? sql`DELETE FROM bar_period_adj WHERE period = ${period} AND symbol = ${symbol}`
      : sql`DELETE FROM bar_period_adj WHERE period = ${period} AND symbol = ${symbol} AND time >= ${start}`,
  );

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
  const latestDateBySymbol = new Map<string, Date>();
  for (const row of latestRes.rows) {
    const r = row as { symbol: string; latest: Date | string | null };
    if (r.latest == null) continue;
    latestBySymbol.set(r.symbol, dayjs(r.latest).format("YYYY-MM-DD"));
    latestDateBySymbol.set(r.symbol, r.latest instanceof Date ? r.latest : new Date(String(r.latest)));
  }

  // 一次性查出「每个标的每个周期」已聚合的最新时间：作为增量重算起点。
  // 从「最后一个已聚合周期」起点重算，才能补齐 kline-1d 回补中间断档后新出现的中间周期。
  const periodMaxRes = await db.execute(sql`
    SELECT period, symbol, MAX(time) AS latest FROM bar_period_adj GROUP BY period, symbol
  `);
  const periodMaxByKey = new Map<string, Date>();
  for (const row of periodMaxRes.rows) {
    const r = row as { period: string; symbol: string; latest: Date | string | null };
    if (r.latest == null) continue;
    periodMaxByKey.set(`${r.period}:${r.symbol}`, r.latest instanceof Date ? r.latest : new Date(String(r.latest)));
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
  updateProgress(0, symbols.length, "开始聚合周期 K 线");
  let total = 0;
  let done = 0;
  for (const { symbol } of symbols) {
    for (const period of PERIODS) {
      // 增量重算起点：
      // - 该周期已有记录 → 从「最后一个已聚合周期」起点重算（同时修正其可能未完成的状态，
      //   并补齐 kline-1d 回补产生的中间周期）；
      // - 尚无记录 → 沿用原行为，只聚合最新周期作为种子（完整历史由 rebuildAll 脚本补齐）。
      const periodMax = periodMaxByKey.get(`${period}:${symbol}`);
      const at = periodMax ?? latestDateBySymbol.get(symbol) ?? null;
      if (at == null) continue;
      const start = await periodStart(symbol, period, at);
      if (start === null) continue;
      total += await aggregateSymbol(symbol, period, start);
    }
    done++;
    // 每处理 50 个标的上报一次进度（全市场 5000+ 标的，逐条上报写库过频）
    if (done % 50 === 0 || done === symbols.length) {
      updateProgress(done, symbols.length, `已聚合周期线 ${done}/${symbols.length}`);
    }
  }

  // 成功判据：直接以 bar_period_adj 是否真实落库 expectedDate 的周期线为准，
  // 而非用日线日期推断（聚合可能静默跳过，导致「日线在、周期线缺」仍被误判成功）。
  // 每个标的需具备全部 PERIODS 的当日周期线才算已同步。
  const coverageRes = await db.execute(sql`
    SELECT symbol, COUNT(DISTINCT period) AS periods
    FROM bar_period_adj
    WHERE time >= ${expectedDate}
    GROUP BY symbol
  `);
  const periodsBySymbol = new Map<string, number>();
  for (const row of coverageRes.rows) {
    const r = row as { symbol: string; periods: number | string };
    periodsBySymbol.set(r.symbol, Number(r.periods));
  }
  let synced = 0;
  const missingSample: string[] = [];
  for (const symbol of tradable) {
    if ((periodsBySymbol.get(symbol) ?? 0) >= PERIODS.length) synced++;
    else if (missingSample.length < 20) missingSample.push(symbol);
  }
  updateProgress(synced, tradableTotal, `已同步周期线 ${synced}/${tradableTotal}`);

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
