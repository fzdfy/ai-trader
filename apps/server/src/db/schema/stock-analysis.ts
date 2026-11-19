import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const vector = customType<{
  data: number[] | null;
  driverData: string | null;
}>({
  dataType() {
    return "vector(512)";
  },
  fromDriver(value) {
    return value ? value.slice(1, -1).split(",").map(Number) : null;
  },
  toDriver(value) {
    return value ? `[${value.join(",")}]` : null;
  },
});

export const researchReport = pgTable(
  "research_report",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    symbol: text("symbol").notNull(),
    title: text("title").notNull(),
    institution: text("institution"),
    analysts: jsonb("analysts").$type<string[]>().default([]).notNull(),
    rating: text("rating"),
    industry: text("industry"),
    publishDate: date("publish_date").notNull(),
    pdfUrl: text("pdf_url"),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("research_report_source_id_unq").on(table.source, table.sourceId),
    index("research_report_symbol_date_idx").on(table.symbol, table.publishDate),
  ],
);

export const researchReportDocument = pgTable(
  "research_report_document",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => researchReport.id, { onDelete: "cascade" }),
    storageKey: text("storage_key"),
    sha256: text("sha256"),
    fileSize: bigint("file_size", { mode: "number" }),
    pageCount: integer("page_count"),
    contentType: text("content_type"),
    fullText: text("full_text"),
    extractStatus: text("extract_status").notNull().default("pending"),
    extractorVersion: text("extractor_version"),
    extractedAt: timestamp("extracted_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("research_report_document_report_unq").on(table.reportId),
    uniqueIndex("research_report_document_sha_unq").on(table.sha256),
  ],
);

export const researchReportChunk = pgTable(
  "research_report_chunk",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    reportId: integer("report_id")
      .notNull()
      .references(() => researchReport.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    pageFrom: integer("page_from").notNull(),
    pageTo: integer("page_to").notNull(),
    sectionTitle: text("section_title"),
    chunkText: text("chunk_text").notNull(),
    embedding: vector("embedding"),
    embeddingModel: text("embedding_model"),
    chunkVersion: text("chunk_version").notNull().default("v1"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("research_report_chunk_version_idx").on(
      table.reportId,
      table.chunkVersion,
      table.chunkIndex,
    ),
    index("research_report_chunk_report_idx").on(table.reportId, table.chunkIndex),
  ],
);

export const researchReportForecast = pgTable(
  "research_report_forecast",
  {
    reportId: integer("report_id")
      .notNull()
      .references(() => researchReport.id, { onDelete: "cascade" }),
    horizon: text("horizon").notNull(),
    eps: numeric("eps"),
    rawValue: text("raw_value"),
  },
  (table) => [primaryKey({ columns: [table.reportId, table.horizon] })],
);

export const analystConsensusSnapshot = pgTable(
  "analyst_consensus_snapshot",
  {
    symbol: text("symbol").notNull(),
    asOfDate: date("as_of_date").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    epsMin: numeric("eps_min"),
    epsMean: numeric("eps_mean"),
    epsMax: numeric("eps_max"),
    analystCount: integer("analyst_count"),
    source: text("source").notNull(),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.symbol, table.asOfDate, table.fiscalYear, table.source],
    }),
  ],
);

export const stockFinancialSnapshot = pgTable(
  "stock_financial_snapshot",
  {
    symbol: text("symbol").notNull(),
    reportPeriod: date("report_period").notNull(),
    statementType: text("statement_type").notNull(),
    source: text("source").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number | string | null>>().notNull(),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.symbol, table.reportPeriod, table.statementType, table.source] }),
  ],
);

export const stockValuationDaily = pgTable(
  "stock_valuation_daily",
  {
    symbol: text("symbol").notNull(),
    tradeDate: date("trade_date").notNull(),
    peTtm: numeric("pe_ttm"),
    peStatic: numeric("pe_static"),
    pb: numeric("pb"),
    psTtm: numeric("ps_ttm"),
    pcf: numeric("pcf"),
    turnoverRate: numeric("turnover_rate"),
    tradeStatus: text("trade_status"),
    isSt: boolean("is_st").notNull().default(false),
    source: text("source").notNull(),
    rawJson: jsonb("raw_json"),
  },
  (table) => [
    primaryKey({ columns: [table.symbol, table.tradeDate, table.source] }),
    index("stock_valuation_daily_symbol_date_idx").on(table.symbol, table.tradeDate),
  ],
);

export const companyAnnouncement = pgTable(
  "company_announcement",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    symbol: text("symbol").notNull(),
    title: text("title").notNull(),
    announcementType: text("announcement_type"),
    publishAt: timestamp("publish_at").notNull(),
    sourceUrl: text("source_url"),
    source: text("source").notNull(),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_announcement_source_url_unq").on(table.source, table.sourceUrl),
    index("company_announcement_symbol_date_idx").on(table.symbol, table.publishAt),
  ],
);

export const stockAnalysisSnapshot = pgTable(
  "stock_analysis_snapshot",
  {
    symbol: text("symbol").notNull(),
    asOfTradeDate: date("as_of_trade_date").notNull(),
    quoteAt: timestamp("quote_at"),
    modelVersion: text("model_version").notNull(),
    inputHash: text("input_hash").notNull(),
    forecastScenarios: jsonb("forecast_scenarios").notNull().default(sql`'[]'::jsonb`),
    riskReferenceRange: jsonb("risk_reference_range"),
    evidenceChunkIds: jsonb("evidence_chunk_ids").$type<number[]>().default([]).notNull(),
    dataQuality: jsonb("data_quality").notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.symbol, table.asOfTradeDate, table.modelVersion, table.inputHash],
    }),
  ],
);
