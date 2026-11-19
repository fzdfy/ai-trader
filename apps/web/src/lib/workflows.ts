export type WorkflowNodeType =
  | "trigger"
  | "stock_pool"
  | "screen"
  | "backtest"
  | "review"
  | "factor_iterate";

export type WorkflowEdgeKind = "control" | "symbols";

export interface WorkflowCanvasNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  measured?: { width?: number; height?: number };
}

export interface WorkflowCanvasEdge {
  id: string;
  source: string;
  target: string;
  kind: WorkflowEdgeKind;
}

export interface WorkflowGraph {
  schemaVersion: 1;
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
}

export interface WorkflowRunRecord {
  id: number;
  workflowId: number;
  versionId: number;
  userId: string;
  status: string;
  triggerType: string;
  triggerRef: string | null;
  currentNodeId: string | null;
  contextJson: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  cancelRequestedAt: string | null;
}

export interface WorkflowRunSummary {
  id: number;
  workflowId: number;
  workflowName: string;
  status: string;
  triggerType: string;
  currentNodeId: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  cancelRequestedAt: string | null;
}

export interface WorkflowVersion {
  id: number;
  workflowId: number;
  version: number;
  graphJson: WorkflowGraph;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowRecord {
  id: number;
  userId: string;
  name: string;
  description: string;
  draftGraph: WorkflowGraph;
  currentVersion: number | null;
  enabled: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSummary extends WorkflowRecord {
  latestRun: WorkflowRunSummary | null;
  currentTrigger: {
    workflowId: number;
    version: number;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
  } | null;
}

export interface WorkflowDetail extends WorkflowRecord {
  publishedVersion: WorkflowVersion | null;
  currentTrigger: {
    workflowId: number;
    version: number;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
  } | null;
}

export interface WorkflowNodeRun {
  id: number;
  workflowRunId: number;
  nodeId: string;
  nodeType: WorkflowNodeType;
  status: string;
  inputSummary: unknown;
  outputSummary: unknown;
  resultRef: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface WorkflowRunDetail {
  run: WorkflowRunRecord;
  workflowName: string;
  workflowDescription: string;
  version: number;
  graph: WorkflowGraph;
  nodes: WorkflowNodeRun[];
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export const WORKFLOW_NODE_META: Record<
  WorkflowNodeType,
  {
    label: string;
    shortLabel: string;
    description: string;
    accentClass: string;
  }
> = {
  trigger: {
    label: "触发器",
    shortLabel: "触发",
    description: "手动、定时或同步完成后启动",
    accentClass: "bg-app-warning",
  },
  stock_pool: {
    label: "股票池",
    shortLabel: "股票池",
    description: "从自选、落库池或手动代码产出标的",
    accentClass: "bg-primary",
  },
  screen: {
    label: "策略选股",
    shortLabel: "选股",
    description: "按策略因子打分并输出候选标的",
    accentClass: "bg-app-success",
  },
  backtest: {
    label: "批量回测",
    shortLabel: "回测",
    description: "对传入标的逐只回测并汇总",
    accentClass: "bg-chart-down",
  },
  review: {
    label: "生成复盘",
    shortLabel: "复盘",
    description: "生成当前交易日复盘与摘要",
    accentClass: "bg-chart-up",
  },
  factor_iterate: {
    label: "AI 因子迭代",
    shortLabel: "因子迭代",
    description: "生成、校验和评价候选因子",
    accentClass: "bg-app-ink-secondary",
  },
};

export const WORKFLOW_STATUS_META: Record<
  string,
  { label: string; className: string; dotClassName: string }
> = {
  pending: {
    label: "等待中",
    className: "bg-app-surface text-app-muted",
    dotClassName: "bg-app-line-strong",
  },
  running: {
    label: "运行中",
    className: "bg-primary/10 text-primary",
    dotClassName: "animate-pulse bg-primary",
  },
  success: {
    label: "已完成",
    className: "bg-app-success-soft text-app-success",
    dotClassName: "bg-app-success",
  },
  failed: {
    label: "异常",
    className: "bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  canceled: {
    label: "已取消",
    className: "bg-app-surface text-app-muted",
    dotClassName: "bg-app-muted",
  },
  skipped: {
    label: "已跳过",
    className: "bg-app-warning-soft text-app-ink",
    dotClassName: "bg-app-warning",
  },
};

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const nodes = new Map<string, WorkflowCanvasNode>();
  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  const outgoing = new Map<string, string[]>();
  const symbolInputs = new Map<string, number>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        code: "duplicate_node",
        message: `节点 ID 重复：${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
    nodes.set(node.id, node);
  }
  if (triggers.length !== 1) {
    issues.push({
      code: "trigger_count",
      message: "工作流必须且只能有一个触发器",
    });
  }

  for (const edge of graph.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      issues.push({
        code: "missing_endpoint",
        message: "连线引用了不存在的节点",
        edgeId: edge.id,
      });
      continue;
    }
    if (edge.kind === "symbols") {
      if (!["stock_pool", "screen"].includes(source.type)) {
        issues.push({
          code: "invalid_symbol_source",
          message: `${WORKFLOW_NODE_META[source.type].label}不能输出标的列表`,
          nodeId: source.id,
          edgeId: edge.id,
        });
      }
      if (target.type !== "backtest") {
        issues.push({
          code: "invalid_symbol_target",
          message: "标的连线只能连接到回测节点",
          nodeId: target.id,
          edgeId: edge.id,
        });
      }
      symbolInputs.set(target.id, (symbolInputs.get(target.id) ?? 0) + 1);
    }
    if (target.type === "trigger") {
      issues.push({
        code: "trigger_incoming",
        message: "触发器不能有入边",
        nodeId: target.id,
        edgeId: edge.id,
      });
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  for (const [nodeId, count] of symbolInputs) {
    if (count > 1) {
      issues.push({
        code: "multiple_symbol_inputs",
        message: "回测节点最多接收一个标的来源",
        nodeId,
      });
    }
  }

  const trigger = triggers[0];
  if (trigger) {
    const visited = new Set<string>();
    const stack = [trigger.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      stack.push(...(outgoing.get(id) ?? []));
    }
    for (const node of graph.nodes) {
      if (node.type !== "trigger" && !visited.has(node.id)) {
        issues.push({
          code: "unreachable",
          message: `${WORKFLOW_NODE_META[node.type].label}节点无法从触发器到达`,
          nodeId: node.id,
        });
      }
    }

    const visiting = new Set<string>();
    const checked = new Set<string>();
    const hasCycle = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (checked.has(id)) return false;
      visiting.add(id);
      for (const next of outgoing.get(id) ?? []) {
        if (hasCycle(next)) return true;
      }
      visiting.delete(id);
      checked.add(id);
      return false;
    };
    if (hasCycle(trigger.id)) {
      issues.push({ code: "cycle", message: "工作流不能包含循环" });
    }
  }
  return issues;
}

export function wouldCreateWorkflowCycle(
  graph: WorkflowGraph,
  source: string,
  target: string,
): boolean {
  const stack = [target];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || visited.has(id)) continue;
    if (id === source) return true;
    visited.add(id);
    for (const edge of graph.edges) {
      if (edge.source === id) stack.push(edge.target);
    }
  }
  return false;
}

export interface WorkflowApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function workflowRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as WorkflowApiResponse<T>;
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error ?? "请求失败，请稍后重试");
  }
  return payload.data;
}
