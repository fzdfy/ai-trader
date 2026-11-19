-- Custom SQL migration file, put your code below! --
ALTER TABLE "workflow_version"
  ADD CONSTRAINT "workflow_version_workflow_id_id_unq" UNIQUE ("workflow_id", "id");--> statement-breakpoint
ALTER TABLE "workflow_definition"
  ADD CONSTRAINT "workflow_definition_id_user_id_unq" UNIQUE ("id", "user_id");--> statement-breakpoint
ALTER TABLE "workflow_run"
  ADD CONSTRAINT "workflow_run_workflow_version_fk"
  FOREIGN KEY ("workflow_id", "version_id")
  REFERENCES "workflow_version" ("workflow_id", "id")
  ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "workflow_run"
  ADD CONSTRAINT "workflow_run_definition_owner_fk"
  FOREIGN KEY ("workflow_id", "user_id")
  REFERENCES "workflow_definition" ("id", "user_id")
  ON DELETE restrict;--> statement-breakpoint
CREATE FUNCTION "assert_workflow_current_version"() RETURNS trigger AS $$
BEGIN
  IF NEW."current_version" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "workflow_version"
    WHERE "workflow_id" = NEW."id"
      AND "version" = NEW."current_version"
  ) THEN
    RAISE EXCEPTION 'workflow current version does not belong to workflow'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "workflow_definition_current_version_check"
  BEFORE INSERT OR UPDATE OF "id", "current_version" ON "workflow_definition"
  FOR EACH ROW EXECUTE FUNCTION "assert_workflow_current_version"();
