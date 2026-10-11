import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { BOOKS, bookIndex } from "@/lib/bible/books";
import { formatRef, refHref } from "@/lib/bible/refs";
import { Markdown } from "@/components/notes/Markdown";

export const metadata = { title: "Notes · Open Bible" };

export default function NotesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Back to reading
      </Link>
      <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Your notes</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/search" className="rounded-lg border border-line px-3 py-1.5 hover:border-ink">
            Search notes
          </Link>
          {/* Plain <a>: these are file downloads, not pages. */}
          <a href="/api/export?format=md" className="rounded-lg border border-line px-3 py-1.5 hover:border-ink">
            Export Markdown
          </a>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <AllNotes />
      </Suspense>
    </main>
  );
}

async function AllNotes() {
  await connection();
  const rows = (await getDb().select().from(notes).orderBy(asc(notes.chapter), asc(notes.verseStart))).filter((n) =>
    n.bodyMd.trim(),
  );
  rows.sort((a, b) => bookIndex(a.bookId) - bookIndex(b.bookId) || a.chapter - b.chapter || a.verseStart - b.verseStart);
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-line p-6 text-sm text-muted">
        No notes yet. In the reader, click a verse number or select some text to add one.
      </p>
    );
  }
  const books = BOOKS.filter((b) => rows.some((n) => n.bookId === b.id));
  return (
    <>
      <nav aria-label="Books with notes" className="mb-8 flex flex-wrap gap-1.5 text-sm">
        {books.map((b) => (
          <a key={b.id} href={`#book-${b.id}`} className="rounded-full border border-line px-2.5 py-0.5 hover:border-ink">
            {b.name} <span className="text-muted">{rows.filter((n) => n.bookId === b.id).length}</span>
          </a>
        ))}
      </nav>
      {books.map((b) => (
        <section key={b.id} id={`book-${b.id}`} className="mb-10 scroll-mt-6">
          <h2 className="mb-3 font-serif text-xl font-semibold">{b.name}</h2>
          <ol className="space-y-3">
            {rows
              .filter((n) => n.bookId === b.id)
              .map((n) => (
                <li key={n.id} className="rounded-xl border border-line bg-paper px-4 py-3">
                  <Link
                    href={refHref({ book: n.bookId, chapter: n.chapter, verse: n.verseStart })}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    {formatRef(n.bookId, n.chapter, n.verseStart, n.verseEnd)}
                  </Link>
                  {n.quote && (
                    <blockquote className="my-1.5 border-l-[3px] border-line pl-2 font-serif text-sm text-muted italic">
                      “{n.quote}”
                    </blockquote>
                  )}
                  <div className="text-sm leading-relaxed">
                    <Markdown source={n.bodyMd} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    Updated {n.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </p>
                </li>
              ))}
          </ol>
        </section>
      ))}
    </>
  );
}
