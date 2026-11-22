import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Clock3, ListChecks, Workflow } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Heading } from "@preline-ui/Heading";
import { Text } from "@preline-ui/Text";
import { useWorkTasks } from "../../../hooks/useWorkTasks";
import {
  useTodayWorkflowRunsQuery,
  useWorkflowsQuery,
} from "../../../hooks/useWorkflows";
import {
  WORK_TASK_CATEGORY_LABELS,
  formatWorkflowRunTime,
  formatTaskDue,
  localDateContext,
  workTaskDetailSearch,
} from "../../../lib/work-tasks";
import { WORKFLOW_STATUS_META } from "../../../lib/workflows";
import {
  latestThreeWorkflowRuns,
  orderTodayWorkTasks,
} from "../../../lib/market-brief";

export function TodayExecutionSection() {
  const local = useMemo(() => localDateContext(), []);
  const tasks = useWorkTasks("today", local.localDate, local.timezone);
  const todayRuns = useTodayWorkflowRunsQuery();
  const workflows = useWorkflowsQuery();
  const orderedTasks = orderTodayWorkTasks(tasks.data?.items ?? []).slice(0, 3);
  const runs = latestThreeWorkflowRuns(todayRuns.data?.items ?? []);
  const activeWorkflows =
    workflows.data?.items.filter((workflow) => workflow.enabled && !workflow.archivedAt)
      .length ?? 0;
  return (
    <section className="today-execution-section grid gap-3 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,.9fr)]" aria-label="今日执行">
      <Card className="overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3">
          <div>
            <Heading level={2} className="text-sm">今日行动</Heading>
            <Text type="supporting" size="sm" as="p" className="mt-0.5">
              当前用户 Work Task · {local.localDate}
            </Text>
          </div>
          <Link to="/home/tasks" className="text-[11px] font-semibold text-primary hover:underline">
            全部 →
          </Link>
        </header>
        {tasks.isError ? (
          <div className="flex items-center justify-between gap-3 p-4 text-xs text-destructive">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-4" />
              今日任务加载失败，行情与工作流不受影响。
            </span>
            <Button
              size="sm"
              variant="secondary"
              label="重试任务"
              onClick={() => void tasks.refetch()}
            />
          </div>
        ) : orderedTasks.length > 0 ? (
          <div className="divide-y divide-app-line/70 px-4">
            {orderedTasks.map((task) => {
              const due = formatTaskDue(task, new Date(), local.localDate);
              return (
                <Link
                  key={task.id}
                  to="/home/tasks"
                  search={workTaskDetailSearch(task.id)}
                  className="grid grid-cols-[48px_minmax(0,1fr)_20px] items-center gap-2 py-3"
                >
                  <span className="font-mono text-[11px] text-app-muted">{task.dueTime?.slice(0, 5) ?? "—"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-app-ink">{task.title}</span>
                    <span className={`mt-0.5 block truncate text-[11px] ${due.overdue ? "text-destructive" : "text-app-muted"}`}>
                      {WORK_TASK_CATEGORY_LABELS[task.category]} · {due.label}
                    </span>
                  </span>
                  <span className={`grid size-5 place-items-center rounded-full ${task.status === "completed" ? "bg-chart-down/10 text-chart-down" : "bg-app-surface text-app-muted"}`}>
                    {task.status === "completed" ? "✓" : <Clock3 className="size-3" />}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 text-xs text-app-muted">
            <ListChecks className="size-5 text-primary" />
            今天没有 Work Task；系统流程不会替代个人行动。
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <header className="flex items-start justify-between gap-3 border-b border-app-line px-4 py-3">
          <div>
            <Heading level={2} className="text-sm">今日工作流</Heading>
            <Text type="supporting" size="sm" as="p" className="mt-0.5">
              自动运行与最近状态 · {activeWorkflows} 条活跃
            </Text>
          </div>
          <Link to="/home/workflows" className="text-[11px] font-semibold text-primary hover:underline">
            全部流程 →
          </Link>
        </header>
        {todayRuns.isError ? (
          <div className="flex items-center justify-between gap-3 p-4 text-xs text-destructive">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-4" />
              今日工作流加载失败，市场与今日行动继续显示。
            </span>
            <Button
              size="sm"
              variant="secondary"
              label="重试工作流"
              onClick={() => void todayRuns.refetch()}
            />
          </div>
        ) : runs.length > 0 ? (
          <div className="divide-y divide-app-line/70 px-4">
            {runs.map((run) => {
              const status = WORKFLOW_STATUS_META[run.status] ?? WORKFLOW_STATUS_META.pending!;
              return (
                <Link
                  key={run.id}
                  to="/home/workflows/runs/$runId"
                  params={{ runId: String(run.id) }}
                  className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 py-3"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Workflow className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-app-ink">{run.workflowName}</span>
                    <span className="mt-0.5 block text-[11px] text-app-muted">
                      {formatWorkflowRunTime(run.createdAt, local.timezone)}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${status.className}`}>{status.label}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 text-xs text-app-muted">
            <Workflow className="size-5 text-primary" />
            今天暂无工作流触发记录。
          </div>
        )}
      </Card>
    </section>
  );
}
