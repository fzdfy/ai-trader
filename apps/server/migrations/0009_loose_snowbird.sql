ALTER TABLE "factor_registry" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "strategy_config" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;