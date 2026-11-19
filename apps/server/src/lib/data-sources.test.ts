import assert from "node:assert/strict";
import test from "node:test";
import { getSourceProviderName } from "./data-sources.ts";

test("maps only explicitly known source platforms to provider health", () => {
  assert.equal(getSourceProviderName("东方财富"), "eastmoney");
  assert.equal(getSourceProviderName("腾讯"), "tencent");
  assert.equal(getSourceProviderName("多源聚合（stock-sdk）"), null);
  assert.equal(getSourceProviderName("本地派生"), null);
});
