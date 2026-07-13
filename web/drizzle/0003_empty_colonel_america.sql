CREATE TABLE "tour_progress" (
	"analysis_id" text NOT NULL,
	"user_id" text NOT NULL,
	"furthest_step" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_progress_analysis_id_user_id_pk" PRIMARY KEY("analysis_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "tour_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tour_progress" ADD CONSTRAINT "tour_progress_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;