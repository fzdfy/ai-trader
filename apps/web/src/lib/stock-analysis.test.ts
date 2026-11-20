import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAnalysisMoney,
  formatContentRefreshSummary,
  formatResearchIndexStatus,
  buildStockContentTimeline,
  selectStockContentPreview,
  mergeRecentAnalyses,
  normalizeCompareSymbols,
  shouldPollResearchIndex,
  stockAnalysisPath,
  stockComparePath,
} from "./stock-analysis.ts";

const indexStatus = {
  symbol: "002594.SZ",
  windowDays: 30,
  total: 7,
  pending: 0,
  extracted: 0,
  failed: 0,
  action: "none" as const,
  observedAt: "2026-11-20T10:52:00.000Z",
};

test("builds encoded analysis and compare routes", () => {
  assert.equal(stockAnalysisPath("002594.SZ"), "/home/market/analysis/002594.SZ");
  assert.equal(
    stockComparePath(["002594.SZ", "601633.SH", "601127.SH"]),
    "/home/market/analysis/compare?symbols=002594.SZ%2C601633.SH%2C601127.SH",
  );
});

test("unifies news, announcements, and reports newest first", () => {
  const timeline = buildStockContentTimeline({
    news: [
      {
        id: 1,
        source: "eastmoney",
        title: "新闻事件",
        url: "https://example.com/news",
        publishedAt: "2026-11-19T10:38:00.000Z",
      },
    ],
    announcements: [
      {
        id: 2,
        title: "季度报告",
        announcementType: "季度报告",
        publishAt: "2026-11-19T02:20:00.000Z",
        sourceUrl: "https://example.com/announcement",
      },
    ],
    reports: [
      {
        id: 3,
        title: "盈利预测更新",
        institution: "中航证券",
        rating: "买入",
        publishDate: "2026-11-13",
        pdfUrl: "https://example.com/report.pdf",
        extractStatus: "pending",
        storageKey: null,
      },
    ],
  });

  assert.deepEqual(
    timeline.map((item) => [item.type, item.title, item.source]),
    [
      ["news", "新闻事件", "东方财富"],
      ["announcement", "季度报告", "巨潮资讯"],
      ["report", "盈利预测更新", "中航证券"],
    ],
  );
  assert.equal(timeline[1]?.meta, "季度报告");
  assert.equal(timeline[2]?.meta, "买入 · PDF 待提取");
});

test("content preview keeps every event type when news dominates", () => {
  const timeline = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `news-${index}`,
      type: "news" as const,
      title: `新闻 ${index}`,
      source: "东方财富",
      publishedAt: `2026-11-19T${String(20 - index).padStart(2, "0")}:00:00.000Z`,
      href: null,
      meta: "个股新闻",
    })),
    {
      id: "announcement-1",
      type: "announcement" as const,
      title: "公告",
      source: "巨潮资讯",
      publishedAt: "2026-11-12T08:00:00.000Z",
      href: null,
      meta: "公司公告",
    },
    {
      id: "report-1",
      type: "report" as const,
      title: "研报",
      source: "中航证券",
      publishedAt: "2026-11-13T08:00:00.000Z",
      href: null,
      meta: "买入",
    },
  ].sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));

  const preview = selectStockContentPreview(timeline, 8);
  assert.equal(preview.length, 8);
  assert.deepEqual(
    new Set(preview.map((item) => item.type)),
    new Set(["news", "announcement", "report"]),
  );
  assert.deepEqual(
    preview.map((item) => item.publishedAt),
    [...preview]
      .map((item) => item.publishedAt)
      .sort((left, right) => Date.parse(right!) - Date.parse(left!)),
  );
});

test("fallback news URLs do not render as external links", () => {
  const timeline = buildStockContentTimeline({
    news: [
      {
        id: 9,
        source: "eastmoney_global",
        title: "无原文链接快讯",
        url: "fallback:eastmoney_global:abc123",
        publishedAt: "2026-11-19T10:00:00.000Z",
      },
    ],
    announcements: [],
    reports: [],
  });
  assert.equal(timeline[0]?.href, null);
});

test("normalizes and deduplicates compare symbols", () => {
  assert.deepEqual(
    normalizeCompareSymbols([" 002594.sz ", "002594.SZ", "sh600519", "AAPL", "920007"]),
    ["002594.SZ", "600519.SH", "920007.BJ"],
  );
});

test("formats analysis money without inventing missing values", () => {
  assert.equal(formatAnalysisMoney(null), "—");
  assert.equal(formatAnalysisMoney(723_176_000_000), "7,231.76 亿");
  assert.equal(formatAnalysisMoney(82_400_000), "8,240.00 万");
});

