import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeRunStatus,
  WorkflowRunStatus,
} from "../lib/workflow-contracts.ts";

export interface WorkflowNodeExecutionResult {
  output?: Record<string, unknown>;
  resultRef?: Record<string, unknown>;
}

export interface WorkflowNodeExecutionInput {
  node: WorkflowNode;
  context: {
    symbols: string[];
    tradeDate?: string;
  };
  signal: AbortSignal;
}

export interface WorkflowDagNodeResult {
  nodeId: string;
  nodeType: WorkflowNode["type"];
  status: WorkflowNodeRunStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  resultRef?: Record<string, unknown>;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
}

export interface WorkflowDagResult {
  status: Extract<WorkflowRunStatus, "success" | "failed" | "canceled">;
  nodes: Map<string, WorkflowDagNodeResult>;
  failedNodeId?: string;
}

interface ExecuteWorkflowDagOptions {
  signal?: AbortSignal;
  tradeDate?: string;
  nodeTimeoutMs?: number;
  shouldCancel?: () => Promise<boolean>;
  onNodeStart?: (result: WorkflowDagNodeResult) => Promise<void>;
  onNodeFinish?: (result: WorkflowDagNodeResult) => Promise<void>;
}

export type WorkflowNodeExecutor = (
  input: WorkflowNodeExecutionInput,
) => Promise<WorkflowNodeExecutionResult>;

function skippedResult(node: WorkflowNode, reason: string): WorkflowDagNodeResult {
  const now = new Date();
  return {
    nodeId: node.id,
    nodeType: node.type,
    status: "skipped",
    error: reason,
    finishedAt: now,
  };
}

function canceledResult(node: WorkflowNode): WorkflowDagNodeResult {
  const now = new Date();
  return {
    nodeId: node.id,
    nodeType: node.type,
    status: "canceled",
    error: "运行已取消",
    finishedAt: now,
  };
}

function upstreamSymbols(
  graph: WorkflowGraph,
  nodeId: string,
  results: Map<string, WorkflowDagNodeResult>,
): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.target !== nodeId || edge.kind !== "symbols") continue;
    const values = results.get(edge.source)?.output?.symbols;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value !== "string" || seen.has(value)) continue;
      seen.add(value);
      symbols.push(value);
    }
  }
  return symbols;
}

export async function executeWorkflowDag(
  graph: WorkflowGraph,
  executeNode: WorkflowNodeExecutor,
  options: ExecuteWorkflowDagOptions = {},
): Promise<WorkflowDagResult> {
  const parents = new Map<string, string[]>();
  const results = new Map<string, WorkflowDagNodeResult>();
  for (const node of graph.nodes) parents.set(node.id, []);
  for (const edge of graph.edges) {
    parents.get(edge.target)?.push(edge.source);
  }

  for (const node of graph.nodes) {
    if (node.type !== "trigger") continue;
    const result: WorkflowDagNodeResult = {
      nodeId: node.id,
      nodeType: node.type,
      status: "success",
      output: { trigger: node.config },
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
    };
    results.set(node.id, result);
    await options.onNodeFinish?.(result);
  }

  const configuredTimeout = Number(process.env.WORKFLOW_NODE_TIMEOUT_MS);
  const timeoutMs =
    options.nodeTimeoutMs ??
    (Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : 60 * 60 * 1000);

  for (;;) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of graph.nodes) {
        if (node.type === "trigger" || results.has(node.id)) continue;
        const blockedParent = parents
          .get(node.id)
          ?.map((id) => results.get(id))
          .find((result) => result && ["failed", "canceled", "skipped"].includes(result.status));
        if (!blockedParent) continue;
        results.set(node.id, skippedResult(node, `上游节点 ${blockedParent.nodeId} 未成功`));
        await options.onNodeFinish?.(results.get(node.id)!);
        changed = true;
      }
    }

    if (options.signal?.aborted || (await options.shouldCancel?.())) {
      for (const node of graph.nodes) {
        if (node.type === "trigger" || results.has(node.id)) continue;
        results.set(node.id, canceledResult(node));
        await options.onNodeFinish?.(results.get(node.id)!);
      }
      break;
    }

    const ready = graph.nodes.filter((node) => {
      if (node.type === "trigger" || results.has(node.id)) return false;
      return (parents.get(node.id) ?? []).every(
        (parentId) => results.get(parentId)?.status === "success",
      );
    });
    if (ready.length === 0) break;

    await Promise.all(
      ready.map(async (node) => {
        if (options.signal?.aborted) {
          results.set(node.id, canceledResult(node));
          await options.onNodeFinish?.(results.get(node.id)!);
          return;
        }

        const startedAt = new Date();
        const controller = new AbortController();
        let timedOut = false;
        const abortFromParent = () => controller.abort();
        options.signal?.addEventListener("abort", abortFromParent, {
          once: true,
        });
        const timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
        const symbols = upstreamSymbols(graph, node.id, results);
        const input = {
          node,
          context: { symbols, tradeDate: options.tradeDate },
          signal: controller.signal,
        };
        await options.onNodeStart?.({
          nodeId: node.id,
          nodeType: node.type,
          status: "running",
          input: { symbols },
          startedAt,
        });

        try {
          const output = await executeNode(input);
          const finishedAt = new Date();
          const result: WorkflowDagNodeResult = {
            nodeId: node.id,
            nodeType: node.type,
            status: "success",
            input: { symbols },
            output: output.output ?? {},
            resultRef: output.resultRef,
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
          };
          results.set(node.id, result);
          await options.onNodeFinish?.(result);
        } catch (error) {
          const finishedAt = new Date();
          const canceled = options.signal?.aborted && !timedOut;
          const result: WorkflowDagNodeResult = {
            nodeId: node.id,
            nodeType: node.type,
            status: canceled ? "canceled" : "failed",
            input: { symbols },
            error: timedOut
              ? `节点执行超时（${timeoutMs}ms）`
              : ((error as Error)?.message ?? String(error)),
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
          };
          results.set(node.id, result);
          await options.onNodeFinish?.(result);
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener("abort", abortFromParent);
        }
      }),
    );
  }

  const nodeResults = [...results.values()];
  const failed = nodeResults.find((result) => result.status === "failed");
  const canceled =
    options.signal?.aborted || nodeResults.some((result) => result.status === "canceled");
  return {
    status: canceled ? "canceled" : failed ? "failed" : "success",
    nodes: results,
    failedNodeId: failed?.nodeId,
  };
}
