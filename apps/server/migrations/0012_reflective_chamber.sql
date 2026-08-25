CREATE TABLE "board_kline" (
	"code" text NOT NULL,
	"time" timestamp NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric NOT NULL,
	"amount" numeric,
	"ingested_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_kline_code_time_pk" PRIMARY KEY("code","time")
);
--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "leader" text;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "leader_change" text;--> statement-breakpoint
CREATE INDEX "board_kline_code_time_idx" ON "board_kline" USING btree ("code","time");