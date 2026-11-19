CREATE TABLE "data_incident" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset_key" text,
	"incident_type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"root_cause" text,
	"payload_json" jsonb NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	CONSTRAINT "data_incident_severity_check" CHECK ("data_incident"."severity" IN ('warning', 'critical')),
	CONSTRAINT "data_incident_status_check" CHECK ("data_incident"."status" IN ('open', 'acknowledged', 'resolving', 'resolved', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "data_incident_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"incident_id" bigint NOT NULL,
	"actor_user_id" text,
	"event_type" text NOT NULL,
	"message" text,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_quality_result" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset_key" text NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" integer NOT NULL,
	"status" text NOT NULL,
	"severity" text NOT NULL,
	"job_run_id" bigint,
	"request_id" text,
	"observed_value" numeric,
	"details_json" jsonb NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_quality_result_status_check" CHECK ("data_quality_result"."status" IN ('passed', 'warning', 'failed', 'error')),
	CONSTRAINT "data_quality_result_severity_check" CHECK ("data_quality_result"."severity" IN ('warning', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "work_task" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_type" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"owner_role" text NOT NULL,
	"related_type" text,
	"related_id" text,
	"payload_json" jsonb NOT NULL,
	"result_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "work_task_status_check" CHECK ("work_task"."status" IN ('pending', 'in_progress', 'completed', 'canceled')),
	CONSTRAINT "work_task_priority_check" CHECK ("work_task"."priority" IN ('normal', 'high', 'critical'))
);
--> statement-breakpoint
CREATE TABLE "work_task_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"actor_user_id" text,
	"event_type" text NOT NULL,
	"message" text,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_incident_event" ADD CONSTRAINT "data_incident_event_incident_id_data_incident_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."data_incident"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_result" ADD CONSTRAINT "data_quality_result_job_run_id_job_run_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_task_event" ADD CONSTRAINT "work_task_event_task_id_work_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_incident_asset_opened_idx" ON "data_incident" USING btree ("asset_key","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_incident_status_opened_idx" ON "data_incident" USING btree ("status","opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_incident_event_incident_created_idx" ON "data_incident_event" USING btree ("incident_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_quality_result_asset_checked_idx" ON "data_quality_result" USING btree ("asset_key","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_quality_result_rule_checked_idx" ON "data_quality_result" USING btree ("rule_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "data_quality_result_status_checked_idx" ON "data_quality_result" USING btree ("status","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_task_status_priority_idx" ON "work_task" USING btree ("status","priority","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_task_related_idx" ON "work_task" USING btree ("related_type","related_id","status");--> statement-breakpoint
CREATE INDEX "work_task_event_task_created_idx" ON "work_task_event" USING btree ("task_id","created_at" DESC NULLS LAST);