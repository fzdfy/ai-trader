import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateResearchEvidence,
  type ResearchGoldenCase,
} from "./research-evidence-evaluation.ts";

const fixture: ResearchGoldenCase = {
  id: "byd-overseas",
  symbol: "002594.SZ",
  query: "海外本地化",
  expectedSourceIds: ["AP202611021831322093"],
};

function item(sourceId: string, publishDate = "2026-11-01") {
  return {
    reportId: 1,
    sourceId,
    title: "单车盈利企稳，海外本地化贡献利润弹性",
    institution: "测试证券",
    publishDate,
    pdfUrl: "https://example.com/report.pdf",
    pageFrom: 2,
    pageTo: 3,
    sectionTitle: "海外",
    excerpt: "海外本地化贡献利润弹性。",
    similarity: 0.82,
  };
}

test("golden case passes when expected evidence and citations are present", async () => {
  const result = await evaluateResearchEvidence([fixture], async () => ({
    mode: "semantic",
    model: "test-model",
    items: [item("AP202611021831322093")],
  }));

  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.results[0]?.failures, []);
});

test("golden case fails when the expected source is missing", async () => {
  const result = await evaluateResearchEvidence([fixture], async () => ({
    mode: "semantic",
    model: "test-model",
    items: [item("AP-other")],
  }));

  assert.equal(result.failed, 1);
  assert.match(result.results[0]?.failures.join(";") ?? "", /missing expected source/);
});

test("golden case fails when a forbidden source leaks across symbols", async () => {
  const result = await evaluateResearchEvidence(
    [{ ...fixture, forbiddenSourceIds: ["AP600519"] }],
    async () => ({
      mode: "keyword",
      model: null,
      items: [item("AP202611021831322093"), item("AP600519")],
    }),
  );

  assert.equal(result.failed, 1);
  assert.match(result.results[0]?.failures.join(";") ?? "", /forbidden source/);
});

test("golden case rejects evidence newer than asOf", async () => {
  const result = await evaluateResearchEvidence([{ ...fixture, asOf: "2026-10-31" }], async () => ({
    mode: "keyword",
    model: null,
    items: [item("AP202611021831322093", "2026-11-01")],
  }));

  assert.equal(result.failed, 1);
  assert.match(result.results[0]?.failures.join(";") ?? "", /after asOf/);
});

test("golden case can require keyword fallback and valid citations", async () => {
  const result = await evaluateResearchEvidence(
    [{ ...fixture, expectedMode: "keyword" }],
    async () => ({
      mode: "keyword",
      model: null,
      items: [item("AP202611021831322093")],
    }),
  );

  assert.equal(result.passed, 1);

  const invalid = await evaluateResearchEvidence([fixture], async () => ({
    mode: "keyword",
    model: null,
    items: [{ ...item("AP202611021831322093"), title: "" }],
  }));
  assert.equal(invalid.failed, 1);
  assert.match(invalid.results[0]?.failures.join(";") ?? "", /invalid citation/);
});
