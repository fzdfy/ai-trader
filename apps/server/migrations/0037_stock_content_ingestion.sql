DELETE FROM "company_announcement" AS older
USING "company_announcement" AS newer
WHERE older."source" = newer."source"
  AND older."source_url" = newer."source_url"
  AND older."id" < newer."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "company_announcement_source_url_unq" ON "company_announcement" USING btree ("source","source_url");
