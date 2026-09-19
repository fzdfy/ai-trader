import { db } from "../../../db";
import { getPrevTradeDate, getSyncTradeDate, isTradeDay, listRecentTradeDates } from "../calendar";
import { quant, type StockKlineBar } from "../../../lib/quant";
import { sql, eq } from "drizzle-orm";
import { bar1dAdj, instrument } from "../../../db/schema";
import { updateProgress } from "../progress";
import dayjs from "dayjs";

// export const kline1dPipe = {
//   async run() {
//     const today = new Date();
//     const isOpen = await isTradeDay(today);
//     if (!isOpen || !isAfterMarketClose(today)) return;
//     console.log("[kline-1d] running...");
//     // TODO: call kline.cn and upsert bar1dAdj
//     console.log("[kline-1d] done");
//   },
// };

// ============================================================================
// 共享工具（当日增量 kline1dPipeRun 与历史回补 kline1dBackfillRun 共用）
// ============================================================================

// 全量重刷单次分页根数。腾讯 fqkline 单次返回根数有上限（约 640），quant 端
// /kline 虽放行到 5000，但传超过上游上限的值会被腾讯静默截断，导致"不足一页即到底"
// 的判断失效而提前终止。取 600 留余量，超过 600 根的历史靠翻页补齐。
const KLINE_PAGE = 600;

// 拉取重试：腾讯 fqkline 连续大量请求会限流「返回空」（非封禁，降速即可恢复），
// 单次空结果/异常不可靠，退避重试到有数据或耗尽次数为止，避免静默跳过导致数据断更。
const MAX_FETCH_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 按标的选源。
 * 北交所历史行情腾讯无数据（实测仅 1 根），只有百度提供完整历史，且百度返回的已是
 * 前复权价（实测与腾讯 qfq 口径一致），故北交所走百度。
 * 沪深仍固定腾讯，避免 qfq 主源失败时静默降级到不复权源污染 bar1d_adj 前复权口径。
 */
function klineSource(symbol: string): "tencent" | "baidu" {
  return symbol.endsWith(".BJ") ? "baidu" : "tencent";
}

/**
 * 全量拉取：从 endDate 往前翻页拉完整前复权历史（forceFull 与「无历史记录的增量标的」共用），
 * 彻底对齐除权后的口径。固定单一源（北交所百度 / 沪深腾讯），避免 qfq 主源失败时
 * 静默降级到不复权源污染口径。
 */
async function fetchFullKlines(symbol: string, endDate: string): Promise<StockKlineBar[]> {
  const out: StockKlineBar[] = [];
  let end = endDate;
  for (;;) {
    // 移除 catch：异常向上抛给 fetchWithRetry 统一退避重试，避免空结果/异常被静默吞掉。
    const chunk = await quant.stockKline(symbol, KLINE_PAGE, undefined, end, "qfq", klineSource(symbol));
    if (chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < KLINE_PAGE) break; // 不足一页说明已拉到底
    // 翻页：以本批最早一根的上一交易日作为下一批 end，向前推进且不重叠
    const earliest = chunk.reduce((min, k) => (k.time < min ? k.time : min), chunk[0]!.time);
    const prev = dayjs(earliest).subtract(1, "day").format("YYYYMMDD");
    if (prev >= end) break; // 防死循环兜底（end 未向前推进时终止）
    end = prev;
  }
  return out;
}

/**
 * 拉取重试：单次空结果/异常不可靠，退避重试到有数据或耗尽次数为止（失败返回空数组）。
 * retryOnEmpty：空结果是否视为可重试。默认 true——对「本应有数据」的标的（当日增量、
 *   头部全量），空多半是腾讯限流，需退避重试；对内部缺口区间（retryOnEmpty=false），
 *   空是合法答案（停牌等确无行情），重试 3 次纯属浪费，直接返回空交由上层跳过。
 * 注意：无论是否重试空结果，抛出的异常一律退避重试，避免瞬时网络/上游故障被静默吞掉。
 */
