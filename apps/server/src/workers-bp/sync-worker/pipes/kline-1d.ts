import { db } from "../../../db";
import { isTradeDay, isAfterMarketClose } from "../calendar";
import { asyncPool } from "stock-sdk";
import { createSdk } from "../../../lib/sdk";
import { sql, eq } from "drizzle-orm";
import { bar1dAdj, instrument } from "../../../db/schema";
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

function toLowerCode(symbol: string): string {
  const parts = symbol.split(".");
  const code = parts[0] ?? symbol;
  const exchange = parts[1] ?? "";
  const prefix = exchange.toLowerCase();
  return `${prefix}${code}`;
}

export async function kline1dPipeRun(): Promise<void> {
  const sdk = createSdk();

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
    const tencentCode = toLowerCode(symbol);
    // 增量：从该标的已入库的最新日线日期开始；SDK 会根据指标依赖自动向前多取若干 bar 保证指标有效
    const startDate = latestBySymbol.get(symbol);

    const klines = await sdk.kline
      .withIndicators(tencentCode, {
        period: "daily",
        adjust: "qfq",
        startDate,
        endDate: today,
        indicators: {
          ma: [5, 10, 20, 60],
          macd: {},
          boll: {},
          kdj: {},
          rsi: [6, 12, 24],
        },
      })
      .catch((error) => {
        console.error(`[kline-1d] ${symbol} failed:`, error);
        return [];
      });

    if (klines.length === 0) return 0;

    const batch = klines
      .filter((k) => k.date)
      .map((k) => ({
        time: new Date(k.date),
        symbol,
        open: String(k.open ?? 0),
        high: String(k.high ?? 0),
        low: String(k.low ?? 0),
        close: String(k.close ?? 0),
        volume: String(k.volume ?? 0),
        amount: k.amount == null ? null : String(k.amount),
        avgPrice: null,
        indicators: { ma: k.ma, macd: k.macd, boll: k.boll, kdj: k.kdj, rsi: k.rsi },
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

  // 并发拉取（上游接口有隐式限流，8 并发在稳定性与速度间取平衡）
  const counts = await asyncPool(
    symbols.map((s) => () => syncOne(s.symbol)),
    1,
  );
  const total = counts.reduce((acc, n) => acc + n, 0);

  console.log(`[kline-1d] done. ${total} bars total`);
}
