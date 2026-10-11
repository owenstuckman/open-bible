CREATE TABLE "reading_plans" (
	"plan_key" text PRIMARY KEY NOT NULL,
	"start_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
