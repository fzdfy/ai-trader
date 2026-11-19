import assert from "node:assert/strict";
import test from "node:test";
import {
  QUALITY_RULES,
  getQualityRulesForAssets,
} from "./quality-rules.ts";

test("tier zero bar asset receives all quality dimensions", () => {
  const rules = getQualityRulesForAssets(["bar1d_raw"]);
  assert.deepEqual(
    new Set(rules.map((rule) => rule.dimension)),
    new Set([
      "freshness",
      "completeness",
      "uniqueness",
      "validity",
      "coverage",
      "consistency",
      "pit",
    ]),
  );
  assert.ok(rules.every((rule) => rule.version >= 1));
});

test("trigger filtering selects only affected rules", () => {
  const rules = getQualityRulesForAssets(["bar1d_raw"], "kline-1d");
  assert.ok(rules.length > 0);
  assert.ok(rules.every((rule) => rule.triggerJobTypes.includes("kline-1d")));
});

test("rule identifiers are unique and versions are immutable integers", () => {
  assert.equal(
    new Set(QUALITY_RULES.map((rule) => rule.id)).size,
    QUALITY_RULES.length,
  );
  assert.ok(
    QUALITY_RULES.every(
      (rule) => Number.isInteger(rule.version) && rule.version > 0,
    ),
  );
});

test("content quality rules are warning-only and cover links and documents", () => {
  const contentAssets = [
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
  for (const assetKey of contentAssets) {
    const rules = getQualityRulesForAssets([assetKey]);
    assert.ok(rules.length > 0, `${assetKey} has no quality rules`);
    assert.ok(rules.every((rule) => rule.severity === "warning"));
  }
  assert.ok(
    QUALITY_RULES.some((rule) => rule.checkKey === "coverage.symbol_links"),
  );
  assert.ok(
    QUALITY_RULES.some((rule) => rule.checkKey === "validity.research_documents"),
  );
});
