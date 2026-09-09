CREATE TABLE "stock_metric" (
	"kind" text NOT NULL,
	"preset" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"display_name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"instruction" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stock_metric_kind_preset_pk" PRIMARY KEY("kind","preset")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stock_metric_kind_default_unq" ON "stock_metric" USING btree ("kind") WHERE "stock_metric"."is_default" = true;