import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export type WorkTaskContext = {
  title?: string;
  subtitle?: string;
  url?: string;
  [key: string]: unknown;
};

export const userWorkTask = pgTable(
  "user_work_task",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("custom"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("pending"),
    scheduledDate: date("scheduled_date"),
    dueTime: time("due_time"),
    sortOrder: integer("sort_order").notNull().default(0),
    blockedReason: text("blocked_reason"),
    completionNote: text("completion_note"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    contextJson: jsonb("context_json")
      .$type<WorkTaskContext>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    canceledAt: timestamp("canceled_at"),
  },
  (table) => [
    check(
      "user_work_task_category_check",
      sql`${table.category} IN ('research', 'review', 'screen', 'strategy', 'follow_up', 'custom')`,
    ),
    check(
      "user_work_task_priority_check",
      sql`${table.priority} IN ('low', 'normal', 'high')`,
    ),
    check(
      "user_work_task_status_check",
      sql`${table.status} IN ('pending', 'in_progress', 'completed', 'canceled')`,
    ),
    check(
      "user_work_task_source_check",
      sql`(${table.sourceType} IS NULL AND ${table.sourceId} IS NULL) OR (${table.sourceType} IS NOT NULL AND ${table.sourceId} IS NOT NULL)`,
    ),
    index("user_work_task_board_idx").on(
      table.userId,
      table.status,
      table.scheduledDate,
      table.sortOrder,
    ),
    index("user_work_task_completed_idx").on(table.userId, table.completedAt),
    index("user_work_task_source_idx").on(
      table.userId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

export const userWorkTaskEvent = pgTable(
  "user_work_task_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => userWorkTask.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    message: text("message"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "user_work_task_event_type_check",
      sql`${table.eventType} IN ('created', 'started', 'completed', 'reopened', 'canceled', 'restored')`,
    ),
    index("user_work_task_event_task_created_idx").on(
      table.taskId,
      table.createdAt.desc(),
    ),
  ],
);