async function fetchWithRetry(
  fetchFn: () => Promise<StockKlineBar[]>,
  symbol: string,
  retryOnEmpty = true,
): Promise<StockKlineBar[]> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      const bars = await fetchFn();
      if (bars.length > 0) return bars;
      if (!retryOnEmpty) return [];
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.warn(`[kline-1d] ${symbol} 返回空，${attempt}/${MAX_FETCH_ATTEMPTS} 次后退避重试`);
      }
    } catch (error) {
      lastError = error;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.warn(`[kline-1d] ${symbol} 拉取失败，${attempt}/${MAX_FETCH_ATTEMPTS} 次后退避重试:`, error);
      }
    }
    if (attempt < MAX_FETCH_ATTEMPTS) await sleep(5000 * attempt);
  }
  if (lastError != null) {
    console.error(`[kline-1d] ${symbol} 重试 ${MAX_FETCH_ATTEMPTS} 次后仍失败:`, lastError);
  }
  return [];
}

/** upsert 单标的日线（分批 200 条，按 (time,symbol) 幂等覆盖），返回写入条数。 */
async function upsertBars(symbol: string, klines: StockKlineBar[]): Promise<number> {
  const batch = klines.map((k) => ({
    time: new Date(k.time),
    symbol,
    open: String(k.open ?? 0),
    high: String(k.high ?? 0),
    low: String(k.low ?? 0),
    close: String(k.close ?? 0),
    volume: String(k.volume ?? 0),
    amount: k.amount == null ? null : String(k.amount),
    avgPrice: null,
    // quant 当前不提供技术指标，indicators 不再由本管道填充
    indicators: {},
    sourceUpdatedAt: new Date(),
    ingestedAt: new Date(),
  }));

  for (let j = 0; j < batch.length; j += 200) {
    await db
      .insert(bar1dAdj)
      .values(batch.slice(j, j + 200))
      .onConflictDoUpdate({
        target: [bar1dAdj.time, bar1dAdj.symbol],
        set: {
          open: sql.raw("excluded.open"),
          high: sql.raw("excluded.high"),
          low: sql.raw("excluded.low"),
          close: sql.raw("excluded.close"),
          volume: sql.raw("excluded.volume"),
          amount: sql.raw("excluded.amount"),
          indicators: sql.raw("excluded.indicators"),
          sourceUpdatedAt: sql.raw("excluded.source_updated_at"),
          ingestedAt: sql.raw("excluded.ingested_at"),
        },
      });
  }
  return batch.length;
}

