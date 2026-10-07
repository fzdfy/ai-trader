ALTER TABLE "factor_evaluation" ADD COLUMN "turnover_mean" double precision;--> statement-breakpoint
ALTER TABLE "factor_evaluation" ADD COLUMN "rank_autocorr_mean" double precision;--> statement-breakpoint
ALTER TABLE "factor_evaluation" ADD COLUMN "long_short_beta" double precision;--> statement-breakpoint
ALTER TABLE "factor_evaluation" ADD COLUMN "long_short_alpha" double precision;--> statement-breakpoint
ALTER TABLE "factor_evaluation" ADD COLUMN "ic_skew" double precision;--> statement-breakpoint
ALTER TABLE "factor_evaluation" ADD COLUMN "ic_kurtosis" double precision;--> statement-breakpoint
ALTER TABLE "factor_evaluation" ADD COLUMN "diagnostics" jsonb;