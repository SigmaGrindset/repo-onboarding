CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"repo_name" text NOT NULL,
	"repo_url" text,
	"blob_key" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_access" (
	"analysis_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "analysis_access_analysis_id_user_id_pk" PRIMARY KEY("analysis_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "analysis_access" ADD CONSTRAINT "analysis_access_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;