export async function kline1dPipeRun(opts?: { forceFull?: boolean }): Promise<void> {
  // 腾讯日线收盘后即定稿（收盘集合竞价 15:00 定格），无需再等 16:00；
  // 非交易日跳过（forceFull 忽略守卫，可任意时间运行以对齐前复权口径）。
  const now = new Date();
  if (!opts?.forceFull && !(await isTradeDay(now))) {
    console.log("[kline-1d] not a trade day, skip");
    return;
  }

  // 获取同步标的：全部上市标的
  const symbols = await db
    .select({ symbol: instrument.symbol })
    .from(instrument)
    .where(eq(instrument.status, "listed"));

  if (symbols.length === 0) {
    console.log("[kline-1d] no listed symbols, skip");
    return;
  }

  console.log(`[kline-1d] syncing ${symbols.length} symbols`);

  const today = dayjs().format("YYYYMMDD");

  // 期望落库到的最新交易日（收盘后的交易日=今天，盘中/非交易日=最近已收盘交易日），
  // 口径与 boards / fundflow 等管道一致，用于判定增量结果是否真的取到了当日数据。
  const expectedDate = (await getSyncTradeDate()) ?? dayjs().format("YYYY-MM-DD");

  // 腾讯 fqkline 按「精确的 param 字符串」做服务端缓存（实测：同一 symbol 下
  // `...day,2026-09-17,2026-09-18,500,qfq` 在晚间仍返回截至 09-17 的截断结果，而把 limit
  // 换成 501 即返回含 09-18 的完整数据）。交易日收盘后首次请求若恰逢当日数据尚未发布，就会
  // 缓存该截断响应；而 deadline 重试（每 5 分钟一次）会重新生成完全相同的 param，从而始终
  // 命中陈旧缓存、直到 18:00 判定失败。这里把增量请求的 limit 按 5 分钟时间桶轮换
  // （501–600，增量窗口仅 1~2 根，轮换不影响返回内容），使每次重试的 param 必然不同以绕过
  // 陈旧缓存；上游一旦发布当日数据，首个使用新 limit 的请求即可取到。
  const incrementalLimit = 501 + (Math.floor(Date.now() / 300_000) % 100);

  // 一次性查出所有标的的最新日线时间，作为增量起点（无历史记录的标的走全量）
  const latestRes = await db.execute(sql`
    SELECT symbol, MAX(time) AS latest FROM bar1d_adj GROUP BY symbol
  `);
  const latestBySymbol = new Map<string, string>();
  for (const row of latestRes.rows) {
    const r = row as { symbol: string; latest: Date | string | null };
    if (r.latest == null) continue;
    const d = r.latest instanceof Date ? r.latest : new Date(String(r.latest));
    if (Number.isNaN(d.getTime())) continue;
    latestBySymbol.set(r.symbol, dayjs(d).format("YYYYMMDD"));
  }

  // 「可交易标的」基准（同步覆盖率的分母）：上个交易日仍有行情的标的。
  // 停牌 / 长期无行情的标的不计入分母，避免把正常停牌误判为「未同步」。
  // 判定方式：标的的最新日线日期 >= 上一交易日即为可交易标的。
  const prevTradeDate = await getPrevTradeDate(expectedDate);
  const prevTradeDateKey = prevTradeDate ? prevTradeDate.replace(/-/g, "") : null;
  const tradable = new Set<string>();
  for (const s of symbols) {
    const latest = latestBySymbol.get(s.symbol);
    if (latest == null) continue;
    if (prevTradeDateKey == null || latest >= prevTradeDateKey) tradable.add(s.symbol);
  }
  // 兜底：无任何历史（首次全量同步）或交易日历缺失时，退化为全部上市标的
  if (tradable.size === 0) for (const s of symbols) tradable.add(s.symbol);
  const tradableTotal = tradable.size;
  console.log(
    `[kline-1d] 可交易标的 ${tradableTotal} 只（上市 ${symbols.length} 只，上一交易日 ${prevTradeDate ?? "未知"}）`,
  );

  const syncOne = async (symbol: string): Promise<{ bars: number; reached: boolean }> => {
    const startDate = opts?.forceFull ? undefined : latestBySymbol.get(symbol);

    let klines: StockKlineBar[];
    if (startDate != null) {
      // 增量：已有历史，空结果/异常几乎必然是上游限流/临时故障，退避重试后仍空才判失败。
      // limit 用轮换值（见 incrementalLimit）绕过腾讯按 param 缓存当日截断结果的问题。
      klines = await fetchWithRetry(
        () => quant.stockKline(symbol, incrementalLimit, startDate, today, "qfq", "tencent"),
        symbol,
      );
    } else {
      // 无历史记录：走全量分页（退避重试；失败/空仍仅告警，历史补全交给 kline-1d-backfill 处理）。
      klines = await fetchWithRetry(() => fetchFullKlines(symbol, today), symbol);
    }

    if (klines.length === 0) {
      // 空结果无法判定是否同步到当日数据，统一记为「未同步」，由末尾覆盖率判据决定是否重跑。
      console.warn(`[kline-1d] ${symbol} 拉取为空（无历史或上游限流），记为未同步`);
      return { bars: 0, reached: false };
    }

    const bars = await upsertBars(symbol, klines);

    // 是否真的取到了期望交易日的数据：非空但止于上一交易日视为「未同步」。
    // 腾讯前复权序列收盘后当晚常延迟发布当日数据，此时会返回上一交易日为止的非空窗口，
    // 若仅判空则会被误当成功。已取到的历史仍写入（幂等覆盖，防数据回退）。
    let latestFetched = klines[0]!.time;
    for (const k of klines) {
      if (k.time > latestFetched) latestFetched = k.time;
    }
    const reached = latestFetched >= expectedDate;
    if (!reached) {
      console.warn(
        `[kline-1d] ${symbol} 最新仅到 ${latestFetched}（期望 ${expectedDate}），疑似上游尚未发布当日数据`,
      );
    }

    return { bars, reached };
  };

  // 受控并发拉取（quant 侧 K 线为前复权口径：沪深固定腾讯 fqkline，北交所固定百度，
  // 均为不封 IP 源）。并发 2 + 每标的 800ms 间隔，把请求速率压到限流阈值之下，避免
  // 串行 5000+ 标的耗时过长导致依赖 kline-1d 的 features 错过当日执行窗口。
  // 注：前复权遇除权会整体漂移历史价，建议定期全量重刷对齐口径。
  const CONCURRENCY = 2;
  // 限流降速：腾讯 fqkline 持续高频请求会触发限流（返回空/超时），全量回补时
  // 每个标的之间留出间隔，配合并发 2 将请求速率压到限流阈值之下。
  const THROTTLE_MS = 800;
  // 全量覆盖容差：可交易标的中未取到当日数据的数量 ≤ 该值仍判成功（覆盖当日新停牌等正常情形）。
  const MISSING_TOLERANCE = 10;

  let total = 0;
  let done = 0;
  // 已同步数：取到期望交易日当日日线的可交易标的数（进度分母为可交易标的总数）。
  let synced = 0;
  const missingSample: string[] = [];
  updateProgress(0, tradableTotal, "开始同步日线 K 线");

  const queue = symbols.map((s) => s.symbol);
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const symbol = queue[idx++]!;
      const { bars, reached } = await syncOne(symbol);
      total += bars;
      done++;
      // 仅统计可交易标的：已取到当日数据计入已同步，未取到则记入缺失样本
      if (tradable.has(symbol)) {
        if (reached) synced++;
        else if (missingSample.length < 20) missingSample.push(symbol);
      }
      // 每处理 50 个标的上报一次进度（全市场 5000+ 标的，逐条上报写库过频）
      if (done % 50 === 0 || done === symbols.length) {
        updateProgress(synced, tradableTotal, `已同步日线 ${synced}/${tradableTotal}`);
      }
      await sleep(THROTTLE_MS);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()),
  );

  if (synced === 0) {
    throw new Error(`[kline-1d] 未取到 ${expectedDate} 当日任何日线数据，未写入有效记录`);
  }

  // 全量覆盖判据：可交易标的中只要未同步数超出容差即判失败，抛错触发上层 deadline 重试，
  // 杜绝「部分标的数据断更但任务仍报 success」的假成功。
  const missing = tradableTotal - synced;
  if (missing > MISSING_TOLERANCE) {
    throw new Error(
      `[kline-1d] 可交易标的 ${tradableTotal} 只中仍有 ${missing} 只未取到 ${expectedDate} 当日日线（容差 ${MISSING_TOLERANCE}），任务未完全成功` +
        (missingSample.length > 0 ? `。示例：${missingSample.slice(0, 5).join(", ")}` : ""),
    );
  }

  console.log(`[kline-1d] done. 已同步 ${synced}/${tradableTotal} 只可交易标的，${total} bars total`);
}

