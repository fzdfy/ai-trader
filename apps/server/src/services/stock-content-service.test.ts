import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import {
  analystConsensusSnapshot,
  companyAnnouncement,
  newsArticle,
  newsArticleSymbol,
  researchReport,
  stockFinancialSnapshot,
  stockValuationDaily,
  syncCursor,
} from "../db/schema";
import { quant } from "../lib/quant";
import {
  shanghaiDate,
  syncStockAnalystConsensus,
  syncStockAnnouncements,
  syncStockContent,
  syncStockFinancialSnapshot,
  syncStockFinancialStatements,
  syncStockNews,
  syncStockResearchReports,
  syncStockValuationHistory,
} from "./stock-content-service.ts";

const runDatabaseTests = process.env.ADMIN_DB_TESTS === "1";
const symbol = "002594.SZ";

test("analyst consensus snapshot date uses the Shanghai market date", () => {
  assert.equal(shanghaiDate(new Date("2026-11-20T16:30:00.000Z")), "2026-11-21");
});

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
    assert.deepEqual(Object.fromEntries(links.map((row) => [row.symbol, Number(row.total)])), {
      [symbol]: 2,
      "600519.SH": 1,
    });
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
    assert.deepEqual(
      rows.map((row) => row.sourceId),
      [recentSourceId],
    );
  },
);

