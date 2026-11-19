import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { user } from "./auth";

export const workflowDefinition = pgTable(
  "workflow_definition",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    draftGraph: jsonb("draft_graph").notNull(),
    currentVersion: integer("current_version"),
    enabled: boolean("enabled").notNull().default(false),
    lastScheduledKey: text("last_scheduled_key"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("workflow_definition_user_active_idx").on(table.userId, table.archivedAt),
    index("workflow_definition_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const workflowVersion = pgTable(
  "workflow_version",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => workflowDefinition.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    graphJson: jsonb("graph_json").notNull(),
    triggerType: text("trigger_type").notNull(),
    triggerConfig: jsonb("trigger_config").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_version_workflow_version_unq").on(table.workflowId, table.version),
    index("workflow_version_trigger_idx").on(table.triggerType),
  ],
);

export const workflowRun = pgTable(
  "workflow_run",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workflowId: integer("workflow_id")
      .notNull()
      .references(() => workflowDefinition.id, { onDelete: "restrict" }),
    versionId: integer("version_id")
      .notNull()
      .references(() => workflowVersion.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    triggerType: text("trigger_type").notNull(),
    triggerRef: text("trigger_ref"),
    currentNodeId: text("current_node_id"),
    contextJson: jsonb("context_json"),
    error: text("error"),
    cancelRequestedAt: timestamp("cancel_requested_at"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("workflow_run_user_created_idx").on(table.userId, table.createdAt),
    index("workflow_run_workflow_created_idx").on(table.workflowId, table.createdAt),
    index("workflow_run_cleanup_idx").on(table.createdAt),
    uniqueIndex("workflow_run_trigger_ref_unq")
      .on(table.workflowId, table.triggerType, table.triggerRef)
      .where(sql`${table.triggerRef} is not null`),
    uniqueIndex("workflow_run_single_active_unq")
      .on(table.workflowId)
      .where(sql`${table.status} in ('pending', 'running')`),
  ],
);

export const workflowNodeRun = pgTable(
  "workflow_node_run",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workflowRunId: integer("workflow_run_id")
      .notNull()
      .references(() => workflowRun.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: text("status").notNull().default("pending"),
    inputSummary: jsonb("input_summary"),
    outputSummary: jsonb("output_summary"),
    resultRef: jsonb("result_ref"),
    error: text("error"),
    attempt: integer("attempt").notNull().default(1),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_node_run_run_node_unq").on(table.workflowRunId, table.nodeId),
    index("workflow_node_run_run_idx").on(table.workflowRunId),
  ],
);

export const workflowDefinitionRelations = relations(workflowDefinition, ({ one, many }) => ({
  user: one(user, {
    fields: [workflowDefinition.userId],
    references: [user.id],
  }),
  versions: many(workflowVersion),
  runs: many(workflowRun),
}));

export const workflowVersionRelations = relations(workflowVersion, ({ one, many }) => ({
  workflow: one(workflowDefinition, {
    fields: [workflowVersion.workflowId],
    references: [workflowDefinition.id],
  }),
  runs: many(workflowRun),
}));

export const workflowRunRelations = relations(workflowRun, ({ one, many }) => ({
  workflow: one(workflowDefinition, {
    fields: [workflowRun.workflowId],
    references: [workflowDefinition.id],
  }),
  version: one(workflowVersion, {
    fields: [workflowRun.versionId],
    references: [workflowVersion.id],
  }),
  user: one(user, {
    fields: [workflowRun.userId],
    references: [user.id],
  }),
  nodes: many(workflowNodeRun),
}));

export const workflowNodeRunRelations = relations(workflowNodeRun, ({ one }) => ({
  run: one(workflowRun, {
    fields: [workflowNodeRun.workflowRunId],
    references: [workflowRun.id],
  }),
}));
