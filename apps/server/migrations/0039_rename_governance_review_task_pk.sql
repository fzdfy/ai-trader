-- Custom SQL migration file, put your code below! --
ALTER TABLE "governance_review_task" RENAME CONSTRAINT "work_task_pkey" TO "governance_review_task_pkey";
--> statement-breakpoint
ALTER TABLE "governance_review_task_event" RENAME CONSTRAINT "work_task_event_pkey" TO "governance_review_task_event_pkey";
