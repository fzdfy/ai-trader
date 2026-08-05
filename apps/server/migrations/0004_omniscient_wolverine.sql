CREATE TABLE "board_constituent" (
	"board_code" text NOT NULL,
	"type" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"change_percent" text,
	"turnover_rate" text,
	"amount" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "board_constituent_board_code_symbol_pk" PRIMARY KEY("board_code","symbol")
);
--> statement-breakpoint
CREATE INDEX "board_constituent_type_idx" ON "board_constituent" USING btree ("type");--> statement-breakpoint
CREATE INDEX "board_constituent_board_idx" ON "board_constituent" USING btree ("board_code");