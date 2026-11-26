CREATE TABLE "rotation_index_daily_bar" (
	"symbol" text NOT NULL,
	"trade_date" date NOT NULL,
	"open" numeric(20, 6) NOT NULL,
	"high" numeric(20, 6) NOT NULL,
	"low" numeric(20, 6) NOT NULL,
	"close" numeric(20, 6) NOT NULL,
	"volume" numeric(24, 4),
	"amount" numeric(24, 4),
	"source" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rotation_index_daily_bar_symbol_trade_date_pk" PRIMARY KEY("symbol","trade_date")
);
--> statement-breakpoint
CREATE INDEX "rotation_index_daily_symbol_date_idx" ON "rotation_index_daily_bar" USING btree ("symbol","trade_date" DESC NULLS LAST);