import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Inbox,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@preline-ui/Button";
import { EmptyState } from "@preline-ui/EmptyState";
import { Skeleton } from "@preline-ui/Skeleton";
import {
  useCreateWorkTask,
  useMoveWorkTask,
  usePatchWorkTask,
  useResetWorkTaskOrder,
  useTransitionWorkTask,
  useWorkTaskDetail,
  useWorkTasks,
  useWorkTaskSummary,
  type CreateWorkTaskInput,
} from "../../../hooks/useWorkTasks";
import {
  WORK_TASK_VIEWS,
  localDateContext,
  type BoardStatus,
  type WorkTaskSourceType,
  type WorkTaskView,
} from "../../../lib/work-tasks";
import { WorkTaskBoard } from "./WorkTaskBoard";
import { WorkTaskDetailPanel } from "./WorkTaskDetailPanel";
import { WorkTaskList } from "./WorkTaskList";

const VIEW_LABEL: Record<WorkTaskView, string> = {
  today: "今日",
  inbox: "收件箱",
  future: "未来",
  all: "全部",
};

type TransitionAction = "start" | "complete" | "reopen" | "cancel" | "restore";

function sourceDraft(
  sourceType: WorkTaskSourceType | undefined,
  sourceId: string | undefined,
): Partial<CreateWorkTaskInput> | null {
  if (!sourceType || !sourceId) return null;
  if (sourceType === "stock") {
    return {
      title: `跟进 ${sourceId} 的研究结论`,
      description: "记录下一步需要验证的判断、数据或执行动作。",
      category: "research",
      sourceType,
      sourceId,
    };
  }
  if (sourceType === "review") {
    return {
      title: `跟进 ${sourceId} 复盘结论`,
      description: "把复盘中的待验证事项转成人工动作。",
      category: "review",
      sourceType,
      sourceId,
    };
  }
  if (sourceType === "screen") {
    return {
      title: `复核选股候选 ${sourceId}`,
      description: "补充候选进入观察或放弃的判断依据。",
      category: "screen",
      sourceType,
      sourceId,
    };
  }
  return {
    title: `跟进 Workflow Run #${sourceId}`,
    description: "检查运行结果并记录需要人工判断的后续动作。",
    category: "follow_up",
    sourceType,
    sourceId,
  };
}

function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-app-line bg-app-panel px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-app-muted">{label}</span>
        <span className="text-app-faint">{icon}</span>
      </div>
      <strong className="mt-2 block font-mono text-[22px] leading-none tracking-[-0.055em] text-app-ink">
        {value}
      </strong>
      <span className="mt-2 block text-[11px] text-app-muted">{note}</span>
    </div>
  );
}

