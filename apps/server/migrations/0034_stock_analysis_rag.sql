CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "analyst_consensus_snapshot" (
	"symbol" text NOT NULL,
	"as_of_date" date NOT NULL,
	"fiscal_year" integer NOT NULL,
	"eps_min" numeric,
	"eps_mean" numeric,
	"eps_max" numeric,
	"analyst_count" integer,
	"source" text NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analyst_consensus_snapshot_symbol_as_of_date_fiscal_year_source_pk" PRIMARY KEY("symbol","as_of_date","fiscal_year","source")
);
--> statement-breakpoint
CREATE TABLE "company_announcement" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"title" text NOT NULL,
	"announcement_type" text,
	"publish_at" timestamp NOT NULL,
	"source_url" text,
	"source" text NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_report" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"symbol" text NOT NULL,
	"title" text NOT NULL,
	"institution" text,
	"analysts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" text,
	"industry" text,
	"publish_date" date NOT NULL,
	"pdf_url" text,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_report_chunk" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"page_from" integer NOT NULL,
	"page_to" integer NOT NULL,
	"section_title" text,
	"chunk_text" text NOT NULL,
	"embedding" vector(512),
	"embedding_model" text,
	"chunk_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_report_document" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"storage_key" text,
	"sha256" text,
	"file_size" bigint,
	"page_count" integer,
	"content_type" text,
	"full_text" text,
	"extract_status" text DEFAULT 'pending' NOT NULL,
	"extractor_version" text,
	"extracted_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_report_forecast" (
	"report_id" integer NOT NULL,
	"horizon" text NOT NULL,
	"eps" numeric,
	"raw_value" text,
	CONSTRAINT "research_report_forecast_report_id_horizon_pk" PRIMARY KEY("report_id","horizon")
);
--> statement-breakpoint
CREATE TABLE "stock_analysis_snapshot" (
	"symbol" text NOT NULL,
	"as_of_trade_date" date NOT NULL,
	"quote_at" timestamp,
	"model_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"forecast_scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_reference_range" jsonb,
	"evidence_chunk_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_quality" jsonb NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_analysis_snapshot_symbol_as_of_trade_date_model_version_input_hash_pk" PRIMARY KEY("symbol","as_of_trade_date","model_version","input_hash")
);
--> statement-breakpoint
CREATE TABLE "stock_financial_snapshot" (
	"symbol" text NOT NULL,
	"report_period" date NOT NULL,
	"statement_type" text NOT NULL,
	"source" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_financial_snapshot_symbol_report_period_statement_type_source_pk" PRIMARY KEY("symbol","report_period","statement_type","source")
);
--> statement-breakpoint
CREATE TABLE "stock_valuation_daily" (
	"symbol" text NOT NULL,
	"trade_date" date NOT NULL,
	"pe_ttm" numeric,
	"pe_static" numeric,
	"pb" numeric,
	"ps_ttm" numeric,
	"pcf" numeric,
	"turnover_rate" numeric,
	"trade_status" text,
	"is_st" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"raw_json" jsonb,
	CONSTRAINT "stock_valuation_daily_symbol_trade_date_source_pk" PRIMARY KEY("symbol","trade_date","source")
);
--> statement-breakpoint
ALTER TABLE "research_report_chunk" ADD CONSTRAINT "research_report_chunk_report_id_research_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."research_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_report_document" ADD CONSTRAINT "research_report_document_report_id_research_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."research_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_report_forecast" ADD CONSTRAINT "research_report_forecast_report_id_research_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."research_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_announcement_symbol_date_idx" ON "company_announcement" USING btree ("symbol","publish_at");--> statement-breakpoint
CREATE UNIQUE INDEX "research_report_source_id_unq" ON "research_report" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "research_report_symbol_date_idx" ON "research_report" USING btree ("symbol","publish_date");--> statement-breakpoint
CREATE UNIQUE INDEX "research_report_chunk_version_idx" ON "research_report_chunk" USING btree ("report_id","chunk_version","chunk_index");--> statement-breakpoint
CREATE INDEX "research_report_chunk_report_idx" ON "research_report_chunk" USING btree ("report_id","chunk_index");--> statement-breakpoint
CREATE UNIQUE INDEX "research_report_document_report_unq" ON "research_report_document" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_report_document_sha_unq" ON "research_report_document" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "stock_valuation_daily_symbol_date_idx" ON "stock_valuation_daily" USING btree ("symbol","trade_date");--> statement-breakpoint
CREATE INDEX "research_report_title_trgm_idx" ON "research_report" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "research_report_chunk_embedding_hnsw_idx" ON "research_report_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "research_report_chunk_text_trgm_idx" ON "research_report_chunk" USING gin ("chunk_text" gin_trgm_ops);
