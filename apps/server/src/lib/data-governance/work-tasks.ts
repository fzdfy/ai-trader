import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  workTask,
  workTaskEvent,
} from "../../db/schema";

export type CreateWorkTaskInput = {
  taskType: string;
  title: string;
  priority: "normal" | "high" | "critical";
  ownerRole: string;
  relatedType: string | null;
  relatedId: string | null;
  payloadJson: Record<string, unknown>;
};

export type WorkTaskTransition = {
  action: "start" | "complete" | "cancel";
  actorUserId?: string | null;
  message?: string | null;
  resultJson?: Record<string, unknown>;
};

export type SourceStandardReviewTaskInput = {
  commitSha: string;
  versionLabel: string;
  previousCommitSha: string;
  skillFileSha256: string;
  snapshotPath: string;
  detectedAt: string;
  capabilities?: string[];
};

type WorkTaskRow = typeof workTask.$inferSelect;
type WorkTaskEventRow = typeof workTaskEvent.$inferSelect;
export type WorkTaskDetail = WorkTaskRow & { events: WorkTaskEventRow[] };

const TRANSITIONS = {
  start: {
    from: ["pending"],
    to: "in_progress",
    eventType: "started",
  },
  complete: {
    from: ["in_progress"],
    to: "completed",
    eventType: "completed",
  },
  cancel: {
    from: ["pending", "in_progress"],
    to: "canceled",
    eventType: "canceled",
  },
} as const;

export async function createWorkTask(
  input: CreateWorkTaskInput,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(workTask)
      .values({ ...input, status: "pending" })
      .returning({ id: workTask.id });
    if (!task) throw new Error("创建工作任务失败");
    await tx.insert(workTaskEvent).values({
      taskId: task.id,
      eventType: "created",
      payloadJson: {},
    });
    return task.id;
  });
}

export async function ensureSourceStandardReviewTask(
  input: SourceStandardReviewTaskInput,
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`source-standard:${input.commitSha}`}))`,
    );
    const [existing] = await tx
      .select({ id: workTask.id })
      .from(workTask)
      .where(
        and(
          eq(workTask.taskType, "source_standard_review"),
          eq(workTask.relatedType, "source_standard"),
          eq(workTask.relatedId, input.commitSha),
          inArray(workTask.status, ["pending", "in_progress", "completed"]),
        ),
      )
      .orderBy(asc(workTask.id))
      .limit(1);
    if (existing) return existing.id;

    const [task] = await tx
      .insert(workTask)
      .values({
        taskType: "source_standard_review",
        title: `复核 a-stock-data v${input.versionLabel} 来源标准变化`,
        status: "pending",
        priority: "high",
        ownerRole: "Data Steward",
        relatedType: "source_standard",
        relatedId: input.commitSha,
        payloadJson: {
          sourceStandardId: "a-stock-data",
          commitSha: input.commitSha,
          previousCommitSha: input.previousCommitSha,
          versionLabel: input.versionLabel,
          skillFileSha256: input.skillFileSha256,
          snapshotPath: input.snapshotPath,
          detectedAt: input.detectedAt,
          capabilitiesToReview: input.capabilities ?? [],
        },
      })
      .returning({ id: workTask.id });
    if (!task) throw new Error("创建来源标准审阅任务失败");
    await tx.insert(workTaskEvent).values({
      taskId: task.id,
      eventType: "created",
      payloadJson: { commitSha: input.commitSha },
    });
    return task.id;
  });
}

export async function countPendingSourceReviewTasks(
  commitSha: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(workTask)
    .where(
      and(
        eq(workTask.taskType, "source_standard_review"),
        eq(workTask.relatedType, "source_standard"),
        eq(workTask.relatedId, commitSha),
        eq(workTask.status, "pending"),
      ),
    );
  return row?.total ?? 0;
}

export async function transitionWorkTask(
  id: number,
  transition: WorkTaskTransition,
): Promise<void> {
  const rule = TRANSITIONS[transition.action];
  if (transition.action === "complete" && !transition.resultJson) {
    throw new Error("work task completion result is required");
  }
  if (
    transition.action === "complete" &&
    (transition.resultJson?.breaking === true ||
      transition.resultJson?.requiresCodeChange === true) &&
    (typeof transition.resultJson.openspecChange !== "string" ||
      transition.resultJson.openspecChange.trim() === "")
  ) {
    throw new Error(
      "breaking source changes require a linked OpenSpec change",
    );
  }
  await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(workTask)
      .where(eq(workTask.id, id))
      .limit(1);
    if (!task) throw new Error("work task not found");
    if (!rule.from.some((status) => status === task.status)) {
      throw new Error(
        `invalid transition: ${transition.action} from ${task.status}`,
      );
    }
    await tx
      .update(workTask)
      .set({
        status: rule.to,
        updatedAt: new Date(),
        ...(transition.action === "complete"
          ? { completedAt: new Date(), resultJson: transition.resultJson }
          : {}),
      })
      .where(eq(workTask.id, id));
    await tx.insert(workTaskEvent).values({
      taskId: id,
      actorUserId: transition.actorUserId ?? null,
      eventType: rule.eventType,
      message: transition.message ?? null,
      payloadJson: {},
    });
  });
}

export async function getWorkTask(id: number): Promise<WorkTaskDetail | null> {
  const [task] = await db
    .select()
    .from(workTask)
    .where(eq(workTask.id, id))
    .limit(1);
  if (!task) return null;
  const events = await db
    .select()
    .from(workTaskEvent)
    .where(eq(workTaskEvent.taskId, id))
    .orderBy(asc(workTaskEvent.id));
  return { ...task, events };
}
