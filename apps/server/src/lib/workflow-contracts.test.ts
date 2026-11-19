import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionRunStatus,
  validateWorkflowGraph,
  validateWorkflowSymbols,
  type WorkflowGraph,
} from "./workflow-contracts.ts";

function graph(overrides: Partial<WorkflowGraph> = {}): WorkflowGraph {
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
        position: { x: 200, y: 0 },
        config: { source: "watchlist" },
      },
      {
        id: "backtest",
        type: "backtest",
        position: { x: 400, y: 0 },
        config: {
          strategy: "ma_cross",
          startDate: "2026-01-01",
          endDate: "2026-06-30",
        },
      },
    ],
    edges: [
      { id: "e1", source: "trigger", target: "pool", kind: "control" },
      { id: "e2", source: "pool", target: "backtest", kind: "symbols" },
    ],
    ...overrides,
  };
}

test("valid DAG accepts one trigger and typed symbol flow", () => {
  assert.deepEqual(validateWorkflowGraph(graph()), []);
});

test("graph validation rejects cycles and unreachable action nodes", () => {
  const invalid = graph({
    nodes: [
      ...graph().nodes,
      {
        id: "review",
        type: "review",
        position: { x: 600, y: 0 },
        config: {},
      },
    ],
    edges: [...graph().edges, { id: "e3", source: "backtest", target: "pool", kind: "control" }],
  });

  const errors = validateWorkflowGraph(invalid);
  assert.ok(errors.some((error) => error.code === "cycle"));
  assert.ok(errors.some((error) => error.code === "unreachable"));
});

test("graph validation rejects illegal symbol connections", () => {
  const invalid = graph({
    edges: [
      { id: "e1", source: "trigger", target: "pool", kind: "control" },
      { id: "e2", source: "trigger", target: "backtest", kind: "symbols" },
    ],
  });

  assert.ok(validateWorkflowGraph(invalid).some((error) => error.code === "invalid_symbol_source"));
});

test("graph validation requires exactly one trigger", () => {
  const trigger = graph().nodes[0];
  if (!trigger || trigger.type !== "trigger") throw new Error("test trigger missing");
  assert.ok(
    validateWorkflowGraph(
      graph({
        nodes: [
          {
            ...trigger,
            config: { type: "schedule", time: "15:30" },
          },
          ...graph().nodes.slice(1),
        ],
      }),
    ).every((error) => error.code !== "trigger_count"),
  );

  assert.ok(
    validateWorkflowGraph(
      graph({
        nodes: graph().nodes.filter((node) => node.type !== "trigger"),
        edges: [],
      }),
    ).some((error) => error.code === "trigger_count"),
  );
});

test("workflow symbol limits reject more than fifty backtest targets", () => {
  const fifty = Array.from({ length: 50 }, (_, index) => `000001.SZ.${index}`);
  assert.deepEqual(validateWorkflowSymbols(fifty), []);
  assert.deepEqual(
    validateWorkflowSymbols([...fifty, "000002.SZ"]).map((item) => item.code),
    ["symbol_limit"],
  );
});

test("run status transitions reject execution after a terminal state", () => {
  assert.equal(canTransitionRunStatus("pending", "running"), true);
  assert.equal(canTransitionRunStatus("running", "success"), true);
  assert.equal(canTransitionRunStatus("running", "canceled"), true);
  assert.equal(canTransitionRunStatus("success", "running"), false);
  assert.equal(canTransitionRunStatus("canceled", "success"), false);
});
