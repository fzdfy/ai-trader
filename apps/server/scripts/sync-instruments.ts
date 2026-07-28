import { StockSDK } from "stock-sdk";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { instrument } from "../src/db/schema";

/**
 * 市场标识 → 交易所代码映射
 * codes.cn() 返回的代码前缀：sh → 上交所, sz → 深交所, bj → 北交所
 */
const MARKET_EXCHANGE_MAP: Record<string, string> = {
  sh: "SH",
  sz: "SZ",
  bj: "BJ",
};

/**
 * 将上游代码转为标准化 symbol
 * bj920000 → 920000.BJ
 */
function toSymbol(code: string): string {
  const marketId = code.slice(0, 2);
  const num = code.slice(2);
  const exchange = MARKET_EXCHANGE_MAP[marketId] ?? marketId.toUpperCase();
  return `${num}.${exchange}`;
}

/** 每批查询/写入的数量 */
const BATCH_SIZE = 200;

async function syncInstruments() {
  const sdk = new StockSDK();

  // step 1: 获取全量 A 股代码列表（带前缀：bj920000）
  console.log("[sync] step 1/3: fetching A-share code list...");
  const fullCodes = await sdk.codes.cn();
  console.log(`[sync] got ${fullCodes.length} codes`);

  // 构建 纯数字代码 → 完整代码 的映射
  // batch.byCodes() 返回的 code 没有前缀（如 '920000'），需要通过这个映射补全
  const codeMap = new Map<string, string>();
  for (const c of fullCodes) {
    codeMap.set(c.slice(2), c);
  }

  // step 2: 分批次按纯数字代码获取行情数据
  console.log("[sync] step 2/3: fetching quotes by codes...");
  const numCodes = [...codeMap.keys()];
  const allQuotes: Awaited<ReturnType<typeof sdk.batch.byCodes>> = [];

  for (let i = 0; i < numCodes.length; i += BATCH_SIZE) {
    const codeBatch = numCodes.slice(i, i + BATCH_SIZE);
    const quotes = await sdk.batch.byCodes(codeBatch);
    allQuotes.push(...quotes);
    console.log(`[sync] fetched ${allQuotes.length}/${numCodes.length}`);
  }

  console.log(`[sync] total quotes: ${allQuotes.length}`);

  // step 3: 分批次写入数据库
  let upserted = 0;

  for (let i = 0; i < allQuotes.length; i += BATCH_SIZE) {
    const batch = allQuotes.slice(i, i + BATCH_SIZE).map((q) => {
      const fullCode = codeMap.get(q.code) ?? q.code;
      const marketId = fullCode.length >= 2 ? fullCode.slice(0, 2) : "unknown";
      return {
        symbol: toSymbol(fullCode),
        code: fullCode,
        name: q.name,
        exchange: MARKET_EXCHANGE_MAP[marketId] ?? marketId.toUpperCase(),
        market: "CN",
        listDate: null,
        delistDate: null,
        status: "listed",
        updatedAt: new Date(),
      };
    });

    await db
      .insert(instrument)
      .values(batch)
      .onConflictDoUpdate({
        target: instrument.symbol,
        set: {
          code: sql.raw("excluded.code"),
          name: sql.raw("excluded.name"),
          exchange: sql.raw("excluded.exchange"),
          market: sql.raw("excluded.market"),
          status: sql.raw("excluded.status"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });

    upserted += batch.length;
    console.log(`[sync] upserted ${upserted}/${allQuotes.length}`);
  }

  console.log(`[sync] done. total: ${upserted}`);
}

await syncInstruments();
