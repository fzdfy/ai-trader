import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "../../db";
import {
  userWorkTask,
  userWorkTaskEvent,
  type WorkTaskContext,
} from "../../db/schema";
import type {
  BoardStatus,
  CreateUserWorkTaskInput,
  ListUserWorkTasksInput,
  MoveUserWorkTaskInput,
  PatchUserWorkTaskInput,
  TransitionUserWorkTaskInput,
  WorkTaskSourceType,
} from "./contracts";

type UserWorkTaskRow = typeof userWorkTask.$inferSelect;
type UserWorkTaskEventRow = typeof userWorkTaskEvent.$inferSelect;

export type UserWorkTask = UserWorkTaskRow;
export type UserWorkTaskDetail = UserWorkTaskRow & {
  events: UserWorkTaskEventRow[];
};

export type WorkTaskSummary = {
  doneToday: number;
  incompleteToday: number;
  highPriority: number;
  overdue: number;
  inbox: number;
  completionRate: number;
};

export type ResolvedWorkTaskSource = {
  sourceType: WorkTaskSourceType;
  sourceId: string;
  contextJson: WorkTaskContext;
};

export class WorkTaskNotFoundError extends Error {
  constructor() {
    super("工作任务不存在");
  }
}

export class WorkTaskStateError extends Error {}

const EVENT_BY_STATUS = {
  pending: "reopened",
  in_progress: "started",
  completed: "completed",
} as const;

const TRANSITIONS = {
  start: {
    from: ["pending"],
    to: "in_progress",
    eventType: "started",
  },
  complete: {
    from: ["pending", "in_progress"],
    to: "completed",
    eventType: "completed",
  },
  reopen: {
    from: ["completed"],
    to: "pending",
    eventType: "reopened",
  },
  cancel: {
    from: ["pending", "in_progress"],
    to: "canceled",
    eventType: "canceled",
  },
  restore: {
    from: ["canceled"],
    to: "pending",
    eventType: "restored",
  },
} as const;

function notFound(): never {
  throw new WorkTaskNotFoundError();
}

function priorityRank(priority: string): number {
  if (priority === "high") return 3;
  if (priority === "normal") return 2;
  return 1;
}

function dueTimeRank(value: string | null): string {
  return value ?? "99:99";
}

function todayCompletedCondition(timezone: string, localDate: string): SQL {
  return sql`timezone(${timezone}, ${userWorkTask.completedAt})::date = ${localDate}::date`;
}

async function nextSortOrder(
  executor: Pick<typeof db, "select">,
  userId: string,
  status: BoardStatus,
): Promise<number> {
  const [row] = await executor
    .select({
      value: sql<number>`coalesce(max(${userWorkTask.sortOrder}), -100)`,
    })
    .from(userWorkTask)
    .where(
      and(
        eq(userWorkTask.userId, userId),
        eq(userWorkTask.status, status),
      ),
    );
  return Number(row?.value ?? -100) + 100;
}

export async function listUserWorkTasks(
  input: ListUserWorkTasksInput,
): Promise<{ items: UserWorkTask[]; nextCursor: number | null }> {
  const conditions: SQL[] = [eq(userWorkTask.userId, input.userId)];
  if (input.status) {
    conditions.push(eq(userWorkTask.status, input.status));
  }
  if (input.category) {
    conditions.push(eq(userWorkTask.category, input.category));
  }
  if (input.q) {
    const pattern = `%${input.q}%`;
    const search = or(
      ilike(userWorkTask.title, pattern),
      ilike(userWorkTask.description, pattern),
    );
    if (search) conditions.push(search);
  }
  if (input.view === "today") {
    const completedToday = and(
      eq(userWorkTask.status, "completed"),
      todayCompletedCondition(input.timezone, input.localDate),
    );
    const openToday = and(
      inArray(userWorkTask.status, ["pending", "in_progress"]),
      sql`${userWorkTask.scheduledDate} <= ${input.localDate}::date`,
    );
    conditions.push(or(completedToday, openToday)!);
  } else if (input.view === "inbox") {
    conditions.push(
      sql`${userWorkTask.scheduledDate} IS NULL`,
      inArray(userWorkTask.status, ["pending", "in_progress"]),
    );
  } else if (input.view === "future") {
    conditions.push(
      sql`${userWorkTask.scheduledDate} > ${input.localDate}::date`,
      inArray(userWorkTask.status, ["pending", "in_progress"]),
    );
  }
  if (input.cursor) {
    conditions.push(lt(userWorkTask.id, input.cursor));
  }

  const query = db
    .select()
    .from(userWorkTask)
    .where(and(...conditions));
  const items =
    input.view === "today"
      ? await query
          .orderBy(
            asc(userWorkTask.sortOrder),
            asc(userWorkTask.dueTime),
            asc(userWorkTask.createdAt),
            asc(userWorkTask.id),
          )
          .limit(input.limit)
      : await query
          .orderBy(desc(userWorkTask.createdAt), desc(userWorkTask.id))
          .limit(input.limit);

  return {
    items,
    nextCursor:
      input.view !== "today" && items.length === input.limit
        ? (items.at(-1)?.id ?? null)
        : null,
  };
}

