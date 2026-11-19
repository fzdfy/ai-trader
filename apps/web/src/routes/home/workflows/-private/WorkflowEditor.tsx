import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChangeset,
  type NodeChangeset,
} from "@xyflow/react";
import { Eye, History, ListRestart, Play, Redo2, Save, Send, Undo2 } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Spinner } from "@preline-ui/Spinner";
import { Switch } from "@preline-ui/Switch";
import {
  usePublishWorkflow,
  useRunWorkflow,
  useSaveWorkflow,
  useToggleWorkflow,
} from "../../../../hooks/useWorkflows";
import {
  WORKFLOW_NODE_META,
  validateWorkflowGraph,
  wouldCreateWorkflowCycle,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowDetail,
  type WorkflowEdgeKind,
  type WorkflowGraph,
  type WorkflowNodeType,
  type WorkflowValidationIssue,
} from "../../../../lib/workflows";
import { WorkflowConfigPanel } from "./WorkflowConfigPanel";
import {
  WorkflowNodeCard,
  type WorkflowCanvasNodeData,
  type WorkflowFlowNode,
} from "./WorkflowNode";

const nodeTypes = { workflowNode: WorkflowNodeCard };
const HISTORY_LIMIT = 50;
const PALETTE_TYPES: WorkflowNodeType[] = [
  "trigger",
  "stock_pool",
  "screen",
  "backtest",
  "review",
  "factor_iterate",
];

type WorkflowFlowEdge = Edge<{ kind: WorkflowEdgeKind }, "smoothstep">;

function normalizeGraph(graph: WorkflowGraph | null | undefined): WorkflowGraph {
  return {
    schemaVersion: 1,
    nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph?.edges) ? graph.edges : [],
  };
}

