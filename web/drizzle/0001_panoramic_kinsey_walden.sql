ALTER TABLE "analyses" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_share_token_unique" UNIQUE("share_token");