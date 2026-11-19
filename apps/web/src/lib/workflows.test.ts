import assert from "node:assert/strict";
import test from "node:test";
import {
  validateWorkflowGraph,
  wouldCreateWorkflowCycle,
  type WorkflowGraph,
} from "./workflows.ts";

function graph(): WorkflowGraph {
  return {
    schemaVersion: 1,
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 0, y: 0 },
        config: { type: "manual" },
      },
      {
        id: "pool",
        type: "stock_pool",
        position: { x: 240, y: 0 },
        config: { source: "watchlist" },
      },
      {
        id: "backtest",
        type: "backtest",
        position: { x: 480, y: 0 },
        config: {
          strategy: "ma_cross",
          startDate: "2025-01-01",
          endDate: "2025-12-31",
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "pool", kind: "control" },
      { id: "e2", source: "pool", target: "backtest", kind: "symbols" },
    ],
  };
}

test("valid workflow graph has no issues", () => {
  assert.deepEqual(validateWorkflowGraph(graph()), []);
});

test("graph validation identifies unreachable and malformed symbol edges", () => {
  const value = graph();
  value.nodes.push({
    id: "review",
    type: "review",
    position: { x: 0, y: 200 },
    config: {},
  });
  value.nodes.push({
    id: "orphan",
    type: "review",
    position: { x: 0, y: 400 },
    config: {},
  });
  value.edges.push({
    id: "e3",
    source: "backtest",
    target: "review",
    kind: "symbols",
  });
  const issues = validateWorkflowGraph(value);
  assert.ok(issues.some((issue) => issue.code === "unreachable"));
  assert.ok(issues.some((issue) => issue.code === "invalid_symbol_source"));
});

test("cycle helper detects an edge that closes a loop", () => {
  assert.equal(wouldCreateWorkflowCycle(graph(), "backtest", "pool"), true);
  assert.equal(wouldCreateWorkflowCycle(graph(), "trigger", "backtest"), false);
});
