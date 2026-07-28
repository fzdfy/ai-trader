CREATE TABLE "bar1d_adj" (
	"time" timestamp NOT NULL,
	"symbol" text NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"amount" numeric,
	"avg_price" numeric,
	"indicators" jsonb,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar1d_adj_time_symbol_pk" PRIMARY KEY("time","symbol")
);
--> statement-breakpoint
CREATE TABLE "bar1m_adj" (
	"time" timestamp NOT NULL,
	"symbol" text NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"amount" numeric,
	"avg_price" numeric,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar1m_adj_time_symbol_pk" PRIMARY KEY("time","symbol")
);
--> statement-breakpoint
CREATE TABLE "board" (
	"code" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"rank" text NOT NULL,
	"change_percent" text,
	"popularity" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument" (
	"symbol" text PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"exchange" text NOT NULL,
	"market" text,
	"list_date" date,
	"delist_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_latest" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text,
	"ts" timestamp NOT NULL,
	"last" numeric,
	"open" numeric,
	"high" numeric,
	"low" numeric,
	"pre_close" numeric,
	"volume" numeric,
	"amount" numeric,
	"change" numeric,
	"change_pct" numeric,
	"turnover_rate" numeric,
	"pe" numeric,
	"pb" numeric,
	"limit_up" numeric,
	"limit_down" numeric,
	"bid1" numeric,
	"bid1_vol" numeric,
	"ask1" numeric,
	"ask1_vol" numeric,
	"bid2_5" jsonb,
	"ask2_5" jsonb,
	"status" text,
	"extra" jsonb,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_snapshot" (
	"time" timestamp NOT NULL,
	"symbol" text NOT NULL,
	"last" numeric,
	"bid1" numeric,
	"bid1_vol" numeric,
	"ask1" numeric,
	"ask1_vol" numeric,
	"bid_ask_depth" jsonb,
	"trigger" text,
	"extra" jsonb,
	"source_updated_at" timestamp,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quote_snapshot_time_symbol_pk" PRIMARY KEY("time","symbol")
);
--> statement-breakpoint
CREATE TABLE "trading_calendar" (
	"trade_date" date PRIMARY KEY NOT NULL,
	"is_trading_day" boolean DEFAULT false NOT NULL,
	"trade_type" text DEFAULT 'closed' NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "data_gap" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"missing_start" timestamp NOT NULL,
	"missing_end" timestamp NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"symbol" text,
	"timeframe" text,
	"range_start" timestamp,
	"range_end" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "symbol_subscription" (
	"symbol" text PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursor" (
	"source" text NOT NULL,
	"endpoint" text NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"cursor_time" timestamp,
	"cursor_token" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sync_cursor_source_endpoint_symbol_timeframe_unq" UNIQUE("source","endpoint","symbol","timeframe")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_symbol_unq" UNIQUE("user_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar1d_adj_symbol_time_idx" ON "bar1d_adj" USING btree ("symbol","time");--> statement-breakpoint
CREATE INDEX "bar1m_adj_symbol_time_idx" ON "bar1m_adj" USING btree ("symbol","time");