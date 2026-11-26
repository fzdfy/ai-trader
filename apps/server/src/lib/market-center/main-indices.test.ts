import assert from "node:assert/strict";
import test from "node:test";
import {
  createMainIndexQuoteSection,
  type MainIndexQuoteDependencies,
} from "./main-indices.ts";
import type { QuoteRead } from "../market-data-read.ts";
import type { StoredRotationIndexBar } from "../market-rotation/store.ts";

function quote(
  symbol: string,
  price: number,
  changePct: number,
): QuoteRead {
  return {
    quote: {
      symbol,
      name: symbol,
      last: price,
      volume: null,
      amount: null,
      change: null,
      changePct,
      pe: null,
      pb: null,
      turnoverRate: null,
      totalMarketCap: null,
      status: "trading",
    },
    asOf: "2026-11-24T07:00:00.000Z",
    source: "quant-live",
    quality: "available",
    fallback: false,
  };
}

function bars(symbol: string, close: number, tradeDate: string): StoredRotationIndexBar {
  return {
    symbol: symbol as StoredRotationIndexBar["symbol"],
    tradeDate,
    open: close,
    high: close,
    low: close,
    close,
    volume: null,
    amount: null,
    source: "csindex",
    observedAt: new Date("2026-11-24T08:00:00.000Z"),
  };
}

function dependencies(
  overrides: Partial<MainIndexQuoteDependencies> = {},
): MainIndexQuoteDependencies {
  return {
    now: () => new Date("2026-11-24T08:00:00.000Z"),
    readQuote: async (symbol) => quote(symbol, 100, 0.25),
    readBars: async () => [
      bars("930955.CSI", 11793.76, "2026-11-21"),
      bars("930955.CSI", 11718.24, "2026-11-24"),
    ],
    ...overrides,
  };
}

test("main index quotes keep fixed order and use official daily close for dividend index", async () => {
  const result = await createMainIndexQuoteSection(dependencies());

  assert.deepEqual(
    result.items.map((item) => item.code),
    [
      "000001.SH",
      "000300.SH",
      "000905.SH",
      "000852.SH",
      "399673.SZ",
      "000688.SH",
      "930955.CSI",
    ],
  );
  assert.equal(result.items[0]?.isBenchmark, true);
  assert.equal(result.items.filter((item) => item.isBenchmark).length, 1);
  const dividend = result.items.at(-1);
  assert.equal(dividend?.price, 11718.24);
  assert.equal(dividend?.changePct, -0.64);
  assert.equal(dividend?.source, "csindex");
  assert.equal(dividend?.asOf, "2026-11-24");
  assert.equal(result.status, "available");
});

test("one failed quote keeps its position with a real missing state", async () => {
  const result = await createMainIndexQuoteSection(
    dependencies({
      readQuote: async (symbol) => {
        if (symbol === "000300.SH") throw new Error("timeout");
        return quote(symbol, 100, 0.25);
      },
    }),
  );

  const missing = result.items.find((item) => item.code === "000300.SH");
  assert.equal(result.items.length, 7);
  assert.equal(missing?.name, "沪深300");
  assert.equal(missing?.price, null);
  assert.equal(missing?.quality, "missing");
  assert.equal(result.status, "low");
  assert.equal(result.errors[0]?.section, "000300.SH");
});

test("dividend index without two official closes is not turned into a zero quote", async () => {
  const result = await createMainIndexQuoteSection(
    dependencies({
      readBars: async () => [bars("930955.CSI", 11718.24, "2026-11-24")],
    }),
  );

  const dividend = result.items.at(-1);
  assert.equal(dividend?.price, 11718.24);
  assert.equal(dividend?.changePct, null);
  assert.equal(dividend?.quality, "low");
});
