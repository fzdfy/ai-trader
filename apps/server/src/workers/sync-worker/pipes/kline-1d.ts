import { db } from "../../../db";
import { isTradeDay, isAfterMarketClose } from "../calendar";
import { quant } from "../../../lib/quant";
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

export async function kline1dPipeRun(): Promise<void> {
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

  const syncOne = async (symbol: string): Promise<number> => {
    // 增量：从该标的已入库的最新日线日期开始（YYYYMMDD，未入库则为 undefined 走全量）
    const startDate = latestBySymbol.get(symbol);

    const klines = await quant
      .stockKline(symbol, 500, startDate, today, "qfq")
      .catch((error) => {
        console.error(`[kline-1d] ${symbol} failed:`, error);
        return [];
      });

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

  // 串行拉取（quant 侧 K 线主源腾讯 fqkline 前复权，降级 mootdx/百度，均为不封 IP 源，
  // 逐一同步避免瞬时并发过高。注：前复权遇除权会整体漂移历史价，建议定期全量重刷对齐口径）
  let total = 0;
  updateProgress(0, symbols.length, "开始同步日线 K 线");
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i]!;
    total += await syncOne(s.symbol);
    // 每处理 50 个标的上报一次进度（全市场 5000+ 标的，逐条上报写库过频）
    if ((i + 1) % 50 === 0 || i === symbols.length - 1) {
      updateProgress(i + 1, symbols.length, `同步日线 ${i + 1}/${symbols.length}`);
    }
  }

  console.log(`[kline-1d] done. ${total} bars total`);
}
