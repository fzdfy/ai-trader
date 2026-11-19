CREATE TABLE "workflow_definition" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"draft_graph" jsonb NOT NULL,
	"current_version" integer,
	"enabled" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_node_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workflow_run_id" integer NOT NULL,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"input_summary" jsonb,
	"output_summary" jsonb,
	"result_ref" jsonb,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_ref" text,
	"current_node_id" text,
	"context_json" jsonb,
	"error" text,
	"cancel_requested_at" timestamp,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_version" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"version" integer NOT NULL,
	"graph_json" jsonb NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_definition" ADD CONSTRAINT "workflow_definition_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_node_run" ADD CONSTRAINT "workflow_node_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflow_id_workflow_definition_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_version_id_workflow_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_version" ADD CONSTRAINT "workflow_version_workflow_id_workflow_definition_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_definition_user_active_idx" ON "workflow_definition" USING btree ("user_id","archived_at");--> statement-breakpoint
CREATE INDEX "workflow_definition_user_updated_idx" ON "workflow_definition" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_node_run_run_node_unq" ON "workflow_node_run" USING btree ("workflow_run_id","node_id");--> statement-breakpoint
CREATE INDEX "workflow_node_run_run_idx" ON "workflow_node_run" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "workflow_run_user_created_idx" ON "workflow_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_workflow_created_idx" ON "workflow_run" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_run_cleanup_idx" ON "workflow_run" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_run_single_active_unq" ON "workflow_run" USING btree ("workflow_id") WHERE "workflow_run"."status" in ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_version_workflow_version_unq" ON "workflow_version" USING btree ("workflow_id","version");--> statement-breakpoint
CREATE INDEX "workflow_version_trigger_idx" ON "workflow_version" USING btree ("trigger_type");