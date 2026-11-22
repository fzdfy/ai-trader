import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createDashboardMarketBriefRoute } from "./dashboard-market-brief.ts";
import type { MarketBriefResponse } from "../lib/dashboard/market-brief.ts";

const response = {
  asOf: null,
  aShareSession: {
    phase: "closed",
    label: "休市",
    tradeDate: null,
    nextEventLabel: null,
    nextEventAt: null,
  },
  tickers: [],
  aShareChart: {},
  etfChart: {},
  globalChart: {},
  signal: {},
} as unknown as MarketBriefResponse;

test("market brief route passes validated independent parameters", async () => {
  let seen: unknown;
  const app = new Hono();
  app.route(
    "/",
    createDashboardMarketBriefRoute(async (params) => {
      seen = params;
      return response;
    }),
  );
  const result = await app.request(
    "/?symbol=399006.SZ&range=1M&etfSymbol=159992.SZ&etfRange=YTD&globalSymbol=IXIC&globalRange=5D",
  );
  assert.equal(result.status, 200);
  assert.deepEqual(seen, {
    symbol: "399006.SZ",
    range: "1M",
    etfSymbol: "159992.SZ",
    etfRange: "YTD",
    globalSymbol: "IXIC",
    globalRange: "5D",
  });
});

test("market brief route rejects unknown symbols and ranges", async () => {
  const app = new Hono();
  app.route("/", createDashboardMarketBriefRoute(async () => response));
  assert.equal((await app.request("/?symbol=SPX")).status, 400);
  assert.equal((await app.request("/?range=2Y")).status, 400);
  assert.equal((await app.request("/?etfSymbol=000001.SH")).status, 400);
});
