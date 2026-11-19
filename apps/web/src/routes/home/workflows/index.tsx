import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  CircleAlert,
  Clock3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Workflow,
} from "lucide-react";
import { Badge } from "@preline-ui/Badge";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Dialog, DialogHeader } from "@preline-ui/Dialog";
import { EmptyState } from "@preline-ui/EmptyState";
import { Spinner } from "@preline-ui/Spinner";
import {
  useArchiveWorkflow,
  useRunWorkflow,
  useToggleWorkflow,
  useWorkflowsQuery,
} from "../../../hooks/useWorkflows";
import { WORKFLOW_STATUS_META, type WorkflowSummary } from "../../../lib/workflows";

export const Route = createFileRoute("/home/workflows/")({
  component: WorkflowsPage,
});

function formatTime(value: string | null | undefined): string {
  if (!value) return "从未运行";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function triggerLabel(workflow: WorkflowSummary): string {
  if (workflow.currentVersion == null) return "尚未发布";
  const config = workflow.currentTrigger?.triggerConfig;
  if (config?.type === "schedule") {
    return `交易日 ${String(config.time ?? "--:--")}`;
  }
  if (config?.type === "sync_complete") {
    return `同步完成 · ${String(config.jobType ?? "未选择")}`;
  }
  return "手动触发";
}

function runStatus(run: WorkflowSummary["latestRun"]) {
  return WORKFLOW_STATUS_META[run?.status ?? "pending"] ?? WORKFLOW_STATUS_META.pending!;
}

function FlowStatus({ workflow }: { workflow: WorkflowSummary }) {
  if (workflow.currentVersion == null) {
    return <Badge variant="soft">草稿</Badge>;
  }
  if (!workflow.enabled) {
    return <Badge variant="soft">已停用</Badge>;
  }
  return <Badge variant="success">已启用</Badge>;
}

function WorkflowsPage() {
  const navigate = useNavigate();
  const workflowsQuery = useWorkflowsQuery();
  const runWorkflow = useRunWorkflow();
  const toggleWorkflow = useToggleWorkflow();
  const archiveWorkflow = useArchiveWorkflow();
  const [archiveTarget, setArchiveTarget] = useState<WorkflowSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const workflows = workflowsQuery.data?.items ?? [];
  const enabledCount = workflows.filter((workflow) => workflow.enabled).length;
  const runningToday = workflows.filter((workflow) =>
    ["pending", "running"].includes(workflow.latestRun?.status ?? ""),
  ).length;
  const needsAttention = workflows.filter(
    (workflow) => workflow.latestRun?.status === "failed",
  ).length;

  const handleRun = async (workflow: WorkflowSummary) => {
    setNotice(null);
    try {
      const result = await runWorkflow.mutateAsync(workflow.id);
      if (result.skipped) {
        setNotice(
          result.reason === "active_run"
            ? "已有活动运行，本次触发已记为跳过。"
            : "同一触发已执行过，本次未重复运行。",
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

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs text-app-muted">自动化研究流程</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-app-ink md:text-[30px]">
            工作流
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-app-muted">
            把股票池、选股、回测、复盘和因子研究串成一条可追踪的私有流程。
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={() => {
            void navigate({ to: "/home/workflows/new" });
          }}
        >
          新建工作流
        </Button>
      </header>

      <section className="grid overflow-hidden rounded-2xl border border-app-line bg-app-panel sm:grid-cols-3">
        {[
          { label: "已启用", value: enabledCount, icon: Play },
          { label: "今日有运行", value: runningToday, icon: RotateCcw },
          { label: "需要处理", value: needsAttention, icon: CircleAlert },
        ].map(({ label, value, icon: Icon }, index) => (
          <div
            key={label}
            className={`flex items-center gap-4 px-5 py-4 ${
              index < 2 ? "border-b border-app-line sm:border-b-0 sm:border-r" : ""
            }`}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-app-surface text-app-muted">
              <Icon className="size-4" />
            </span>
            <div>
              <p className="text-[11px] text-app-muted">{label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-app-ink">{value}</p>
            </div>
          </div>
        ))}
      </section>

      {notice ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-app-line bg-app-surface px-4 py-3 text-sm text-app-ink"
        >
          <CircleAlert className="size-4 shrink-0 text-app-warning" />
          <span>{notice}</span>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[minmax(220px,1.45fr)_minmax(150px,.8fr)_minmax(170px,1fr)_112px_120px] items-center gap-4 border-b border-app-line bg-app-surface/60 px-5 py-2.5 text-[11px] font-medium text-app-muted lg:grid">
          <span>工作流</span>
          <span>触发器</span>
          <span>最近运行</span>
          <span>状态</span>
          <span className="text-right">操作</span>
        </div>

        {workflowsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-app-muted">
            <Spinner size="sm" />
            正在读取工作流
          </div>
        ) : workflowsQuery.isError ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-destructive">{(workflowsQuery.error as Error).message}</p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => void workflowsQuery.refetch()}
            >
              重新加载
            </Button>
          </div>
        ) : workflows.length === 0 ? (
          <div className="px-6 py-12">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Workflow className="size-5" />
            </span>
            <EmptyState
              title="还没有工作流"
              description="先从一个触发器开始，再把研究步骤拖到画布中。"
            />
            <div className="text-center">
              <Button
                variant="primary"
                onClick={() => void navigate({ to: "/home/workflows/new" })}
              >
                新建第一条工作流
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-app-line">
            {workflows.map((workflow) => {
              const latest = workflow.latestRun;
              const status = runStatus(latest);
              return (
                <article
                  key={workflow.id}
                  className="grid gap-4 px-5 py-4 transition hover:bg-app-surface/60 lg:grid-cols-[minmax(220px,1.45fr)_minmax(150px,.8fr)_minmax(170px,1fr)_112px_120px] lg:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      to="/home/workflows/$workflowId"
                      params={{ workflowId: String(workflow.id) }}
                      className="focus-ring inline-flex items-center gap-2 rounded text-sm font-semibold text-app-ink hover:text-primary"
                    >
                      {workflow.name}
                      <ArrowRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                    </Link>
                    <p className="mt-1 line-clamp-1 text-xs text-app-muted">
                      {workflow.description || "未填写说明"}
                    </p>
                    <p className="mt-1 text-[11px] text-app-faint lg:hidden">
                      {triggerLabel(workflow)}
                    </p>
                  </div>

                  <div className="hidden items-center gap-2 text-xs text-app-muted lg:flex">
                    <Clock3 className="size-3.5 text-app-faint" />
                    {triggerLabel(workflow)}
                  </div>

                  <div className="min-w-0">
                    {latest ? (
                      <Link
                        to="/home/workflows/runs/$runId"
                        params={{ runId: String(latest.id) }}
                        className="focus-ring block rounded"
                      >
                        <span className="flex items-center gap-2">
                          <span className={`size-1.5 rounded-full ${status.dotClassName}`} />
                          <span className={`text-xs font-medium ${status.className}`}>
                            {status.label}
                          </span>
                          <span className="text-[11px] text-app-faint">
                            {formatTime(latest.createdAt)}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-app-muted">
                          {latest.error ??
                            (latest.currentNodeId ? `当前：${latest.currentNodeId}` : "运行已结束")}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-xs text-app-faint">尚未运行</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:block">
                    <FlowStatus workflow={workflow} />
                    <span className="text-[11px] text-app-faint lg:hidden">
                      v{workflow.currentVersion ?? "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 lg:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      label={`${workflow.enabled ? "停用" : "启用"} ${workflow.name}`}
                      icon={
                        workflow.enabled ? (
                          <Pause className="size-3.5" />
                        ) : (
                          <Play className="size-3.5" />
                        )
                      }
                      isDisabled={workflow.currentVersion == null || toggleWorkflow.isPending}
                      onClick={() =>
                        toggleWorkflow.mutate({
                          workflowId: workflow.id,
                          enabled: !workflow.enabled,
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      label="运行"
                      icon={<Play className="size-3.5" />}
                      isDisabled={workflow.currentVersion == null || runWorkflow.isPending}
                      onClick={() => void handleRun(workflow)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      label="归档"
                      icon={
                        archiveWorkflow.isPending ? (
                          <Spinner size="sm" />
                        ) : (
                          <Archive className="size-3.5" />
                        )
                      }
                      onClick={() => setArchiveTarget(workflow)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 px-1 text-[11px] leading-5 text-app-muted">
        <Pause className="mt-0.5 size-3.5 shrink-0" />
        同一工作流同时只运行一次；触发冲突会记录为“已跳过”。运行历史保留 90 天。
      </div>

      <Dialog
        isOpen={archiveTarget != null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        width={440}
      >
        <DialogHeader
          title="归档工作流"
          subtitle="工作流会从列表隐藏，已有运行记录仍会保留到清理期限。"
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
        />
        <div className="p-5">
          <p className="text-sm text-app-ink">{archiveTarget?.name}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              isLoading={archiveWorkflow.isPending}
              onClick={async () => {
                if (!archiveTarget) return;
                try {
                  await archiveWorkflow.mutateAsync(archiveTarget.id);
                  setArchiveTarget(null);
                } catch (error) {
                  setNotice((error as Error).message);
                }
              }}
            >
              确认归档
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
