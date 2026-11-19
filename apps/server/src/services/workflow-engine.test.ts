import assert from "node:assert/strict";
import test from "node:test";
import { workflowGraphSchema, type WorkflowNode } from "../lib/workflow-contracts.ts";
import { executeWorkflowDag } from "./workflow-engine.ts";

function node(
  id: string,
  type: WorkflowNode["type"],
  config: WorkflowNode["config"],
): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config,
  } as WorkflowNode;
}

test("DAG waits for every parent and runs independent branches in parallel", async () => {
  const graph = workflowGraphSchema.parse({
    schemaVersion: 1,
    nodes: [
      node("trigger", "trigger", { type: "manual" }),
      node("pool", "stock_pool", { source: "watchlist" }),
      node("preview", "review", {}),
      node("backtest", "backtest", {
        strategy: "ma_cross",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      }),
      node("final", "review", {}),
    ],
    edges: [
      { id: "e1", source: "trigger", target: "pool", kind: "control" },
      { id: "e2", source: "trigger", target: "preview", kind: "control" },
      { id: "e3", source: "pool", target: "backtest", kind: "symbols" },
      { id: "e4", source: "preview", target: "backtest", kind: "control" },
      { id: "e5", source: "backtest", target: "final", kind: "control" },
    ],
  });

  const started: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const result = await executeWorkflowDag(graph, async ({ node: current, context }) => {
    started.push(current.id);
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 15));
    running -= 1;
    if (current.type === "stock_pool") {
      return { output: { symbols: ["600519.SH"] } };
    }
    if (current.type === "backtest") {
      assert.deepEqual(context.symbols, ["600519.SH"]);
      return { output: { total: 1 } };
    }
    return { output: { ok: true } };
  });

  assert.equal(result.status, "success", JSON.stringify([...result.nodes.values()], null, 2));
  assert.ok(maxRunning >= 2);
  assert.ok(started.indexOf("final") > started.indexOf("backtest"));
  assert.ok(started.indexOf("backtest") > started.indexOf("preview"));
});

test("a failed node prevents downstream nodes and keeps skipped nodes visible", async () => {
  const graph = workflowGraphSchema.parse({
    schemaVersion: 1,
    nodes: [
      node("trigger", "trigger", { type: "manual" }),
      node("pool", "stock_pool", { source: "watchlist" }),
      node("backtest", "backtest", {
        strategy: "ma_cross",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
      }),
      node("review", "review", {}),
    ],
    edges: [
      { id: "e1", source: "trigger", target: "pool", kind: "control" },
      { id: "e2", source: "pool", target: "backtest", kind: "symbols" },
      { id: "e3", source: "backtest", target: "review", kind: "control" },
    ],
  });

  const called: string[] = [];
  const result = await executeWorkflowDag(graph, async ({ node: current }) => {
    called.push(current.id);
    if (current.id === "pool") throw new Error("pool unavailable");
    return { output: {} };
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(called, ["pool"]);
  assert.equal(result.nodes.get("backtest")?.status, "skipped");
  assert.equal(result.nodes.get("review")?.status, "skipped");
});

test("cancellation prevents pending nodes from starting", async () => {
  const graph = workflowGraphSchema.parse({
    schemaVersion: 1,
    nodes: [
      node("trigger", "trigger", { type: "manual" }),
      node("pool", "stock_pool", { source: "watchlist" }),
    ],
    edges: [{ id: "e1", source: "trigger", target: "pool", kind: "control" }],
  });

  const controller = new AbortController();
  controller.abort();
  let called = false;
  const result = await executeWorkflowDag(
    graph,
    async () => {
      called = true;
      return { output: {} };
    },
    { signal: controller.signal },
  );

  assert.equal(called, false);
  assert.equal(result.status, "canceled");
  assert.equal(result.nodes.get("pool")?.status, "canceled");
});
