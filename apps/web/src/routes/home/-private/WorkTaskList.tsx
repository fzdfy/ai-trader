import { Check, ChevronRight, RotateCcw } from "lucide-react";
import {
  WORK_TASK_CATEGORY_LABELS,
  WORK_TASK_SOURCE_LABELS,
  WORK_TASK_STATUS_LABELS,
  formatTaskDue,
  type UserWorkTask,
  type WorkTaskView,
} from "../../../lib/work-tasks";

const VIEW_TITLE: Record<Exclude<WorkTaskView, "today">, string> = {
  inbox: "尚未安排日期的任务",
  future: "未来的计划",
  all: "全部任务",
};

export function WorkTaskList({
  view,
  items,
  localDate,
  onOpen,
  onTransition,
}: {
  view: Exclude<WorkTaskView, "today">;
  items: UserWorkTask[];
  localDate: string;
  onOpen: (id: number) => void;
  onTransition: (
    id: number,
    action: "start" | "complete" | "reopen" | "cancel" | "restore",
  ) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-app-line bg-app-panel">
      <header className="flex items-center justify-between gap-3 border-b border-app-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-app-ink">
            {VIEW_TITLE[view]}
          </h2>
          <p className="mt-1 text-[11px] text-app-muted">
            {items.length} 项 · 按最近更新排序
          </p>
        </div>
      </header>
      {items.length === 0 ? (
        <div className="grid min-h-52 place-items-center px-6 text-center">
          <div>
            <p className="text-sm font-medium text-app-ink">这里还没有任务</p>
            <p className="mt-1 text-xs text-app-muted">
              {view === "inbox"
                ? "未设置计划日期的任务会自动进入收件箱。"
                : view === "future"
                  ? "把任务安排到明天或更晚，就会出现在这里。"
                  : "从今日看板创建一个任务后，它会出现在这里。"}
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-app-line">
          {items.map((task) => {
            const due = formatTaskDue(task, new Date(), localDate);
            return (
              <article
                key={task.id}
                className="group grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors hover:bg-app-surface/60"
              >
                <button
                  type="button"
                  className="focus-ring min-w-0 rounded-md text-left"
                  onClick={() => onOpen(task.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        task.status === "completed"
                          ? "bg-app-success"
                          : task.status === "canceled"
                            ? "bg-app-faint"
                            : task.status === "in_progress"
                              ? "bg-primary"
                              : "bg-app-warning"
                      }`}
                    />
                    <strong className="truncate text-xs font-medium text-app-ink">
                      {task.title}
                    </strong>
                    <span className="rounded-full bg-app-surface px-1.5 py-0.5 text-[11px] text-app-muted">
                      {WORK_TASK_STATUS_LABELS[task.status]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-app-muted">
                    <span>{WORK_TASK_CATEGORY_LABELS[task.category]}</span>
                    <span>{due.label}</span>
                    {task.sourceType ? (
                      <span>
                        {WORK_TASK_SOURCE_LABELS[task.sourceType]} ·{" "}
                        {String(
                          task.contextJson.title ??
                            task.contextJson.subtitle ??
                            task.sourceId,
                        )}
                      </span>
                    ) : null}
                    {task.blockedReason ? (
                      <span className="text-app-warning">
                        阻塞 · {task.blockedReason}
                      </span>
                    ) : null}
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  {task.status === "pending" ? (
                    <button
                      type="button"
                      className="focus-ring rounded-md border border-app-line px-2 py-1 text-[11px] text-app-muted hover:text-primary"
                      onClick={() => void onTransition(task.id, "start")}
                    >
                      开始
                    </button>
                  ) : null}
                  {task.status === "pending" ||
                  task.status === "in_progress" ? (
                    <button
                      type="button"
                      className="focus-ring grid size-7 place-items-center rounded-full border border-app-line text-app-faint hover:text-app-success"
                      aria-label={`完成「${task.title}」`}
                      onClick={() => void onTransition(task.id, "complete")}
                    >
                      <Check className="size-3.5" />
                    </button>
                  ) : null}
                  {task.status === "completed" || task.status === "canceled" ? (
                    <button
                      type="button"
                      className="focus-ring grid size-7 place-items-center rounded-full border border-app-line text-app-faint hover:text-primary"
                      aria-label={`恢复「${task.title}」`}
                      onClick={() =>
                        void onTransition(
                          task.id,
                          task.status === "completed" ? "reopen" : "restore",
                        )
                      }
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="focus-ring grid size-7 place-items-center rounded-md text-app-faint hover:bg-app-surface hover:text-app-ink"
                    aria-label={`查看「${task.title}」详情`}
                    onClick={() => onOpen(task.id)}
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
