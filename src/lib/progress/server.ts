import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { chapterProgress, highlights, notes, readingState, verseReads, verses } from "@/db/schema";
import { BOOKS, getBook } from "@/lib/bible/books";
import { activeTranslation, getChapterCounts, type TranslationId } from "@/lib/bible/text";

/** A chapter counts as read once this share of its verses has been seen. */
export const COMPLETE_RATIO = 0.9;

export type VerseRefInput = { book: string; chapter: number; verse: number };

/** Verse count per chapter, keyed "BOOK.chapter". */
export async function getVerseCounts(translation: TranslationId): Promise<Record<string, number>> {
  "use cache";
  cacheLife("max");
  cacheTag(`text:${translation}`);
  const rows = await getDb()
    .select({ bookId: verses.bookId, chapter: verses.chapter, n: count() })
    .from(verses)
    .where(eq(verses.translation, translation))
    .groupBy(verses.bookId, verses.chapter);
  return Object.fromEntries(rows.map((r) => [`${r.bookId}.${r.chapter}`, r.n]));
}

const isRef = (r: unknown): r is VerseRefInput => {
  const x = r as VerseRefInput;
  return (
    !!x &&
    typeof x.book === "string" &&
    !!getBook(x.book) &&
    Number.isInteger(x.chapter) &&
    x.chapter >= 1 &&
    x.chapter <= 200 &&
    Number.isInteger(x.verse) &&
    x.verse >= 1 &&
    x.verse <= 200
  );
};

export function cleanRefs(input: unknown, max = 500): VerseRefInput[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, max)
    .filter(isRef)
    .map((r) => ({ book: getBook(r.book)!.id, chapter: r.chapter, verse: r.verse }));
}

export const cleanRef = (input: unknown): VerseRefInput | null => cleanRefs([input])[0] ?? null;

/**
 * Records verse reads and saves the reading position. Returns the chapters
 * that became complete as a result.
 */
export async function recordReads(reads: VerseRefInput[], position: VerseRefInput | null): Promise<string[]> {
  const db = getDb();
  if (position) {
    await db
      .insert(readingState)
      .values({ id: 1, bookId: position.book, chapter: position.chapter, verse: position.verse })
      .onConflictDoUpdate({
        target: readingState.id,
        set: { bookId: position.book, chapter: position.chapter, verse: position.verse, updatedAt: new Date() },
      });
  }
  if (!reads.length) return [];

  await db
    .insert(verseReads)
    .values(reads.map((r) => ({ bookId: r.book, chapter: r.chapter, verse: r.verse })))
    .onConflictDoNothing();

  const totals = await getVerseCounts(activeTranslation());
  const touched = [...new Set(reads.map((r) => `${r.book}.${r.chapter}`))];
  const done: string[] = [];
  for (const key of touched) {
    const [book, ch] = key.split(".");
    const chapter = Number(ch);
    const total = totals[key];
    if (!total) continue;
    const [{ n }] = await db
      .select({ n: count() })
      .from(verseReads)
      .where(and(eq(verseReads.bookId, book), eq(verseReads.chapter, chapter)));
    if (n >= Math.ceil(total * COMPLETE_RATIO)) {
      const inserted = await db
        .insert(chapterProgress)
        .values({ bookId: book, chapter })
        .onConflictDoNothing()
        .returning({ bookId: chapterProgress.bookId });
      if (inserted.length) done.push(key);
    }
  }
  return done;
}

export async function setChapterRead(book: string, chapter: number, read: boolean) {
  const db = getDb();
  if (read) {
    await db
      .insert(chapterProgress)
      .values({ bookId: book, chapter, manual: true })
      .onConflictDoUpdate({
        target: [chapterProgress.bookId, chapterProgress.chapter],
        set: { manual: true, completedAt: new Date() },
      });
  } else {
    // Unmarking also forgets the verse reads, so it won't auto-complete again
    // until you actually read it.
    await db.delete(chapterProgress).where(and(eq(chapterProgress.bookId, book), eq(chapterProgress.chapter, chapter)));
    await db.delete(verseReads).where(and(eq(verseReads.bookId, book), eq(verseReads.chapter, chapter)));
  }
}

export type ProgressSummary = {
  completed: Record<string, number[]>; // book → completed chapters
  chapterCounts: Record<string, number>;
  totals: { chapters: number; completed: number; notes: number; highlights: number };
  position: { book: string; chapter: number; verse: number; updatedAt: string } | null;
  lastReadAt: string | null;
};

export async function getSummary(): Promise<ProgressSummary> {
  const db = getDb();
  const translation = activeTranslation();
  const chapterCounts = await getChapterCounts(translation);
  const known = BOOKS.filter((b) => chapterCounts[b.id]).map((b) => b.id);

  const [rows, [state], [{ n: noteCount }], [{ n: hlCount }], [last]] = await Promise.all([
    db
      .select({ bookId: chapterProgress.bookId, chapter: chapterProgress.chapter })
      .from(chapterProgress)
      .where(inArray(chapterProgress.bookId, known)),
    db.select().from(readingState).where(eq(readingState.id, 1)).limit(1),
    db.select({ n: count() }).from(notes),
    db.select({ n: count() }).from(highlights).where(eq(highlights.translation, translation)),
    db.select({ at: sql<Date | null>`max(${verseReads.firstReadAt})` }).from(verseReads),
  ]);

  const completed: Record<string, number[]> = {};
  let done = 0;
  for (const r of rows) {
    if (r.chapter > (chapterCounts[r.bookId] ?? 0)) continue; // e.g. marked under another translation
    (completed[r.bookId] ??= []).push(r.chapter);
    done++;
  }
  for (const k in completed) completed[k].sort((a, b) => a - b);

  const lastAt = last?.at ? new Date(last.at).toISOString() : null;
  return {
    completed,
    chapterCounts,
    totals: {
      chapters: Object.values(chapterCounts).reduce((a, b) => a + b, 0),
      completed: done,
      notes: noteCount,
      highlights: hlCount,
    },
    position: state
      ? { book: state.bookId, chapter: state.chapter, verse: state.verse, updatedAt: state.updatedAt.toISOString() }
      : null,
    lastReadAt: lastAt,
  };
}

export async function getPosition() {
  const [state] = await getDb().select().from(readingState).where(eq(readingState.id, 1)).limit(1);
  return state ?? null;
}
