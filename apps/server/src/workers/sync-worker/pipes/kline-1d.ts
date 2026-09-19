import { db } from "../../../db";
import { getPrevTradeDate, getSyncTradeDate, isTradeDay } from "../calendar";
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
      // 无历史记录：走全量分页（退避重试；失败/空仍仅告警，历史补全交给 refresh:kline1d 显式执行）。
      klines = await fetchWithRetry(() => fetchFullKlines(symbol), symbol);
    }

    if (klines.length === 0) {
      // 空结果无法判定是否同步到当日数据，统一记为「未同步」，由末尾覆盖率判据决定是否重跑。
      console.warn(`[kline-1d] ${symbol} 拉取为空（无历史或上游限流），记为未同步`);
      return { bars: 0, reached: false };
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

    return { bars: batch.length, reached };
  };

  // 受控并发拉取（quant 侧 K 线主源腾讯 fqkline 前复权，降级 mootdx/百度，均为不封 IP 源）。
  // 并发 5 与 constituents/board-kline 保持一致，避免串行 5000+ 标的耗时过长导致
  // 依赖 kline-1d 的 features（16:00–18:50 窗口）错过当日执行。
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
