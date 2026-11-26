import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { createMarketCenterRoute } from "./market-center.ts";

const overview = {
  generatedAt: "2026-11-24T08:00:00.000Z",
  asOf: {
    quotes: null,
    boards: null,
    fundFlow: null,
    limitUp: null,
    growthDefense: null,
    mainIndices: null,
  },
  quotes: [],
  breadth: {
    status: "missing" as const,
    industry: { total: 0, rising: 0, falling: 0, flat: 0 },
    concept: { total: 0, rising: 0, falling: 0, flat: 0 },
    asOf: null,
  },
  limitUp: {
    status: "missing" as const,
    total: 0,
    maxBoard: 0,
    maxSealAmount: 0,
    avgTurnover: 0,
    openedCount: 0,
    ladder: [],
    leaders: [],
    asOf: null,
  },
  anomalies: {
    status: "missing" as const,
    items: [],
    asOf: null,
  },
  growthDefense: {
    scope: "growth-defense" as const,
    window: "20D" as const,
    asOf: null,
    status: "missing" as const,
    rows: [],
    growthDefense: null,
    benchmark: null,
    validStyleCount: 0,
    errors: [],
  },
  mainIndices: {
    status: "missing" as const,
    asOf: null,
    items: [],
    errors: [],
  },
  errors: [],
};
const rotation = {
  scope: "industry" as const,
  window: "20D" as const,
  asOf: null,
  status: "missing" as const,
  rows: [],
  growthDefense: null,
  benchmark: null,
  validStyleCount: 0,
  errors: [],
};

test("market center validates scope and window", async () => {
  const app = new Hono();
  app.route("/", createMarketCenterRoute(async () => overview, async () => rotation));
  assert.equal((await app.request("/rotation?scope=industry&window=20D")).status, 200);
  assert.equal((await app.request("/rotation?scope=main-benchmark&window=20D")).status, 200);
  assert.equal((await app.request("/rotation?scope=sector")).status, 400);
  assert.equal((await app.request("/rotation?scope=industry&window=2Y")).status, 400);
});

test("market center forwards the main benchmark scope without changing existing asset scope", async () => {
  const calls: Array<[string, string]> = [];
  const app = new Hono();
  app.route(
    "/",
    createMarketCenterRoute(
      async () => overview,
      async (scope, window) => {
        calls.push([scope, window]);
        return { ...rotation, scope, window };
      },
    ),
  );

  assert.equal(
    (await app.request("/rotation?scope=main-benchmark&window=60D")).status,
    200,
  );
  assert.equal((await app.request("/rotation?scope=asset&window=20D")).status, 200);
  assert.deepEqual(calls, [
    ["main-benchmark", "60D"],
    ["asset", "20D"],
  ]);
});

test("market center overview returns the fixed main index section", async () => {
  const app = new Hono();
  app.route("/", createMarketCenterRoute(async () => overview, async () => rotation));

  const response = await app.request("/overview");
  const body = await response.json() as {
    data: { mainIndices: { status: string; items: unknown[] } };
  };

  assert.equal(response.status, 200);
  assert.equal(body.data.mainIndices.status, "missing");
  assert.deepEqual(body.data.mainIndices.items, []);
});

test("disabled market center never loads data", async () => {
  let calls = 0;
  const app = new Hono();
  app.route(
    "/",
    createMarketCenterRoute(
      async () => {
        calls += 1;
        return overview;
      },
      async () => rotation,
      () => false,
    ),
  );
  assert.equal((await app.request("/overview")).status, 404);
  assert.equal(calls, 0);
});
