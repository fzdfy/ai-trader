import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  bigserial,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * 特征集定义表
 */
export const featureSet = pgTable("feature_set", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  definitionJson: jsonb("definition_json").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * 特征值表（按时间序列存储）
 */
export const featureValue = pgTable(
  "feature_value",
  {
    time: timestamp("time").notNull(),
    symbol: text("symbol").notNull(),
    featureSetId: integer("feature_set_id").notNull(),
    featuresJson: jsonb("features_json").notNull(),
    qualityFlag: integer("quality_flag").default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.time, table.symbol, table.featureSetId] }),
  }),
);

export const featureValueRelations = relations(featureValue, ({ one }) => ({
  featureSet: one(featureSet, {
    fields: [featureValue.featureSetId],
    references: [featureSet.id],
  }),
}));
