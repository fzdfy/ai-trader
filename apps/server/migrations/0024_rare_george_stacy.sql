CREATE INDEX "bar_period_adj_time_idx" ON "bar_period_adj" USING btree ("time");--> statement-breakpoint
CREATE INDEX "board_kline_time_idx" ON "board_kline" USING btree ("time");