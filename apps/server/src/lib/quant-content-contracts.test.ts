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
