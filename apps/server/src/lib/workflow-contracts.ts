import { z } from "zod";

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const triggerConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("manual") }),
  z.object({
    type: z.literal("schedule"),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  }),
  z.object({
    type: z.literal("sync_complete"),
    jobType: z.string().min(1),
  }),
]);

const stockPoolConfigSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("watchlist") }),
  z.object({ source: z.literal("stock_pool") }),
  z.object({
    source: z.literal("manual"),
    symbols: z.array(z.string().min(1)).min(1).max(50),
  }),
]);

const screenConfigSchema = z.object({
  strategyId: z.number().int().positive(),
  topN: z.number().int().positive().max(500).default(50),
  scope: z
    .enum(["all", "industry", "concept", "resultSet", "gain3", "amount1b", "limitUp1"])
    .default("all"),
  boardCodes: z.array(z.string()).optional(),
  excludes: z.array(z.enum(["smallCap", "loss", "st", "star", "chinext"])).optional(),
});

const backtestConfigSchema = z.object({
  strategy: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  params: z.record(z.number()).optional(),
  config: z.record(z.unknown()).optional(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  symbols: z.array(z.string().min(1)).max(50).optional(),
});

const factorIterateConfigSchema = z.object({
  description: z.string().min(1),
  rounds: z.number().int().positive().max(10).optional(),
  horizon: z.number().int().positive().optional(),
  layers: z.number().int().positive().optional(),
  bars: z.number().int().positive().optional(),
  maxSymbols: z.number().int().positive().optional(),
  minSymbols: z.number().int().positive().optional(),
  validRatio: z.number().positive().max(1).optional(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const baseNodeSchema = z.object({
  id: z.string().min(1),
  position: positionSchema,
});

const triggerNodeSchema = baseNodeSchema.extend({
  type: z.literal("trigger"),
  config: triggerConfigSchema,
});

const stockPoolNodeSchema = baseNodeSchema.extend({
  type: z.literal("stock_pool"),
  config: stockPoolConfigSchema,
});

const screenNodeSchema = baseNodeSchema.extend({
  type: z.literal("screen"),
  config: screenConfigSchema,
});

const backtestNodeSchema = baseNodeSchema.extend({
  type: z.literal("backtest"),
  config: backtestConfigSchema,
});

const reviewNodeSchema = baseNodeSchema.extend({
  type: z.literal("review"),
  config: z.object({}).default({}),
});

const factorIterateNodeSchema = baseNodeSchema.extend({
  type: z.literal("factor_iterate"),
  config: factorIterateConfigSchema,
});

export const workflowNodeSchema = z.discriminatedUnion("type", [
  triggerNodeSchema,
  stockPoolNodeSchema,
  screenNodeSchema,
  backtestNodeSchema,
  reviewNodeSchema,
  factorIterateNodeSchema,
]);

export const workflowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(["control", "symbols"]),
});

export const workflowGraphSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(workflowNodeSchema).min(1).max(200),
  edges: z.array(workflowEdgeSchema).max(1000),
});

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowNodeType = WorkflowNode["type"];
export type WorkflowTriggerConfig = z.infer<typeof triggerConfigSchema>;

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped";

export type WorkflowNodeRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped";

export interface WorkflowValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

const RUN_TRANSITIONS: Record<WorkflowRunStatus, ReadonlySet<WorkflowRunStatus>> = {
  pending: new Set(["running", "canceled", "skipped"]),
  running: new Set(["success", "failed", "canceled"]),
  success: new Set(),
  failed: new Set(),
  canceled: new Set(),
  skipped: new Set(),
};

export function canTransitionRunStatus(from: WorkflowRunStatus, to: WorkflowRunStatus): boolean {
  return RUN_TRANSITIONS[from].has(to);
}

export function validateWorkflowSymbols(symbols: string[]): WorkflowValidationError[] {
  if (symbols.length <= 50) return [];
  return [
    {
      code: "symbol_limit",
      message: `回测最多允许 50 个标的，当前为 ${symbols.length} 个`,
    },
  ];
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = [];
  const nodeIds = new Set<string>();
  const nodesById = new Map<string, WorkflowNode>();
  const triggerNodes = graph.nodes.filter((node) => node.type === "trigger");

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        code: "duplicate_node",
        message: `节点 ID 重复：${node.id}`,
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
    nodesById.set(node.id, node);
  }

  if (triggerNodes.length !== 1) {
    errors.push({
      code: "trigger_count",
      message: "工作流必须且只能有一个触发器",
    });
  }

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const symbolInputs = new Map<string, number>();

  for (const edge of graph.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    if (!source || !target) {
      errors.push({
        code: "missing_endpoint",
        message: "连线引用了不存在的节点",
        edgeId: edge.id,
      });
      continue;
    }
    if (edge.kind === "symbols") {
      if (source.type !== "stock_pool" && source.type !== "screen") {
        errors.push({
          code: "invalid_symbol_source",
          message: "只有股票池或选股节点可以输出 symbols",
          edgeId: edge.id,
        });
      }
      if (target.type !== "backtest") {
        errors.push({
          code: "invalid_symbol_target",
          message: "symbols 只能连接到回测节点",
          edgeId: edge.id,
        });
      }
      symbolInputs.set(target.id, (symbolInputs.get(target.id) ?? 0) + 1);
    }
    if (target.type === "trigger") {
      errors.push({
        code: "trigger_incoming",
        message: "触发器不能有入边",
        edgeId: edge.id,
      });
    }
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }

  for (const [nodeId, count] of symbolInputs) {
    if (count > 1) {
      errors.push({
        code: "multiple_symbol_inputs",
        message: "回测节点最多接收一个 symbols 输入",
        nodeId,
      });
    }
  }

  const trigger = triggerNodes[0];
  if (trigger) {
    const visited = new Set<string>();
    const stack = [trigger.id];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      for (const next of outgoing.get(id) ?? []) stack.push(next);
    }
    for (const node of graph.nodes) {
      if (node.type !== "trigger" && !visited.has(node.id)) {
        errors.push({
          code: "unreachable",
          message: `节点无法从触发器到达：${node.id}`,
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
      errors.push({ code: "cycle", message: "工作流图不能包含循环" });
    }
  }

  return errors;
}
