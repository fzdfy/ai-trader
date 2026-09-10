import { db } from "../../../db";
import { isTradeDay, isAfterMarketClose } from "../calendar";
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
  // 日线每日收盘后才定稿，常规同步仅在交易日收盘后拉取；
  // 全量重刷（forceFull）忽略收盘守卫，可在任意时间运行以对齐前复权口径。
  const now = new Date();
  if (!opts?.forceFull && (!(await isTradeDay(now)) || !isAfterMarketClose(now))) {
    console.log("[kline-1d] not a trading day after market close, skip");
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

  const syncOne = async (symbol: string): Promise<number> => {
    let klines: StockKlineBar[];

    if (opts?.forceFull) {
      // 全量重刷：从当日往前翻页拉取完整前复权历史，彻底对齐除权后的口径。
      klines = [];
      let end = today;
      for (;;) {
        const chunk = await quant
          .stockKline(symbol, KLINE_PAGE, undefined, end, "qfq")
          .catch((error) => {
            console.error(`[kline-1d] ${symbol} full fetch failed:`, error);
            return [];
          });
        if (chunk.length === 0) break;
        klines.push(...chunk);
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
    } else {
      // 增量：从该标的已入库的最新日线日期开始（YYYYMMDD，未入库则为 undefined 走全量）
      const startDate = latestBySymbol.get(symbol);
      klines = await quant
        .stockKline(symbol, 500, startDate, today, "qfq")
        .catch((error) => {
          console.error(`[kline-1d] ${symbol} failed:`, error);
          return [];
        });
    }

    if (klines.length === 0) return 0;

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
  const CONCURRENCY = 5;
  let total = 0;
  let done = 0;
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
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()),
  );

  console.log(`[kline-1d] done. ${total} bars total`);
}
