ALTER TABLE "analyses" ADD COLUMN "repo_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "analyses_owner_repo_key_created_at_idx" ON "analyses" USING btree ("owner_id","repo_key","created_at");--> statement-breakpoint
-- One-time backfill of repo_key for rows written before this column existed.
-- Mirrors repoKeyFor() in web/src/lib/repo-key.ts exactly; keep the two in sync.
UPDATE "analyses" SET "repo_key" = CASE
  WHEN "repo_url" IS NOT NULL AND "repo_url" <> ''
    THEN regexp_replace(regexp_replace(lower("repo_url"), '^https?://(www\.)?', ''), '(\.git)?/*$', '')
  ELSE 'name:' || lower(trim("repo_name"))
END WHERE "repo_key" = '';