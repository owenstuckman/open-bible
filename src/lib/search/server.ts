import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notes, verses } from "@/db/schema";
import { BOOKS, bookIndex } from "@/lib/bible/books";
import { activeTranslation } from "@/lib/bible/text";
import { MARK_END, MARK_START } from "./marks";

export type Scope = "all" | "OT" | "NT" | string; // or a USFM book id

export type VerseHit = { book: string; chapter: number; verse: number; snippet: string };
export type NoteHit = { id: string; book: string; chapter: number; verseStart: number; verseEnd: number; snippet: string };

function booksFor(scope: Scope): string[] | null {
  if (scope === "all") return null;
  if (scope === "OT" || scope === "NT") return BOOKS.filter((b) => b.testament === scope).map((b) => b.id);
  return BOOKS.some((b) => b.id === scope) ? [scope] : null;
}

/** Full-text search over the Bible, ranked by relevance (ties in canonical order). */
export async function searchVerses(q: string, scope: Scope, limit: number, offset: number) {
  const db = getDb();
  const query = sql`websearch_to_tsquery('english', ${q})`;
  const doc = sql`to_tsvector('english', ${verses.text})`;
  const books = booksFor(scope);
  const where = and(
    eq(verses.translation, activeTranslation()),
    sql`${doc} @@ ${query}`,
    books ? inArray(verses.bookId, books) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        book: verses.bookId,
        chapter: verses.chapter,
        verse: verses.verse,
        rank: sql<number>`ts_rank(${doc}, ${query})`.mapWith(Number),
      })
      .from(verses)
      .where(where)
      .orderBy(desc(sql`ts_rank(${doc}, ${query})`))
      .limit(500),
    db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(verses).where(where),
  ]);
  // Postgres sorts book ids alphabetically; put equal-rank hits in Bible order instead.
  rows.sort((a, b) => b.rank - a.rank || bookIndex(a.book) - bookIndex(b.book) || a.chapter - b.chapter || a.verse - b.verse);
  const page = rows.slice(offset, offset + limit);
  if (!page.length) return { total, hits: [] as VerseHit[] };

  // Snippets only for the page being returned.
  const keys = sql.join(
    page.map((r) => sql`(${r.book}, ${r.chapter}::int, ${r.verse}::int)`),
    sql`, `,
  );
  const snippets = await db
    .select({
      book: verses.bookId,
      chapter: verses.chapter,
      verse: verses.verse,
      snippet: sql<string>`ts_headline('english', ${verses.text}, ${query}, ${`StartSel=${MARK_START}, StopSel=${MARK_END}, HighlightAll=true`})`,
    })
    .from(verses)
    .where(and(eq(verses.translation, activeTranslation()), sql`(${verses.bookId}, ${verses.chapter}, ${verses.verse}) in (${keys})`));
  const byKey = new Map(snippets.map((s) => [`${s.book}.${s.chapter}.${s.verse}`, s.snippet]));
  return {
    total,
    hits: page.map((r) => ({ book: r.book, chapter: r.chapter, verse: r.verse, snippet: byKey.get(`${r.book}.${r.chapter}.${r.verse}`) ?? "" })),
  };
}

/** Substring search over your notes (body and quoted text). */
export async function searchNotes(q: string, scope: Scope, limit: number): Promise<{ total: number; hits: NoteHit[] }> {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return { total: 0, hits: [] };
  const books = booksFor(scope);
  const rows = await getDb()
    .select()
    .from(notes)
    .where(
      and(
        ...words.map((w) => or(ilike(notes.bodyMd, `%${escapeLike(w)}%`), ilike(notes.quote, `%${escapeLike(w)}%`))),
        books ? inArray(notes.bookId, books) : undefined,
      ),
    )
    .limit(500);
  rows.sort((a, b) => bookIndex(a.bookId) - bookIndex(b.bookId) || a.chapter - b.chapter || a.verseStart - b.verseStart);
  return {
    total: rows.length,
    hits: rows.slice(0, limit).map((n) => ({
      id: n.id,
      book: n.bookId,
      chapter: n.chapter,
      verseStart: n.verseStart,
      verseEnd: n.verseEnd,
      snippet: snippet(`${n.quote ? `“${n.quote}” ` : ""}${n.bodyMd}`, words),
    })),
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A short excerpt around the first match, with matches wrapped in markers. */
function snippet(text: string, words: string[]): string {
  const flat = text.replace(/\s+/g, " ");
  const lower = flat.toLowerCase();
  const first = Math.min(...words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0));
  const from = Number.isFinite(first) ? Math.max(0, first - 60) : 0;
  let out = (from > 0 ? "…" : "") + flat.slice(from, from + 220) + (from + 220 < flat.length ? "…" : "");
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  out = out.replace(re, `${MARK_START}$1${MARK_END}`);
  return out;
}
