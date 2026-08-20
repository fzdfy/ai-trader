CREATE TABLE "review_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"fundflow" jsonb NOT NULL,
	"mainline" jsonb NOT NULL,
	"stock_pool" jsonb NOT NULL,
	"summary" text NOT NULL,
	"skill" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_skill" (
	"name" text PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_pool" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"score" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "stock_pool_date_idx" ON "stock_pool" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_pool_date_symbol_unq" ON "stock_pool" USING btree ("date","symbol");