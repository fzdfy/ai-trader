import assert from "node:assert/strict";
import test, { after } from "node:test";
import { eq, inArray } from "drizzle-orm";

import { db } from "../../../db";
import { newsArticle, newsArticleSymbol, watchlist } from "../../../db/schema";
import { quant } from "../../../lib/quant";
import { newsPipeRun } from "./news.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test(
  "news pipe uses quant providers and stores watchlist content",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const userId = `news-pipe-${crypto.randomUUID()}`;
    const marketSource = `test-market-${crypto.randomUUID()}`;
    const stockSource = `test-stock-${crypto.randomUUID()}`;
    const marketUrl = `https://example.com/${crypto.randomUUID()}`;
    const stockUrl = `https://example.com/${crypto.randomUUID()}`;
    const watchlistCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    const originalMarketNews = quant.marketNews;
    const originalStockNews = quant.stockNews;
    t.after(async () => {
      globalThis.fetch = originalFetch;
      quant.marketNews = originalMarketNews;
      quant.stockNews = originalStockNews;
      await db.delete(watchlist).where(eq(watchlist.userId, userId));
      const articles = await db
        .select({ id: newsArticle.id })
        .from(newsArticle)
        .where(inArray(newsArticle.source, [marketSource, stockSource]));
      const ids = articles.map((article) => article.id);
      if (ids.length > 0) {
        await db.delete(newsArticleSymbol).where(inArray(newsArticleSymbol.articleId, ids));
        await db.delete(newsArticle).where(inArray(newsArticle.id, ids));
      }
    });
    await db.insert(watchlist).values({ userId, symbol: "002594.SZ" });
    const expected = await db
      .selectDistinct({ symbol: watchlist.symbol })
      .from(watchlist)
      .then((rows) => rows.map((row) => row.symbol).sort());
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ errno: 0, data: { roll_data: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    quant.marketNews = async () => [
      {
        source: marketSource,
        title: "市场快讯",
        content: null,
        url: marketUrl,
        published_at: null,
        related_symbols: [],
      },
    ];
    quant.stockNews = async (symbol) => {
      watchlistCalls.push(symbol);
      return [
        {
          source: stockSource,
          title: "自选股新闻",
          content: null,
          url: stockUrl,
          published_at: null,
          related_symbols: [],
        },
      ];
    };

    await newsPipeRun();

    assert.deepEqual([...watchlistCalls].sort(), expected);
    const rows = await db
      .select({ source: newsArticle.source })
      .from(newsArticle)
      .where(inArray(newsArticle.source, [marketSource, stockSource]));
    assert.deepEqual(rows.map((row) => row.source).sort(), [marketSource, stockSource].sort());
  },
);