// ============================================================================
// 历史回补（kline-1d-backfill）—— 与当日增量彻底分离的独立任务
// ============================================================================
// 当日 kline1dPipeRun 对每只标的只从「自身最新一根日线」往后增量拉取，只能自愈「尾部」缺失；
// 两类结构性缺口永远补不上：
//   1) 头部缺失：标的从未被全量拉取过，历史只从某天（如 2026-09-01）开始；
//   2) 内部缺口：中间某个交易日缺失，但前后都有数据（增量从尾部推进不会回看）。
// 本任务在收盘任务 deadline(18:00) 之后独立触发，定向识别这两类缺口并按需补拉：
//   - 头部缺失 → 整段全量分页重刷（fetchFullKlines）；
//   - 内部缺口 → 只补「缺口区间」（quant.stockKline 带 start/end），不做整段重刷。
// 空数据语义：头部全量拉取若「尝试了却无一成功」判为上游故障抛错触发 deadline 重试；
//   内部缺口补拉可能因停牌等正常原因为空，仅告警跳过（下次运行会再尝试，自愈）。

/** 内部缺口检测回看窗口（交易日）。头部缺失不受此窗口限制，始终按上市日全历史判定。 */
export const KLINE_BACKFILL_GAP_WINDOW = 120;
/** 头部缺失宽限（自然日）：首根日线晚于上市日超过该天数即判定头部缺失，避免新股/次新股误判。 */
const HEAD_MISSING_GRACE_DAYS = 45;
// 全量回补请求量远大于当日增量，保持与当日一致的保守并发 / 限流速率，避免触发腾讯限流。
const BACKFILL_CONCURRENCY = 2;
const BACKFILL_THROTTLE_MS = 800;

