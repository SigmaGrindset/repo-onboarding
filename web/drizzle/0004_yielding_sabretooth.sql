CREATE TABLE "chat_quota" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_quota_user_id_day_pk" PRIMARY KEY("user_id","day")
);
