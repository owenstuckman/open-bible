import "server-only";
import { getDb } from "@/db";
import { chapterProgress, highlights, notes, readingState, verseReads } from "@/db/schema";
import { BOOKS, bookIndex, getBook } from "@/lib/bible/books";
import { formatRef } from "@/lib/bible/refs";
import { activeTranslation } from "@/lib/bible/text";

export const BACKUP_VERSION = 1;

export type Backup = {
  app: "open-bible";
  version: number;
  exportedAt: string;
  translation: string;
  notes: (typeof notes.$inferSelect)[];
  highlights: (typeof highlights.$inferSelect)[];
  verseReads: (typeof verseReads.$inferSelect)[];
  chapterProgress: (typeof chapterProgress.$inferSelect)[];
  readingState: (typeof readingState.$inferSelect) | null;
};

const byRef = <T extends { bookId: string; chapter: number }>(a: T, b: T, va = 0, vb = 0) =>
  bookIndex(a.bookId) - bookIndex(b.bookId) || a.chapter - b.chapter || va - vb;

/** Everything you've made: notes, highlights, reading progress. */
export async function buildBackup(): Promise<Backup> {
  const db = getDb();
  const [n, h, r, p, [s]] = await Promise.all([
    db.select().from(notes),
    db.select().from(highlights),
    db.select().from(verseReads),
    db.select().from(chapterProgress),
    db.select().from(readingState),
  ]);
  n.sort((a, b) => byRef(a, b, a.verseStart, b.verseStart));
  h.sort((a, b) => byRef(a, b, a.verseStart, b.verseStart));
  return {
    app: "open-bible",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    translation: activeTranslation(),
    notes: n,
    highlights: h,
    verseReads: r,
    chapterProgress: p,
    readingState: s ?? null,
  };
}

/** Notes (and highlighted passages) as a readable Markdown document. */
export function backupToMarkdown(b: Backup): string {
  const out: string[] = [`# Open Bible: my notes`, ``, `Exported ${b.exportedAt.slice(0, 10)}.`, ``];
  for (const book of BOOKS) {
    const ns = b.notes.filter((n) => n.bookId === book.id && n.bodyMd.trim());
    if (!ns.length) continue;
    out.push(`## ${book.name}`, ``);
    for (const n of ns) {
      out.push(`### ${formatRef(n.bookId, n.chapter, n.verseStart, n.verseEnd)}`, ``);
      if (n.quote) out.push(`> ${n.quote}`, ``);
      out.push(n.bodyMd.trim(), ``);
    }
  }
  const hs = b.highlights.filter((h) => h.translation === b.translation && h.quote);
  if (hs.length) {
    out.push(`## Highlights`, ``);
    for (const h of hs) {
      out.push(`- **${formatRef(h.bookId, h.chapter, h.verseStart, h.verseEnd)}** (${h.color}): “${h.quote}”`);
    }
    out.push(``);
  }
  return out.join("\n");
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const int = (x: unknown, min = 0, max = 100_000) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const str = (x: unknown, max = 50_000) => typeof x === "string" && x.length <= max;
const book = (x: unknown) => typeof x === "string" && !!getBook(x);
const date = (x: unknown) => (typeof x === "string" && !Number.isNaN(Date.parse(x)) ? new Date(x) : new Date());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLORS = ["yellow", "green", "blue", "pink"];

/**
 * Merges a backup into the database. Existing rows win (matched by id or
 * verse), so restoring twice is harmless. Returns counts of rows added.
 */
export async function restoreBackup(input: unknown) {
  if (!isObj(input) || input.app !== "open-bible" || input.version !== BACKUP_VERSION) {
    throw new Error("That file isn't an Open Bible backup.");
  }
  const arr = (k: string) => (Array.isArray(input[k]) ? (input[k] as unknown[]).filter(isObj) : []);
  const noteRows = arr("notes")
    .filter((n) => str(n.id) && UUID.test(n.id as string) && book(n.bookId) && int(n.chapter, 1, 200) && int(n.verseStart, 1, 200) && int(n.verseEnd, 1, 200) && str(n.bodyMd))
    .map((n) => ({
      id: n.id as string,
      bookId: n.bookId as string,
      chapter: n.chapter as number,
      verseStart: n.verseStart as number,
      verseEnd: n.verseEnd as number,
      quote: str(n.quote, 2000) ? (n.quote as string) : null,
      bodyMd: n.bodyMd as string,
      createdAt: date(n.createdAt),
      updatedAt: date(n.updatedAt),
    }));
  const hlRows = arr("highlights")
    .filter((h) => str(h.id) && UUID.test(h.id as string) && str(h.translation, 20) && book(h.bookId) && int(h.chapter, 1, 200) && int(h.verseStart, 1, 200) && int(h.verseEnd, 1, 200) && int(h.startOffset) && int(h.endOffset) && COLORS.includes(h.color as string))
    .map((h) => ({
      id: h.id as string,
      translation: h.translation as string,
      bookId: h.bookId as string,
      chapter: h.chapter as number,
      verseStart: h.verseStart as number,
      startOffset: h.startOffset as number,
      verseEnd: h.verseEnd as number,
      endOffset: h.endOffset as number,
      color: h.color as (typeof highlights.$inferInsert)["color"],
      quote: str(h.quote, 2000) ? (h.quote as string) : null,
      createdAt: date(h.createdAt),
    }));
  const readRows = arr("verseReads")
    .filter((r) => book(r.bookId) && int(r.chapter, 1, 200) && int(r.verse, 1, 200))
    .map((r) => ({ bookId: r.bookId as string, chapter: r.chapter as number, verse: r.verse as number, firstReadAt: date(r.firstReadAt) }));
  const progRows = arr("chapterProgress")
    .filter((p) => book(p.bookId) && int(p.chapter, 1, 200))
    .map((p) => ({ bookId: p.bookId as string, chapter: p.chapter as number, completedAt: date(p.completedAt), manual: p.manual === true }));
  const st = isObj(input.readingState) && book(input.readingState.bookId) && int(input.readingState.chapter, 1, 200) && int(input.readingState.verse, 1, 200) ? input.readingState : null;

  const db = getDb();
  return db.transaction(async (tx) => {
    const ins = async <T extends object>(table: Parameters<typeof tx.insert>[0], rows: T[]) => {
      let added = 0;
      for (let i = 0; i < rows.length; i += 1000) {
        const res = await tx.insert(table).values(rows.slice(i, i + 1000) as never).onConflictDoNothing().returning();
        added += res.length;
      }
      return added;
    };
    const counts = {
      notes: await ins(notes, noteRows),
      highlights: await ins(highlights, hlRows),
      verseReads: await ins(verseReads, readRows),
      chapterProgress: await ins(chapterProgress, progRows),
      readingState: 0,
    };
    if (st) {
      const res = await tx
        .insert(readingState)
        .values({ id: 1, bookId: st.bookId as string, chapter: st.chapter as number, verse: st.verse as number })
        .onConflictDoNothing()
        .returning();
      counts.readingState = res.length;
    }
    return counts;
  });
}
