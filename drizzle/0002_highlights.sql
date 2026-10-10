CREATE TABLE "highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation" text NOT NULL,
	"book_id" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse_start" integer NOT NULL,
	"start_offset" integer NOT NULL,
	"verse_end" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"color" text NOT NULL,
	"quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "highlights_chapter_idx" ON "highlights" USING btree ("translation","book_id","chapter");