test("recent analyses keep the latest visit per symbol", () => {
  assert.deepEqual(
    mergeRecentAnalyses(
      [
        { symbol: "600519.SH", name: "贵州茅台", viewedAt: "2026-11-18T08:00:00.000Z" },
        { symbol: "002594.SZ", name: "比亚迪", viewedAt: "2026-11-17T08:00:00.000Z" },
      ],
      { symbol: "002594.SZ", name: "比亚迪", viewedAt: "2026-11-19T08:00:00.000Z" },
      2,
    ),
    [
      { symbol: "002594.SZ", name: "比亚迪", viewedAt: "2026-11-19T08:00:00.000Z" },
      { symbol: "600519.SH", name: "贵州茅台", viewedAt: "2026-11-18T08:00:00.000Z" },
    ],
  );
});

test("content refresh summary never claims success when a module fails", () => {
  const base = {
    symbol: "002594.SZ",
    modules: {
      news: {
        ok: true,
        inserted: 2,
        total: 8,
        observedAt: "2026-11-19T10:42:00.000Z",
        error: null,
      },
      announcements: {
        ok: true,
        inserted: 1,
        total: 3,
        observedAt: "2026-11-19T10:42:00.000Z",
        error: null,
      },
      reports: {
        ok: true,
        inserted: 0,
        total: 12,
        observedAt: "2026-11-19T10:42:00.000Z",
        error: null,
      },
    },
  } as const;

  assert.deepEqual(formatContentRefreshSummary(base), {
    tone: "success",
    label: "新闻、公告和研报已更新",
    detail: "新闻 8 条 · 公告 3 条 · 研报 12 篇",
    failedModules: [],
  });

  const partial = {
    ...base,
    modules: {
      ...base.modules,
      announcements: {
        ok: false,
        inserted: 0,
        total: 0,
        observedAt: "2026-11-19T10:42:00.000Z",
        error: "公告上游不可用",
      },
    },
  };
  assert.deepEqual(formatContentRefreshSummary(partial), {
    tone: "warning",
    label: "部分内容更新失败",
    detail: "公告：公告上游不可用",
    failedModules: ["公告"],
  });

  const allFailed = {
    ...base,
    modules: {
      news: { ...base.modules.news, ok: false, total: 0, error: "新闻失败" },
      announcements: { ...base.modules.announcements, ok: false, total: 0, error: "公告失败" },
      reports: { ...base.modules.reports, ok: false, total: 0, error: "研报失败" },
    },
  };
  assert.deepEqual(formatContentRefreshSummary(allFailed), {
    tone: "error",
    label: "内容更新失败",
    detail: "新闻：新闻失败；公告：公告失败；研报：研报失败",
    failedModules: ["新闻", "公告", "研报"],
  });

  assert.deepEqual(formatContentRefreshSummary(null), {
    tone: "warning",
    label: "刷新结果不完整",
    detail: "未收到完整模块状态，请重新分析。",
    failedModules: ["新闻", "公告", "研报"],
  });
});

test("research index status distinguishes pending, active, partial, complete and failed", () => {
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      pending: 7,
      action: "index_reports",
    }),
    {
      label: "7 篇待索引",
      tone: "warning",
      detail: "全文索引任务已进入队列，完成后可按主题检索页码和原文片段。",
      isActive: true,
    },
  );
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      pending: 4,
      extracted: 3,
      action: "index_reports",
    }),
    {
      label: "索引中 3/7",
      tone: "warning",
      detail: "已完成 3 篇，剩余 4 篇正在排队或提取。",
      isActive: true,
    },
  );
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      extracted: 5,
      failed: 2,
    }),
    {
      label: "已索引 5 篇 · 2 失败",
      tone: "warning",
      detail: "2 篇研报全文提取失败，已索引内容仍可检索；可单独重试失败研报。",
      isActive: false,
    },
  );
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      extracted: 7,
    }),
    {
      label: "已索引 7 篇",
      tone: "success",
      detail: "最近 30 天研报全文已可检索。",
      isActive: false,
    },
  );
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      failed: 7,
    }),
    {
      label: "7 篇提取失败",
      tone: "error",
      detail: "全文提取全部失败；可单独重试失败研报。",
      isActive: false,
    },
  );
});

test("empty and stale research index states do not invent indexed content", () => {
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      total: 0,
    }),
    {
      label: "暂无全文",
      tone: "neutral",
      detail: "当前没有可引用全文，研报元数据同步后会自动触发索引。",
      isActive: false,
    },
  );
  assert.deepEqual(
    formatResearchIndexStatus({
      ...indexStatus,
      total: 0,
      action: "sync_metadata",
    }),
    {
      label: "等待元数据",
      tone: "warning",
      detail: "正在同步最近 12 个月研报元数据。",
      isActive: true,
    },
  );
  assert.equal(shouldPollResearchIndex({ ...indexStatus, action: "index_reports" }), true);
  assert.equal(shouldPollResearchIndex(indexStatus), false);
});
