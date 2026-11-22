CREATE TABLE "market_asset_daily_bar" (
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
	CONSTRAINT "market_asset_daily_bar_symbol_trade_date_pk" PRIMARY KEY("symbol","trade_date")
);
--> statement-breakpoint
CREATE TABLE "market_asset_minute_bar" (
	"symbol" text NOT NULL,
	"session_date" date NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"open" numeric(20, 6) NOT NULL,
	"high" numeric(20, 6) NOT NULL,
	"low" numeric(20, 6) NOT NULL,
	"close" numeric(20, 6) NOT NULL,
	"volume" numeric(24, 4),
	"amount" numeric(24, 4),
	"source" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_asset_minute_bar_symbol_bucket_start_pk" PRIMARY KEY("symbol","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "market_asset_quote" (
	"symbol" text NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"pre_close" numeric(20, 6),
	"open" numeric(20, 6),
	"high" numeric(20, 6),
	"low" numeric(20, 6),
	"change_pct" numeric(12, 6),
	"volume" numeric(24, 4),
	"amount" numeric(24, 4),
	"quoted_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"quality" text NOT NULL,
	"stale_reason" text,
	"fallback_reason" text,
	"raw" jsonb,
	CONSTRAINT "market_asset_quote_symbol_pk" PRIMARY KEY("symbol")
);
--> statement-breakpoint
CREATE INDEX "market_asset_daily_symbol_date_idx" ON "market_asset_daily_bar" USING btree ("symbol","trade_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "market_asset_minute_symbol_bucket_idx" ON "market_asset_minute_bar" USING btree ("symbol","bucket_start" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "market_asset_minute_session_idx" ON "market_asset_minute_bar" USING btree ("session_date");