function defaultNodeConfig(type: WorkflowNodeType): Record<string, unknown> {
  if (type === "trigger") return { type: "manual" };
  if (type === "stock_pool") return { source: "watchlist" };
  if (type === "screen") return { strategyId: 0, topN: 50, scope: "all" };
  if (type === "backtest") {
    const year = new Date().getFullYear();
    return {
      strategy: "ma_cross",
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }
  if (type === "factor_iterate") {
    return { description: "", rounds: 3 };
  }
  return {};
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function nodeSignature(graph: WorkflowGraph): string {
  return JSON.stringify({
    ...graph,
    nodes: graph.nodes.map(({ measured: _measured, ...node }) => node),
  });
}

function serializableGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(({ measured: _measured, ...node }) => node),
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function serverIssueNodeIds(message: string, graph: WorkflowGraph): string[] {
  const indexes = new Set<number>();
  for (const match of message.matchAll(/nodes\.(\d+)/g)) {
    indexes.add(Number(match[1]));
  }
  return [...indexes]
    .map((index) => graph.nodes[index]?.id)
    .filter((id): id is string => Boolean(id));
}

function EditorContent({ workflow }: { workflow: WorkflowDetail }) {
  const navigate = useNavigate();
  const reactFlow = useReactFlow();
  const saveWorkflow = useSaveWorkflow();
  const publishWorkflow = usePublishWorkflow();
  const runWorkflow = useRunWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const initialGraph = useMemo(() => normalizeGraph(workflow.draftGraph), [workflow.draftGraph]);
  const [graph, setGraph] = useState(initialGraph);
  const graphRef = useRef(graph);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverNodeIds, setServerNodeIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [past, setPast] = useState<WorkflowGraph[]>([]);
  const [future, setFuture] = useState<WorkflowGraph[]>([]);
  const [savedSignature, setSavedSignature] = useState(nodeSignature(initialGraph));
  const [publishedVersion, setPublishedVersion] = useState(
    workflow.publishedVersion?.version ?? workflow.currentVersion,
  );
  const [enabled, setEnabled] = useState(workflow.enabled);
  const dragSnapshot = useRef<WorkflowGraph | null>(null);
  const didInitialFit = useRef(false);
  const validationIssues = useMemo(() => validateWorkflowGraph(graph), [graph]);
  const invalidNodeIds = useMemo(
    () =>
      new Set([
        ...validationIssues.map((issue) => issue.nodeId).filter((id): id is string => Boolean(id)),
        ...serverNodeIds,
      ]),
    [serverNodeIds, validationIssues],
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? null;
  const dirty = nodeSignature(graph) !== savedSignature;

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  const rememberSnapshot = useCallback((snapshot: WorkflowGraph) => {
    setPast((items) => [...items.slice(-(HISTORY_LIMIT - 1)), snapshot]);
    setFuture([]);
  }, []);

  const applyGraph = useCallback(
    (next: WorkflowGraph, recordHistory = true) => {
      const previous = graphRef.current;
      if (recordHistory) rememberSnapshot(previous);
      graphRef.current = next;
      setGraph(next);
      setServerError(null);
      setServerNodeIds([]);
    },
    [rememberSnapshot],
  );

  const undo = useCallback(() => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [graphRef.current, ...items].slice(0, HISTORY_LIMIT));
    graphRef.current = previous;
    setGraph(previous);
    setServerError(null);
  }, [past]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-(HISTORY_LIMIT - 1)), graphRef.current]);
    graphRef.current = next;
    setGraph(next);
  }, [future]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedId) {
        setSelectedId(null);
        return;
      }
      if (isTypingTarget(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, selectedId, undo]);

  const onNodesChange = useCallback(
    (changeset: NodeChangeset<WorkflowFlowNode>) => {
      const changes = changeset.toArray();
      let next = graphRef.current;
      const removed = changes.some((change) => change.type === "remove");
      if (removed) {
        const removedIds = new Set(
          changes
            .filter(
              (
                change,
              ): change is {
                type: "remove";
                id: string;
              } => change.type === "remove",
            )
            .map((change) => change.id),
        );
        next = {
          ...next,
          nodes: next.nodes.filter((node) => !removedIds.has(node.id)),
          edges: next.edges.filter(
            (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
          ),
        };
        if (selectedId && removedIds.has(selectedId)) setSelectedId(null);
      }
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          next = {
            ...next,
            nodes: next.nodes.map((node) =>
              node.id === change.id ? { ...node, measured: change.dimensions } : node,
            ),
          };
        }
        if (change.type !== "position" || !change.position) continue;
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.id === change.id ? { ...node, position: change.position! } : node,
          ),
        };
      }
      applyGraph(next, removed);
    },
    [applyGraph, selectedId],
  );

  const onEdgesChange = useCallback(
    (changeset: EdgeChangeset<WorkflowFlowEdge>) => {
      const removedIds = new Set(
        changeset
          .toArray()
          .filter((change) => change.type === "remove")
          .map((change) => change.id),
      );
      if (removedIds.size === 0) return;
      applyGraph({
        ...graphRef.current,
        edges: graphRef.current.edges.filter((edge) => !removedIds.has(edge.id)),
      });
    },
    [applyGraph],
  );

  const flowNodes = useMemo<WorkflowFlowNode[]>(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "workflowNode",
        position: node.position,
        measured: node.measured,
        selected: node.id === selectedId,
        data: {
          nodeType: node.type,
          invalid: invalidNodeIds.has(node.id),
          onActivate: () => setSelectedId(node.id),
        } satisfies WorkflowCanvasNodeData,
      })),
    [graph.nodes, invalidNodeIds, selectedId],
  );

  const flowEdges = useMemo<WorkflowFlowEdge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.kind,
        targetHandle: edge.kind,
        type: "smoothstep",
        animated: edge.kind === "symbols",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.kind === "symbols" ? "var(--color-app-success)" : "var(--primary)",
        },
        style: {
          stroke: edge.kind === "symbols" ? "var(--color-app-success)" : "var(--primary)",
          strokeWidth: edge.kind === "symbols" ? 2 : 1.5,
          strokeDasharray: edge.kind === "symbols" ? "6 5" : undefined,
        },
        data: { kind: edge.kind },
      })),
    [graph.edges],
  );

  useEffect(() => {
    if (
      didInitialFit.current ||
      flowNodes.length === 0 ||
      !flowNodes.every((node) => node.measured?.width)
    ) {
      return;
    }
    didInitialFit.current = true;
    const frame = requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        void reactFlow.setViewport({ x: 24, y: 108, zoom: 0.82 });
      } else {
        void reactFlow.fitView({ padding: 0.2, duration: 0 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [flowNodes, reactFlow]);

  const addNode = useCallback(
    (type: WorkflowNodeType, position?: { x: number; y: number }) => {
      if (type === "trigger" && graphRef.current.nodes.some((node) => node.type === "trigger")) {
        setNotice("每条工作流只能有一个触发器。");
        return;
      }
      const fallbackIndex = graphRef.current.nodes.length;
      const node: WorkflowCanvasNode = {
        id: newId(type),
        type,
        position: position ?? {
          x: 80 + (fallbackIndex % 3) * 270,
          y: 90 + Math.floor(fallbackIndex / 3) * 190,
        },
        config: defaultNodeConfig(type),
      };
      applyGraph({
        ...graphRef.current,
        nodes: [...graphRef.current.nodes, node],
      });
      setSelectedId(node.id);
      setNotice(null);
    },
    [applyGraph],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        setNotice("节点不能连接到自己。");
        return;
      }
      const current = graphRef.current;
      const source = current.nodes.find((node) => node.id === connection.source);
      const target = current.nodes.find((node) => node.id === connection.target);
      if (!source || !target) return;
      if (target.type === "trigger") {
        setNotice("触发器不能接收入边。");
        return;
      }

      const kind: WorkflowEdgeKind = connection.sourceHandle === "symbols" ? "symbols" : "control";
      if (
        kind === "control" &&
        (connection.sourceHandle !== "control" || connection.targetHandle !== "control")
      ) {
        setNotice("控制线需要连接两侧的灰色端口。");
        return;
      }
      if (kind === "symbols") {
        if (connection.targetHandle !== "symbols") {
          setNotice("标的线需要连接到回测节点的标的端口。");
          return;
        }
        if (!["stock_pool", "screen"].includes(source.type) || target.type !== "backtest") {
          setNotice("标的线只能从股票池或选股连接到回测。");
          return;
        }
        if (current.edges.some((edge) => edge.target === target.id && edge.kind === "symbols")) {
          setNotice("回测节点只能接收一个标的来源。");
          return;
        }
      }
      if (
        current.edges.some(
          (edge) => edge.source === source.id && edge.target === target.id && edge.kind === kind,
        )
      ) {
        setNotice("这两个端口已经连接。");
        return;
      }
      if (wouldCreateWorkflowCycle(current, source.id, target.id)) {
        setNotice("该连接会形成循环，无法添加。");
        return;
      }

      const edge: WorkflowCanvasEdge = {
        id: newId("edge"),
        source: source.id,
        target: target.id,
        kind,
      };
      applyGraph({
        ...current,
        edges: [...current.edges, edge],
      });
      setNotice(null);
    },
    [applyGraph],
  );

  const updateSelectedConfig = useCallback(
    (config: Record<string, unknown>) => {
      if (!selectedId) return;
      applyGraph({
        ...graphRef.current,
        nodes: graphRef.current.nodes.map((node) =>
          node.id === selectedId ? { ...node, config } : node,
        ),
      });
    },
    [applyGraph, selectedId],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    applyGraph({
      ...graphRef.current,
      nodes: graphRef.current.nodes.filter((node) => node.id !== selectedId),
      edges: graphRef.current.edges.filter(
        (edge) => edge.source !== selectedId && edge.target !== selectedId,
      ),
    });
    setSelectedId(null);
  }, [applyGraph, selectedId]);

  const saveDraft = useCallback(async () => {
    const saved = await saveWorkflow.mutateAsync({
      workflowId: workflow.id,
      name,
      description,
      draftGraph: serializableGraph(graphRef.current),
    });
    setSavedSignature(nodeSignature(graphRef.current));
    setNotice(`草稿已保存 ${new Date(saved.updatedAt).toLocaleTimeString("zh-CN")}`);
    return saved;
  }, [description, name, saveWorkflow, workflow.id]);

  const publish = async () => {
    setShowErrors(true);
    setServerError(null);
    setServerNodeIds([]);
    if (validationIssues.length > 0) {
      const firstNodeId = validationIssues.find((issue) => issue.nodeId)?.nodeId;
      if (firstNodeId) setSelectedId(firstNodeId);
      setNotice("发布前请先修正校验问题。");
      return;
    }
    try {
      await saveDraft();
      const result = await publishWorkflow.mutateAsync(workflow.id);
      setPublishedVersion(result.version.version);
      setNotice(`已发布 v${result.version.version}`);
    } catch (error) {
      const message = (error as Error).message;
      setServerError(message);
      setServerNodeIds(serverIssueNodeIds(message, graphRef.current));
      setShowErrors(true);
    }
  };

  const run = async () => {
    try {
      await saveDraft();
      const result = await runWorkflow.mutateAsync(workflow.id);
      if (result.skipped) {
        setNotice(
          result.reason === "active_run"
            ? "已有活动运行，本次触发已记为跳过。"
            : "本次触发与已有记录重复。",
        );
        return;
      }
      await navigate({
        to: "/home/workflows/runs/$runId",
        params: { runId: String(result.runId) },
      });
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const toggleEnabled = async (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    try {
      await toggleWorkflow.mutateAsync({
        workflowId: workflow.id,
        enabled: nextEnabled,
      });
      setNotice(nextEnabled ? "工作流已启用" : "工作流已停用");
    } catch (error) {
      setEnabled(!nextEnabled);
      setNotice((error as Error).message);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (isTypingTarget(event.target)) return;
    if (!selectedId) return;
    event.preventDefault();
    deleteSelected();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(
      "application/x-ai-trader-workflow-node",
    ) as WorkflowNodeType;
    if (!PALETTE_TYPES.includes(type)) return;
    addNode(
      type,
      reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-8">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-[-0.03em] text-app-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:text-[30px]"
              aria-label="工作流名称"
            />
            <input
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="补充这条工作流要解决的问题"
              className="mt-1 w-full border-0 bg-transparent p-0 text-sm text-app-muted outline-none placeholder:text-app-faint focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label="工作流说明"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-app-muted">
              <span>{publishedVersion ? `已发布 v${publishedVersion}` : "尚未发布"}</span>
              <span className="size-1 rounded-full bg-app-line-strong" />
              <span>{dirty ? "有未保存修改" : "草稿已同步"}</span>
              <span className="size-1 rounded-full bg-app-line-strong" />
              <span>{graph.nodes.length} 个节点</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Switch
            label="启用自动触发"
            value={enabled}
            isDisabled={!publishedVersion || toggleWorkflow.isPending}
            onChange={(next) => void toggleEnabled(next)}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={saveWorkflow.isPending ? <Spinner size="sm" /> : <Save className="size-4" />}
            onClick={() => {
              void saveDraft().catch((error: unknown) => setNotice((error as Error).message));
            }}
          >
            保存草稿
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Play className="size-4" />}
            isDisabled={!publishedVersion || runWorkflow.isPending}
            onClick={() => void run()}
          >
            运行
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Send className="size-4" />}
            isLoading={publishWorkflow.isPending}
            onClick={() => void publish()}
          >
            发布
          </Button>
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className="rounded-xl border border-app-line bg-app-surface px-4 py-2.5 text-sm text-app-ink"
        >
          {notice}
        </div>
      ) : null}
      {serverError ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </div>
      ) : null}

      <section className="flex h-[calc(100dvh-12rem)] min-h-[680px] flex-col overflow-hidden rounded-2xl border border-app-line bg-app-panel xl:flex-row">
        <aside
          className="shrink-0 border-b border-app-line bg-app-surface/45 p-3 xl:w-[214px] xl:border-b-0 xl:border-r"
          aria-label="节点面板"
        >
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-xs font-semibold text-app-ink">节点</p>
              <p className="mt-0.5 text-[10px] text-app-muted">拖入画布，或点击添加</p>
            </div>
            <ListRestart className="size-3.5 text-app-faint" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {PALETTE_TYPES.map((type) => {
              const meta = WORKFLOW_NODE_META[type];
              const triggerUsed = graph.nodes.some((node) => node.type === "trigger");
              return (
                <button
                  key={type}
                  type="button"
                  draggable={!(type === "trigger" && triggerUsed)}
                  disabled={type === "trigger" && triggerUsed}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-ai-trader-workflow-node", type);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => addNode(type)}
                  className="focus-ring group min-w-[150px] rounded-xl border border-app-line bg-app-panel p-3 text-left transition hover:border-app-line-strong hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45 xl:min-w-0"
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-5 rounded-full ${meta.accentClass}`} />
                    <span className="text-xs font-semibold text-app-ink">{meta.label}</span>
                  </span>
                  <span className="mt-1.5 block text-[10px] leading-4 text-app-muted">
                    {meta.description}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 hidden rounded-xl border border-dashed border-app-line px-3 py-2.5 text-[10px] leading-4 text-app-muted xl:block">
            <span className="font-medium text-app-ink">端口</span>
            <p className="mt-1">蓝色实线为控制流，绿色虚线为标的流。</p>
          </div>
        </aside>

        <div
          className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-app-surface"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={onDrop}
          onKeyDown={handleKeyDown}
        >
          <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onNodeDoubleClick={(_, node) => setSelectedId(node.id)}
            onNodeDragStart={() => {
              dragSnapshot.current = graphRef.current;
            }}
            onNodeDragStop={() => {
              if (dragSnapshot.current) {
                rememberSnapshot(dragSnapshot.current);
                dragSnapshot.current = null;
              }
            }}
            onPaneClick={() => setSelectedId(null)}
            nodesFocusable
            edgesFocusable
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.35}
            maxZoom={1.6}
            deleteKeyCode={["Backspace", "Delete"]}
            className="workflow-canvas !bg-app-surface"
            style={{ backgroundColor: "var(--surface)" }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1.2}
              color="var(--line-strong)"
              bgColor="var(--surface)"
            />
            <Controls
              position="bottom-left"
              showInteractive={false}
              className="!overflow-hidden !rounded-xl !border !border-app-line !bg-app-panel !shadow-lg"
            />
          </ReactFlow>

          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2">
            <button
              type="button"
              className="pointer-events-auto focus-ring grid size-8 place-items-center rounded-lg border border-app-line bg-app-panel text-app-muted shadow-sm hover:text-app-ink disabled:opacity-40"
              onClick={undo}
              disabled={past.length === 0}
              aria-label="撤销"
              title="撤销 (⌘Z)"
            >
              <Undo2 className="size-3.5" />
            </button>
            <button
              type="button"
              className="pointer-events-auto focus-ring grid size-8 place-items-center rounded-lg border border-app-line bg-app-panel text-app-muted shadow-sm hover:text-app-ink disabled:opacity-40"
              onClick={redo}
              disabled={future.length === 0}
              aria-label="重做"
              title="重做 (⇧⌘Z)"
            >
              <Redo2 className="size-3.5" />
            </button>
            <span className="pointer-events-auto rounded-lg border border-app-line bg-app-panel/95 px-2.5 py-1.5 text-[10px] text-app-muted shadow-sm">
              {validationIssues.length === 0
                ? "结构可发布"
                : `${validationIssues.length} 个待修正项`}
            </span>
          </div>

          {showErrors && validationIssues.length > 0 ? (
            <div
              role="alert"
              className="absolute bottom-4 left-14 right-4 z-20 max-h-44 overflow-auto rounded-xl border border-destructive/30 bg-app-panel p-3 shadow-xl lg:right-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-destructive">发布前需要修正</p>
                <button
                  type="button"
                  className="focus-ring rounded px-2 py-1 text-[10px] text-app-muted hover:bg-app-surface"
                  onClick={() => setShowErrors(false)}
                >
                  收起
                </button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {validationIssues.map((issue: WorkflowValidationIssue, index) => (
                  <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? index}`}>
                    <button
                      type="button"
                      className="focus-ring flex w-full items-start gap-2 rounded px-1 py-0.5 text-left text-[11px] text-app-muted hover:text-app-ink"
                      onClick={() => {
                        if (issue.nodeId) setSelectedId(issue.nodeId);
                      }}
                    >
                      <span className="mt-1 size-1 shrink-0 rounded-full bg-destructive" />
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {graph.nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="max-w-xs -translate-y-12 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-app-line bg-app-panel text-primary shadow-sm">
                  <Eye className="size-5" />
                </span>
                <p className="mt-4 text-sm font-semibold text-app-ink">从触发器开始</p>
                <p className="mt-1 text-xs leading-5 text-app-muted">
                  把左侧节点拖进来，再连接流程。点击节点可以编辑参数。
                </p>
              </div>
            </div>
          ) : null}

          <WorkflowConfigPanel
            node={selectedNode}
            onChange={updateSelectedConfig}
            onClose={() => setSelectedId(null)}
            onDelete={deleteSelected}
          />
        </div>
      </section>

      <section
        id="workflow-run-history"
        className="flex flex-col gap-2 rounded-xl border border-app-line bg-app-panel px-4 py-3 text-xs text-app-muted sm:flex-row sm:items-center sm:justify-between"
      >
        <span>版本发布后不可修改；再次发布会产生新的版本号。</span>
        <Link
          to="/home/workflows"
          className="focus-ring inline-flex items-center gap-1.5 rounded text-primary hover:underline"
        >
          <History className="size-3.5" />
          查看全部运行记录
        </Link>
      </section>
    </div>
  );
}

export function WorkflowEditor({ workflow }: { workflow: WorkflowDetail }) {
  return (
    <ReactFlowProvider>
      <EditorContent workflow={workflow} />
    </ReactFlowProvider>
  );
}
