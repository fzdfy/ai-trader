import assert from "node:assert/strict";
import test from "node:test";

import {
  RESEARCH_CHUNK_VERSION,
  RESEARCH_EMBEDDING_MODEL,
  RESEARCH_EXTRACTOR_VERSION,
  researchIndexJobOptions,
} from "./research-index-contracts.ts";

test("research index jobs preserve dedupe and retry contracts", () => {
  assert.deepEqual(
    researchIndexJobOptions({
      kind: "metadata",
      symbol: "002594.SZ",
      trigger: "analysis",
    }),
    {
      singletonKey: "research-metadata:002594.SZ",
      singletonSeconds: 86_400,
      priority: 10,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
    },
  );
  assert.deepEqual(
    researchIndexJobOptions({
      kind: "report",
      reportId: 42,
      symbol: "002594.SZ",
      trigger: "analysis",
    }),
    {
      singletonKey:
        `research-index:42:${RESEARCH_EXTRACTOR_VERSION}:${RESEARCH_CHUNK_VERSION}:${RESEARCH_EMBEDDING_MODEL}`,
      singletonSeconds: 600,
      priority: 10,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
    },
  );
});
