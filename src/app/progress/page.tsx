import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BOOKS, type Book } from "@/lib/bible/books";
import { formatRef, verseAnchor } from "@/lib/bible/refs";
import { formatPct } from "@/lib/progress/format";
import { getSummary, type ProgressSummary } from "@/lib/progress/server";

export const metadata = { title: "Progress · Open Bible" };

export default function ProgressPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Back to reading
      </Link>
      <h1 className="mt-4 mb-6 font-serif text-3xl font-semibold">Reading progress</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Progress />
      </Suspense>
    </main>
  );
}

async function Progress() {
  await connection();
  const s = await getSummary();
  const pct = formatPct(s.totals.completed, s.totals.chapters);
  const pctNum = s.totals.chapters ? Math.floor((s.totals.completed / s.totals.chapters) * 100) : 0;
  const books = BOOKS.filter((b) => s.chapterCounts[b.id]);

  return (
    <>
      <section className="mb-8 flex flex-wrap items-end gap-x-10 gap-y-4">
        <Stat value={pct} label="of the Bible" />
        <Stat value={`${s.totals.completed.toLocaleString()} / ${s.totals.chapters.toLocaleString()}`} label="chapters read" />
        <Link href="/notes" className="hover:text-accent">
          <Stat value={s.totals.notes.toLocaleString()} label={s.totals.notes === 1 ? "note →" : "notes →"} />
        </Link>
        <Stat value={s.totals.highlights.toLocaleString()} label={s.totals.highlights === 1 ? "highlight" : "highlights"} />
        {s.lastReadAt && (
          <Stat
            value={new Date(s.lastReadAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            label="last read"
          />
        )}
        <span className="flex-1" />
        {s.position && (
          <Link
            href={`/read/${s.position.book}/${s.position.chapter}#${verseAnchor(s.position.book, s.position.chapter, s.position.verse)}`}
            className="rounded-lg bg-ink px-4 py-2.5 font-medium text-paper transition hover:opacity-90"
          >
            ▶ Continue: {formatRef(s.position.book, s.position.chapter, s.position.verse)}
          </Link>
        )}
      </section>
      <div className="mb-10 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pctNum} aria-valuemin={0} aria-valuemax={100} aria-label="Bible read">
        <div className="h-full rounded-full bg-accent" style={{ width: pct }} />
      </div>

      {(["OT", "NT"] as const).map((t) => (
        <section key={t} className="mb-10">
          <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">
            {t === "OT" ? "Old Testament" : "New Testament"}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {books
              .filter((b) => b.testament === t)
              .map((b) => (
                <BookCard key={b.id} book={b} total={s.chapterCounts[b.id]} done={s.completed[b.id] ?? []} />
              ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted">
        A chapter counts as read once you have scrolled through about 90% of its verses. You can also mark chapters
        read or unread in the reader.
      </p>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-3xl font-semibold">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function BookCard({ book, total, done }: { book: Book; total: number; done: ProgressSummary["completed"][string] }) {
  const read = new Set(done);
  const pct = Math.floor((read.size / total) * 100);
  return (
    <div className="rounded-xl border border-line bg-paper p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Link href={`/read/${book.id}/1`} className="truncate font-medium hover:text-accent">
          {book.name}
        </Link>
        <span className={`shrink-0 text-xs ${pct === 100 ? "font-semibold text-accent" : "text-muted"}`}>
          {pct === 100 ? "✓ " : ""}
          {read.size}/{total}
        </span>
      </div>
      <div className="flex flex-wrap gap-[3px]">
        {Array.from({ length: total }, (_, i) => i + 1).map((c) => (
          <Link
            key={c}
            href={`/read/${book.id}/${c}`}
            title={`${book.name} ${c}${read.has(c) ? " ✓" : ""}`}
            aria-label={`${book.name} ${c}${read.has(c) ? ", read" : ""}`}
            className={`size-3 rounded-[3px] border transition hover:scale-125 ${
              read.has(c) ? "border-accent bg-accent" : "border-line bg-bg"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
