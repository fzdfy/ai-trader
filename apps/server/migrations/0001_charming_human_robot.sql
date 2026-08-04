CREATE TABLE "bar_period_adj" (
	"period" text NOT NULL,
	"time" timestamp NOT NULL,
	"symbol" text NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"amount" numeric,
	"bar_count" integer NOT NULL,
	"first_day" date NOT NULL,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar_period_adj_period_time_symbol_pk" PRIMARY KEY("period","time","symbol")
);
--> statement-breakpoint
CREATE INDEX "bar_period_adj_symbol_time_idx" ON "bar_period_adj" USING btree ("period","symbol","time");