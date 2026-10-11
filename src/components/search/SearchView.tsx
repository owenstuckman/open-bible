"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BOOKS } from "@/lib/bible/books";
import { formatRef, parseRef, refHref } from "@/lib/bible/refs";
import { MARK_END, MARK_START } from "@/lib/search/marks";
import type { NoteHit, VerseHit } from "@/lib/search/server";

type Results = {
  q: string;
  bible: { total: number; hits: VerseHit[] };
  notes: { total: number; hits: NoteHit[] };
};

/** Renders a snippet, turning marker-wrapped runs into <mark>s. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(${MARK_START}[^${MARK_END}]*${MARK_END})`));
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith(MARK_START) ? (
          <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-ink">
            {p.slice(1, -1)}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function SearchView() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [scope, setScope] = useState(params.get("scope") ?? "all");
  const [tab, setTab] = useState<"bible" | "notes">("bible");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const ref = useMemo(() => parseRef(q), [q]);

  // Debounced search; keeps the URL shareable/back-button friendly.
  useEffect(() => {
    const query = q.trim();
    const url = query ? `/search?q=${encodeURIComponent(query)}${scope !== "all" ? `&scope=${scope}` : ""}` : "/search";
    window.history.replaceState(null, "", url);
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&scope=${scope}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Search failed");
        setResults(await res.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, scope]);

  async function loadMore() {
    if (!results) return;
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(results.q)}&scope=${scope}&offset=${results.bible.hits.length}`,
    );
    if (!res.ok) return;
    const more: Results = await res.json();
    setResults({ ...results, bible: { ...results.bible, hits: [...results.bible.hits, ...more.bible.hits] } });
  }

  const shown = q.trim().length >= 2 ? results : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Back to reading
      </Link>
      <h1 className="mt-4 mb-5 font-serif text-3xl font-semibold">Search</h1>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (ref) router.push(refHref(ref));
        }}
        className="mb-4 flex flex-wrap gap-2"
      >
        <input
          ref={input}
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Words, a phrase in "quotes", or a reference like Jn 3:16'
          aria-label="Search"
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2.5 outline-none focus:border-accent"
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          aria-label="Where to search"
          className="rounded-lg border border-line bg-paper px-2 py-2.5 text-sm"
        >
          <option value="all">Whole Bible</option>
          <option value="OT">Old Testament</option>
          <option value="NT">New Testament</option>
          <optgroup label="Book">
            {BOOKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </optgroup>
        </select>
      </form>

      {ref && (
        <Link
          href={refHref(ref)}
          className="mb-5 flex items-center justify-between rounded-xl border border-accent bg-accent-soft px-4 py-3 font-medium text-accent"
        >
          Go to {formatRef(ref.book, ref.chapter, ref.verse, ref.verseEnd)}
          <span aria-hidden>→</span>
        </Link>
      )}

      {shown && (
        <div role="tablist" aria-label="Results" className="mb-4 flex gap-1 border-b border-line">
          {(["bible", "notes"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t === "bible" ? "Bible" : "Your notes"}{" "}
              <span className="text-xs">({(t === "bible" ? shown.bible.total : shown.notes.total).toLocaleString()})</span>
            </button>
          ))}
          {loading && <span className="ml-auto self-center text-xs text-muted">Searching…</span>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-accent">{error}</p>}

      {shown && tab === "bible" && (
        <ol className="space-y-1">
          {shown.bible.hits.map((h) => (
            <li key={`${h.book}.${h.chapter}.${h.verse}`}>
              <Link
                href={refHref({ book: h.book, chapter: h.chapter, verse: h.verse })}
                className="block rounded-lg px-3 py-2.5 transition hover:bg-accent-soft"
              >
                <span className="mr-2 text-xs font-semibold text-accent">{formatRef(h.book, h.chapter, h.verse)}</span>
                <span className="font-serif leading-relaxed">
                  <Snippet text={h.snippet} />
                </span>
              </Link>
            </li>
          ))}
          {shown.bible.hits.length === 0 && <p className="px-3 text-sm text-muted">No verses match.</p>}
          {shown.bible.hits.length < Math.min(shown.bible.total, 500) && (
            <li className="pt-2 text-center">
              <button onClick={loadMore} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-ink">
                Show more
              </button>
            </li>
          )}
        </ol>
      )}

      {shown && tab === "notes" && (
        <ol className="space-y-1">
          {shown.notes.hits.map((n) => (
            <li key={n.id}>
              <Link
                href={refHref({ book: n.book, chapter: n.chapter, verse: n.verseStart })}
                className="block rounded-lg px-3 py-2.5 transition hover:bg-accent-soft"
              >
                <span className="mr-2 text-xs font-semibold text-accent">
                  {formatRef(n.book, n.chapter, n.verseStart, n.verseEnd)}
                </span>
                <span className="text-sm leading-relaxed">
                  <Snippet text={n.snippet} />
                </span>
              </Link>
            </li>
          ))}
          {shown.notes.hits.length === 0 && <p className="px-3 text-sm text-muted">No notes match.</p>}
        </ol>
      )}

      {!shown && !ref && (
        <p className="text-sm text-muted">
          Search finds word forms too (“love” matches “loved” and “loveth”). Put a phrase in quotes for an exact match,
          or use <code>-word</code> to exclude a word.
        </p>
      )}
    </main>
  );
}
