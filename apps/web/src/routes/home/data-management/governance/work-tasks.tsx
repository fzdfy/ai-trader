import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleStop, ListChecks, Play } from "lucide-react";
import { Button } from "@preline-ui/Button";
import { Card } from "@preline-ui/Card";
import { Dialog, DialogHeader } from "@preline-ui/Dialog";
import { EmptyState } from "@preline-ui/EmptyState";
import { Selector } from "@preline-ui/Selector";
import { Skeleton } from "@preline-ui/Skeleton";
import { Switch } from "@preline-ui/Switch";
import { Table, proportional } from "@preline-ui/Table";
import { TextArea } from "@preline-ui/TextArea";
import { TextInput } from "@preline-ui/TextInput";
import {
  useGovernanceTask,
  useGovernanceTasks,
  useTransitionGovernanceTask,
  type GovernanceTask,
} from "../../../../hooks/useDataGovernance";
import { GovernanceSectionNav } from "./-private/GovernanceSectionNav";
import { GovernanceStatusBadge } from "./-private/GovernanceStatusBadge";
import { formatGovernanceDate, taskStatusMeta } from "./-private/governance-ui";

export const Route = createFileRoute(
  "/home/data-management/governance/work-tasks",
)({
  component: GovernanceWorkTasksPage,
});

type TaskRow = GovernanceTask & Record<string, unknown>;
type TaskAction = "start" | "complete" | "cancel";

const TASK_COLUMNS = [
  {
    key: "title",
    header: "任务",
    width: proportional(1.7),
    renderCell: (row: TaskRow) => (
      <div>
        <p className="text-xs font-medium text-app-ink">{row.title}</p>
        <p className="mt-0.5 text-[11px] text-app-muted">
          {row.taskType} · {row.ownerRole}
        </p>
      </div>
    ),
  },
  {
    key: "status",
    header: "状态",
    width: proportional(0.6),
    renderCell: (row: TaskRow) => {
      const status = taskStatusMeta(row.status);
      return <GovernanceStatusBadge label={status.label} tone={status.tone} />;
    },
  },
  {
    key: "priority",
    header: "优先级",
    width: proportional(0.55),
    renderCell: (row: TaskRow) => (
      <GovernanceStatusBadge
        label={row.priority}
        tone={
          row.priority === "critical"
            ? "error"
            : row.priority === "high"
              ? "warning"
              : "neutral"
        }
      />
    ),
  },
  {
    key: "related",
    header: "关联",
    width: proportional(1.2),
    renderCell: (row: TaskRow) => (
      <span className="break-all font-mono text-[11px] text-app-muted">
        {row.relatedType ?? "—"} · {row.relatedId ?? "—"}
      </span>
    ),
  },
  {
    key: "createdAt",
    header: "创建时间",
    width: proportional(0.8),
    renderCell: (row: TaskRow) => formatGovernanceDate(row.createdAt),
  },
];