export async function getUserWorkTaskSummary(
  userId: string,
  localDate: string,
  timezone: string,
): Promise<WorkTaskSummary> {
  const [row] = await db
    .select({
      doneToday: sql<number>`count(*) filter (
        where ${userWorkTask.status} = 'completed'
          and timezone(${timezone}, ${userWorkTask.completedAt})::date = ${localDate}::date
      )`,
      incompleteToday: sql<number>`count(*) filter (
        where ${userWorkTask.status} in ('pending', 'in_progress')
          and ${userWorkTask.scheduledDate} <= ${localDate}::date
      )`,
      highPriority: sql<number>`count(*) filter (
        where ${userWorkTask.priority} = 'high'
          and ${userWorkTask.status} in ('pending', 'in_progress')
      )`,
      overdue: sql<number>`count(*) filter (
        where ${userWorkTask.scheduledDate} < ${localDate}::date
          and ${userWorkTask.status} in ('pending', 'in_progress')
      )`,
      inbox: sql<number>`count(*) filter (
        where ${userWorkTask.scheduledDate} is null
          and ${userWorkTask.status} in ('pending', 'in_progress')
      )`,
    })
    .from(userWorkTask)
    .where(eq(userWorkTask.userId, userId));

  const doneToday = Number(row?.doneToday ?? 0);
  const incompleteToday = Number(row?.incompleteToday ?? 0);
  const total = doneToday + incompleteToday;
  return {
    doneToday,
    incompleteToday,
    highPriority: Number(row?.highPriority ?? 0),
    overdue: Number(row?.overdue ?? 0),
    inbox: Number(row?.inbox ?? 0),
    completionRate: total === 0 ? 0 : Math.round((doneToday / total) * 100),
  };
}

export async function createUserWorkTask(
  userId: string,
  input: CreateUserWorkTaskInput,
  source?: ResolvedWorkTaskSource | null,
): Promise<number> {
  return db.transaction(async (tx) => {
    const initialStatus: BoardStatus = "pending";
    const sortOrder = await nextSortOrder(tx, userId, initialStatus);
    const [task] = await tx
      .insert(userWorkTask)
      .values({
        userId,
        title: input.title,
        description: input.description ?? null,
        category: input.category,
        priority: input.priority,
        status: initialStatus,
        scheduledDate: input.scheduledDate ?? null,
        dueTime: input.dueTime ?? null,
        blockedReason: input.blockedReason ?? null,
        sortOrder,
        sourceType: source?.sourceType ?? null,
        sourceId: source?.sourceId ?? null,
        contextJson: source?.contextJson ?? {},
      })
      .returning({ id: userWorkTask.id });
    if (!task) throw new Error("创建工作任务失败");
    await tx.insert(userWorkTaskEvent).values({
      taskId: task.id,
      actorUserId: userId,
      eventType: "created",
      payloadJson: source
        ? { sourceType: source.sourceType, sourceId: source.sourceId }
        : {},
    });
    return task.id;
  });
}

export async function getUserWorkTask(
  userId: string,
  id: number,
): Promise<UserWorkTaskDetail | null> {
  const [task] = await db
    .select()
    .from(userWorkTask)
    .where(
      and(eq(userWorkTask.id, id), eq(userWorkTask.userId, userId)),
    )
    .limit(1);
  if (!task) return null;
  const events = await db
    .select()
    .from(userWorkTaskEvent)
    .where(eq(userWorkTaskEvent.taskId, id))
    .orderBy(asc(userWorkTaskEvent.id));
  return { ...task, events };
}

