import { readFile } from "node:fs/promises";

import { db } from "../src/db";
import {
  evaluateResearchEvidence,
  type ResearchGoldenCase,
} from "../src/services/research-evidence-evaluation";
import {
  RESEARCH_RETRIEVAL_VERSION,
  searchResearchEvidence,
} from "../src/services/research-evidence-service";

const fixturePath = new URL(
  "../src/agent/mastra/fixtures/research-rag-golden-set.json",
  import.meta.url,
);
const fixtures = JSON.parse(await readFile(fixturePath, "utf8")) as ResearchGoldenCase[];
const evaluation = await evaluateResearchEvidence(fixtures, searchResearchEvidence);
const expected = fixtures.reduce((sum, fixture) => sum + fixture.expectedSourceIds.length, 0);
const recalled = fixtures.reduce((sum, fixture) => {
  const result = evaluation.results.find((item) => item.id === fixture.id);
  const returned = new Set(result?.returnedSourceIds ?? []);
  return sum + fixture.expectedSourceIds.filter((sourceId) => returned.has(sourceId)).length;
}, 0);
const modes = evaluation.results.reduce<Record<string, number>>((counts, result) => {
  const mode = result.mode ?? "none";
  counts[mode] = (counts[mode] ?? 0) + 1;
  return counts;
}, {});

console.log(
  JSON.stringify(
    {
      cases: fixtures.length,
      retrievalVersion: RESEARCH_RETRIEVAL_VERSION,
      passed: evaluation.passed,
      failed: evaluation.failed,
      recall: expected === 0 ? 0 : recalled / expected,
      modes,
      failures: evaluation.results.filter((result) => !result.passed),
    },
    null,
    2,
  ),
);

if (process.argv.includes("--enforce") && evaluation.failed > 0) {
  process.exitCode = 1;
}
await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
