import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import {
  companyAnnouncement,
  newsArticle,
  newsArticleSymbol,
  researchReport,
} from "../db/schema";
import { quant } from "../lib/quant";
import {
  syncStockAnnouncements,
  syncStockContent,
  syncStockNews,
  syncStockResearchReports,
} from "./stock-content-service.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";
const symbol = "002594.SZ";

after(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
});

test(
  "stock news links the queried symbol and stays idempotent",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-news-${crypto.randomUUID()}`;
    const urls = [
      `https://example.com/${crypto.randomUUID()}`,
      `https://example.com/${crypto.randomUUID()}`,
    ];
    const original = quant.stockNews;
    t.after(async () => {
      quant.stockNews = original;
      const articles = await db
        .select({ id: newsArticle.id })
        .from(newsArticle)
        .where(eq(newsArticle.source, source));
      const ids = articles.map((article) => article.id);
      if (ids.length > 0) {
        await db.delete(newsArticleSymbol).where(inArray(newsArticleSymbol.articleId, ids));
        await db.delete(newsArticle).where(inArray(newsArticle.id, ids));
      }
    });
    quant.stockNews = async () => [
      {
        source,
        title: "公司发布经营更新",
        content: "正文未出现股票代码",
        url: urls[0]!,
        published_at: "2026-11-19T10:00:00+08:00",
        related_symbols: [],
      },
      {
        source,
        title: "行业联合更新",
        content: "正文同时提及贵州茅台 600519.SH。",
        url: urls[1]!,
        published_at: "2026-11-19T11:00:00+08:00",
        related_symbols: ["002594.SZ", "002594"],
      },
    ];

    const first = await syncStockNews(symbol);
    const second = await syncStockNews(symbol);

    assert.equal(first.ok, true, first.error ?? undefined);
    assert.equal(first.inserted, 2);
    assert.equal(second.ok, true, second.error ?? undefined);
    assert.equal(second.inserted, 0);
    const rows = await db
      .select({ id: newsArticle.id })
      .from(newsArticle)
      .where(eq(newsArticle.source, source));
    assert.equal(rows.length, 2);
    const links = await db
      .select({
        symbol: newsArticleSymbol.symbol,
        total: sql<number>`count(*)::int`,
      })
      .from(newsArticleSymbol)
      .where(
        and(
          inArray(
            newsArticleSymbol.articleId,
            rows.map((row) => row.id),
          ),
          inArray(newsArticleSymbol.symbol, [symbol, "600519.SH"]),
        ),
      )
      .groupBy(newsArticleSymbol.symbol);
    assert.deepEqual(
      Object.fromEntries(links.map((row) => [row.symbol, Number(row.total)])),
      { [symbol]: 2, "600519.SH": 1 },
    );
  },
);

test(
  "stock announcements update the same source URL without inserting duplicates",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-announcement-${crypto.randomUUID()}`;
    const url = `https://example.com/${crypto.randomUUID()}`;
    const original = quant.announcements;
    t.after(async () => {
      quant.announcements = original;
      await db
        .delete(companyAnnouncement)
        .where(and(eq(companyAnnouncement.source, source), eq(companyAnnouncement.sourceUrl, url)));
    });
    quant.announcements = async () => [
      {
        source,
        source_id: crypto.randomUUID(),
        title: "第一次公告标题",
        announcement_type: "临时公告",
        published_at: "2026-11-18",
        url,
        pdf_url: null,
      },
    ];

    const first = await syncStockAnnouncements(symbol);
    quant.announcements = async () => [
      {
        source,
        source_id: crypto.randomUUID(),
        title: "更新后的公告标题",
        announcement_type: "正式公告",
        published_at: "2026-11-18",
        url,
        pdf_url: "https://example.com/notice.pdf",
      },
    ];
    const second = await syncStockAnnouncements(symbol);

    assert.equal(first.ok, true, first.error ?? undefined);
    assert.equal(first.inserted, 1);
    assert.equal(second.inserted, 0);
    const rows = await db
      .select({ title: companyAnnouncement.title, type: companyAnnouncement.announcementType })
      .from(companyAnnouncement)
      .where(and(eq(companyAnnouncement.source, source), eq(companyAnnouncement.sourceUrl, url)));
    assert.deepEqual(rows, [{ title: "更新后的公告标题", type: "正式公告" }]);
  },
);

