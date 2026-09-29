ALTER TABLE "bar1d_adj" RENAME TO "bar1d_adj_legacy";--> statement-breakpoint
ALTER INDEX "bar1d_adj_symbol_time_idx" RENAME TO "bar1d_adj_legacy_symbol_time_idx";--> statement-breakpoint
ALTER TABLE "bar1d_adj_legacy" RENAME CONSTRAINT "bar1d_adj_time_symbol_pk" TO "bar1d_adj_legacy_time_symbol_pk";
