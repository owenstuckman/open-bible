CREATE TABLE "chapter_progress" (
	"book_id" text NOT NULL,
	"chapter" integer NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	CONSTRAINT "chapter_progress_book_id_chapter_pk" PRIMARY KEY("book_id","chapter")
);
--> statement-breakpoint
CREATE TABLE "reading_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"book_id" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verse_reads" (
	"book_id" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"first_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verse_reads_book_id_chapter_verse_pk" PRIMARY KEY("book_id","chapter","verse")
);
