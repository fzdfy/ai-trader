import assert from "node:assert/strict";
import test from "node:test";
import { getSystemFeatures } from "./system-features.ts";

test("dashboard market radar and market center default off", () => {
  assert.deepEqual(getSystemFeatures({}), {
    dashboardMarketRadar: false,
    marketCenter: false,
  });
});

test("dashboard market radar enables only with exact true", () => {
  assert.deepEqual(
    getSystemFeatures({ DASHBOARD_MARKET_RADAR_ENABLED: "true" }),
    { dashboardMarketRadar: true, marketCenter: false },
  );
  assert.deepEqual(
    getSystemFeatures({ DASHBOARD_MARKET_RADAR_ENABLED: "1" }),
    { dashboardMarketRadar: false, marketCenter: false },
  );
});

test("market center enables only with exact true", () => {
  assert.equal(
    getSystemFeatures({ MARKET_CENTER_ENABLED: "true" }).marketCenter,
    true,
  );
  assert.equal(
    getSystemFeatures({ MARKET_CENTER_ENABLED: "1" }).marketCenter,
    false,
  );
});
