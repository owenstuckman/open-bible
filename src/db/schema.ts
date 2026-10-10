import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Color } from "../lib/highlights/types";

// Auth: one owner, any number of passkeys (phone, laptop, ...).
export const passkeys = pgTable("passkeys", {
  id: text("id").primaryKey(), // credential ID, base64url
  publicKey: text("public_key").notNull(), // base64url-encoded COSE key
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: text("transports").array(),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  nickname: text("nickname").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Small key/value store, e.g. which SETUP_TOKEN has already been used.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Bible text, one row per verse. `translation` lets a licensed text sit next
// to the public-domain placeholder.
export const verses = pgTable(
  "verses",
  {
    translation: text("translation").notNull(),
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    text: text("text").notNull(),
  },
  (t) => [primaryKey({ columns: [t.translation, t.bookId, t.chapter, t.verse] })],
);

// Footnotes/annotations that ship with a translation (Challoner's notes for
// Douay-Rheims; the NABRE's notes once licensed). `offset` places the marker
// inside the verse text; null means at the end of the verse.
export const footnotes = pgTable(
  "footnotes",
  {
    translation: text("translation").notNull(),
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    seq: integer("seq").notNull(), // order within the chapter
    offset: integer("offset"),
    label: text("label"), // the phrase being annotated, when known
    text: text("text").notNull(),
  },
  (t) => [primaryKey({ columns: [t.translation, t.bookId, t.chapter, t.seq] })],
);

// Notes are anchored to a verse range within one chapter. Refs are USFM book
// codes + numbers, so they survive a translation swap (modulo versification).
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    verseStart: integer("verse_start").notNull(),
    verseEnd: integer("verse_end").notNull(),
    quote: text("quote"), // selected text when the note was created, for context
    bodyMd: text("body_md").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_chapter_idx").on(t.bookId, t.chapter)],
);

// A highlight spans [start verse, start offset) → [end verse, end offset) within
// one chapter. Offsets are character positions in the verse text, so they are
// specific to the translation they were made in.
export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    translation: text("translation").notNull(),
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    verseStart: integer("verse_start").notNull(),
    startOffset: integer("start_offset").notNull(),
    verseEnd: integer("verse_end").notNull(),
    endOffset: integer("end_offset").notNull(),
    color: text("color").$type<Color>().notNull(),
    quote: text("quote"), // highlighted text, kept for re-anchoring after a translation swap
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("highlights_chapter_idx").on(t.translation, t.bookId, t.chapter)],
);

// Reading progress (single user). Verse reads are keyed by USFM ref, so they
// carry over between translations.
export const verseReads = pgTable(
  "verse_reads",
  {
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    firstReadAt: timestamp("first_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.bookId, t.chapter, t.verse] })],
);

export const chapterProgress = pgTable(
  "chapter_progress",
  {
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    manual: boolean("manual").notNull().default(false), // marked by hand rather than by reading
  },
  (t) => [primaryKey({ columns: [t.bookId, t.chapter] })],
);

// Where you left off; one row (id = 1).
export const readingState = pgTable("reading_state", {
  id: integer("id").primaryKey().default(1),
  bookId: text("book_id").notNull(),
  chapter: integer("chapter").notNull(),
  verse: integer("verse").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