test(
  "analyst consensus snapshots upsert by source and fiscal year",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-consensus-${crypto.randomUUID()}`;
    const asOfDate = "2026-11-21";
    let epsMean = 3.46;
    const original = quant.analystConsensus;
    t.after(async () => {
      quant.analystConsensus = original;
      await db
        .delete(analystConsensusSnapshot)
        .where(
          and(
            eq(analystConsensusSnapshot.symbol, symbol),
            eq(analystConsensusSnapshot.source, source),
          ),
        );
    });
    quant.analystConsensus = async () => [
      {
        symbol,
        as_of_date: asOfDate,
        fiscal_year: 2026,
        eps_min: 3.12,
        eps_mean: epsMean,
        eps_max: 3.88,
        analyst_count: 18,
        source,
        raw: {},
      },
    ];

    const first = await syncStockAnalystConsensus(symbol, asOfDate);
    epsMean = 3.52;
    const second = await syncStockAnalystConsensus(symbol, asOfDate);

    assert.equal(first.ok, true, first.error ?? undefined);
    assert.equal(first.inserted, 1);
    assert.equal(second.ok, true, second.error ?? undefined);
    assert.equal(second.inserted, 0);
    const rows = await db
      .select({
        epsMean: analystConsensusSnapshot.epsMean,
        analystCount: analystConsensusSnapshot.analystCount,
      })
      .from(analystConsensusSnapshot)
      .where(
        and(
          eq(analystConsensusSnapshot.symbol, symbol),
          eq(analystConsensusSnapshot.source, source),
          eq(analystConsensusSnapshot.asOfDate, asOfDate),
        ),
      );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0]?.epsMean), 3.52);
    assert.equal(rows[0]?.analystCount, 18);
  },
);

test(
  "analyst consensus duplicates collapse to the last business key",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const source = `test-consensus-duplicate-${crypto.randomUUID()}`;
    const asOfDate = "2026-11-21";
    const original = quant.analystConsensus;
    t.after(async () => {
      quant.analystConsensus = original;
      await db
        .delete(analystConsensusSnapshot)
        .where(
          and(
            eq(analystConsensusSnapshot.symbol, symbol),
            eq(analystConsensusSnapshot.source, source),
          ),
        );
    });
    quant.analystConsensus = async () => [
      {
        symbol,
        as_of_date: asOfDate,
        fiscal_year: 2026,
        eps_min: 3.0,
        eps_mean: 3.4,
        eps_max: 3.8,
        analyst_count: 10,
        source,
        raw: {},
      },
      {
        symbol,
        as_of_date: asOfDate,
        fiscal_year: 2026,
        eps_min: 3.1,
        eps_mean: 3.5,
        eps_max: 3.9,
        analyst_count: 18,
        source,
        raw: {},
      },
    ];

    const result = await syncStockAnalystConsensus(symbol, asOfDate);

    assert.equal(result.ok, true, result.error ?? undefined);
    assert.equal(result.inserted, 1);
    const rows = await db
      .select({
        epsMean: analystConsensusSnapshot.epsMean,
        analystCount: analystConsensusSnapshot.analystCount,
      })
      .from(analystConsensusSnapshot)
      .where(
        and(
          eq(analystConsensusSnapshot.symbol, symbol),
          eq(analystConsensusSnapshot.source, source),
        ),
      );
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0]?.epsMean), 3.5);
    assert.equal(rows[0]?.analystCount, 18);
  },
);

test(
  "financial and valuation sources stay distinct and idempotent",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const snapshotSource = `test-mootdx-${crypto.randomUUID()}`;
    const statementSource = `test-sina-${crypto.randomUUID()}`;
    const valuationSource = `test-baostock-${crypto.randomUUID()}`;
    const reportPeriod = "2026-09-30";
    const tradeDate = "2026-11-20";
    const originalSnapshot = quant.financialSnapshot;
    const originalStatements = quant.financialStatements;
    const originalValuation = quant.valuationHistory;
    t.after(async () => {
      quant.financialSnapshot = originalSnapshot;
      quant.financialStatements = originalStatements;
      quant.valuationHistory = originalValuation;
      await db
        .delete(stockFinancialSnapshot)
        .where(
          and(
            eq(stockFinancialSnapshot.symbol, symbol),
            inArray(stockFinancialSnapshot.source, [snapshotSource, statementSource]),
          ),
        );
      await db
        .delete(stockValuationDaily)
        .where(
          and(
            eq(stockValuationDaily.symbol, symbol),
            eq(stockValuationDaily.source, valuationSource),
          ),
        );
    });
    quant.financialSnapshot = async () => [
      {
        symbol,
        report_period: reportPeriod,
        statement_type: "snapshot",
        source: snapshotSource,
        metrics: { eps: 3.44 },
        raw: {},
      },
    ];
    quant.financialStatements = async () => [
      {
        symbol,
        report_period: reportPeriod,
        statement_type: "income_statement",
        source: statementSource,
        metrics: { 净利润: 9876 },
        raw: {},
      },
    ];
    quant.valuationHistory = async () => [
      {
        symbol,
        trade_date: tradeDate,
        pe_ttm: 23.4,
        pe_static: null,
        pb: 4.1,
        ps_ttm: 1.2,
        pcf: -5,
        turnover_rate: 1.23,
        trade_status: "trading",
        is_st: false,
        source: valuationSource,
        raw: {},
      },
    ];

    const firstSnapshot = await syncStockFinancialSnapshot(symbol);
    const firstStatements = await syncStockFinancialStatements(symbol);
    const firstValuation = await syncStockValuationHistory(symbol);
    quant.financialSnapshot = async () => [
      {
        symbol,
        report_period: reportPeriod,
        statement_type: "snapshot",
        source: snapshotSource,
        metrics: { eps: 3.51 },
        raw: {},
      },
    ];
    quant.valuationHistory = async () => [
      {
        symbol,
        trade_date: tradeDate,
        pe_ttm: 24.1,
        pe_static: null,
        pb: 4.2,
        ps_ttm: 1.3,
        pcf: -6,
        turnover_rate: 1.5,
        trade_status: "suspended",
        is_st: true,
        source: valuationSource,
        raw: {},
      },
    ];
    const secondSnapshot = await syncStockFinancialSnapshot(symbol);
    const secondStatements = await syncStockFinancialStatements(symbol);
    const secondValuation = await syncStockValuationHistory(symbol);

    assert.equal(firstSnapshot.inserted, 1);
    assert.equal(firstStatements.inserted, 1);
    assert.equal(firstValuation.inserted, 1);
    assert.equal(secondSnapshot.inserted, 0);
    assert.equal(secondStatements.inserted, 0);
    assert.equal(secondValuation.inserted, 0);
    const financialRows = await db
      .select({
        source: stockFinancialSnapshot.source,
        metrics: stockFinancialSnapshot.metrics,
      })
      .from(stockFinancialSnapshot)
      .where(
        and(
          eq(stockFinancialSnapshot.symbol, symbol),
          eq(stockFinancialSnapshot.reportPeriod, reportPeriod),
          inArray(stockFinancialSnapshot.source, [snapshotSource, statementSource]),
        ),
      )
      .orderBy(stockFinancialSnapshot.source);
    assert.equal(financialRows.length, 2);
    assert.deepEqual(Object.fromEntries(financialRows.map((row) => [row.source, row.metrics])), {
      [statementSource]: { 净利润: 9876 },
      [snapshotSource]: { eps: 3.51 },
    });
    const [valuation] = await db
      .select({
        peTtm: stockValuationDaily.peTtm,
        tradeStatus: stockValuationDaily.tradeStatus,
        isSt: stockValuationDaily.isSt,
      })
      .from(stockValuationDaily)
      .where(
        and(
          eq(stockValuationDaily.symbol, symbol),
          eq(stockValuationDaily.tradeDate, tradeDate),
          eq(stockValuationDaily.source, valuationSource),
        ),
      );
    assert.equal(Number(valuation?.peTtm), 24.1);
    assert.equal(valuation?.tradeStatus, "suspended");
    assert.equal(valuation?.isSt, true);
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
    const originalConsensus = quant.analystConsensus;
    const originalSnapshot = quant.financialSnapshot;
    const originalStatements = quant.financialStatements;
    const originalValuation = quant.valuationHistory;
    t.after(async () => {
      quant.stockNews = originalNews;
      quant.announcements = originalAnnouncements;
      quant.researchReports = originalReports;
      quant.analystConsensus = originalConsensus;
      quant.financialSnapshot = originalSnapshot;
      quant.financialStatements = originalStatements;
      quant.valuationHistory = originalValuation;
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
    quant.analystConsensus = async () => [];
    quant.financialSnapshot = async () => [];
    quant.financialStatements = async () => [];
    quant.valuationHistory = async () => [];

    const result = await syncStockContent(symbol);

    assert.equal(result.modules.news.ok, true);
    assert.equal(result.modules.news.inserted, 1);
    assert.equal(result.modules.announcements.ok, false);
    assert.match(result.modules.announcements.error ?? "", /公告上游不可用/);
    assert.equal(result.modules.reports.ok, true);
    assert.equal(result.modules.analystConsensus.ok, true);
    assert.equal(result.modules.financialSnapshot.ok, true);
    assert.equal(result.modules.financialStatements.ok, true);
    assert.equal(result.modules.valuationHistory.ok, true);
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
  "research metadata advances from a bounded cursor window",
  { skip: runDatabaseTests ? false : "set ADMIN_DB_TESTS=1 to run" },
  async (t) => {
    const cursorSymbol = `T${crypto.randomUUID().slice(0, 6).toUpperCase()}.SZ`;
    const beginTimes: Array<string | undefined> = [];
    const original = quant.researchReports;
    t.after(async () => {
      quant.researchReports = original;
      await db.delete(syncCursor).where(eq(syncCursor.symbol, cursorSymbol));
    });
    await db.insert(syncCursor).values({
      source: "eastmoney",
      endpoint: "research-reports-metadata",
      symbol: cursorSymbol,
      timeframe: "12m",
      cursorTime: new Date("2026-11-10T10:00:00.000Z"),
      updatedAt: new Date("2026-11-10T10:00:00.000Z"),
    });
    quant.researchReports = async (_symbol, _page, _pageSize, beginTime) => {
      beginTimes.push(beginTime);
      return {
        symbol: cursorSymbol,
        page: 1,
        page_size: 100,
        total: 0,
        items: [],
      };
    };

    const result = await syncStockResearchReports(
      cursorSymbol,
      new Date("2026-11-21T10:00:00.000Z"),
    );

    assert.equal(result.ok, true, result.error ?? undefined);
    assert.deepEqual(beginTimes, ["2026-11-03"]);
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
