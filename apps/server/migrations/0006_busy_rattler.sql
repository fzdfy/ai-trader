CREATE TABLE "factor_registry" (
	"name" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"direction" integer DEFAULT 1 NOT NULL,
	"default_params" jsonb,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_set" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"definition_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_value" (
	"time" timestamp NOT NULL,
	"symbol" text NOT NULL,
	"feature_set_id" integer NOT NULL,
	"features_json" jsonb NOT NULL,
	"quality_flag" integer DEFAULT 0,
	CONSTRAINT "feature_value_time_symbol_feature_set_id_pk" PRIMARY KEY("time","symbol","feature_set_id")
);
--> statement-breakpoint
CREATE TABLE "strategy_config" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config_json" jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
