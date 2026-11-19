import assert from "node:assert/strict";
import test from "node:test";
import { DATA_CENTER_TABLES } from "../../api/data-center.ts";
import {
  GOVERNANCE_ASSETS,
  getGovernanceAsset,
} from "./registry.ts";
import { generatedCatalog } from "./generate-docs.ts";
import { validateGovernanceRegistry } from "./validation.ts";

test("governance registry is valid and unique", () => {
  assert.deepEqual(validateGovernanceRegistry(GOVERNANCE_ASSETS), []);
  assert.equal(
    new Set(GOVERNANCE_ASSETS.map((asset) => asset.key)).size,
    GOVERNANCE_ASSETS.length,
  );
});

test("governance registry covers every deployed data-center table", () => {
  for (const definition of DATA_CENTER_TABLES) {
    assert.ok(
      getGovernanceAsset(definition.table),
      `missing governance asset for ${definition.table}`,
    );
  }
});

test("generated catalog is deterministic and exposes tier zero lineage", () => {
  const first = generatedCatalog();
  assert.equal(first, generatedCatalog());
  assert.match(first, /bar1d_raw/);
  assert.match(first, /tier_0/);
  assert.match(first, /a-stock-data/);
  assert.match(first, /Data Steward/);
});

test("content tables expose sources, jobs, and stable business keys", () => {
  const contentTables = [
    "news_article",
    "news_article_symbol",
    "news_embedding",
    "news_event",
    "news_event_symbol",
    "research_report",
    "research_report_document",
    "research_report_chunk",
    "research_report_forecast",
    "company_announcement",
  ];
  for (const tableName of contentTables) {
    const definition = DATA_CENTER_TABLES.find(
      (candidate) => candidate.table === tableName,
    );
    assert.ok(definition, `${tableName} missing from data center`);
    const governed = getGovernanceAsset(tableName);
    assert.ok(governed, `${tableName} missing governance contract`);
    assert.ok(governed.contract.primaryKey.length > 0);
  }

  assert.deepEqual(
    DATA_CENTER_TABLES.find((item) => item.table === "news_article")
      ?.fallback.chain,
    ["eastmoney", "sina"],
  );
  assert.deepEqual(
    DATA_CENTER_TABLES.find((item) => item.table === "company_announcement")
      ?.fallback.chain,
    ["cninfo", "eastmoney"],
  );
});