function GovernanceWorkTasksPage() {
  const [status, setStatus] = useState("");
  const tasks = useGovernanceTasks({ status });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useGovernanceTask(selectedId);
  const transition = useTransitionGovernanceTask();
  const [action, setAction] = useState<TaskAction | null>(null);
  const [reason, setReason] = useState("");
  const [requiresCodeChange, setRequiresCodeChange] = useState(false);
  const [openspecChange, setOpenspecChange] = useState("");

  const openAction = (next: TaskAction) => {
    setReason("");
    setRequiresCodeChange(false);
    setOpenspecChange("");
    setAction(next);
  };

  const submitAction = async () => {
    if (!selectedId || !action || !reason.trim()) return;
    if (requiresCodeChange && !openspecChange.trim()) return;
    await transition.mutateAsync({
      id: selectedId,
      action,
      reason: reason.trim(),
      ...(action === "complete"
        ? {
            result: {
              note: reason.trim(),
              requiresCodeChange,
              ...(requiresCodeChange
                ? { openspecChange: openspecChange.trim() }
                : {}),
            },
          }
        : {}),
    });
    setAction(null);
    setReason("");
    setRequiresCodeChange(false);
    setOpenspecChange("");
  };

  if (tasks.isLoading && !tasks.data) {
    return (
      <div className="space-y-3">
        <Skeleton height={40} />
        <Skeleton height={360} />
      </div>
    );
  }
  if (tasks.error) {
    return (
      <Card padding={6}>
        <EmptyState title="治理任务读取失败" description={tasks.error.message} />
        <div className="flex justify-center">
          <Button size="sm" onClick={() => void tasks.refetch()}>
            重新读取
          </Button>
        </div>
      </Card>
    );
  }

  const items = (tasks.data ?? []) as TaskRow[];
  const task = detail.data;
  return (
    <div className="flex flex-col gap-4">
      <GovernanceSectionNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">治理任务</h2>
          <p className="mt-1 text-xs text-app-muted">
            保留创建上下文、状态事件和处理结论；破坏性变更必须转入 OpenSpec。
          </p>
        </div>
        <Selector
          label="状态"
          aria-label="筛选治理任务状态"
          width={160}
          value={status}
          onChange={setStatus}
          placeholder="全部状态"
          options={[
            { value: "pending", label: "待处理" },
            { value: "in_progress", label: "处理中" },
            { value: "completed", label: "已完成" },
            { value: "canceled", label: "已取消" },
          ]}
        />
      </div>

      {items.length === 0 ? (
        <Card padding={4}>
          <EmptyState
            title="没有匹配的治理任务"
            description="来源标准变化会自动创建待审阅任务。"
          />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-app-line bg-app-panel">
          <Table<TaskRow>
            idKey="id"
            columns={TASK_COLUMNS as never}
            data={items}
            density="compact"
            dividers="rows"
            hasHover
          />
          <div className="flex flex-wrap gap-2 border-t border-app-line p-3">
            {items.slice(0, 8).map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={selectedId === item.id ? "primary" : "secondary"}
                onClick={() => setSelectedId(item.id)}
              >
                #{item.id} {taskStatusMeta(item.status).label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {selectedId ? (
        <Card padding={5}>
          {detail.isLoading && !task ? <Skeleton height={220} /> : null}
          {detail.error ? (
            <EmptyState title="任务详情读取失败" description={detail.error.message} />
          ) : null}
          {task ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-app-ink">{task.title}</h3>
                    <GovernanceStatusBadge
                      label={taskStatusMeta(task.status).label}
                      tone={taskStatusMeta(task.status).tone}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-app-muted">
                    #{task.id} · {task.ownerRole} · 创建于 {formatGovernanceDate(task.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {task.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Play className="size-3.5" />}
                      onClick={() => openAction("start")}
                    >
                      开始
                    </Button>
                  ) : null}
                  {task.status === "in_progress" ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<CheckCircle2 className="size-3.5" />}
                      onClick={() => openAction("complete")}
                    >
                      完成
                    </Button>
                  ) : null}
                  {task.status === "pending" || task.status === "in_progress" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<CircleStop className="size-3.5" />}
                      onClick={() => openAction("cancel")}
                    >
                      取消
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-[11px] text-app-muted">创建上下文</p>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-app-surface/60 p-3 font-mono text-[11px] leading-5 text-app-ink">
                    {JSON.stringify(task.payloadJson, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[11px] text-app-muted">处理结果</p>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-app-surface/60 p-3 font-mono text-[11px] leading-5 text-app-ink">
                    {JSON.stringify(task.resultJson ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-app-muted">状态事件</p>
                <div className="mt-2 space-y-2">
                  {task.events.map((event) => (
                    <div
                      key={String(event.id)}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-app-line pb-2 text-[11px] last:border-0"
                    >
                      <span className="text-app-ink">{String(event.eventType)}</span>
                      <span className="text-app-muted">
                        {formatGovernanceDate(String(event.createdAt))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card padding={4} className="border-dashed">
          <div className="flex items-center justify-center gap-2 text-xs text-app-muted">
            <ListChecks className="size-4" />
            选择任务查看上下文并执行状态流转
          </div>
        </Card>
      )}

      <Dialog isOpen={action !== null} onOpenChange={() => setAction(null)} width={480}>
        <DialogHeader
          title={
            action === "start"
              ? "开始治理任务"
              : action === "complete"
                ? "完成治理任务"
                : "取消治理任务"
          }
          subtitle="操作原因会写入任务事件和管理审计。"
          onOpenChange={() => setAction(null)}
        />
        <div className="space-y-4 p-5">
          <TextArea
            label="操作原因"
            value={reason}
            onChange={setReason}
            placeholder={
              action === "complete"
                ? "说明评审结论、兼容性或后续 OpenSpec"
                : "说明本次状态变化原因"
            }
            maxLength={500}
          />
          {action === "complete" ? (
            <Switch
              label="需要生产代码变更"
              description="开启后必须关联独立 OpenSpec change。"
              value={requiresCodeChange}
              onChange={setRequiresCodeChange}
              labelSpacing="spread"
            />
          ) : null}
          {action === "complete" && requiresCodeChange ? (
            <TextInput
              label="OpenSpec change"
              value={openspecChange}
              onChange={setOpenspecChange}
              placeholder="例如 add-data-governance-baseline"
              isRequired
            />
          ) : null}
          {transition.error ? (
            <p className="text-xs text-destructive">{transition.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAction(null)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              isLoading={transition.isPending}
              isDisabled={
                !reason.trim() ||
                (requiresCodeChange && !openspecChange.trim())
              }
              onClick={() => void submitAction()}
            >
              确认
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
