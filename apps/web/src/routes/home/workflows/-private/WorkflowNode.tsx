import type { NodeProps } from "@xyflow/react";
import { Handle, Position, type Node } from "@xyflow/react";
import {
  ChartNoAxesCombined,
  Database,
  FileText,
  Filter,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { WORKFLOW_NODE_META, type WorkflowNodeType } from "../../../../lib/workflows";

export interface WorkflowCanvasNodeData extends Record<string, unknown> {
  nodeType: WorkflowNodeType;
  invalid?: boolean;
  onActivate?: () => void;
}

export type WorkflowFlowNode = Node<WorkflowCanvasNodeData, "workflowNode">;

const NODE_ICONS: Record<WorkflowNodeType, LucideIcon> = {
  trigger: Zap,
  stock_pool: Database,
  screen: Filter,
  backtest: ChartNoAxesCombined,
  review: FileText,
  factor_iterate: Sparkles,
};

export function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const meta = WORKFLOW_NODE_META[data.nodeType];
  const Icon = NODE_ICONS[data.nodeType];
  const canReceive = data.nodeType !== "trigger";
  const isBacktest = data.nodeType === "backtest";
  const hasSymbolOutput = ["stock_pool", "screen"].includes(data.nodeType);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${meta.label}节点，按 Enter 打开配置`}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        data.onActivate?.();
      }}
      className={`workflow-canvas-node relative w-[220px] overflow-hidden rounded-2xl border bg-app-panel shadow-lg transition ${
        selected
          ? "border-primary ring-2 ring-primary/20"
          : data.invalid
            ? "border-destructive ring-2 ring-destructive/15"
            : "border-app-line hover:border-app-line-strong"
      }`}
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${meta.accentClass}`} />
      {canReceive ? (
        <Handle
          id="control"
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-app-panel !bg-app-muted"
          style={{ top: isBacktest ? "38%" : "50%" }}
        />
      ) : null}
      {isBacktest ? (
        <Handle
          id="symbols"
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-app-panel !bg-app-success"
          style={{ top: "70%" }}
        />
      ) : null}
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-app-surface text-app-ink">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-[0.08em] text-app-faint">
            {data.nodeType === "trigger" ? "TRIGGER" : "ACTION"}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-app-ink">{meta.label}</p>
        </div>
      </div>
      <p className="min-h-9 px-4 text-[11px] leading-5 text-app-muted">{meta.description}</p>
      <div className="mt-3 flex items-center justify-between border-t border-app-line bg-app-surface/55 px-4 py-2">
        <span className="text-[10px] text-app-faint">
          {data.nodeType === "trigger" ? "流程起点" : "双击查看配置"}
        </span>
        {data.invalid ? (
          <span className="text-[10px] font-medium text-destructive">需修正</span>
        ) : null}
      </div>
      <Handle
        id="control"
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-app-panel !bg-primary"
        style={{ top: hasSymbolOutput ? "38%" : "50%" }}
      />
      {hasSymbolOutput ? (
        <Handle
          id="symbols"
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-app-panel !bg-app-success"
          style={{ top: "72%" }}
        />
      ) : null}
    </div>
  );
}
