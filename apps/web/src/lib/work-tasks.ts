export const WORK_TASK_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "canceled",
] as const;
export const BOARD_STATUSES = ["pending", "in_progress", "completed"] as const;
export const WORK_TASK_CATEGORIES = [
  "research",
  "review",
  "screen",
  "strategy",
  "follow_up",
  "custom",
] as const;
export const WORK_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const WORK_TASK_SOURCE_TYPES = [
  "stock",
  "review",
  "screen",
  "workflow_run",
] as const;
export const WORK_TASK_VIEWS = ["today", "inbox", "future", "all"] as const;

export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export type WorkTaskCategory = (typeof WORK_TASK_CATEGORIES)[number];
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number];
export type WorkTaskSourceType = (typeof WORK_TASK_SOURCE_TYPES)[number];
export type WorkTaskView = (typeof WORK_TASK_VIEWS)[number];

export type WorkTaskContext = {
  title?: string;
  subtitle?: string;
  url?: string;
  [key: string]: unknown;
};

export type UserWorkTask = {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  category: WorkTaskCategory;
  priority: WorkTaskPriority;
  status: WorkTaskStatus;
  scheduledDate: string | null;
  dueTime: string | null;
  sortOrder: number;
  blockedReason: string | null;
  completionNote: string | null;
  sourceType: WorkTaskSourceType | null;
  sourceId: string | null;
  contextJson: WorkTaskContext;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
};

export type WorkTaskEvent = {
  id: number;
  taskId: number;
  actorUserId: string;
  eventType:
    | "created"
    | "started"
    | "completed"
    | "reopened"
    | "canceled"
    | "restored";
  message: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
};

export type WorkTaskDetail = UserWorkTask & { events: WorkTaskEvent[] };

export type WorkTaskSummary = {
  doneToday: number;
  incompleteToday: number;
  highPriority: number;
  overdue: number;
  inbox: number;
  completionRate: number;
};

export function localDateContext(
  now = new Date(),
  requestedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): { localDate: string; timezone: string } {
  let timezone = requestedTimezone || "Asia/Shanghai";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    timezone = "Asia/Shanghai";
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  }
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    localDate: `${values.year}-${values.month}-${values.day}`,
    timezone,
  };
}

export function groupTodayTasks(
  items: UserWorkTask[],
): Record<BoardStatus, UserWorkTask[]> {
  const grouped: Record<BoardStatus, UserWorkTask[]> = {
    pending: [],
    in_progress: [],
    completed: [],
  };
  for (const item of items) {
    if (item.status !== "canceled") grouped[item.status].push(item);
  }
  return grouped;
}

function dateDistance(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function shortTime(value: string): string {
  return value.slice(0, 5);
}

export function formatTaskDue(
  task: UserWorkTask,
  now: Date,
  localDate: string,
): { label: string; overdue: boolean } {
  if (task.status === "completed" && task.completedAt) {
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(task.completedAt));
    return { label: `完成于 ${time}`, overdue: false };
  }
  if (!task.scheduledDate) {
    return {
      label: task.dueTime ? `截止 ${shortTime(task.dueTime)}` : "收件箱",
      overdue: false,
    };
  }
  const overdueDays = dateDistance(task.scheduledDate, localDate);
  if (task.scheduledDate < localDate) {
    return { label: `逾期 ${overdueDays} 天`, overdue: true };
  }
  if (task.scheduledDate === localDate) {
    return {
      label: task.dueTime ? `今天 ${shortTime(task.dueTime)}` : "今天",
      overdue: false,
    };
  }
  const date = new Date(`${task.scheduledDate}T00:00:00`);
  const day = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(date);
  return {
    label: task.dueTime ? `${day} ${shortTime(task.dueTime)}` : day,
    overdue: false,
  };
}

export const WORK_TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  canceled: "已取消",
};

export const WORK_TASK_CATEGORY_LABELS: Record<WorkTaskCategory, string> = {
  research: "研究",
  review: "复盘",
  screen: "选股",
  strategy: "策略",
  follow_up: "跟进",
  custom: "自定义",
};

export const WORK_TASK_PRIORITY_LABELS: Record<WorkTaskPriority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
};

export const WORK_TASK_SOURCE_LABELS: Record<WorkTaskSourceType, string> = {
  stock: "个股",
  review: "每日复盘",
  screen: "每日选股",
  workflow_run: "Workflow Run",
};

export function workTaskDetailSearch(taskId: number): { task: number } {
  return { task: taskId };
}

export function formatWorkflowRunTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5, 16).replace("T", " ");
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatWorkflowSuccessRate(
  runs: readonly { status: string }[],
): string {
  const terminal = runs.filter((run) =>
    ["success", "failed", "canceled", "skipped"].includes(run.status),
  );
  if (terminal.length === 0) return "—";
  const succeeded = terminal.filter((run) => run.status === "success").length;
  return `${Math.round((succeeded / terminal.length) * 100)}%`;
}
