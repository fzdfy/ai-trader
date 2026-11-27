import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { TechnicalSignalJudgmentSummary } from "../../../../../packages/signal-catalog/src/contracts";

export const technicalSignalSnapshot = pgTable(
  "technical_signal_snapshot",
  {
    objectType: text("object_type").notNull(),
    objectSubtype: text("object_subtype").notNull().default(""),
    objectCode: text("object_code").notNull(),
    asOf: text("as_of").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    definitionHash: text("definition_hash").notNull(),
    inputHash: text("input_hash").notNull(),
    quality: text("quality").notNull(),
    dataSourcesJson: jsonb("data_sources_json")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    signalsJson: jsonb("signals_json").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    summaryJson: jsonb("summary_json")
      .$type<TechnicalSignalJudgmentSummary>()
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({
      columns: [
        table.objectType,
        table.objectSubtype,
        table.objectCode,
        table.asOf,
        table.catalogVersion,
      ],
    }),
    index("technical_signal_snapshot_object_date_idx").on(
      table.objectType,
      table.objectSubtype,
      table.objectCode,
      table.asOf.desc(),
    ),
    check(
      "technical_signal_snapshot_object_type_chk",
      sql`${table.objectType} in ('market', 'sector', 'stock', 'gold')`,
    ),
    check(
      "technical_signal_snapshot_subtype_chk",
      sql`(
        (${table.objectType} = 'sector' and ${table.objectSubtype} in ('industry', 'concept'))
        or
        (${table.objectType} <> 'sector' and ${table.objectSubtype} = '')
      )`,
    ),
    check(
      "technical_signal_snapshot_quality_chk",
      sql`${table.quality} in ('available', 'low', 'missing')`,
    ),
  ],
);

export const technicalSignalTrigger = pgTable(
  "technical_signal_trigger",
  {
    objectType: text("object_type").notNull(),
    objectSubtype: text("object_subtype").notNull().default(""),
    objectCode: text("object_code").notNull(),
    asOf: text("as_of").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    signalId: text("signal_id").notNull(),
    layer: text("layer").notNull(),
    status: text("status").notNull(),
    direction: text("direction").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 30, scale: 10 }),
    valueText: text("value_text"),
    quality: text("quality").notNull(),
    evidenceSummary: jsonb("evidence_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.objectType,
        table.objectSubtype,
        table.objectCode,
        table.asOf,
        table.catalogVersion,
        table.signalId,
      ],
    }),
    index("technical_signal_trigger_status_date_idx").on(
      table.status,
      table.asOf.desc(),
      table.objectType,
      table.objectSubtype,
    ),
    index("technical_signal_trigger_signal_date_idx").on(table.signalId, table.asOf.desc()),
    check(
      "technical_signal_trigger_object_type_chk",
      sql`${table.objectType} in ('market', 'sector', 'stock', 'gold')`,
    ),
    check(
      "technical_signal_trigger_subtype_chk",
      sql`(
        (${table.objectType} = 'sector' and ${table.objectSubtype} in ('industry', 'concept'))
        or
        (${table.objectType} <> 'sector' and ${table.objectSubtype} = '')
      )`,
    ),
    check(
      "technical_signal_trigger_layer_chk",
      sql`${table.layer} in ('basic', 'pattern', 'advanced', 'micro')`,
    ),
    check(
      "technical_signal_trigger_status_chk",
      sql`${table.status} in ('triggered', 'invalidated', 'low-confidence', 'unavailable')`,
    ),
  ],
);

export const technicalSignalValidation = pgTable(
  "technical_signal_validation",
  {
    signalId: text("signal_id").notNull(),
    scope: text("scope").notNull(),
    horizon: integer("horizon").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    validationVersion: text("validation_version").notNull(),
    sampleCount: integer("sample_count").notNull(),
    winRate: numeric("win_rate", { precision: 12, scale: 6 }),
    profitLossRatio: numeric("profit_loss_ratio", {
      precision: 20,
      scale: 6,
    }),
    expectedReturn: numeric("expected_return", { precision: 20, scale: 10 }),
    maxDrawdown: numeric("max_drawdown", { precision: 20, scale: 10 }),
    validationStart: date("validation_start").notNull(),
    validationEnd: date("validation_end").notNull(),
    objectScope: jsonb("object_scope").$type<Record<string, unknown>>().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.signalId,
        table.scope,
        table.horizon,
        table.catalogVersion,
        table.validationVersion,
      ],
    }),
    check(
      "technical_signal_validation_scope_chk",
      sql`${table.scope} in ('market', 'sector', 'stock', 'gold')`,
    ),
    check("technical_signal_validation_horizon_chk", sql`${table.horizon} in (5, 20, 60)`),
    check("technical_signal_validation_sample_chk", sql`${table.sampleCount} >= 0`),
  ],
);
