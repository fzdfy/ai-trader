CREATE TABLE "user_work_task" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'custom' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_date" date,
	"due_time" time,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"blocked_reason" text,
	"completion_note" text,
	"source_type" text,
	"source_id" text,
	"context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"canceled_at" timestamp,
	CONSTRAINT "user_work_task_category_check" CHECK ("user_work_task"."category" IN ('research', 'review', 'screen', 'strategy', 'follow_up', 'custom')),
	CONSTRAINT "user_work_task_priority_check" CHECK ("user_work_task"."priority" IN ('low', 'normal', 'high')),
	CONSTRAINT "user_work_task_status_check" CHECK ("user_work_task"."status" IN ('pending', 'in_progress', 'completed', 'canceled')),
	CONSTRAINT "user_work_task_source_check" CHECK (("user_work_task"."source_type" IS NULL AND "user_work_task"."source_id" IS NULL) OR ("user_work_task"."source_type" IS NOT NULL AND "user_work_task"."source_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "user_work_task_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"actor_user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_work_task_event_type_check" CHECK ("user_work_task_event"."event_type" IN ('created', 'started', 'completed', 'reopened', 'canceled', 'restored'))
);
--> statement-breakpoint
ALTER TABLE "work_task" RENAME TO "governance_review_task";--> statement-breakpoint
ALTER TABLE "work_task_event" RENAME TO "governance_review_task_event";--> statement-breakpoint
ALTER TABLE "governance_review_task" DROP CONSTRAINT "work_task_status_check";--> statement-breakpoint
ALTER TABLE "governance_review_task" DROP CONSTRAINT "work_task_priority_check";--> statement-breakpoint
ALTER TABLE "governance_review_task_event" DROP CONSTRAINT "work_task_event_task_id_work_task_id_fk";
--> statement-breakpoint
DROP INDEX "work_task_status_priority_idx";--> statement-breakpoint
DROP INDEX "work_task_related_idx";--> statement-breakpoint
DROP INDEX "work_task_event_task_created_idx";--> statement-breakpoint
ALTER TABLE "user_work_task" ADD CONSTRAINT "user_work_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_work_task_event" ADD CONSTRAINT "user_work_task_event_task_id_user_work_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."user_work_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_work_task_event" ADD CONSTRAINT "user_work_task_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_work_task_board_idx" ON "user_work_task" USING btree ("user_id","status","scheduled_date","sort_order");--> statement-breakpoint
CREATE INDEX "user_work_task_completed_idx" ON "user_work_task" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "user_work_task_source_idx" ON "user_work_task" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "user_work_task_event_task_created_idx" ON "user_work_task_event" USING btree ("task_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "governance_review_task_event" ADD CONSTRAINT "governance_review_task_event_task_id_governance_review_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."governance_review_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "governance_review_task_status_priority_idx" ON "governance_review_task" USING btree ("status","priority","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "governance_review_task_related_idx" ON "governance_review_task" USING btree ("related_type","related_id","status");--> statement-breakpoint
CREATE INDEX "governance_review_task_event_task_created_idx" ON "governance_review_task_event" USING btree ("task_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "governance_review_task" ADD CONSTRAINT "governance_review_task_status_check" CHECK ("governance_review_task"."status" IN ('pending', 'in_progress', 'completed', 'canceled'));--> statement-breakpoint
ALTER TABLE "governance_review_task" ADD CONSTRAINT "governance_review_task_priority_check" CHECK ("governance_review_task"."priority" IN ('normal', 'high', 'critical'));