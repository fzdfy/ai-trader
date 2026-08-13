import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  bigserial,
  boolean,
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

/**
 * 因子注册表
 * 定义系统中所有可用的因子元数据，前端因子选择器从此表读取。
 */
export const factorRegistry = pgTable("factor_registry", {
  name: text("name").primaryKey(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  direction: integer("direction").notNull().default(1), // 1=正向 -1=反向
  defaultParams: jsonb("default_params"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * 用户自定义策略配置表
 * 一行 = 一个用户创建的多因子策略 JSON。
 */
export const strategyConfig = pgTable("strategy_config", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  configJson: jsonb("config_json").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
