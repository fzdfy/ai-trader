import { Hono } from "hono";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "../db";
import {
  boardHistory,
  fundFlowRank,
  limitUpPool,
  newsArticle,
  reviewDaily,
  stockPool,
} from "../db/schema";
import {
  summarizeBreadth,
  summarizeFundFlowBreadth,
  summarizeLimitUp,
  toNumber,
} from "../lib/dashboard-data";
import { serverError, ok } from "../lib/response";

const dashboardRoute = new Hono();

dashboardRoute.get("/", async (c) => {
  try {
    const [boardDateRow, fundDateRow, limitDateRow, stockDateRow, reviewRow] = await Promise.all([
      db.select({ date: max(boardHistory.date) }).from(boardHistory),
      db.select({ date: max(fundFlowRank.date) }).from(fundFlowRank),
      db.select({ date: max(limitUpPool.date) }).from(limitUpPool),
      db.select({ date: max(stockPool.date) }).from(stockPool),
      db
        .select({
          date: reviewDaily.date,
          summary: reviewDaily.summary,
          updatedAt: reviewDaily.updatedAt,
        })
        .from(reviewDaily)
        .orderBy(desc(reviewDaily.date))
        .limit(1),
    ]);

    const boardDate = boardDateRow[0]?.date ?? null;
    const fundDate = fundDateRow[0]?.date ?? null;
    const limitDate = limitDateRow[0]?.date ?? null;
    const stockDate = stockDateRow[0]?.date ?? null;

    const [boardRows, fundRows, limitRows, stockRows, newsRows] = await Promise.all([
      boardDate
        ? db
            .select({
              type: boardHistory.type,
              changePercent: boardHistory.changePercent,
            })
            .from(boardHistory)
            .where(eq(boardHistory.date, boardDate))
        : Promise.resolve([]),
      fundDate
        ? db
            .select({
              category: fundFlowRank.category,
              rank: fundFlowRank.rank,
              code: fundFlowRank.code,
              name: fundFlowRank.name,
              changePercent: fundFlowRank.changePercent,
              mainNetInflow: fundFlowRank.mainNetInflow,
              topStockName: fundFlowRank.topStockName,
            })
            .from(fundFlowRank)
            .where(
              and(
                eq(fundFlowRank.date, fundDate),
                inArray(fundFlowRank.category, ["industry", "concept"]),
              ),
            )
            .orderBy(fundFlowRank.category, fundFlowRank.rank)
        : Promise.resolve([]),
      limitDate
        ? db
            .select({
              symbol: limitUpPool.symbol,
              name: limitUpPool.name,
              industry: limitUpPool.industry,
              limitUpCount: limitUpPool.limitUpCount,
              isLimitUp: limitUpPool.isLimitUp,
              openCount: limitUpPool.openCount,
              sealAmount: limitUpPool.sealAmount,
              turnoverRate: limitUpPool.turnoverRate,
            })
            .from(limitUpPool)
            .where(eq(limitUpPool.date, limitDate))
            .orderBy(desc(limitUpPool.limitUpCount), desc(limitUpPool.sealAmount))
        : Promise.resolve([]),
      stockDate
        ? db
            .select({
              symbol: stockPool.symbol,
              name: stockPool.name,
              source: stockPool.source,
              score: stockPool.score,
            })
            .from(stockPool)
            .where(eq(stockPool.date, stockDate))
            .orderBy(sql`${stockPool.score} DESC NULLS LAST`)
        : Promise.resolve([]),
      db
        .select({
          id: newsArticle.id,
          source: newsArticle.source,
          title: newsArticle.title,
          url: newsArticle.url,
          publishedAt: newsArticle.publishedAt,
        })
        .from(newsArticle)
        .orderBy(sql`${newsArticle.publishedAt} DESC NULLS LAST`)
        .limit(3),
    ]);

    const byCategory = (category: string) =>
      fundRows
        .filter((row) => row.category === category)
        .slice(0, 5)
        .map((row) => ({
          rank: row.rank,
          code: row.code,
          name: row.name,
          changePercent: toNumber(row.changePercent),
          mainNetInflow: toNumber(row.mainNetInflow),
          topStockName: row.topStockName,
        }));
    const limitSummary = summarizeLimitUp(limitRows);
    const review = reviewRow[0]
      ? {
          date: reviewRow[0].date,
          summary: reviewRow[0].summary,
          updatedAt: reviewRow[0].updatedAt.toISOString(),
        }
      : null;

    return ok(c, {
      asOf: {
        market: boardDate ?? fundDate ?? limitDate,
        boards: boardDate,
        fundFlow: fundDate,
        limitUp: limitDate,
        stockPool: stockDate,
        news: newsRows[0]?.publishedAt?.toISOString() ?? null,
        review: review?.updatedAt ?? null,
      },
      breadth: summarizeBreadth(boardRows),
      fundFlow: {
        breadth: summarizeFundFlowBreadth(fundRows),
        industry: byCategory("industry"),
        concept: byCategory("concept"),
      },
      limitUp: {
        ...limitSummary,
        avgTurnover: Number(limitSummary.avgTurnover.toFixed(2)),
        leaders: limitRows
          .filter((row) => row.isLimitUp)
          .slice(0, 8)
          .map((row) => ({
            symbol: row.symbol,
            name: row.name,
            industry: row.industry,
            count: row.limitUpCount,
          })),
      },
      stockPool: {
        date: stockDate,
        total: stockRows.length,
        items: stockRows.slice(0, 5).map((row) => ({
          symbol: row.symbol,
          name: row.name,
          source: row.source,
          score: toNumber(row.score),
        })),
      },
      news: newsRows.map((row) => ({
        id: row.id,
        source: row.source,
        title: row.title,
        url: row.url,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      })),
      review,
    });
  } catch (error) {
    console.error("[dashboard] failed:", error);
    return serverError(c, "每日看板数据获取失败，请稍后重试。");
  }
});

export { dashboardRoute };
