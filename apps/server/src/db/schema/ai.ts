import {
  pgTable,
  text,
  timestamp,
  jsonb,
  bigserial,
  integer,
  numeric,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const daterange = customType<{
  data: [string, string] | null;
  driverData: string;
}>({
  dataType() {
    return "daterange";
  },
  fromDriver(value: string): [string, string] | null {
    if (!value) return null;
    const match = value.match(/\[(\S+),(\S+)\)/);
    return match ? [match[1]!, match[2]!] : null;
  },
  toDriver(value: [string, string] | null): string {
    if (!value) return "";
    return `[${value[0]},${value[1]})`;
  },
});

export const model = pgTable("model", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  artifactUri: text("artifact_uri"),
  trainDataRange: daterange("train_data_range"),
  metricsJson: jsonb("metrics_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const modelRelations = relations(model, ({ many }) => ({
  signals: many(signal),
}));

export const signal = pgTable(
  "signal",
  {
    time: timestamp("time").notNull(),
    symbol: text("symbol").notNull(),
    modelId: integer("model_id").notNull(),
    signalType: text("signal_type").notNull(),
    score: numeric("score").notNull(),
    direction: text("direction").notNull(),
    reasonJson: jsonb("reason_json"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.time, table.symbol, table.modelId] }),
  }),
);

export const signalRelations = relations(signal, ({ one }) => ({
  model: one(model, {
    fields: [signal.modelId],
    references: [model.id],
  }),
}));
