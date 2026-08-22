CREATE TABLE "fund_flow_rank" (
	"date" date NOT NULL,
	"category" text NOT NULL,
	"rank" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"change_percent" numeric,
	"main_net_inflow" numeric,
	"main_net_inflow_percent" numeric,
	"super_large_net_inflow" numeric,
	"large_net_inflow" numeric,
	"medium_net_inflow" numeric,
	"small_net_inflow" numeric,
	"price" numeric,
	"top_stock_code" text,
	"top_stock_name" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fund_flow_rank_date_category_code_pk" PRIMARY KEY("date","category","code")
);
--> statement-breakpoint
ALTER TABLE "review_daily" ADD COLUMN "sections" jsonb;--> statement-breakpoint
UPDATE "review_daily" SET "sections" = '[]'::jsonb WHERE "sections" IS NULL;--> statement-breakpoint
ALTER TABLE "review_daily" ALTER COLUMN "sections" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "fund_flow_rank_date_category_idx" ON "fund_flow_rank" USING btree ("date","category");--> statement-breakpoint
ALTER TABLE "review_daily" DROP COLUMN "fundflow";--> statement-breakpoint
ALTER TABLE "review_daily" DROP COLUMN "mainline";--> statement-breakpoint
ALTER TABLE "review_daily" DROP COLUMN "stock_pool";