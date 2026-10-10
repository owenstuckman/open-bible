CREATE TABLE "footnotes" (
	"translation" text NOT NULL,
	"book_id" text NOT NULL,
	"chapter" integer NOT NULL,
	"verse" integer NOT NULL,
	"seq" integer NOT NULL,
	"offset" integer,
	"label" text,
	"text" text NOT NULL,
	CONSTRAINT "footnotes_translation_book_id_chapter_seq_pk" PRIMARY KEY("translation","book_id","chapter","seq")
);
