import { Hono } from "hono";
import { db } from "../db";
import { newsArticle, newsArticleSymbol, newsEvent } from "../db/schema";
import { eq, desc, gte, lte } from "drizzle-orm";
import { ok, paginated } from "../lib/response";

const newsRoute = new Hono();

newsRoute.get("/", async (c) => {
  const symbol = c.req.query("symbol");
  const page = Number(c.req.query("page") ?? "1");
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 100);
  const offset = (page - 1) * limit;

  if (symbol) {
    const rows = await db
      .select()
      .from(newsArticle)
      .innerJoin(newsArticleSymbol, eq(newsArticle.id, newsArticleSymbol.articleId))
      .where(eq(newsArticleSymbol.symbol, symbol))
      .orderBy(desc(newsArticle.publishedAt))
      .limit(limit)
      .offset(offset);
    return paginated(c, rows, rows.length, page, limit);
  }

  const rows = await db
    .select()
    .from(newsArticle)
    .orderBy(desc(newsArticle.publishedAt))
    .limit(limit)
    .offset(offset);
  return paginated(c, rows, rows.length, page, limit);
});

newsRoute.get("/events", async (c) => {
  const symbol = c.req.query("symbol");
  const start = c.req.query("from");
  const end = c.req.query("to");
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);

  let query = db.select().from(newsEvent).$dynamic();
  if (start) query = query.where(gte(newsEvent.eventTime, new Date(start)));
  if (end) query = query.where(lte(newsEvent.eventTime, new Date(end)));
  query = query.orderBy(desc(newsEvent.eventTime)).limit(limit);

  return ok(c, await query);
});

export { newsRoute };