export async function patchUserWorkTask(
  userId: string,
  id: number,
  input: PatchUserWorkTaskInput,
): Promise<void> {
  const [updated] = await db
    .update(userWorkTask)
    .set({
      ...input,
      ...(Object.hasOwn(input, "description")
        ? { description: input.description ?? null }
        : {}),
      ...(Object.hasOwn(input, "scheduledDate")
        ? { scheduledDate: input.scheduledDate ?? null }
        : {}),
      ...(Object.hasOwn(input, "dueTime")
        ? { dueTime: input.dueTime ?? null }
        : {}),
      ...(Object.hasOwn(input, "blockedReason")
        ? { blockedReason: input.blockedReason ?? null }
        : {}),
      ...(Object.hasOwn(input, "completionNote")
        ? { completionNote: input.completionNote ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(userWorkTask.id, id), eq(userWorkTask.userId, userId)),
    )
    .returning({ id: userWorkTask.id });
  if (!updated) notFound();
}

export async function transitionUserWorkTask(
  userId: string,
  id: number,
  input: TransitionUserWorkTaskInput,
): Promise<void> {
  const rule = TRANSITIONS[input.action];
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`user-work-task:${userId}:${id}`}))`,
    );
    const [task] = await tx
      .select()
      .from(userWorkTask)
      .where(
        and(eq(userWorkTask.id, id), eq(userWorkTask.userId, userId)),
      )
      .limit(1);
    if (!task) notFound();
    if (!rule.from.some((status) => status === task.status)) {
      throw new WorkTaskStateError(`无法从 ${task.status} 执行 ${input.action}`);
    }
    const nextStatus = rule.to;
    const sortOrder =
      nextStatus === "canceled"
        ? task.sortOrder
        : await nextSortOrder(tx, userId, nextStatus);
    const now = new Date();
    await tx
      .update(userWorkTask)
      .set({
        status: nextStatus,
        sortOrder,
        updatedAt: now,
        blockedReason:
          task.status === "in_progress" && nextStatus !== "in_progress"
            ? null
            : task.blockedReason,
        completedAt:
          nextStatus === "completed"
            ? now
            : input.action === "reopen"
              ? null
              : task.completedAt,
        canceledAt:
          nextStatus === "canceled"
            ? now
            : input.action === "restore"
              ? null
              : task.canceledAt,
        completionNote:
          nextStatus === "completed"
            ? (input.completionNote ?? task.completionNote)
            : input.action === "reopen"
              ? null
              : task.completionNote,
      })
      .where(eq(userWorkTask.id, id));
    await tx.insert(userWorkTaskEvent).values({
      taskId: id,
      actorUserId: userId,
      eventType: rule.eventType,
      message: input.message ?? null,
      payloadJson: {
        from: task.status,
        to: nextStatus,
        ...(task.blockedReason && nextStatus !== "in_progress"
          ? { blockedReason: task.blockedReason }
          : {}),
      },
    });
  });
}

export async function moveUserWorkTask(
  userId: string,
  id: number,
  input: MoveUserWorkTaskInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`user-work-task-order:${userId}:${input.targetStatus}`}))`,
    );
    const [task] = await tx
      .select()
      .from(userWorkTask)
      .where(
        and(eq(userWorkTask.id, id), eq(userWorkTask.userId, userId)),
      )
      .limit(1);
    if (!task) notFound();
    if (task.status === "canceled") {
      throw new WorkTaskStateError("已取消任务需先恢复再移动");
    }
    const targetRows = await tx
      .select({ id: userWorkTask.id })
      .from(userWorkTask)
      .where(
        and(
          eq(userWorkTask.userId, userId),
          eq(userWorkTask.status, input.targetStatus),
          ne(userWorkTask.id, id),
        ),
      )
      .orderBy(asc(userWorkTask.sortOrder), asc(userWorkTask.id));
    const targetIds = targetRows.map((row) => row.id);
    let index = targetIds.length;
    if (input.beforeId) {
      const found = targetIds.indexOf(input.beforeId);
      if (found >= 0) index = found;
    } else if (input.afterId) {
      const found = targetIds.indexOf(input.afterId);
      if (found >= 0) index = found + 1;
    }
    targetIds.splice(index, 0, id);

    const now = new Date();
    const statusChanged = task.status !== input.targetStatus;
    await tx
      .update(userWorkTask)
      .set({
        status: input.targetStatus,
        updatedAt: now,
        blockedReason:
          task.status === "in_progress" &&
          input.targetStatus !== "in_progress"
            ? null
            : task.blockedReason,
        completedAt:
          input.targetStatus === "completed"
            ? (task.completedAt ?? now)
            : statusChanged
              ? null
              : task.completedAt,
      })
      .where(eq(userWorkTask.id, id));
    for (const [order, taskId] of targetIds.entries()) {
      await tx
        .update(userWorkTask)
        .set({ sortOrder: order * 100 })
        .where(
          and(
            eq(userWorkTask.id, taskId),
            eq(userWorkTask.userId, userId),
          ),
        );
    }
    if (statusChanged) {
      await tx.insert(userWorkTaskEvent).values({
        taskId: id,
        actorUserId: userId,
        eventType: EVENT_BY_STATUS[input.targetStatus],
        payloadJson: {
          from: task.status,
          to: input.targetStatus,
          ...(task.blockedReason && input.targetStatus !== "in_progress"
            ? { blockedReason: task.blockedReason }
            : {}),
        },
      });
    }
  });
}

export async function resetUserWorkTaskOrder(
  userId: string,
  status: BoardStatus,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`user-work-task-order:${userId}:${status}`}))`,
    );
    const rows = await tx
      .select({
        id: userWorkTask.id,
        priority: userWorkTask.priority,
        dueTime: userWorkTask.dueTime,
        createdAt: userWorkTask.createdAt,
      })
      .from(userWorkTask)
      .where(
        and(
          eq(userWorkTask.userId, userId),
          eq(userWorkTask.status, status),
        ),
      );
    rows.sort(
      (a, b) =>
        priorityRank(b.priority) - priorityRank(a.priority) ||
        dueTimeRank(a.dueTime).localeCompare(dueTimeRank(b.dueTime)) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id - b.id,
    );
    for (const [order, row] of rows.entries()) {
      await tx
        .update(userWorkTask)
        .set({ sortOrder: order * 100, updatedAt: new Date() })
        .where(
          and(
            eq(userWorkTask.id, row.id),
            eq(userWorkTask.userId, userId),
          ),
        );
    }
  });
}
