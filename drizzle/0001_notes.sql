CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse_start" integer NOT NULL,
	"verse_end" integer NOT NULL,
	"quote" text,
	"body_md" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notes_chapter_idx" ON "notes" USING btree ("book_id","chapter");