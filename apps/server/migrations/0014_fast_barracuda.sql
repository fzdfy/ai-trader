CREATE TABLE "limit_up_pool" (
	"date" date NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"limit_up_count" integer NOT NULL,
	"is_limit_up" boolean DEFAULT true NOT NULL,
	"first_limit_time" timestamp,
	"open_count" integer DEFAULT 0 NOT NULL,
	"seal_amount" numeric,
	"limit_type" text,
	"industry" text,
	"concepts" text,
	"turnover_rate" numeric,
	"amount" numeric,
	"float_market_cap" numeric,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "limit_up_pool_date_symbol_pk" PRIMARY KEY("date","symbol")
);
--> statement-breakpoint
CREATE INDEX "limit_up_pool_date_idx" ON "limit_up_pool" USING btree ("date");--> statement-breakpoint
CREATE INDEX "limit_up_pool_industry_date_idx" ON "limit_up_pool" USING btree ("industry","date");--> statement-breakpoint
CREATE INDEX "limit_up_pool_count_date_idx" ON "limit_up_pool" USING btree ("limit_up_count","date");