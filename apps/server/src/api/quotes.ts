import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { stockValuationDaily } from "../db/schema";
import { ok } from "../lib/response";
import { marketDataReader } from "../lib/market-data-read";

const quotesRoute = new Hono();

async function latestValuation(symbol: string) {
  const [row] = await db
    .select({
      peTtm: stockValuationDaily.peTtm,
      peStatic: stockValuationDaily.peStatic,
      pb: stockValuationDaily.pb,
    })
    .from(stockValuationDaily)
    .where(eq(stockValuationDaily.symbol, symbol))
    .orderBy(desc(stockValuationDaily.tradeDate))
    .limit(1);
  return row ?? null;
}

// GET /api/v1/quotes/latest?codes=000001.SZ,600000.SH
quotesRoute.get("/latest", async (c) => {
  const codesStr = c.req.query("codes") ?? "";
  if (!codesStr) return ok(c, []);
  const codes = codesStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const includeValuation = c.req.query("includeValuation") === "true";
  const reads = await Promise.all(codes.map((symbol) => marketDataReader.readQuote(symbol)));
  const valuations = includeValuation
    ? await Promise.all(codes.map((symbol) => latestValuation(symbol)))
    : [];
  const valuationBySymbol = new Map(
    codes.map((symbol, index) => [symbol, valuations[index] ?? null]),
  );
  return ok(
    c,
    reads.flatMap((read) => {
      if (!read.quote) return [];
      const valuation = valuationBySymbol.get(read.quote.symbol);
      return [
        {
          symbol: read.quote.symbol,
          name: read.quote.name,
          last: read.quote.last == null ? null : String(read.quote.last),
          changePct: read.quote.changePct == null ? null : String(read.quote.changePct),
          amount: read.quote.amount == null ? null : String(read.quote.amount),
          pe: read.quote.pe == null ? null : String(read.quote.pe),
          peTtm: valuation?.peTtm ?? null,
          peStatic: valuation?.peStatic ?? null,
          pb:
            read.quote.pb == null
              ? (valuation?.pb ?? null)
              : String(read.quote.pb),
          ts: read.asOf ?? "",
          source: read.source,
          quality: read.quality,
          fallback: read.fallback,
        },
      ];
    }),
  );
});

export { quotesRoute };
