import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetRotationSeries } from "./rotation-assets.ts";

test("reports an asset omitted from rotation when its history is empty", () => {
  const result = buildAssetRotationSeries([
    {
      symbol: "510300.SH",
      bars: [
        { sessionDate: "2026-11-20", close: 4.1 },
        { sessionDate: "2026-11-21", close: 4.2 },
      ],
    },
    { symbol: "IXIC", bars: [] },
  ]);

  assert.deepEqual(result.series.map((item) => item.code), ["510300.SH"]);
  assert.deepEqual(result.errors, [
    { section: "IXIC", message: "同期日线不足 2 个交易日" },
  ]);
});
