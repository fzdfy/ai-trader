import { Hono } from "hono";
import { ok } from "../lib/response";
import { marketDataReader } from "../lib/market-data-read";

const quotesRoute = new Hono();

// GET /api/v1/quotes/latest?codes=000001.SZ,600000.SH
quotesRoute.get("/latest", async (c) => {
  const codesStr = c.req.query("codes") ?? "";
  if (!codesStr) return ok(c, []);
  const codes = codesStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const reads = await Promise.all(codes.map((symbol) => marketDataReader.readQuote(symbol)));
  return ok(
    c,
    reads.flatMap((read) =>
      read.quote
        ? [
            {
              symbol: read.quote.symbol,
              name: read.quote.name,
              last: read.quote.last == null ? null : String(read.quote.last),
              changePct: read.quote.changePct == null ? null : String(read.quote.changePct),
              pe: read.quote.pe == null ? null : String(read.quote.pe),
              pb: read.quote.pb == null ? null : String(read.quote.pb),
              ts: read.asOf ?? "",
              source: read.source,
              quality: read.quality,
              fallback: read.fallback,
            },
          ]
        : [],
    ),
  );
});

export { quotesRoute };
