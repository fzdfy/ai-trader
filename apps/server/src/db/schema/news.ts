import {
  pgTable,
  text,
  timestamp,
  jsonb,
  bigserial,
  integer,
  numeric,
  unique,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * 自定义 vector 类型 (pgvector)
 */
const vector = customType<{
  data: number[] | null;
  driverData: string | null;
}>({
  dataType() {
    return "vector";
  },
  fromDriver(value: string | null): number[] | null {
    if (!value) return null;
    return value
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
  toDriver(value: number[] | null): string | null {
    if (!value) return null;
    return `[${value.join(",")}]`;
  },
});

/**
 * 自定义 tsvector 类型
 */
const tsvector = customType<{
  data: string | null;
  driverData: string | null;
}>({
  dataType() {
    return "tsvector";
  },
  fromDriver(value: string | null): string | null {
    return value;
  },
  toDriver(value: string | null): string | null {
    return value;
  },
});

/**
 * 新闻文章表
 */
export const newsArticle = pgTable(
  "news_article",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at"),
    summary: text("summary"),
    sentiment: numeric("sentiment"),
    rawJson: jsonb("raw_json"),
    ingestedAt: timestamp("ingested_at").notNull().defaultNow(),
  },
  (table) => ({
    unqSourceUrl: unique("news_article_source_url_unq").on(table.source, table.url),
  }),
);

export const newsArticleRelations = relations(newsArticle, ({ many }) => ({
  symbols: many(newsArticleSymbol),
}));

/**
 * 新闻-标的关联表
 */
export const newsArticleSymbol = pgTable(
  "news_article_symbol",
  {
    articleId: integer("article_id").notNull(),
    symbol: text("symbol").notNull(),
    score: numeric("score"),
    relationType: text("relation_type"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.articleId, table.symbol] }),
  }),
);

export const newsArticleSymbolRelations = relations(newsArticleSymbol, ({ one }) => ({
  article: one(newsArticle, {
    fields: [newsArticleSymbol.articleId],
    references: [newsArticle.id],
  }),
}));

/**
 * 新闻事件表
 */
export const newsEvent = pgTable("news_event", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  eventTime: timestamp("event_time").notNull(),
  impactScore: numeric("impact_score"),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const newsEventRelations = relations(newsEvent, ({ many }) => ({
  symbols: many(newsEventSymbol),
}));

/**
 * 新闻事件-标的关联表
 */
export const newsEventSymbol = pgTable(
  "news_event_symbol",
  {
    eventId: integer("event_id").notNull(),
    symbol: text("symbol").notNull(),
    impactScore: numeric("impact_score"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.symbol] }),
  }),
);

export const newsEventSymbolRelations = relations(newsEventSymbol, ({ one }) => ({
  event: one(newsEvent, {
    fields: [newsEventSymbol.eventId],
    references: [newsEvent.id],
  }),
}));

/**
 * 新闻向量嵌入表 (RAG 检索)
 */
export const newsEmbedding = pgTable("news_embedding", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding"),
  tsv: tsvector("tsv"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
