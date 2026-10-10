// Moves your notes, highlights and reading progress from the Douay-Rheims
// placeholder onto the NABRE's verse numbering. Run it once, after seeding the
// NABRE and before switching BIBLE_TRANSLATION.
//
//   npm run swap-translation              → dry run: report what would change
//   npm run swap-translation -- --apply   → do it (in one transaction)
//
// What it does:
// - notes, verse reads, chapter progress and the resume position are renumbered
//   with src/lib/bible/versification.ts (Psalms, Joel, Malachi)
// - highlights can't keep character offsets across translations, so each one
//   becomes a whole-verse highlight in the NABRE; the Douay-Rheims ones stay
// - chapters are re-checked for completion against the NABRE's verse counts
// - notes in books with numbering differences it doesn't handle are listed for review
import { drizzle } from "drizzle-orm/postgres-js";
import { and, count, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import {
  appMeta,
  chapterProgress,
  highlights,
  notes,
  readingState,
  verseReads,
  verses,
} from "../src/db/schema";
import { REVIEW_BOOKS, draToNabre, type Ref } from "../src/lib/bible/versification";

const FROM = "dra";
const TO = "nabre";
const META_KEY = "versification";
const COMPLETE_RATIO = 0.9; // keep in sync with src/lib/progress/server.ts

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (try: vercel env pull .env.local)");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  try {
    const [done] = await db.select().from(appMeta).where(eq(appMeta.key, META_KEY));
    if (done?.value === TO) {
      console.log(`Already swapped to ${TO}; nothing to do.`);
      return;
    }

    // The target text must be loaded first.
    const counts = await db
      .select({ bookId: verses.bookId, chapter: verses.chapter, n: count() })
      .from(verses)
      .where(eq(verses.translation, TO))
      .groupBy(verses.bookId, verses.chapter);
    if (counts.length < 1000) {
      throw new Error(`The ${TO} text isn't seeded (found ${counts.length} chapters). Run: npm run db:seed -- <file>`);
    }
    const verseCount = new Map(counts.map((c) => [`${c.bookId}.${c.chapter}`, c.n]));
    const lastVerse = async (book: string, chapter: number) => {
      const [r] = await db
        .select({ v: sql<number>`max(${verses.verse})`.mapWith(Number) })
        .from(verses)
        .where(and(eq(verses.translation, TO), eq(verses.bookId, book), eq(verses.chapter, chapter)));
      return r?.v ?? 0;
    };
    const verseLength = async (book: string, chapter: number, verse: number) => {
      const [r] = await db
        .select({ t: verses.text })
        .from(verses)
        .where(
          and(eq(verses.translation, TO), eq(verses.bookId, book), eq(verses.chapter, chapter), eq(verses.verse, verse)),
        );
      return r?.t.length ?? null;
    };
    const fmt = (r: Ref) => `${r.book} ${r.chapter}:${r.verse}`;
    const moved = (a: Ref, b: Ref) => a.chapter !== b.chapter || a.verse !== b.verse;

    // ---- notes
    const noteRows = await db.select().from(notes);
    const noteUpdates: { id: string; chapter: number; verseStart: number; verseEnd: number }[] = [];
    const review: string[] = [];
    const warnings: string[] = [];
    for (const n of noteRows) {
      const s = draToNabre({ book: n.bookId, chapter: n.chapter, verse: n.verseStart });
      let e = draToNabre({ book: n.bookId, chapter: n.chapter, verse: n.verseEnd });
      if (e.chapter !== s.chapter) {
        e = { ...s, verse: await lastVerse(s.book, s.chapter) };
        warnings.push(`note ${fmt(s)}: range crossed a psalm split; now ends at ${fmt(e)}`);
      }
      if (!verseCount.has(`${s.book}.${s.chapter}`) || (await verseLength(s.book, s.chapter, s.verse)) === null) {
        warnings.push(`note at ${fmt(s)}: that verse doesn't exist in ${TO}; check it`);
      }
      if (REVIEW_BOOKS[n.bookId]) review.push(`${fmt(s)} (${REVIEW_BOOKS[n.bookId]})`);
      if (moved({ book: n.bookId, chapter: n.chapter, verse: n.verseStart }, s) || e.verse !== n.verseEnd) {
        noteUpdates.push({ id: n.id, chapter: s.chapter, verseStart: s.verse, verseEnd: e.verse });
      }
    }

    // ---- verse reads
    const reads = await db.select().from(verseReads);
    const mappedReads = new Map<string, Ref & { firstReadAt: Date }>();
    for (const r of reads) {
      const m = draToNabre({ book: r.bookId, chapter: r.chapter, verse: r.verse });
      const k = fmt(m);
      if (!mappedReads.has(k)) mappedReads.set(k, { ...m, firstReadAt: r.firstReadAt });
    }
    const readsMoved = reads.filter((r) => moved({ book: r.bookId, chapter: r.chapter, verse: r.verse }, draToNabre({ book: r.bookId, chapter: r.chapter, verse: r.verse }))).length;

    // ---- chapter progress: keep manual marks (renumbered); recompute the rest
    const progress = await db.select().from(chapterProgress);
    const manual = new Map<string, { bookId: string; chapter: number; completedAt: Date }>();
    for (const p of progress.filter((p) => p.manual)) {
      const m = draToNabre({ book: p.bookId, chapter: p.chapter, verse: 1 });
      manual.set(`${m.book}.${m.chapter}`, { bookId: m.book, chapter: m.chapter, completedAt: p.completedAt });
    }
    const readsPerChapter = new Map<string, number>();
    for (const r of mappedReads.values()) {
      const k = `${r.book}.${r.chapter}`;
      readsPerChapter.set(k, (readsPerChapter.get(k) ?? 0) + 1);
    }
    const auto = [...readsPerChapter]
      .filter(([k, n]) => !manual.has(k) && verseCount.has(k) && n >= Math.ceil(verseCount.get(k)! * COMPLETE_RATIO))
      .map(([k]) => {
        const [bookId, ch] = k.split(".");
        return { bookId, chapter: Number(ch) };
      });

    // ---- resume position
    const [state] = await db.select().from(readingState);
    const newState = state ? draToNabre({ book: state.bookId, chapter: state.chapter, verse: state.verse }) : null;

    // ---- highlights → whole-verse highlights in the new translation
    const hls = await db.select().from(highlights).where(eq(highlights.translation, FROM));
    const newHls: (typeof highlights.$inferInsert)[] = [];
    for (const h of hls) {
      const s = draToNabre({ book: h.bookId, chapter: h.chapter, verse: h.verseStart });
      let e = draToNabre({ book: h.bookId, chapter: h.chapter, verse: h.verseEnd });
      if (e.chapter !== s.chapter) e = { ...s, verse: await lastVerse(s.book, s.chapter) };
      const endLen = await verseLength(e.book, e.chapter, e.verse);
      if (endLen === null || (await verseLength(s.book, s.chapter, s.verse)) === null) {
        warnings.push(`highlight at ${fmt(s)}: verse missing in ${TO}; skipped`);
        continue;
      }
      newHls.push({
        translation: TO,
        bookId: s.book,
        chapter: s.chapter,
        verseStart: s.verse,
        startOffset: 0,
        verseEnd: e.verse,
        endOffset: endLen,
        color: h.color,
        quote: h.quote,
      });
    }

    // ---- report
    console.log(`${apply ? "Applying" : "Dry run"}: ${FROM} → ${TO}\n`);
    console.log(`notes:            ${noteRows.length} total, ${noteUpdates.length} renumbered`);
    console.log(`verse reads:      ${reads.length} total, ${readsMoved} renumbered`);
    console.log(`chapter progress: ${manual.size} manual marks kept, ${auto.length} chapters complete by reading`);
    console.log(`resume position:  ${state ? `${fmt({ book: state.bookId, chapter: state.chapter, verse: state.verse })} → ${fmt(newState!)}` : "none"}`);
    console.log(`highlights:       ${hls.length} → ${newHls.length} whole-verse highlights in ${TO} (the ${FROM} ones are kept)`);
    if (warnings.length) console.log(`\nWarnings:\n  ${warnings.join("\n  ")}`);
    if (review.length) console.log(`\nNotes worth a quick check (numbering may differ slightly here):\n  ${review.join("\n  ")}`);

    if (!apply) {
      console.log("\nNothing changed. Re-run with --apply to make these changes.");
      return;
    }

    await db.transaction(async (tx) => {
      for (const u of noteUpdates) {
        await tx
          .update(notes)
          .set({ chapter: u.chapter, verseStart: u.verseStart, verseEnd: u.verseEnd })
          .where(eq(notes.id, u.id));
      }
      await tx.delete(verseReads);
      const readRows = [...mappedReads.values()].map((r) => ({
        bookId: r.book,
        chapter: r.chapter,
        verse: r.verse,
        firstReadAt: r.firstReadAt,
      }));
      for (let i = 0; i < readRows.length; i += 2000) await tx.insert(verseReads).values(readRows.slice(i, i + 2000));
      await tx.delete(chapterProgress);
      const progressRows = [
        ...[...manual.values()].map((m) => ({ ...m, manual: true })),
        ...auto.map((a) => ({ ...a, manual: false })),
      ];
      if (progressRows.length) await tx.insert(chapterProgress).values(progressRows);
      if (newState) {
        await tx
          .update(readingState)
          .set({ chapter: newState.chapter, verse: newState.verse })
          .where(eq(readingState.id, 1));
      }
      if (newHls.length) await tx.insert(highlights).values(newHls);
      await tx
        .insert(appMeta)
        .values({ key: META_KEY, value: TO })
        .onConflictDoUpdate({ target: appMeta.key, set: { value: TO } });
    });
    console.log(`\nDone. Now set BIBLE_TRANSLATION=${TO} in Vercel and redeploy.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