test(
  "stock research report refresh keeps only the last twelve months",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-report-${crypto.randomUUID()}`;
    const recentSourceId = crypto.randomUUID();
    const oldSourceId = crypto.randomUUID();
    const oldDate = new Date();
    oldDate.setUTCFullYear(oldDate.getUTCFullYear() - 1);
    oldDate.setUTCDate(oldDate.getUTCDate() - 1);
    const original = quant.researchReports;
    t.after(async () => {
      quant.researchReports = original;
      await db
        .delete(researchReport)
        .where(
          and(
            eq(researchReport.source, source),
            inArray(researchReport.sourceId, [recentSourceId, oldSourceId]),
          ),
        );
    });
    quant.researchReports = async () => ({
      symbol,
      page: 1,
      page_size: 100,
      total: 2,
      items: [
        {
          source,
          source_id: recentSourceId,
          symbol,
          title: "最近研报",
          institution: "测试证券",
          analysts: [],
          rating: "买入",
          industry: null,
          publish_date: new Date().toISOString().slice(0, 10),
          pdf_url: null,
          forecasts: [],
          raw: {},
        },
        {
          source,
          source_id: oldSourceId,
          symbol,
          title: "过期研报",
          institution: "测试证券",
          analysts: [],
          rating: null,
          industry: null,
          publish_date: oldDate.toISOString().slice(0, 10),
          pdf_url: null,
          forecasts: [],
          raw: {},
        },
      ],
    });

    const result = await syncStockResearchReports(symbol);

    assert.equal(result.ok, true, result.error ?? undefined);
    assert.equal(result.total, 1);
    assert.equal(result.inserted, 1);
    const rows = await db
      .select({ sourceId: researchReport.sourceId })
      .from(researchReport)
      .where(eq(researchReport.source, source));
    assert.deepEqual(rows.map((row) => row.sourceId), [recentSourceId]);
  },
);

test(
  "one failed content module does not cancel the other modules",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-partial-${crypto.randomUUID()}`;
    const url = `https://example.com/${crypto.randomUUID()}`;
    const originalNews = quant.stockNews;
    const originalAnnouncements = quant.announcements;
    const originalReports = quant.researchReports;
    t.after(async () => {
      quant.stockNews = originalNews;
      quant.announcements = originalAnnouncements;
      quant.researchReports = originalReports;
      const articles = await db
        .select({ id: newsArticle.id })
        .from(newsArticle)
        .where(eq(newsArticle.source, source));
      const ids = articles.map((article) => article.id);
      if (ids.length > 0) {
        await db.delete(newsArticleSymbol).where(inArray(newsArticleSymbol.articleId, ids));
        await db.delete(newsArticle).where(inArray(newsArticle.id, ids));
      }
    });
    quant.stockNews = async () => [
      {
        source,
        title: "刷新仍可用",
        content: null,
        url,
        published_at: null,
        related_symbols: [symbol],
      },
    ];
    quant.announcements = async () => {
      throw new Error("公告上游不可用");
    };
    quant.researchReports = async () => ({
      symbol,
      page: 1,
      page_size: 100,
      total: 0,
      items: [],
    });

    const result = await syncStockContent(symbol);

    assert.equal(result.modules.news.ok, true);
    assert.equal(result.modules.news.inserted, 1);
    assert.equal(result.modules.announcements.ok, false);
    assert.match(result.modules.announcements.error ?? "", /公告上游不可用/);
    assert.equal(result.modules.reports.ok, true);
  },
);

test(
  "research report refresh paginates beyond one hundred reports",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-report-pages-${crypto.randomUUID()}`;
    const publishDate = new Date().toISOString().slice(0, 10);
    const items = Array.from({ length: 101 }, (_, index) => ({
      source,
      source_id: `${source}-${index}`,
      symbol,
      title: `分页研报 ${index}`,
      institution: "测试证券",
      analysts: [],
      rating: null,
      industry: null,
      publish_date: publishDate,
      pdf_url: null,
      forecasts: [],
      raw: {},
    }));
    const pages: number[] = [];
    const original = quant.researchReports;
    t.after(async () => {
      quant.researchReports = original;
      await db.delete(researchReport).where(eq(researchReport.source, source));
    });
    quant.researchReports = async (_symbol, page = 1, pageSize = 100) => {
      pages.push(page);
      const start = (page - 1) * pageSize;
      return {
        symbol,
        page,
        page_size: pageSize,
        total: items.length,
        items: items.slice(start, start + pageSize),
      };
    };

    const result = await syncStockResearchReports(symbol);

    assert.equal(result.ok, true, result.error ?? undefined);
    assert.equal(result.total, 101);
    assert.equal(result.inserted, 101);
    assert.deepEqual(pages, [1, 2]);
  },
);

test(
  "empty provider URLs receive stable fallback keys",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-empty-url-${crypto.randomUUID()}`;
    const original = quant.stockNews;
    t.after(async () => {
      quant.stockNews = original;
      const articles = await db
        .select({ id: newsArticle.id })
        .from(newsArticle)
        .where(eq(newsArticle.source, source));
      const ids = articles.map((article) => article.id);
      if (ids.length > 0) {
        await db.delete(newsArticleSymbol).where(inArray(newsArticleSymbol.articleId, ids));
        await db.delete(newsArticle).where(inArray(newsArticle.id, ids));
      }
    });
    quant.stockNews = async () => [
      {
        source,
        title: "快讯一",
        content: null,
        url: "",
        published_at: null,
        related_symbols: [],
      },
      {
        source,
        title: "快讯二",
        content: null,
        url: "",
        published_at: null,
        related_symbols: [],
      },
    ];

    const result = await syncStockNews(symbol);

    assert.equal(result.ok, true, result.error ?? undefined);
    assert.equal(result.inserted, 2);
    const rows = await db
      .select({ url: newsArticle.url })
      .from(newsArticle)
      .where(eq(newsArticle.source, source));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.url.startsWith(`fallback:${source}:`)));
  },
);

test(
  "content observedAt is captured after the upstream call completes",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const original = quant.stockNews;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    t.after(() => {
      quant.stockNews = original;
    });
    quant.stockNews = async () => {
      await gate;
      return [];
    };

    const pending = syncStockNews(symbol);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const completedAfter = Date.now();
    release();
    const result = await pending;

    assert.equal(result.ok, true, result.error ?? undefined);
    assert.ok(Date.parse(result.observedAt) >= completedAfter);
  },
);
