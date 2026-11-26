import assert from "node:assert/strict";
import test from "node:test";
import { runRotationIndexDailyJob } from "./rotation-indices.ts";

test("rotation sync stores available source and keeps partial failure visible", async () => {
  let stored = 0;
  const result = await runRotationIndexDailyJob({
    now: () => new Date("2026-11-24T08:10:00.000Z"),
    fetchDaily: async () => ({
      bars: [
        {
          symbol: "930955.CSI",
          trade_date: "2026-11-24",
          open: 1,
          high: 2,
          low: 1,
          close: 2,
          volume: null,
          amount: null,
          source: "csindex",
        },
      ],
      errors: [{ symbol: "399673.SZ", error: "timeout" }],
    }),
    upsert: async (values) => {
      stored = values.length;
      return values.length;
    },
  });
  assert.equal(stored, 1);
  assert.deepEqual(result.failed.map((item) => item.symbol), ["399673.SZ"]);
});

test("main index sync preserves successful symbols when one source fails", async () => {
  let storedSymbols: string[] = [];
  const result = await runRotationIndexDailyJob({
    now: () => new Date("2026-11-24T08:10:00.000Z"),
    fetchDaily: async () => ({
      bars: [
        {
          symbol: "000300.SH",
          trade_date: "2026-11-24",
          open: 1,
          high: 2,
          low: 1,
          close: 2,
          volume: null,
          amount: null,
          source: "tencent",
        },
      ],
      errors: [{ symbol: "930955.CSI", error: "timeout" }],
    }),
    upsert: async (values) => {
      storedSymbols = values.map((value) => value.symbol);
      return values.length;
    },
  });
  assert.deepEqual(storedSymbols, ["000300.SH"]);
  assert.deepEqual(result.failed.map((item) => item.symbol), ["930955.CSI"]);
});
