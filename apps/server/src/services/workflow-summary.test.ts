import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWorkflowJson } from "./workflow-summary.ts";

test("small workflow output is stored unchanged", () => {
  assert.deepEqual(summarizeWorkflowJson({ symbols: ["600519.SH"] }), {
    symbols: ["600519.SH"],
  });
});

test("large workflow output keeps a bounded preview", () => {
  const result = summarizeWorkflowJson(
    { rows: Array.from({ length: 100 }, (_, index) => `row-${index}`) },
    80,
  ) as { truncated: boolean; preview: string; originalBytes: number };

  assert.equal(result.truncated, true);
  assert.ok(result.preview.length <= 40);
  assert.ok(result.originalBytes > 80);
});
