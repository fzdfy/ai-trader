import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Dialog, DialogHeader } from "@preline-ui/Dialog";
import { Spinner } from "@preline-ui/Spinner";
import { AddWorkTaskButton } from "../../../../components/AddWorkTaskButton";
import { useCancelWorkflowRun, useWorkflowRunQuery } from "../../../../hooks/useWorkflows";
import {
  WORKFLOW_NODE_META,
  WORKFLOW_STATUS_META,
  type WorkflowNodeRun,
  type WorkflowNodeType,
} from "../../../../lib/workflows";

export const Route = createFileRoute("/home/workflows/runs/$runId")({
  component: WorkflowRunPage,
});

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start) return "—";
  const startAt = new Date(start).getTime();
  const endAt = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return "—";
  const seconds = Math.max(0, Math.round((endAt - startAt) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function triggerLabel(runType: string): string {
  if (runType === "schedule") return "交易日定时";
  if (runType === "sync_complete") return "同步完成后";
  return "手动触发";
}

function NodeStatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircle2 className="size-4" />;
  if (status === "running") return <LoaderCircle className="size-4 animate-spin" />;
  if (status === "failed") return <CircleAlert className="size-4" />;
  if (status === "canceled") return <XCircle className="size-4" />;
  return <Clock3 className="size-4" />;
}

function nodeDuration(node: WorkflowNodeRun): string {
  return durationLabel(node.startedAt, node.finishedAt);
}

function resultLink(node: WorkflowNodeRun) {
  const ref = node.resultRef as { type?: string; path?: string; date?: string } | null;
  if (!ref) return null;
  if (ref.type === "factor_job" && ref.path) {
    return (
      <Link
        to="/home/factors/iterate"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        查看因子任务
        <ExternalLink className="size-3" />
      </Link>
    );
  }
  if (ref.type === "review" && ref.date) {
    return (
      <Link
        to="/home/reviews/history/$date"
        params={{ date: ref.date }}
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        查看复盘
        <ExternalLink className="size-3" />
      </Link>
    );
  }
  return null;
}

function WorkflowRunPage() {
  const { runId } = Route.useParams();
  const id = Number(runId);
  const query = useWorkflowRunQuery(id);
  const cancelRun = useCancelWorkflowRun();
  const [cancelOpen, setCancelOpen] = useState(false);

  if (query.isLoading) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <Spinner label="正在读取运行记录…" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto grid min-h-[55vh] max-w-md place-items-center text-center">
        <div>
          <p className="text-sm text-destructive">
            {(query.error as Error | null)?.message ?? "运行记录不存在"}
          </p>
          <Link
            to="/home/workflows"
            className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            返回工作流
          </Link>
        </div>
      </div>
    );
  }

  const detail = query.data;
  const run = detail.run;
  const status = WORKFLOW_STATUS_META[run.status] ?? WORKFLOW_STATUS_META.pending!;
  const graphNodes = new Map(detail.graph.nodes.map((node) => [node.id, node]));
  const canCancel = ["pending", "running"].includes(run.status);
  const currentLabel = run.currentNodeId
    ? (WORKFLOW_NODE_META[graphNodes.get(run.currentNodeId)?.type as WorkflowNodeType]?.label ??
      run.currentNodeId)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div>
            <p className="text-xs text-app-muted">运行详情 · v{detail.version}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-app-ink">
              {detail.workflowName}
            </h1>
            <p className="mt-1 text-sm text-app-muted">
              {triggerLabel(run.triggerType)} · 创建于 {formatTime(run.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddWorkTaskButton
            sourceType="workflow_run"
            sourceId={String(run.id)}
            label="生成人工跟进任务"
          />
          {canCancel ? (
            <Button
              variant="secondary"
              icon={<XCircle className="size-4" />}
              onClick={() => setCancelOpen(true)}
            >
              取消运行
            </Button>
          ) : null}
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-app-line bg-app-panel">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "整体状态",
              value: (
                <span className={`inline-flex items-center gap-2 ${status.className}`}>
                  <span className={`size-2 rounded-full ${status.dotClassName}`} />
                  {status.label}
                </span>
              ),
            },
            { label: "当前步骤", value: currentLabel ?? "已结束" },
            {
              label: "总耗时",
              value: durationLabel(run.startedAt, run.finishedAt),
            },
            { label: "触发来源", value: triggerLabel(run.triggerType) },
          ].map((item, index) => (
            <div
              key={item.label}
              className={`px-5 py-4 ${
                index < 3 ? "border-b border-app-line sm:border-r lg:border-b-0" : ""
              }`}
            >
              <p className="text-[11px] text-app-muted">{item.label}</p>
              <div className="mt-1.5 text-sm font-semibold text-app-ink">{item.value}</div>
            </div>
          ))}
        </div>
        {run.error ? (
          <div className="border-t border-app-line bg-destructive/5 px-5 py-3 text-sm text-destructive">
            {run.error}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-app-line bg-app-panel">
        <div className="flex items-center justify-between border-b border-app-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-app-ink">节点时间线</h2>
            <p className="mt-0.5 text-xs text-app-muted">
              只展示摘要和业务引用，大型结果保留在原模块。
            </p>
          </div>
          <span className="text-[11px] text-app-faint">{detail.nodes.length} 个节点</span>
        </div>

        <div className="divide-y divide-app-line">
          {detail.nodes.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-app-muted">
              工作流还在等待执行。
            </div>
          ) : (
            detail.nodes.map((node, index) => {
              const nodeMeta = WORKFLOW_NODE_META[node.nodeType];
              const nodeStatus = WORKFLOW_STATUS_META[node.status] ?? WORKFLOW_STATUS_META.pending!;
              const output =
                node.outputSummary == null ? null : JSON.stringify(node.outputSummary, null, 2);
              return (
                <article
                  key={node.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(190px,0.7fr)_minmax(0,1.3fr)]"
                >
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-lg ${nodeStatus.className}`}
                      >
                        <NodeStatusIcon status={node.status} />
                      </span>
                      {index < detail.nodes.length - 1 ? (
                        <span className="mt-1 w-px flex-1 bg-app-line" />
                      ) : null}
                    </div>
                    <div className="min-w-0 pb-1">
                      <p className="text-sm font-semibold text-app-ink">
                        {nodeMeta?.label ?? node.nodeType}
                      </p>
                      <p className="mt-1 text-[11px] text-app-muted">
                        {nodeStatus.label} · {nodeDuration(node)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-app-faint">
                        {formatTime(node.startedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    {node.error ? (
                      <p className="rounded-lg bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                        {node.error}
                      </p>
                    ) : output ? (
                      <details className="group">
                        <summary className="focus-ring cursor-pointer list-none rounded-lg border border-app-line bg-app-surface px-3 py-2 text-xs text-app-muted transition hover:text-app-ink">
                          查看节点摘要
                        </summary>
                        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-app-surface p-3 font-mono text-[10px] leading-5 text-app-ink">
                          {output}
                        </pre>
                      </details>
                    ) : (
                      <p className="text-xs text-app-faint">没有额外输出。</p>
                    )}
                    {resultLink(node) ? (
                      <div className="mt-2 text-xs">{resultLink(node)}</div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <Dialog isOpen={cancelOpen} onOpenChange={setCancelOpen} width={460}>
        <DialogHeader
          title="取消这次运行？"
          subtitle="系统会停止启动后续节点，但已经发往选股、回测或 AI 的请求可能继续完成。"
          onOpenChange={setCancelOpen}
        />
        <div className="flex justify-end gap-2 p-5">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>
            继续运行
          </Button>
          <Button
            variant="danger"
            isLoading={cancelRun.isPending}
            onClick={async () => {
              await cancelRun.mutateAsync(run.id);
              setCancelOpen(false);
            }}
          >
            确认取消
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
