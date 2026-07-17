ALTER TABLE "tour_progress" ALTER COLUMN "furthest_step" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tour_progress" ADD COLUMN "architecture_read" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tour_progress" ADD COLUMN "setup_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tour_progress" ADD COLUMN "selected_task_index" integer;