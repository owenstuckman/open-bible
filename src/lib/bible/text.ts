import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { verses } from "@/db/schema";
import { BOOKS, bookIndex, getBook } from "./books";

// The text source behind the reader. Swapping translations (Douay-Rheims
// placeholder → NABRE once licensed) means seeding new rows and changing
// BIBLE_TRANSLATION; nothing that keys off USFM refs has to change.

export type TranslationId = "dra" | "nabre";

export const TRANSLATIONS: Record<TranslationId, { name: string; notice: string }> = {
  dra: {
    name: "Douay-Rheims (Challoner)",
    notice:
      "Douay-Rheims Bible, Challoner revision. Public domain. Used as a placeholder until the NABRE license is in place.",
  },
  nabre: {
    name: "New American Bible, Revised Edition",
    notice:
      "Scripture texts in this work are taken from the New American Bible, revised edition © 2010, 1991, 1986, 1970 Confraternity of Christian Doctrine, Washington, D.C. and are used by permission of the copyright owner. All Rights Reserved.",
  },
};

export function activeTranslation(): TranslationId {
  return process.env.BIBLE_TRANSLATION === "nabre" ? "nabre" : "dra";
}

export type Verse = { n: number; text: string };
export type ChapterRef = { book: string; chapter: number };
export type Chapter = {
  book: string;
  bookName: string;
  chapter: number;
  chapterCount: number;
  verses: Verse[];
  prev: ChapterRef | null;
  next: ChapterRef | null;
};

/** Chapters per book for a translation, e.g. { GEN: 50, ... }. */
export async function getChapterCounts(translation: TranslationId): Promise<Record<string, number>> {
  "use cache";
  cacheLife("max");
  cacheTag(`text:${translation}`);

  const rows = await getDb()
    .select({ bookId: verses.bookId, chapters: sql<number>`max(${verses.chapter})`.mapWith(Number) })
    .from(verses)
    .where(eq(verses.translation, translation))
    .groupBy(verses.bookId);
  return Object.fromEntries(rows.map((r) => [r.bookId, r.chapters]));
}

/** One chapter plus links to its neighbours, crossing book boundaries. */
export async function getChapter(
  translation: TranslationId,
  bookId: string,
  chapter: number,
): Promise<Chapter | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`text:${translation}`);

  const book = getBook(bookId);
  const counts = await getChapterCounts(translation);
  const count = book ? counts[book.id] : undefined;
  if (!book || !count || !Number.isInteger(chapter) || chapter < 1 || chapter > count) return null;

  const rows = await getDb()
    .select({ n: verses.verse, text: verses.text })
    .from(verses)
    .where(
      and(eq(verses.translation, translation), eq(verses.bookId, book.id), eq(verses.chapter, chapter)),
    )
    .orderBy(asc(verses.verse));

  return {
    book: book.id,
    bookName: book.name,
    chapter,
    chapterCount: count,
    verses: rows,
    prev: neighbour(counts, book.id, chapter, -1),
    next: neighbour(counts, book.id, chapter, 1),
  };
}

function neighbour(
  counts: Record<string, number>,
  bookId: string,
  chapter: number,
  dir: 1 | -1,
): ChapterRef | null {
  const target = chapter + dir;
  if (target >= 1 && target <= (counts[bookId] ?? 0)) return { book: bookId, chapter: target };
  // Step to the adjacent book that has text in this translation.
  for (let i = bookIndex(bookId) + dir; i >= 0 && i < BOOKS.length; i += dir) {
    const id = BOOKS[i].id;
    if (counts[id]) return { book: id, chapter: dir === 1 ? 1 : counts[id] };
  }
  return null;
}
