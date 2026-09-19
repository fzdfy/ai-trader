import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { instrument } from "../src/db/schema";
import { createSdk } from "../src/lib/sdk";

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
  // 复用带东财风控治理的 SDK 实例（串行限流 + 正常 UA/Referer）
  const sdk = createSdk();

  // step 1/4: 获取全量 A 股代码列表（带前缀：bj920000）
  console.log("[sync] step 1/4: fetching A-share code list...");
  const fullCodes = await sdk.codes.cn();
  console.log(`[sync] got ${fullCodes.length} codes`);

  // 构建 纯数字代码 → 完整代码 的映射
  // batch.byCodes() 返回的 code 没有前缀（如 '920000'），需要通过这个映射补全
  const codeMap = new Map<string, string>();
  for (const c of fullCodes) {
    codeMap.set(c.slice(2), c);
  }

  // step 2/4: 分批次按纯数字代码获取行情数据
  console.log("[sync] step 2/4: fetching quotes by codes...");
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

  // step 4/4: 回填上市日期（仅沪深）。
  // 上游行情接口不提供上市日，唯一可靠来源是「该标的最早一根日线」（bar1d_adj 的 MIN(time)）：
  //   - 沪深：历史已由腾讯完整落库，最早一根即真实上市日；
  //   - 北交所：不在此回填。北交所历史只有百度提供，在首次成功全量拉取前，库里可能只有被上游
  //     瞬时故障（如百度 500）截断的 1~2 根；若据此回填，会写成一个远晚于真实上市日的错误值，
  //     并让 kline-1d 的 detectHeadMissing 误判「头部完整」而永不重试（自我封口）。故北交所的
  //     list_date 改由 kline-1d 回补管道在「一次成功的全量拉取」之后用最早一根锚定
  //     （见 kline-1d.ts 的 anchorBjListDate）。
  // 仅回填 list_date 为空的行，不覆盖已有值（幂等）。list_date 落地后，kline-1d 的
  // detectHeadMissing 才能按「首根晚于上市日」判定头部缺失。
  console.log("[sync] step 4/4: backfilling list_date from earliest bar (excl. .BJ)...");
  const backfilled = await db.execute(sql`
    UPDATE instrument i
    SET list_date = sub.first_bar, updated_at = now()
    FROM (
      SELECT symbol, MIN(time)::date AS first_bar
      FROM bar1d_adj
      GROUP BY symbol
    ) sub
    WHERE i.symbol = sub.symbol AND i.list_date IS NULL AND i.symbol NOT LIKE '%.BJ'
  `);
  console.log(`[sync] list_date backfilled: ${backfilled.rowCount ?? 0}`);

  console.log(`[sync] done. total: ${upserted}`);
}

await syncInstruments();
