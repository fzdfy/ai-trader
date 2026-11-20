import { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarClock,
  Check,
  ChevronRight,
  GripVertical,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@preline-ui/Button";
import {
  BOARD_STATUSES,
  WORK_TASK_CATEGORY_LABELS,
  formatTaskDue,
  groupTodayTasks,
  type BoardStatus,
  type UserWorkTask,
} from "../../../lib/work-tasks";

type TransitionAction = "start" | "complete" | "reopen" | "cancel" | "restore";

interface WorkTaskBoardProps {
  items: UserWorkTask[];
  localDate: string;
  onOpen: (id: number) => void;
  onMove: (input: {
    id: number;
    targetStatus: BoardStatus;
    beforeId?: number;
    afterId?: number;
  }) => Promise<void>;
  onTransition: (id: number, action: TransitionAction) => Promise<void>;
  onReset: (status: BoardStatus) => Promise<void>;
}

const COLUMN_LABEL: Record<BoardStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
};

function TaskCard({
  task,
  localDate,
  onOpen,
  onTransition,
}: {
  task: UserWorkTask;
  localDate: string;
  onOpen: (id: number) => void;
  onTransition: (id: number, action: TransitionAction) => Promise<void>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { status: task.status } });
  const due = formatTaskDue(task, new Date(), localDate);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group rounded-[11px] border border-app-line bg-app-panel p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] motion-reduce:transition-none ${
        isDragging ? "dragged z-20 opacity-60 shadow-xl" : ""
      }`}
      data-status={task.status}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-app-muted">
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              task.priority === "high"
                ? "bg-app-warning"
                : task.status === "completed"
                  ? "bg-app-success"
                  : "bg-primary"
            }`}
          />
          <span className="truncate">
            {WORK_TASK_CATEGORY_LABELS[task.category]}
            {task.priority === "high" ? " · 高优先级" : ""}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="focus-ring grid size-6 cursor-grab place-items-center rounded-md text-app-faint hover:bg-app-surface hover:text-app-muted active:cursor-grabbing"
            aria-label={`拖动「${task.title}」`}
            aria-describedby="task-drag-instructions"
          >
            <GripVertical className="size-3.5" />
          </button>
          <button
            type="button"
            className="focus-ring grid size-6 place-items-center rounded-md text-app-faint hover:bg-app-surface hover:text-app-ink"
            aria-label={`查看「${task.title}」详情`}
            onClick={() => onOpen(task.id)}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
      <button
        type="button"
        className="focus-ring mt-2 block w-full rounded-md text-left"
        onClick={() => onOpen(task.id)}
      >
        <strong className="block text-[13px] leading-5 text-app-ink">
          {task.title}
        </strong>
        {task.description ? (
          <span className="mt-1 line-clamp-2 block text-[11px] leading-[1.55] text-app-ink-secondary">
            {task.description}
          </span>
        ) : null}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {task.blockedReason ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-app-warning/10 px-1.5 py-1 text-[11px] text-app-warning">
            <CalendarClock className="size-3 shrink-0" />
            <span className="truncate">{task.blockedReason}</span>
          </span>
        ) : null}
        {task.sourceType ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-app-surface px-1.5 py-1 text-[11px] text-app-muted">
            <span className="size-1.5 rounded-full bg-app-faint" />
            <span className="truncate">
              {task.contextJson.subtitle ??
                task.contextJson.title ??
                task.sourceType}
            </span>
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-app-line/70 pt-2">
        <span
          className={`text-[11px] ${due.overdue ? "text-destructive" : "text-app-muted"}`}
        >
          {due.label}
        </span>
        <div className="flex items-center gap-1">
          {task.status === "pending" ? (
            <button
              type="button"
              className="focus-ring rounded-md border border-app-line px-2 py-1 text-[11px] text-app-muted hover:border-primary/30 hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                void onTransition(task.id, "start");
              }}
            >
              开始
            </button>
          ) : null}
          {task.status !== "completed" ? (
            <button
              type="button"
              className="focus-ring grid size-6 place-items-center rounded-full border border-app-line text-app-faint hover:border-app-success/40 hover:text-app-success"
              aria-label={`完成「${task.title}」`}
              onClick={(event) => {
                event.stopPropagation();
                void onTransition(task.id, "complete");
              }}
            >
              <Check className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className="focus-ring rounded-md border border-app-line px-2 py-1 text-[11px] text-app-muted hover:border-primary/30 hover:text-primary"
              onClick={(event) => {
                event.stopPropagation();
                void onTransition(task.id, "reopen");
              }}
            >
              重新打开
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function BoardColumn({
  status,
  tasks,
  localDate,
  onOpen,
  onTransition,
  onReset,
}: {
  status: BoardStatus;
  tasks: UserWorkTask[];
  localDate: string;
  onOpen: (id: number) => void;
  onTransition: (id: number, action: TransitionAction) => Promise<void>;
  onReset: (status: BoardStatus) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  return (
    <section
      ref={setNodeRef}
      className={`min-h-[410px] rounded-lg border border-transparent transition-colors motion-reduce:transition-none ${
        isOver ? "border-primary/25 bg-primary/5" : ""
      }`}
      aria-label={`${COLUMN_LABEL[status]}任务`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-app-ink">
            {COLUMN_LABEL[status]}
          </h3>
          <span className="rounded-full bg-app-surface px-1.5 py-0.5 font-mono text-[11px] text-app-muted">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          className="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-app-muted hover:bg-app-panel hover:text-primary"
          onClick={() => void onReset(status)}
        >
          <RotateCcw className="size-2.5" />
          恢复自动排序
        </button>
      </div>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              localDate={localDate}
              onOpen={onOpen}
              onTransition={onTransition}
            />
          ))}
          {tasks.length === 0 ? (
            <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-app-line text-center">
              <div>
                <Play className="mx-auto size-4 text-app-faint" />
                <p className="mt-2 text-[11px] text-app-muted">
                  拖动任务到这里
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

export function WorkTaskBoard({
  items,
  localDate,
  onOpen,
  onMove,
  onTransition,
  onReset,
}: WorkTaskBoardProps) {
  const [optimisticItems, setOptimisticItems] = useState(items);
  const [moveError, setMoveError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setOptimisticItems(items);
  }, [items]);

  const grouped = groupTodayTasks(optimisticItems);
  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const id = Number(active.id);
    const current = optimisticItems.find((task) => task.id === id);
    if (!current) return;
    const overId = String(over.id);
    const overTask = optimisticItems.find(
      (task) => task.id === Number(over.id),
    );
    const targetStatus: BoardStatus = overId.startsWith("column:")
      ? (overId.slice("column:".length) as BoardStatus)
      : ((overTask?.status ?? current.status) as BoardStatus);
    if (!BOARD_STATUSES.includes(targetStatus)) return;
    if (
      current.status === targetStatus &&
      (overId === `column:${targetStatus}` || id === Number(over.id))
    ) {
      return;
    }

    const snapshot = optimisticItems;
    const targetTasks = snapshot
      .filter(
        (task) =>
          task.id !== id &&
          task.status === targetStatus,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const overIndex = targetTasks.findIndex((task) => task.id === Number(over.id));
    const insertIndex = overIndex >= 0 ? overIndex : targetTasks.length;
    const beforeId = targetTasks[insertIndex]?.id;
    const afterId = targetTasks[insertIndex - 1]?.id;
    const moved = {
      ...current,
      status: targetStatus,
      completedAt:
        targetStatus === "completed"
          ? (current.completedAt ?? new Date().toISOString())
          : null,
    };
    targetTasks.splice(insertIndex, 0, moved);
    const next = snapshot
      .filter((task) => task.id !== id)
      .map((task) => {
        if (task.status !== targetStatus) return task;
        const order = targetTasks.findIndex((item) => item.id === task.id);
        return order >= 0 ? { ...task, sortOrder: order * 100 } : task;
      });
    next.push({
      ...moved,
      sortOrder: targetTasks.findIndex((item) => item.id === id) * 100,
    });
    setOptimisticItems(next);
    setMoveError("");
    try {
      await onMove({ id, targetStatus, beforeId, afterId });
    } catch (reason) {
      setOptimisticItems(snapshot);
      setMoveError(
        reason instanceof Error ? reason.message : "任务移动失败，已恢复原顺序",
      );
    }
  };

  return (
    <div>
      <p id="task-drag-instructions" className="sr-only">
        聚焦拖拽手柄后按空格进入拖拽，使用方向键移动，按空格落位，按 Escape 取消。
      </p>
      {moveError ? (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{moveError}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMoveError("");
              setOptimisticItems(items);
            }}
          >
            知道了
          </Button>
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {BOARD_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={grouped[status]}
              localDate={localDate}
              onOpen={onOpen}
              onTransition={onTransition}
              onReset={onReset}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
