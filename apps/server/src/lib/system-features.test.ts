import assert from "node:assert/strict";
import test from "node:test";
import { getSystemFeatures } from "./system-features.ts";

test("dashboard market radar defaults off", () => {
  assert.deepEqual(getSystemFeatures({}), { dashboardMarketRadar: false });
});

test("dashboard market radar enables only with exact true", () => {
  assert.deepEqual(
    getSystemFeatures({ DASHBOARD_MARKET_RADAR_ENABLED: "true" }),
    { dashboardMarketRadar: true },
  );
  assert.deepEqual(
    getSystemFeatures({ DASHBOARD_MARKET_RADAR_ENABLED: "1" }),
    { dashboardMarketRadar: false },
  );
});
