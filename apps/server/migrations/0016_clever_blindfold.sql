CREATE TABLE "board_fund_flow_period" (
	"date" date NOT NULL,
	"board_type" text NOT NULL,
	"period" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"change_percent" numeric,
	"main_net_inflow" numeric,
	"main_net_inflow_percent" numeric,
	"top_stock_code" text,
	"top_stock_name" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_fund_flow_period_date_board_type_period_code_pk" PRIMARY KEY("date","board_type","period","code")
);
--> statement-breakpoint
CREATE TABLE "dragon_tiger_daily" (
	"date" date NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"reason" text,
	"close" numeric,
	"change_percent" numeric,
	"net_buy_wan" numeric,
	"buy_wan" numeric,
	"sell_wan" numeric,
	"turnover_percent" numeric,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dragon_tiger_daily_date_symbol_pk" PRIMARY KEY("date","symbol")
);
--> statement-breakpoint
CREATE TABLE "hot_reason" (
	"date" date NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"reason" text,
	"close" numeric,
	"change" numeric,
	"change_percent" numeric,
	"turnover_rate" numeric,
	"amount" numeric,
	"volume" numeric,
	"large_order_net" numeric,
	"market" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hot_reason_date_symbol_pk" PRIMARY KEY("date","symbol")
);
--> statement-breakpoint
ALTER TABLE "instrument" ALTER COLUMN "status" SET DEFAULT 'listed';--> statement-breakpoint
CREATE INDEX "bff_period_date_type_idx" ON "board_fund_flow_period" USING btree ("date","board_type","period");--> statement-breakpoint
CREATE INDEX "dragon_tiger_daily_date_idx" ON "dragon_tiger_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "hot_reason_date_idx" ON "hot_reason" USING btree ("date");