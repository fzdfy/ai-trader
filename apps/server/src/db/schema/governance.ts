import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { jobRun } from "./ops.ts";

export const dataQualityResult = pgTable(
  "data_quality_result",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    assetKey: text("asset_key").notNull(),
    ruleId: text("rule_id").notNull(),
    ruleVersion: integer("rule_version").notNull(),
    status: text("status").notNull(),
    severity: text("severity").notNull(),
    jobRunId: bigint("job_run_id", { mode: "number" }).references(
      () => jobRun.id,
    ),
    requestId: text("request_id"),
    observedValue: numeric("observed_value"),
    detailsJson: jsonb("details_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    checkedAt: timestamp("checked_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "data_quality_result_status_check",
      sql`${table.status} IN ('passed', 'warning', 'failed', 'error')`,
    ),
    check(
      "data_quality_result_severity_check",
      sql`${table.severity} IN ('warning', 'critical')`,
    ),
    index("data_quality_result_asset_checked_idx").on(
      table.assetKey,
      table.checkedAt.desc(),
    ),
    index("data_quality_result_rule_checked_idx").on(
      table.ruleId,
      table.checkedAt.desc(),
    ),
    index("data_quality_result_status_checked_idx").on(
      table.status,
      table.checkedAt.desc(),
    ),
  ],
);

export const dataIncident = pgTable(
  "data_incident",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    assetKey: text("asset_key"),
    incidentType: text("incident_type").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    rootCause: text("root_cause"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at"),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    check(
      "data_incident_severity_check",
      sql`${table.severity} IN ('warning', 'critical')`,
    ),
    check(
      "data_incident_status_check",
      sql`${table.status} IN ('open', 'acknowledged', 'resolving', 'resolved', 'closed')`,
    ),
    index("data_incident_asset_opened_idx").on(
      table.assetKey,
      table.openedAt.desc(),
    ),
    index("data_incident_status_opened_idx").on(
      table.status,
      table.openedAt.desc(),
    ),
  ],
);

export const dataIncidentEvent = pgTable(
  "data_incident_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    incidentId: bigint("incident_id", { mode: "number" })
      .notNull()
      .references(() => dataIncident.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    eventType: text("event_type").notNull(),
    message: text("message"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("data_incident_event_incident_created_idx").on(
      table.incidentId,
      table.createdAt.desc(),
    ),
  ],
);

export const workTask = pgTable(
  "work_task",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskType: text("task_type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("pending"),
    priority: text("priority").notNull().default("normal"),
    ownerRole: text("owner_role").notNull(),
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    check(
      "work_task_status_check",
      sql`${table.status} IN ('pending', 'in_progress', 'completed', 'canceled')`,
    ),
    check(
      "work_task_priority_check",
      sql`${table.priority} IN ('normal', 'high', 'critical')`,
    ),
    index("work_task_status_priority_idx").on(
      table.status,
      table.priority,
      table.createdAt.desc(),
    ),
    index("work_task_related_idx").on(
      table.relatedType,
      table.relatedId,
      table.status,
    ),
  ],
);

export const workTaskEvent = pgTable(
  "work_task_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    taskId: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => workTask.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id"),
    eventType: text("event_type").notNull(),
    message: text("message"),
    payloadJson: jsonb("payload_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("work_task_event_task_created_idx").on(
      table.taskId,
      table.createdAt.desc(),
    ),
  ],
);
