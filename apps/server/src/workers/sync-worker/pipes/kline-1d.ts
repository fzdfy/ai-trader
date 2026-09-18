import { db } from "../../../db";
import { isTradeDay } from "../calendar";
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

  // 全量重刷单次分页根数。腾讯 fqkline 单次返回根数有上限（约 640），quant 端
  // /kline 虽放行到 5000，但传超过上游上限的值会被腾讯静默截断，导致"不足一页即到底"
  // 的判断失效而提前终止。取 600 留余量，超过 600 根的历史靠翻页补齐。
  const KLINE_PAGE = 600;

  // 全量拉取：从当日往前翻页拉完整前复权历史（forceFull 与「无历史记录的增量标的」共用），
  // 彻底对齐除权后的口径。强制 source=tencent，避免 qfq 主源失败时静默降级到不复权污染口径。
  const fetchFullKlines = async (symbol: string): Promise<StockKlineBar[]> => {
    const out: StockKlineBar[] = [];
    let end = today;
    for (;;) {
      // 移除 catch：异常向上抛给 fetchWithRetry 统一退避重试，避免空结果/异常被静默吞掉。
      const chunk = await quant.stockKline(symbol, KLINE_PAGE, undefined, end, "qfq", "tencent");
      if (chunk.length === 0) break;
      out.push(...chunk);
      if (chunk.length < KLINE_PAGE) break; // 不足一页说明已拉到底
      // 翻页：以本批最早一根的上一交易日作为下一批 end，向前推进且不重叠
      const earliest = chunk.reduce(
        (min, k) => (k.time < min ? k.time : min),
        chunk[0]!.time,
      );
      const prev = dayjs(earliest).subtract(1, "day").format("YYYYMMDD");
      if (prev >= end) break; // 防死循环兜底（end 未向前推进时终止）
      end = prev;
    }
    return out;
  };

  // 拉取重试：腾讯 fqkline 连续大量请求会限流「返回空」（非封禁，降速即可恢复），
  // 单次空结果/异常不可靠，退避重试到有数据或耗尽次数为止，避免静默跳过导致数据断更。
  const MAX_FETCH_ATTEMPTS = 3;
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const fetchWithRetry = async (
    fetchFn: () => Promise<StockKlineBar[]>,
    symbol: string,
  ): Promise<StockKlineBar[]> => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
      try {
        const bars = await fetchFn();
        if (bars.length > 0) return bars;
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
  };

  const syncOne = async (symbol: string): Promise<number> => {
    const startDate = opts?.forceFull ? undefined : latestBySymbol.get(symbol);
    const isIncremental = startDate != null;

    let klines: StockKlineBar[];
    if (startDate != null) {
      // 增量：已有历史，空结果/异常几乎必然是上游限流/临时故障，退避重试后仍空才判失败。
      klines = await fetchWithRetry(
        () => quant.stockKline(symbol, 500, startDate, today, "qfq", "tencent"),
        symbol,
      );
    } else {
      // 无历史记录：走全量分页（退避重试；失败/空仍仅告警，历史补全交给 refresh:kline1d 显式执行）。
      klines = await fetchWithRetry(() => fetchFullKlines(symbol), symbol);
    }

    if (klines.length === 0) {
      // 已有历史的标的增量返回空必然是上游故障/限流，记失败由末尾判定触发重跑；
      // 无历史标的返回空可能是新上市/边缘标的，仅告警不判失败。
      if (isIncremental) {
        incrementalFailed++;
        console.error(`[kline-1d] ${symbol} 增量同步返回空（判定失败）`);
      } else {
        console.warn(`[kline-1d] ${symbol} 全量拉取为空（无历史或上游限流）`);
      }
      return 0;
    }

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
  };

  // 受控并发拉取（quant 侧 K 线主源腾讯 fqkline 前复权，降级 mootdx/百度，均为不封 IP 源）。
  // 并发 5 与 constituents/board-kline 保持一致，避免串行 5000+ 标的耗时过长导致
  // 依赖 kline-1d 的 features（16:00–18:50 窗口）错过当日执行。
  // 注：前复权遇除权会整体漂移历史价，建议定期全量重刷对齐口径。
  const CONCURRENCY = 2;
  // 限流降速：腾讯 fqkline 持续高频请求会触发限流（返回空/超时），全量回补时
  // 每个标的之间留出间隔，配合并发 2 将请求速率压到限流阈值之下。
  const THROTTLE_MS = 800;
  let total = 0;
  let done = 0;
  let incrementalFailed = 0;
  updateProgress(0, symbols.length, "开始同步日线 K 线");

  const queue = symbols.map((s) => s.symbol);
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const symbol = queue[idx++]!;
      const n = await syncOne(symbol);
      total += n;
      done++;
      // 每处理 50 个标的上报一次进度（全市场 5000+ 标的，逐条上报写库过频）
      if (done % 50 === 0 || done === symbols.length) {
        updateProgress(done, symbols.length, `同步日线 ${done}/${symbols.length}`);
      }
      await sleep(THROTTLE_MS);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()),
  );

  if (total === 0) {
    throw new Error(`[kline-1d] ${symbols.length} 只标的日线均无数据，未写入任何记录`);
  }

  // 已有历史却拉不到增量数据的标的一律判失败：抛错触发上层 deadline 重试，
  // 杜绝「部分标的数据断更但任务仍报 success」的假成功。
  if (incrementalFailed > 0) {
    throw new Error(
      `[kline-1d] ${incrementalFailed}/${symbols.length} 只已有历史标的增量同步返回空，任务未完全成功`,
    );
  }

  console.log(`[kline-1d] done. ${total} bars total`);
}
