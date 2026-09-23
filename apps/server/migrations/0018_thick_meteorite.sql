ALTER TABLE "factor_registry" ADD COLUMN "kind" text DEFAULT 'expression' NOT NULL;--> statement-breakpoint
ALTER TABLE "factor_registry" ADD COLUMN "code" text;