import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";

import { createTechnicalSignalsRoute } from "./technical-signals.ts";
import type { StoredTechnicalSignalSnapshot } from "../lib/technical-signals/store.ts";

const snapshot: StoredTechnicalSignalSnapshot = {
  objectType: "stock",
  objectSubtype: null,
  objectCode: "600519.SH",
  asOf: "2026-11-25",
  catalogVersion: "technical-signals-1.0.0",
  computedAt: new Date("2026-11-26T08:00:00.000Z"),
  definitionHash: "a".repeat(64),
  inputHash: "b".repeat(64),
  quality: "available",
  dataSources: ["bar1d_hfq"],
  signals: [
    {
      signalId: "basic.stock.rsi_state",
      displayName: "RSI 超买超卖与背离",
      rule: "RSI(14)",
      params: { period: 14 },
      confirmation: "RSI 离开极端区",
      invalidation: "RSI 重新进入反向极端区",
      dataRequirements: [
        {
          dataset: "daily_ohlcv",
          fields: ["close"],
          minHistory: 30,
          required: true,
          source: "fixture",
        },
      ],
      scope: "stock",
      objectType: "stock",
      objectSubtype: null,
      objectCode: "600519.SH",
      status: "neutral",
      direction: "neutral",
      value: 55,
      unit: "index",
      quality: "available",
      proxy: false,
      sampleCount: 320,
      asOf: "2026-11-25",
      computedAt: "2026-11-26T08:00:00.000Z",
      dataSources: ["bar1d_hfq"],
      evidence: { components: [], notes: [], missingFields: [] },
      catalogVersion: "technical-signals-1.0.0",
      definitionHash: "c".repeat(64),
    },
  ],
  summary: { triggered: 0 },
};

const app = new Hono();
app.route(
  "/",
  createTechnicalSignalsRoute(
    async (identity, options) => {
      if (
        identity.objectType === "stock" &&
        identity.objectCode === "600519.SH" &&
        (!options.asOf || options.asOf === "2026-11-25")
      ) {
        return snapshot;
      }
      return null;
    },
    async (symbols) =>
      symbols.map((symbol) => ({
        symbol,
        asOf: "2026-11-25",
        catalogVersion: "technical-signals-1.0.0",
        quality: "available" as const,
        counts: {
          triggered: 1,
          neutral: 2,
          invalidated: 0,
          "low-confidence": 0,
          unavailable: 0,
          "not-applicable": 0,
        },
        keySignals: ["pattern.stock.platform_breakout"],
      })),
    async (codes, subtype) =>
      codes.map((symbol) => ({
        symbol,
        asOf: "2026-11-25",
        catalogVersion: "technical-signals-1.0.0",
        quality: "available" as const,
        counts: {
          triggered: subtype === "industry" ? 1 : 0,
          neutral: 1,
          invalidated: 0,
          "low-confidence": 0,
          unavailable: 0,
          "not-applicable": 0,
        },
        keySignals: [],
      })),
  ),
);

test("catalog endpoint filters scope and layer", async () => {
  const response = await app.request("/catalog?scope=stock&layer=basic");
  const body = (await response.json()) as {
    data: { catalogVersion: string; signals: Array<{ signalId: string }> };
  };
  assert.equal(response.status, 200);
  assert.equal(body.data.catalogVersion, "technical-signals-1.0.0");
  assert.equal(body.data.signals.length, 10);
  assert.ok(body.data.signals.every((signal) => signal.signalId.startsWith("basic.stock.")));
});

test("sector detail requires a valid subtype", async () => {
  assert.equal((await app.request("/sector/BK0475")).status, 400);
  assert.equal((await app.request("/sector/BK0475?subtype=invalid")).status, 400);
});

test("detail rejects unknown scopes and missing snapshots", async () => {
  assert.equal((await app.request("/invalid/CODE")).status, 400);
  const response = await app.request("/stock/000001.SZ?asOf=2026-11-25");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
});

test("object codes use strict scope-specific allowlists", async () => {
  assert.equal((await app.request("/market/000300.SH")).status, 400);
  assert.equal((await app.request("/gold/BTCUSD")).status, 400);
  assert.equal((await app.request("/stock/not-a-stock")).status, 400);
  assert.equal((await app.request("/sector/NOT_A_BOARD?subtype=industry")).status, 400);
});

test("detail returns the stored snapshot and single signal", async () => {
  const detail = await app.request("/stock/600519.SH?asOf=2026-11-25");
  assert.equal(detail.status, 200);
  const detailBody = (await detail.json()) as {
    data: StoredTechnicalSignalSnapshot;
  };
  assert.equal(detailBody.data.catalogVersion, "technical-signals-1.0.0");
  assert.equal(detailBody.data.signals.length, 1);

  const signal = await app.request("/stock/600519.SH/basic.stock.rsi_state?asOf=2026-11-25");
  assert.equal(signal.status, 200);
  const signalBody = (await signal.json()) as {
    data: { signalId: string; value: number };
  };
  assert.equal(signalBody.data.signalId, "basic.stock.rsi_state");
  assert.equal(signalBody.data.value, 55);
});

test("single signal validates the catalog allowlist", async () => {
  const response = await app.request("/stock/600519.SH/basic.stock.not_a_signal?asOf=2026-11-25");
  assert.equal(response.status, 400);
});

test("stock batch summary is limited to ten current-page symbols", async () => {
  const response = await app.request("/stocks?symbols=600519.SH,000001.SZ");
  const body = (await response.json()) as {
    data: Array<{ symbol: string; keySignals: string[]; signals?: unknown }>;
  };
  assert.equal(response.status, 200);
  assert.deepEqual(
    body.data.map((item) => item.symbol),
    ["600519.SH", "000001.SZ"],
  );
  assert.ok(body.data.every((item) => item.signals === undefined));

  const tooMany = Array.from(
    { length: 11 },
    (_, index) => `${String(index).padStart(6, "0")}.SZ`,
  ).join(",");
  assert.equal((await app.request(`/stocks?symbols=${tooMany}`)).status, 400);
});

test("board batch summary requires subtype and returns current-page rows only", async () => {
  assert.equal((await app.request("/boards?codes=BK0475")).status, 400);
  const response = await app.request("/boards?subtype=industry&codes=BK0475,BK1027");
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: Array<{ symbol: string; counts: { triggered: number } }>;
  };
  assert.deepEqual(
    body.data.map((item) => item.symbol),
    ["BK0475", "BK1027"],
  );
  assert.equal(body.data[0]?.counts.triggered, 1);
});
