import assert from "node:assert/strict";
import test from "node:test";

import { quant } from "./quant.ts";

test("content clients preserve snake_case contracts and query parameters", async (t) => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const payloads = [
    [
      {
        source: "eastmoney",
        title: "比亚迪新闻",
        content: null,
        url: "https://example.com/news",
        published_at: "2026-11-19T10:38:00+08:00",
        related_symbols: ["002594.SZ"],
      },
    ],
    [
      {
        source: "eastmoney_global",
        title: "市场快讯",
        content: "正文",
        url: "https://example.com/market",
        published_at: null,
        related_symbols: [],
      },
    ],
    [
      {
        source: "cninfo",
        source_id: "1224900001",
        title: "季度报告",
        announcement_type: "季度报告",
        published_at: "2026-10-28",
        url: "https://example.com/announcement",
        pdf_url: "https://example.com/announcement.pdf",
      },
    ],
  ];

  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return new Response(JSON.stringify(payloads.shift()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  assert.deepEqual(await quant.stockNews("002594.SZ", 20), [
    {
      source: "eastmoney",
      title: "比亚迪新闻",
      content: null,
      url: "https://example.com/news",
      published_at: "2026-11-19T10:38:00+08:00",
      related_symbols: ["002594.SZ"],
    },
  ]);
  assert.deepEqual(await quant.marketNews(50), [
    {
      source: "eastmoney_global",
      title: "市场快讯",
      content: "正文",
      url: "https://example.com/market",
      published_at: null,
      related_symbols: [],
    },
  ]);
  assert.deepEqual(await quant.announcements("002594.SZ", 30, 20), [
    {
      source: "cninfo",
      source_id: "1224900001",
      title: "季度报告",
      announcement_type: "季度报告",
      published_at: "2026-10-28",
      url: "https://example.com/announcement",
      pdf_url: "https://example.com/announcement.pdf",
    },
  ]);
  assert.deepEqual(requested, [
    "http://localhost:3002/api/v1/data/stock-news?symbol=002594.SZ&page_size=20",
    "http://localhost:3002/api/v1/data/market-news?limit=50",
    "http://localhost:3002/api/v1/data/announcements?symbol=002594.SZ&since_days=30&page_size=20",
  ]);
});

test("fundamental clients preserve source windows and snake_case contracts", async (t) => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const payloads = [
    [
      {
        symbol: "002594.SZ",
        as_of_date: "2026-11-21",
        fiscal_year: 2026,
        eps_min: 3.12,
        eps_mean: 3.46,
        eps_max: 3.88,
        analyst_count: 18,
        source: "ths",
        raw: {},
      },
    ],
    [
      {
        symbol: "002594.SZ",
        report_period: "2026-09-30",
        statement_type: "snapshot",
        source: "mootdx",
        metrics: { eps: 3.44 },
        raw: {},
      },
    ],
    [
      {
        symbol: "002594.SZ",
        report_period: "2026-09-30",
        statement_type: "income_statement",
        source: "sina",
        metrics: { 净利润: 9876 },
        raw: {},
      },
    ],
    [
      {
        symbol: "002594.SZ",
        trade_date: "2026-11-20",
        pe_ttm: 23.4,
        pb: 4.1,
        turnover_rate: 1.23,
        trade_status: "trading",
        is_st: false,
        source: "baostock",
        raw: {},
      },
    ],
  ];

  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return new Response(JSON.stringify(payloads.shift()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  await quant.analystConsensus("002594.SZ", "2026-11-21");
  await quant.financialSnapshot("002594.SZ");
  await quant.financialStatements("002594.SZ", 8);
  await quant.valuationHistory("002594.SZ", "2021-11-21", "2026-11-21");

  assert.deepEqual(requested, [
    "http://localhost:3002/api/v1/data/analyst-consensus?symbol=002594.SZ&as_of_date=2026-11-21",
    "http://localhost:3002/api/v1/data/financial-snapshot?symbol=002594.SZ",
    "http://localhost:3002/api/v1/data/financial-statements?symbol=002594.SZ&periods=8",
    "http://localhost:3002/api/v1/data/valuation-history?symbol=002594.SZ&start=2021-11-21&end=2026-11-21",
  ]);
});
