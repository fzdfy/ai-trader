CREATE TABLE "technical_signal_snapshot" (
	"object_type" text NOT NULL,
	"object_subtype" text DEFAULT '' NOT NULL,
	"object_code" text NOT NULL,
	"as_of" text NOT NULL,
	"catalog_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"definition_hash" text NOT NULL,
	"input_hash" text NOT NULL,
	"quality" text NOT NULL,
	"data_sources_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signals_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "technical_signal_snapshot_object_type_object_subtype_object_code_as_of_catalog_version_pk" PRIMARY KEY("object_type","object_subtype","object_code","as_of","catalog_version"),
	CONSTRAINT "technical_signal_snapshot_object_type_chk" CHECK ("technical_signal_snapshot"."object_type" in ('market', 'sector', 'stock', 'gold')),
	CONSTRAINT "technical_signal_snapshot_subtype_chk" CHECK ((
        ("technical_signal_snapshot"."object_type" = 'sector' and "technical_signal_snapshot"."object_subtype" in ('industry', 'concept'))
        or
        ("technical_signal_snapshot"."object_type" <> 'sector' and "technical_signal_snapshot"."object_subtype" = '')
      )),
	CONSTRAINT "technical_signal_snapshot_quality_chk" CHECK ("technical_signal_snapshot"."quality" in ('available', 'low', 'missing'))
);
--> statement-breakpoint
CREATE TABLE "technical_signal_trigger" (
	"object_type" text NOT NULL,
	"object_subtype" text DEFAULT '' NOT NULL,
	"object_code" text NOT NULL,
	"as_of" text NOT NULL,
	"catalog_version" text NOT NULL,
	"signal_id" text NOT NULL,
	"layer" text NOT NULL,
	"status" text NOT NULL,
	"direction" text NOT NULL,
	"value_numeric" numeric(30, 10),
	"value_text" text,
	"quality" text NOT NULL,
	"evidence_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_signal_trigger_object_type_object_subtype_object_code_as_of_catalog_version_signal_id_pk" PRIMARY KEY("object_type","object_subtype","object_code","as_of","catalog_version","signal_id"),
	CONSTRAINT "technical_signal_trigger_object_type_chk" CHECK ("technical_signal_trigger"."object_type" in ('market', 'sector', 'stock', 'gold')),
	CONSTRAINT "technical_signal_trigger_subtype_chk" CHECK ((
        ("technical_signal_trigger"."object_type" = 'sector' and "technical_signal_trigger"."object_subtype" in ('industry', 'concept'))
        or
        ("technical_signal_trigger"."object_type" <> 'sector' and "technical_signal_trigger"."object_subtype" = '')
      )),
	CONSTRAINT "technical_signal_trigger_layer_chk" CHECK ("technical_signal_trigger"."layer" in ('basic', 'pattern', 'advanced', 'micro')),
	CONSTRAINT "technical_signal_trigger_status_chk" CHECK ("technical_signal_trigger"."status" in ('triggered', 'invalidated', 'low-confidence', 'unavailable'))
);
--> statement-breakpoint
CREATE TABLE "technical_signal_validation" (
	"signal_id" text NOT NULL,
	"scope" text NOT NULL,
	"horizon" integer NOT NULL,
	"catalog_version" text NOT NULL,
	"validation_version" text NOT NULL,
	"sample_count" integer NOT NULL,
	"win_rate" numeric(12, 6),
	"profit_loss_ratio" numeric(20, 6),
	"expected_return" numeric(20, 10),
	"max_drawdown" numeric(20, 10),
	"validation_start" date NOT NULL,
	"validation_end" date NOT NULL,
	"object_scope" jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "technical_signal_validation_signal_id_scope_horizon_catalog_version_validation_version_pk" PRIMARY KEY("signal_id","scope","horizon","catalog_version","validation_version"),
	CONSTRAINT "technical_signal_validation_scope_chk" CHECK ("technical_signal_validation"."scope" in ('market', 'sector', 'stock', 'gold')),
	CONSTRAINT "technical_signal_validation_horizon_chk" CHECK ("technical_signal_validation"."horizon" in (5, 20, 60)),
	CONSTRAINT "technical_signal_validation_sample_chk" CHECK ("technical_signal_validation"."sample_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "technical_signal_snapshot_object_date_idx" ON "technical_signal_snapshot" USING btree ("object_type","object_subtype","object_code","as_of" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "technical_signal_trigger_status_date_idx" ON "technical_signal_trigger" USING btree ("status","as_of" DESC NULLS LAST,"object_type","object_subtype");--> statement-breakpoint
CREATE INDEX "technical_signal_trigger_signal_date_idx" ON "technical_signal_trigger" USING btree ("signal_id","as_of" DESC NULLS LAST);