type BackfillTask = { symbol: string; ranges?: { start: string; end: string }[] };

/** 把升序缺失交易日合并为连续区间（容 3 个自然日，跨周末不拆分）。 */
function toRanges(days: string[]): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  for (const d of days) {
    const last = ranges.at(-1);
    if (last && dayjs(d).diff(dayjs(last.end), "day") <= 3) last.end = d;
    else ranges.push({ start: d, end: d });
  }
  return ranges;
}

/** 检测头部缺失标的：首根日线晚于上市日（超过宽限）或全无历史。返回 symbol 列表。 */
async function detectHeadMissing(): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT i.symbol AS symbol, i.list_date AS list_date, MIN(b.time) AS first_bar
    FROM instrument i
    LEFT JOIN bar1d_adj b ON b.symbol = i.symbol
    WHERE i.status = 'listed'
    GROUP BY i.symbol, i.list_date
  `);
  const out: string[] = [];
  for (const row of res.rows) {
    const r = row as { symbol: string; list_date: Date | string | null; first_bar: Date | string | null };
    if (r.first_bar == null) {
      // 全无历史：首次全量同步或从未来过数据，需整段拉取
      out.push(r.symbol);
      continue;
    }
    if (r.list_date == null) {
      // 无上市日无法按「首根晚于上市日」判定。沪深历史已由腾讯完整落库（首根即真实上市日），
      // 跳过避免误判；北交所因腾讯无 BJ 历史，存量可能只落过 1~2 根，其 list_date 只有在本
      // 管道首次全量回补（百度全历史）成功后才由 anchorBjListDate 锚定（不由 sync-instruments 回填，
      // 避免用被截断的历史封口）。为打破这个先后依赖，对 list_date 为空（= 尚未成功回补过）的
      // 北交所标的直接纳入回补；成功回补后 list_date 落地，后续即收敛为正常的「首根晚于上市日」判定。
      if (r.symbol.endsWith(".BJ")) out.push(r.symbol);
      continue;
    }
    const firstBar = dayjs(r.first_bar);
    const listDate = dayjs(r.list_date);
    if (!firstBar.isValid() || !listDate.isValid()) continue;
    if (firstBar.diff(listDate, "day") > HEAD_MISSING_GRACE_DAYS) out.push(r.symbol);
  }
  return out;
}

/**
 * 用一次「成功的全量拉取」结果锚定北交所标的的 list_date（真实上市日）。
 * 北交所历史仅百度提供，拉取为空（瞬时故障/限流）时不写，留待下次运行重试；只有真正拉全历史时，
 * 最早一根才是可信上市日。沪深 list_date 由 sync-instruments 从腾讯完整历史回填，不经此路径。
 * 目的：打破「用被截断的历史回填列表日 → 误判头部完整 → 永不重试」的自我封口死循环。
 */
async function anchorBjListDate(symbol: string, klines: StockKlineBar[]): Promise<void> {
  let first = klines[0]!.time;
  for (const k of klines) if (k.time < first) first = k.time;
  await db
    .update(instrument)
    .set({ listDate: dayjs(first).format("YYYY-MM-DD"), updatedAt: new Date() })
    .where(eq(instrument.symbol, symbol));
}

/** 检测内部缺口：窗口内缺失、但缺口两侧均有行情的交易日。返回 symbol → 缺失交易日（升序）。 */
async function detectInteriorGaps(expectedDays: string[]): Promise<Map<string, string[]>> {
  const gapTargets = new Map<string, string[]>();
  if (expectedDays.length < 2) return gapTargets;

  const windowStart = expectedDays[0]!;
  const windowEnd = expectedDays.at(-1)!;
  const expectedCount = expectedDays.length;

  // 先按窗口内覆盖条数筛出「有缺日」候选，避免为全部标的拉取明细
  const coverRes = await db.execute(sql`
    SELECT symbol, COUNT(*) AS cnt
    FROM bar1d_adj
    WHERE time >= ${windowStart} AND time <= ${windowEnd}
    GROUP BY symbol
  `);
  const candidates: string[] = [];
  for (const row of coverRes.rows) {
    const r = row as { symbol: string; cnt: string | number };
    if (Number(r.cnt) < expectedCount) candidates.push(r.symbol);
  }

  for (const symbol of candidates) {
    const detail = await db.execute(sql`
      SELECT DISTINCT time FROM bar1d_adj
      WHERE symbol = ${symbol} AND time >= ${windowStart} AND time <= ${windowEnd}
    `);
    const present = new Set<string>();
    for (const d of detail.rows) {
      const r = d as { time: Date | string };
      const v = r.time instanceof Date ? r.time : new Date(String(r.time));
      if (!Number.isNaN(v.getTime())) present.add(dayjs(v).format("YYYY-MM-DD"));
    }
    const interior: string[] = [];
    for (const d of expectedDays) {
      if (present.has(d)) continue;
      // 缺口两侧均须有行情：排除头部/尾部缺失与整段停牌起始
      const hasBefore = expectedDays.some((x) => x < d && present.has(x));
      const hasAfter = expectedDays.some((x) => x > d && present.has(x));
      if (hasBefore && hasAfter) interior.push(d);
    }
    if (interior.length > 0) gapTargets.set(symbol, interior);
  }
  return gapTargets;
}

export async function kline1dBackfillRun(opts?: { force?: boolean }): Promise<void> {
  const now = new Date();
  if (!opts?.force && !(await isTradeDay(now))) {
    console.log("[kline-1d-backfill] not a trade day, skip");
    return;
  }

  const today = dayjs().format("YYYYMMDD");
  const expectedDate = (await getSyncTradeDate()) ?? dayjs().format("YYYY-MM-DD");

  const headMissing = await detectHeadMissing();

  // 内部缺口只在「排除当日」的窗口内检测（当日由 kline1dPipeRun 负责）
  const windowDates = await listRecentTradeDates(KLINE_BACKFILL_GAP_WINDOW, expectedDate);
  const expectedDays = windowDates.filter((d) => d !== expectedDate);
  const gapTargets = await detectInteriorGaps(expectedDays);

  const headTotal = headMissing.length;
  const gapTotal = gapTargets.size;
  if (headTotal === 0 && gapTotal === 0) {
    updateProgress(0, 0, "日 K 线无需回补");
    console.log("[kline-1d-backfill] 无头部缺失、无内部缺口，无需回补");
    return;
  }

  // 任务集合：头部缺失（整段全量）+ 内部缺口（按区间补拉）
  const tasks: BackfillTask[] = [];
  for (const symbol of headMissing) tasks.push({ symbol });
  for (const [symbol, days] of gapTargets) tasks.push({ symbol, ranges: toRanges(days) });
  const total = tasks.length;
  const gapMissingDays = [...gapTargets.values()].reduce((s, d) => s + d.length, 0);
  console.log(
    `[kline-1d-backfill] 头部缺失 ${headTotal} 只，内部缺口 ${gapTotal} 只（窗口 ${expectedDays.length} 个交易日 / ${gapMissingDays} 个缺失交易日），共 ${total} 个回补任务`,
  );
  updateProgress(0, total, `开始回补日 K 线（头部 ${headTotal} / 缺口 ${gapTotal}）`);

  let done = 0;
  let barsTotal = 0;
  let headAttempted = 0;
  let headResolved = 0;
  let gapResolved = 0;
  let gapSuspended = 0;
  const headFailedSample: string[] = [];
  const gapSuspendedSample: string[] = [];

  const processTask = async (task: BackfillTask): Promise<void> => {
    if (task.ranges == null) {
      // 头部缺失：整段全量分页重刷
      headAttempted++;
      const klines = await fetchWithRetry(() => fetchFullKlines(task.symbol, today), task.symbol);
      if (klines.length === 0) {
        if (headFailedSample.length < 20) headFailedSample.push(task.symbol);
        console.warn(`[kline-1d-backfill] ${task.symbol} 头部全量拉取为空（上游限流或确无历史），记为未补全`);
      } else {
        barsTotal += await upsertBars(task.symbol, klines);
        headResolved++;
        // 北交所 list_date 由「成功的全量拉取」锚定：拉取为空时不写，避免用被截断的历史自我封口，
        // 保证下次运行仍会被 detectHeadMissing 捕获并重试（沪深 list_date 由 sync-instruments 回填）。
        if (task.symbol.endsWith(".BJ")) await anchorBjListDate(task.symbol, klines);
      }
      return;
    }
    // 内部缺口：逐区间补拉。缺口区间为空是合法答案（停牌等确无行情），retryOnEmpty=false
    // 直接返回，避免为每只停牌股空耗 3 次重试；补全与否由 gapResolved 统计，逐只告警改为汇总。
    let ok = false;
    for (const r of task.ranges) {
      const klines = await fetchWithRetry(
        () =>
          quant.stockKline(
            task.symbol,
            KLINE_PAGE,
            r.start.replaceAll("-", ""),
            r.end.replaceAll("-", ""),
            "qfq",
            klineSource(task.symbol),
          ),
        task.symbol,
        false,
      );
      if (klines.length > 0) {
        barsTotal += await upsertBars(task.symbol, klines);
        ok = true;
      }
      await sleep(BACKFILL_THROTTLE_MS);
    }
    if (ok) gapResolved++;
    else {
      gapSuspended++;
      if (gapSuspendedSample.length < 20) gapSuspendedSample.push(task.symbol);
    }
  };

  let idx = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const task = tasks[idx++]!;
      await processTask(task);
      done++;
      if (done % 20 === 0 || done === total) {
        updateProgress(done, total, `已回补 ${done}/${total} 个任务（${barsTotal} 条）`);
      }
      await sleep(BACKFILL_THROTTLE_MS);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(BACKFILL_CONCURRENCY, tasks.length) }, () => worker()),
  );

  // 成功判据：头部缺失为结构性缺口，若「尝试了头部回补但无一成功」视为上游故障，
  // 抛错触发 deadline 重试；只要部分成功即算通过（其余缺口下次运行自愈）。
  if (headAttempted > 0 && headResolved === 0) {
    throw new Error(
      `[kline-1d-backfill] 头部缺失 ${headAttempted} 只全部拉取失败（上游限流/故障），未写入任何有效记录` +
        (headFailedSample.length > 0 ? `。示例：${headFailedSample.slice(0, 5).join(", ")}` : ""),
    );
  }

  if (gapSuspended > 0) {
    console.log(
      `[kline-1d-backfill] 内部缺口未补全 ${gapSuspended} 只（区间确无行情，多为停牌，属正常，下次运行自愈）` +
        (gapSuspendedSample.length > 0 ? `。示例：${gapSuspendedSample.slice(0, 5).join(", ")}` : ""),
    );
  }
  console.log(
    `[kline-1d-backfill] done. 头部补全 ${headResolved}/${headAttempted} 只；内部缺口补全 ${gapResolved}/${gapTotal} 只；累计 ${barsTotal} bars`,
  );
}