export function WorkTaskPage({
  initialView,
  initialSourceType,
  initialSourceId,
  initialTaskId,
  initialDraft,
}: {
  initialView: WorkTaskView;
  initialSourceType?: WorkTaskSourceType;
  initialSourceId?: string;
  initialTaskId?: number;
  initialDraft?: Partial<CreateWorkTaskInput> | null;
}) {
  const local = useMemo(() => localDateContext(), []);
  const [view, setView] = useState<WorkTaskView>(initialView);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialTaskId ?? null,
  );
  const [creating, setCreating] = useState(
    Boolean(initialSourceType && initialSourceId || initialDraft),
  );
  const [pageError, setPageError] = useState("");
  const summary = useWorkTaskSummary(local.localDate, local.timezone);
  const tasks = useWorkTasks(view, local.localDate, local.timezone);
  const detail = useWorkTaskDetail(selectedId);
  const createTask = useCreateWorkTask();
  const patchTask = usePatchWorkTask();
  const transition = useTransitionWorkTask();
  const move = useMoveWorkTask();
  const reset = useResetWorkTaskOrder();
  const draft = useMemo(
    () =>
      initialDraft ??
      sourceDraft(initialSourceType, initialSourceId),
    [initialDraft, initialSourceId, initialSourceType],
  );

  useEffect(() => {
    if (initialSourceType && initialSourceId) setCreating(true);
  }, [initialSourceId, initialSourceType]);

  const tasksError =
    tasks.error instanceof Error ? tasks.error.message : tasks.error ? "读取失败" : "";
  const detailError =
    detail.error instanceof Error
      ? detail.error.message
      : detail.error
        ? "任务详情读取失败"
        : "";

  const transitionTask = async (id: number, action: TransitionAction) => {
    setPageError("");
    try {
      await transition.mutateAsync({ id, action });
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "状态更新失败");
    }
  };

  const create = async (input: CreateWorkTaskInput) => {
    setPageError("");
    try {
      const result = await createTask.mutateAsync(input);
      setCreating(false);
      if (input.sourceType && !result.sourceResolved) {
        setPageError("来源暂时不可用，任务已保存为普通任务。");
      }
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "创建任务失败");
    }
  };

  const save = async (
    id: number,
    input: Omit<CreateWorkTaskInput, "sourceType" | "sourceId">,
  ) => {
    setPageError("");
    try {
      await patchTask.mutateAsync({ id, patch: input });
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "保存任务失败");
    }
  };

  const moveTask = async (input: {
    id: number;
    targetStatus: BoardStatus;
    beforeId?: number;
    afterId?: number;
  }) => {
    try {
      await move.mutateAsync(input);
    } catch (reason) {
      setPageError(reason instanceof Error ? reason.message : "移动任务失败");
      throw reason;
    }
  };

  const resetOrder = async (status: BoardStatus) => {
    setPageError("");
    try {
      await reset.mutateAsync(status);
    } catch (reason) {
      setPageError(
        reason instanceof Error ? reason.message : "恢复自动排序失败",
      );
    }
  };

  const items = tasks.data?.items ?? [];
  const metrics = summary.data;
  return (
    <div className="flex min-w-0 gap-4 pb-16 lg:pb-8">
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-app-ink">
              <span className="h-px w-4 bg-primary" />
              TASKS · {local.localDate}
            </p>
            <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.05em] text-app-ink md:text-[42px]">
              工作任务
            </h1>
            <p className="mt-2 text-[13px] text-app-muted">
              把研究判断转成今天真正要推进的人工动作
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-app-line bg-app-panel px-3 py-1.5 text-[11px] text-app-muted">
              <span className="size-1.5 rounded-full bg-app-success" />
              今日完成 {metrics?.doneToday ?? "—"} /{" "}
              {(metrics?.doneToday ?? 0) + (metrics?.incompleteToday ?? 0)}
            </span>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => {
                setSelectedId(null);
                setCreating(true);
              }}
            >
              添加任务
            </Button>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric
            label="今日完成"
            value={
              metrics
                ? `${metrics.doneToday} / ${metrics.doneToday + metrics.incompleteToday}`
                : "—"
            }
            note={`完成率 ${metrics?.completionRate ?? 0}%`}
            icon={<ArrowUpRight className="size-3.5" />}
          />
          <Metric
            label="待处理高优先级"
            value={metrics ? `${metrics.highPriority} 项` : "—"}
            note="尚未完成"
            icon={<Bell className="size-3.5" />}
          />
          <Metric
            label="逾期任务"
            value={metrics ? `${metrics.overdue} 项` : "—"}
            note="需要重新安排"
            icon={<CalendarDays className="size-3.5" />}
          />
          <Metric
            label="收件箱"
            value={metrics ? `${metrics.inbox} 项` : "—"}
            note="尚未安排日期"
            icon={<Inbox className="size-3.5" />}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex rounded-[10px] border border-app-line bg-app-panel/80 p-1"
            role="tablist"
            aria-label="工作任务视图"
          >
            {WORK_TASK_VIEWS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                aria-controls="work-task-view"
                className={`focus-ring rounded-lg px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
                  view === item
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-app-ink-secondary hover:bg-primary/5 hover:text-primary"
                }`}
                onClick={() => setView(item)}
              >
                {VIEW_LABEL[item]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-app-muted">
            {view === "today"
              ? "拖动三列可调整状态 · 列内顺序会自动保存"
              : "任务按最近创建时间排列"}
          </p>
        </div>

        {pageError ? (
          <div
            role="alert"
            className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span>{pageError}</span>
            <button
              type="button"
              className="focus-ring rounded px-1.5 py-0.5 text-[11px] hover:bg-destructive/10"
              onClick={() => setPageError("")}
            >
              关闭
            </button>
          </div>
        ) : null}

        <div
          id="work-task-view"
          className="mt-3"
          role="tabpanel"
          aria-label={`${VIEW_LABEL[view]}任务`}
        >
          {tasks.isLoading && !tasks.data ? (
            <div className="grid gap-3 lg:grid-cols-3">
              <Skeleton height={220} />
              <Skeleton height={220} />
              <Skeleton height={220} />
            </div>
          ) : tasksError ? (
            <div className="rounded-xl border border-app-line bg-app-panel p-4">
              <EmptyState title="工作任务读取失败" description={tasksError} />
              <div className="mt-3 flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RefreshCw className="size-3.5" />}
                  onClick={() => void tasks.refetch()}
                >
                  重新加载
                </Button>
              </div>
            </div>
          ) : view === "today" ? (
            <WorkTaskBoard
              items={items}
              localDate={local.localDate}
              onOpen={(id) => {
                setCreating(false);
                setSelectedId(id);
              }}
              onMove={moveTask}
              onTransition={transitionTask}
              onReset={resetOrder}
            />
          ) : (
            <WorkTaskList
              view={view}
              items={items}
              localDate={local.localDate}
              onOpen={(id) => {
                setCreating(false);
                setSelectedId(id);
              }}
              onTransition={transitionTask}
            />
          )}
        </div>
      </div>

      {creating || selectedId ? (
        <WorkTaskDetailPanel
          key={selectedId ?? "new"}
          task={selectedId ? detail.data : null}
          draft={creating ? draft : null}
          localDate={local.localDate}
          error={detailError || pageError}
          isSaving={
            createTask.isPending || patchTask.isPending || transition.isPending
          }
          isLoading={Boolean(selectedId && detail.isLoading && !detail.data)}
          onClose={() => {
            setCreating(false);
            setSelectedId(null);
            setPageError("");
          }}
          onCreate={create}
          onSave={save}
          onTransition={transitionTask}
        />
      ) : null}
    </div>
  );
}
