CREATE TABLE "adj_factor" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"factor" numeric NOT NULL,
	"source" text,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adj_factor_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE TABLE "adj_factor_latest" (
	"symbol" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"factor" numeric NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar1d_hfq" (
	"time" timestamp NOT NULL,
	"symbol" text NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"close_raw" numeric,
	"volume" numeric NOT NULL,
	"amount" numeric,
	"avg_price" numeric,
	"indicators" jsonb,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar1d_hfq_time_symbol_pk" PRIMARY KEY("time","symbol")
);
--> statement-breakpoint
CREATE INDEX "adj_factor_symbol_date_idx" ON "adj_factor" USING btree ("symbol","date");--> statement-breakpoint
CREATE INDEX "bar1d_hfq_symbol_time_idx" ON "bar1d_hfq" USING btree ("symbol","time");--> statement-breakpoint
CREATE VIEW "public"."bar1d_qfq" AS (select "bar1d_hfq"."time", "bar1d_hfq"."symbol", ("bar1d_hfq"."open" / NULLIF("adj_factor_latest"."factor", 0)) as "open", ("bar1d_hfq"."high" / NULLIF("adj_factor_latest"."factor", 0)) as "high", ("bar1d_hfq"."low" / NULLIF("adj_factor_latest"."factor", 0)) as "low", ("bar1d_hfq"."close" / NULLIF("adj_factor_latest"."factor", 0)) as "close", "bar1d_hfq"."close_raw", "bar1d_hfq"."volume", "bar1d_hfq"."amount", "bar1d_hfq"."avg_price", "bar1d_hfq"."indicators", "bar1d_hfq"."source_updated_at", "bar1d_hfq"."ingested_at" from "bar1d_hfq" left join "adj_factor_latest" on "adj_factor_latest"."symbol" = "bar1d_hfq"."symbol");