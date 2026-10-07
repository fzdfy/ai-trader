ALTER TABLE "factor_iteration" ADD COLUMN "valid_ratio" double precision;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "split_date" text;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "valid_ic_mean" double precision;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "valid_rank_ic_mean" double precision;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "valid_icir" double precision;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "valid_long_short_ann_ret" double precision;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "valid_long_short_cum_ret" double precision;--> statement-breakpoint
ALTER TABLE "factor_iteration" ADD COLUMN "valid_sample_count" integer;