CREATE TABLE "board_history" (
	"date" date NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"rank" text NOT NULL,
	"change_percent" text,
	"popularity" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_history_date_code_pk" PRIMARY KEY("date","code")
);
--> statement-breakpoint
CREATE INDEX "board_history_type_date_idx" ON "board_history" USING btree ("type","date");