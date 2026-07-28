import { db } from "../../../db";
import { isTradeDay, isAfterMarketClose } from "../calendar";
import { StockSDK } from "stock-sdk";
import { sql } from "drizzle-orm";
import { watchlist, bar1dAdj } from "../../../db/schema";
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
  const sdk = new StockSDK();

  // 获取所有自选标的
  const symbols = await db.selectDistinct({ symbol: watchlist.symbol }).from(watchlist);

  if (symbols.length === 0) {
    console.log("[kline-1d] no watchlist symbols, skip");
    return;
  }

  console.log(`[kline-1d] syncing ${symbols.length} symbols`);

  const today = dayjs().format("YYYYMMDD");
  // const startDate = dayjs().subtract(3, "year").format("YYYYMMDD");
  let total = 0;

  for (const { symbol } of symbols) {
    const tencentCode = toLowerCode(symbol);

    const klines = await sdk.kline
      .withIndicators(tencentCode, {
        period: "daily",
        adjust: "qfq",
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

    if (klines.length === 0) continue;

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

    total += batch.length;
  }

  console.log(`[kline-1d] done. ${total} bars total`);
}
