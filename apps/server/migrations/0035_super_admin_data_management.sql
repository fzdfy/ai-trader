CREATE TABLE "admin_operation_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_job_type" text,
	"reason" text,
	"request_id" text NOT NULL,
	"job_run_id" integer,
	"status" text DEFAULT 'accepted' NOT NULL,
	"input_json" jsonb NOT NULL,
	"result_json" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX "admin_operation_audit_created_idx" ON "admin_operation_audit" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_operation_audit_actor_created_idx" ON "admin_operation_audit" USING btree ("actor_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_operation_audit_status_idx" ON "admin_operation_audit" USING btree ("status");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" IN ('user', 'super_admin'));