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
  formatTaskDue,
  formatWorkflowRunTime,
  formatWorkflowSuccessRate,
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
    workflows.data?.items.filter(
      (workflow) => workflow.enabled && !workflow.archivedAt,
    ).length ?? 0;
  const successRate = formatWorkflowSuccessRate(todayRuns.data?.items ?? []);

  return (
    <section
      className="today-execution-section grid items-stretch gap-3 lg:grid-cols-[minmax(0,1.22fr)_minmax(0,.9fr)]"
      aria-label="今日执行"
    >
      <Card className="flex min-h-[270px] flex-col overflow-hidden rounded-[18px] shadow-sm">
        <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
          <div>
            <Heading level={2} className="text-sm font-bold">
              今日行动
            </Heading>
            <Text type="supporting" as="p" className="mt-1 text-[11px]">
              当前用户 Work Task · {local.localDate}
            </Text>
          </div>
          <Link
            to="/home/tasks"
            className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
          >
            全部 <span aria-hidden="true">→</span>
          </Link>
        </header>
        {tasks.isError ? (
          <div className="m-4 flex flex-1 flex-col items-center justify-center rounded-xl bg-destructive/5 p-4 text-center text-xs text-destructive">
            <CircleAlert className="size-5" />
            <strong className="mt-2 text-xs">今日任务加载失败</strong>
            <p className="mt-1 text-[11px] text-app-muted">
              行情与工作流不受影响，可单独重试。
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              label="重试任务"
              onClick={() => void tasks.refetch()}
            />
          </div>
        ) : tasks.isLoading ? (
          <div className="grid gap-2 px-4 pb-4" aria-label="今日任务加载中">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-11 animate-pulse rounded-lg bg-app-surface"
              />
            ))}
          </div>
        ) : orderedTasks.length > 0 ? (
          <div className="grid flex-1 content-start px-4">
            {orderedTasks.map((task) => {
              const due = formatTaskDue(task, new Date(), local.localDate);
              return (
                <Link
                  key={task.id}
                  to="/home/tasks"
                  search={workTaskDetailSearch(task.id)}
                  className="group focus-ring grid min-h-[52px] grid-cols-[44px_minmax(0,1fr)_20px] items-center gap-2 rounded-md border-t border-app-line/70 px-1 py-2 first:border-t-0"
                >
                  <span className="font-mono text-[11px] text-app-ink-secondary">
                    {task.dueTime?.slice(0, 5) ?? "—"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-app-ink transition group-hover:text-primary">
                      {task.title}
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-[11px] ${
                        due.overdue ? "text-destructive" : "text-app-muted"
                      }`}
                    >
                      {WORK_TASK_CATEGORY_LABELS[task.category]} · {due.label}
                    </span>
                  </span>
                  <span
                    className={`grid size-[18px] place-items-center rounded-full ${
                      task.status === "completed"
                        ? "bg-chart-down/10 text-chart-down"
                        : "border border-app-line-strong text-app-muted"
                    }`}
                  >
                    {task.status === "completed" ? (
                      "✓"
                    ) : (
                      <Clock3 className="size-3" />
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="m-4 flex min-h-[132px] flex-1 flex-col items-center justify-center rounded-xl bg-app-surface/55 p-4 text-center text-xs text-app-muted">
            <ListChecks className="size-6 text-primary" />
            <strong className="mt-2 text-xs text-app-ink">今天没有 Work Task</strong>
            <p className="mt-1 max-w-[250px] leading-5">
              创建任务后会在这里按到期时间显示，系统流程不会替代个人行动。
            </p>
          </div>
        )}
      </Card>

      <Card className="flex min-h-[270px] flex-col overflow-hidden rounded-[18px] shadow-sm">
        <header className="flex items-start justify-between gap-3 px-4 pb-0 pt-3.5">
          <div>
            <Heading level={2} className="text-sm font-bold">
              今日工作流
            </Heading>
            <Text type="supporting" as="p" className="mt-1 text-[11px]">
              自动运行与最近状态 · {workflows.isError ? "活跃数不可用" : `${activeWorkflows} 条活跃`}
            </Text>
          </div>
          <Link
            to="/home/workflows"
            className="focus-ring inline-flex items-center gap-1 rounded text-[11px] font-semibold text-primary hover:underline"
          >
            全部流程 <span aria-hidden="true">→</span>
          </Link>
        </header>
        {todayRuns.isError ? (
          <div className="m-4 flex flex-1 flex-col items-center justify-center rounded-xl bg-destructive/5 p-4 text-center text-xs text-destructive">
            <CircleAlert className="size-5" />
            <strong className="mt-2 text-xs">今日工作流加载失败</strong>
            <p className="mt-1 text-[11px] text-app-muted">
              市场与今日行动继续显示，可单独重试。
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              label="重试工作流"
              onClick={() => void todayRuns.refetch()}
            />
          </div>
        ) : (
          <div className="grid gap-2.5 px-4 pb-3.5 pt-3">
            <div className="grid grid-cols-3 gap-1.5" aria-label="工作流今日概况">
              {[
                ["今日运行", `${todayRuns.data?.items.length ?? 0} 次`],
                ["活跃流程", workflows.isError ? "—" : `${activeWorkflows} 条`],
                ["成功率", successRate],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-app-surface/65 px-2.5 py-2">
                  <span className="block text-[10px] text-app-muted">{label}</span>
                  <strong className="mt-1 block font-mono text-sm text-app-ink">
                    {value}
                  </strong>
                </div>
              ))}
            </div>
            {todayRuns.isLoading ? (
              <div className="grid gap-2" aria-label="今日工作流加载中">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-12 animate-pulse rounded-lg bg-app-surface"
                  />
                ))}
              </div>
            ) : runs.length > 0 ? (
              <div className="grid">
                {runs.map((run) => {
                  const status =
                    WORKFLOW_STATUS_META[run.status] ??
                    WORKFLOW_STATUS_META.pending!;
                  return (
                    <Link
                      key={run.id}
                      to="/home/workflows/runs/$runId"
                      params={{ runId: String(run.id) }}
                      className="focus-ring grid min-h-12 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border-t border-app-line/70 py-1.5 first:border-t-0"
                    >
                      <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Workflow className="size-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-app-ink">
                          {run.workflowName}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-app-muted">
                          {formatWorkflowRunTime(run.createdAt, local.timezone)}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[110px] items-center gap-3 rounded-xl bg-app-surface/55 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Workflow className="size-4" />
                </span>
                <div>
                  <strong className="text-xs font-semibold text-app-ink">
                    今天暂无工作流触发
                  </strong>
                  <p className="mt-1 text-[11px] leading-5 text-app-muted">
                    独立接口失败不会影响行情与个人行动。
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
