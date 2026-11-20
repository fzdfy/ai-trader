import { useEffect, useState } from "react";
import {
  Check,
  CircleStop,
  ExternalLink,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@preline-ui/Button";
import { DateInput } from "@preline-ui/DateInput";
import { Selector } from "@preline-ui/Selector";
import { Skeleton } from "@preline-ui/Skeleton";
import { TextArea } from "@preline-ui/TextArea";
import { TextInput } from "@preline-ui/TextInput";
import type { CreateWorkTaskInput } from "../../../hooks/useWorkTasks";
import {
  WORK_TASK_CATEGORIES,
  WORK_TASK_CATEGORY_LABELS,
  WORK_TASK_PRIORITIES,
  WORK_TASK_PRIORITY_LABELS,
  WORK_TASK_SOURCE_LABELS,
  WORK_TASK_STATUS_LABELS,
  type WorkTaskCategory,
  type WorkTaskDetail,
  type WorkTaskPriority,
} from "../../../lib/work-tasks";

type TransitionAction = "start" | "complete" | "reopen" | "cancel" | "restore";

export function WorkTaskDetailPanel({
  task,
  draft,
  localDate,
  error,
  isSaving,
  isLoading,
  onClose,
  onCreate,
  onSave,
  onTransition,
}: {
  task?: WorkTaskDetail | null;
  draft?: Partial<CreateWorkTaskInput> | null;
  localDate: string;
  error?: string;
  isSaving: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onCreate: (input: CreateWorkTaskInput) => Promise<void>;
  onSave: (id: number, input: Omit<CreateWorkTaskInput, "sourceType" | "sourceId">) => Promise<void>;
  onTransition: (id: number, action: TransitionAction) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<WorkTaskCategory>("custom");
  const [priority, setPriority] = useState<WorkTaskPriority>("normal");
  const [scheduledDate, setScheduledDate] = useState(localDate);
  const [dueTime, setDueTime] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [completionNote, setCompletionNote] = useState("");

  useEffect(() => {
    const source = task ?? draft;
    setTitle(source?.title ?? "");
    setDescription(source?.description ?? "");
    setCategory(source?.category ?? "custom");
    setPriority(source?.priority ?? "normal");
    setScheduledDate(source?.scheduledDate ?? localDate);
    setDueTime(source?.dueTime?.slice(0, 5) ?? "");
    setBlockedReason(
      task?.blockedReason ??
        ("blockedReason" in (draft ?? {})
          ? (draft?.blockedReason ?? "")
          : ""),
    );
    setCompletionNote(task?.completionNote ?? "");
  }, [draft, localDate, task]);

  const editing = Boolean(task);
  const canEdit =
    !task || !["completed", "canceled"].includes(task.status);
  const textValid = title.trim().length > 0 && title.trim().length <= 120;

  if (isLoading) {
    return (
      <aside
        className="fixed inset-0 z-[70] flex min-h-0 flex-col border-app-line bg-app-panel p-4 shadow-2xl lg:static lg:z-auto lg:max-h-[calc(100vh-8rem)] lg:w-[380px] lg:shrink-0 lg:rounded-xl lg:border"
        aria-label="正在读取任务详情"
      >
        <div className="flex items-center justify-between">
          <Skeleton height={18} width="45%" />
          <button
            type="button"
            className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
            aria-label="关闭任务面板"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5 space-y-3">
          <Skeleton height={34} />
          <Skeleton height={120} />
          <Skeleton height={34} />
          <Skeleton height={34} />
        </div>
      </aside>
    );
  }

  if (!task && error) {
    return (
      <aside
        className="fixed inset-0 z-[70] flex flex-col border-app-line bg-app-panel shadow-2xl lg:static lg:z-auto lg:max-h-[calc(100vh-8rem)] lg:w-[380px] lg:shrink-0 lg:rounded-xl lg:border"
        aria-label="任务详情读取失败"
      >
        <header className="flex items-center justify-between border-b border-app-line px-4 py-3.5">
          <h2 className="text-base font-semibold text-app-ink">任务详情</h2>
          <button
            type="button"
            className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
            aria-label="关闭任务面板"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div>
            <p className="text-sm font-medium text-app-ink">无法读取任务</p>
            <p className="mt-1 text-xs text-destructive">{error}</p>
          </div>
        </div>
      </aside>
    );
  }

  const save = async () => {
    if (!textValid) return;
    const input: CreateWorkTaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      priority,
      scheduledDate: scheduledDate || null,
      dueTime: dueTime || null,
      blockedReason: blockedReason.trim() || null,
      ...(!task && draft?.sourceType && draft.sourceId
        ? { sourceType: draft.sourceType, sourceId: draft.sourceId }
        : {}),
    };
    if (task) {
      await onSave(task.id, input);
    } else {
      await onCreate(input);
    }
  };

  return (
    <aside
      className="fixed inset-0 z-[70] flex min-h-0 flex-col border-app-line bg-app-panel shadow-2xl lg:static lg:z-auto lg:max-h-[calc(100vh-8rem)] lg:w-[380px] lg:shrink-0 lg:rounded-xl lg:border"
      aria-label={editing ? "任务详情" : "新建任务"}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-app-line px-4 py-3.5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-app-muted">
            {editing ? `TASK #${task?.id}` : "NEW TASK"}
          </p>
          <h2 className="mt-1 text-base font-semibold text-app-ink">
            {editing ? "任务详情" : "添加工作任务"}
          </h2>
        </div>
        <button
          type="button"
          className="focus-ring grid size-8 place-items-center rounded-lg text-app-muted hover:bg-app-surface hover:text-app-ink"
          aria-label="关闭任务面板"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </header>

      <form
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {task ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-app-surface px-2.5 py-1 text-[11px] text-app-muted">
              <span
                className={`size-1.5 rounded-full ${
                  task.status === "completed"
                    ? "bg-app-success"
                    : task.status === "in_progress"
                      ? "bg-primary"
                      : "bg-app-warning"
                }`}
              />
              {WORK_TASK_STATUS_LABELS[task.status]}
            </span>
            {task.priority === "high" ? (
              <span className="rounded-full bg-app-warning/10 px-2.5 py-1 text-[11px] text-app-warning">
                高优先级
              </span>
            ) : null}
          </div>
        ) : null}

        <TextInput
          label="标题"
          className="[&_input]:text-base md:[&_input]:text-sm [&_input::placeholder]:text-app-muted"
          value={title}
          onChange={setTitle}
          maxLength={120}
          isRequired
          isDisabled={!canEdit}
          placeholder="下一步要推进什么？"
        />
        <TextArea
          label="说明"
          className="[&_textarea]:text-base md:[&_textarea]:text-sm [&_textarea::placeholder]:text-app-muted"
          value={description}
          onChange={setDescription}
          maxLength={4000}
          isDisabled={!canEdit}
          placeholder="补充判断依据、完成条件或待验证问题。"
        />
        <div className="grid grid-cols-2 gap-3">
          <Selector
            label="分类"
            className="[&_select]:text-base md:[&_select]:text-sm"
            value={category}
            onChange={(value) => setCategory(value as WorkTaskCategory)}
            options={WORK_TASK_CATEGORIES.map((value) => ({
              value,
              label: WORK_TASK_CATEGORY_LABELS[value],
            }))}
            isDisabled={!canEdit}
          />
          <Selector
            label="优先级"
            className="[&_select]:text-base md:[&_select]:text-sm"
            value={priority}
            onChange={(value) => setPriority(value as WorkTaskPriority)}
            options={WORK_TASK_PRIORITIES.map((value) => ({
              value,
              label: WORK_TASK_PRIORITY_LABELS[value],
            }))}
            isDisabled={!canEdit}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateInput
            label="计划日期"
            className="[&_input]:text-base md:[&_input]:text-sm [&_input::placeholder]:text-app-muted"
            value={scheduledDate}
            onChange={setScheduledDate}
            isDisabled={!canEdit}
          />
          <TextInput
            label="截止时间"
            className="[&_input]:text-base md:[&_input]:text-sm [&_input::placeholder]:text-app-muted"
            type="time"
            value={dueTime}
            onChange={setDueTime}
            isDisabled={!canEdit}
          />
        </div>

        {task?.status === "in_progress" || blockedReason ? (
          <TextInput
            label="阻塞原因"
            className="[&_input]:text-base md:[&_input]:text-sm [&_input::placeholder]:text-app-muted"
            value={blockedReason}
            onChange={setBlockedReason}
            maxLength={500}
            isDisabled={!canEdit}
            placeholder="等待哪个输入或上游结果？"
          />
        ) : null}
        {task?.status === "completed" ? (
          <TextArea
            label="完成说明"
            className="[&_textarea]:text-base md:[&_textarea]:text-sm [&_textarea::placeholder]:text-app-muted"
            value={completionNote}
            onChange={setCompletionNote}
            maxLength={2000}
            isDisabled
          />
        ) : null}

        {task?.sourceType ? (
          <section className="rounded-xl border border-app-line bg-app-surface/45 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted">
              来源快照
            </p>
            <p className="mt-2 text-xs font-medium text-app-ink">
              {String(task.contextJson.title ?? WORK_TASK_SOURCE_LABELS[task.sourceType])}
            </p>
            <p className="mt-1 text-[11px] text-app-muted">
              {String(task.contextJson.subtitle ?? task.sourceId ?? "")}
            </p>
            {typeof task.contextJson.url === "string" ? (
              <a
                href={task.contextJson.url}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                打开来源
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </section>
        ) : null}

        {task?.events.length ? (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted">
              状态记录
            </p>
            <div className="mt-2 space-y-2">
              {task.events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-3 border-b border-app-line/70 pb-2 text-[11px] last:border-0"
                >
                  <span className="text-app-ink">{event.eventType}</span>
                  <time className="text-app-muted">
                    {new Intl.DateTimeFormat("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(event.createdAt))}
                  </time>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      <footer className="shrink-0 border-t border-app-line bg-app-panel px-4 py-3">
        {task ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {task.status === "pending" ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Play className="size-3.5" />}
                onClick={() => void onTransition(task.id, "start")}
              >
                开始
              </Button>
            ) : null}
            {task.status !== "completed" && task.status !== "canceled" ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check className="size-3.5" />}
                  onClick={() => void onTransition(task.id, "complete")}
                >
                  完成
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CircleStop className="size-3.5" />}
                  onClick={() => void onTransition(task.id, "cancel")}
                >
                  取消
                </Button>
              </>
            ) : null}
            {task.status === "completed" ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => void onTransition(task.id, "reopen")}
              >
                重新打开
              </Button>
            ) : null}
            {task.status === "canceled" ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="size-3.5" />}
                onClick={() => void onTransition(task.id, "restore")}
              >
                恢复任务
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            关闭
          </Button>
          <Button
            size="sm"
            variant="primary"
            isLoading={isSaving}
            isDisabled={!canEdit || !textValid}
            onClick={() => void save()}
          >
            {editing ? "保存修改" : "创建任务"}
          </Button>
        </div>
      </footer>
    </aside>
  );
}
