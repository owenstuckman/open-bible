"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Chapter, ChapterRef } from "@/lib/bible/text";
import { getBook } from "@/lib/bible/books";
import { LAST_READ_KEY } from "@/components/ResumeRedirect";
import { verseAnchor } from "@/lib/bible/refs";
import { NotesColumn } from "@/components/notes/NotesColumn";
import { NotesSheet } from "@/components/notes/NotesSheet";
import { chapterKey, useNotes, type ClientNote, type NotesStore } from "@/components/notes/useNotes";
import { BookPicker } from "./BookPicker";
import { ActionPopover, useVerseSelection } from "./ActionPopover";
import { useHighlights, type ClientHighlight } from "@/components/highlights/useHighlights";
import { segmentVerse } from "@/lib/highlights/types";

type Props = {
  initial: Chapter;
  chapterCounts: Record<string, number>;
  translationName: string;
  notice: string;
};

const LOAD_MARGIN = "1500px 0px";
const SPLIT_KEY = "ob:split";
const SPLIT_DEFAULT = 56;
const clampSplit = (n: number) => Math.min(72, Math.max(38, n));
const refKey = (r: ChapterRef) => `${r.book}.${r.chapter}`;
const refUrl = (r: ChapterRef) => `/read/${r.book}/${r.chapter}`;

class SignedOutError extends Error {}

async function fetchChapter(ref: ChapterRef): Promise<Chapter> {
  const res = await fetch(`/api/chapters/${ref.book}/${ref.chapter}`);
  if (res.status === 401) throw new SignedOutError("Signed out");
  if (!res.ok) throw new Error(`Failed to load ${refKey(ref)}`);
  return res.json();
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

/**
 * Continuous-scroll reader with notes. Starts at one chapter and streams
 * neighbours in as you approach either end; the header and URL follow the
 * chapter in view. Desktop shows notes beside their verses; smaller screens
 * use a bottom sheet.
 */
export function Reader({ initial, chapterCounts, translationName, notice }: Props) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([initial]);
  const [current, setCurrent] = useState<ChapterRef>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; ref: ChapterRef; verse: number | null }>({
    open: false,
    ref: initial,
    verse: null,
  });
  const notes = useNotes();
  const highlights = useHighlights();
  const [activeHl, setActiveHl] = useState<{ h: ClientHighlight; rect: DOMRect } | null>(null);
  const isDesktop = useIsDesktop();

  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const loading = useRef({ prev: false, next: false });
  const prependAnchor = useRef<{ el: HTMLElement; top: number } | null>(null);
  // Don't pull in earlier chapters until the reader actually scrolls; otherwise
  // the page would load the previous chapter immediately on arrival.
  const [scrolledOnce, setScrolledOnce] = useState(false);

  const first = chapters[0];
  const last = chapters[chapters.length - 1];

  const onLoadError = useCallback(
    (e: unknown) => {
      if (e instanceof SignedOutError) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      else setError((e as Error).message);
    },
    [router],
  );

  const loadNext = useCallback(async () => {
    if (loading.current.next || !last.next) return;
    loading.current.next = true;
    try {
      const ch = await fetchChapter(last.next);
      setChapters((cs) => (cs.some((c) => refKey(c) === refKey(ch)) ? cs : [...cs, ch]));
    } catch (e) {
      onLoadError(e);
    } finally {
      loading.current.next = false;
    }
  }, [last, onLoadError]);

  const loadPrev = useCallback(async () => {
    if (loading.current.prev || !first.prev) return;
    loading.current.prev = true;
    try {
      const ch = await fetchChapter(first.prev);
      // Remember where the current first chapter sits so we can keep it still.
      const el = columnsRef.current?.querySelector<HTMLElement>(`[data-chapter="${refKey(first)}"]`);
      if (el) prependAnchor.current = { el, top: el.getBoundingClientRect().top };
      setChapters((cs) => (cs.some((c) => refKey(c) === refKey(ch)) ? cs : [ch, ...cs]));
    } catch (e) {
      onLoadError(e);
    } finally {
      loading.current.prev = false;
    }
  }, [first, onLoadError]);

  // After a prepend, scroll by however much the anchor moved so the text doesn't jump.
  useLayoutEffect(() => {
    const anchor = prependAnchor.current;
    if (!anchor) return;
    prependAnchor.current = null;
    window.scrollBy(0, anchor.el.getBoundingClientRect().top - anchor.top);
  }, [chapters]);

  // Fetch notes and highlights for every chapter as it streams in.
  const { loadChapter } = notes;
  const { loadChapter: loadHighlights } = highlights;
  useEffect(() => {
    for (const ch of chapters) {
      loadChapter(ch.book, ch.chapter);
      loadHighlights(ch.book, ch.chapter);
    }
  }, [chapters, loadChapter, loadHighlights]);

  // Load more when a sentinel gets near the viewport.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target === bottomSentinel.current) loadNext();
          if (e.target === topSentinel.current && scrolledOnce) loadPrev();
        }
      },
      { rootMargin: LOAD_MARGIN },
    );
    if (bottomSentinel.current) io.observe(bottomSentinel.current);
    if (topSentinel.current) io.observe(topSentinel.current);
    return () => io.disconnect();
  }, [loadNext, loadPrev, scrolledOnce]);

  // Track which chapter is in view; keep the URL and "last read" in sync.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (!scrolledOnce && window.scrollY > 0) setScrolledOnce(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const line = (headerRef.current?.offsetHeight ?? 0) + 80;
        // Scoped to this reader: Next keeps the previous page's DOM around (hidden).
        const sections = columnsRef.current?.querySelectorAll<HTMLElement>("[data-chapter]") ?? [];
        let inView: HTMLElement | undefined;
        for (const s of sections) {
          if (s.getBoundingClientRect().top <= line) inView = s;
          else break;
        }
        inView ??= sections[0];
        if (!inView) return;
        const [book, ch] = inView.dataset.chapter!.split(".");
        setCurrent((cur) => (cur.book === book && cur.chapter === Number(ch) ? cur : { book, chapter: Number(ch) }));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scrolledOnce]);

  useEffect(() => {
    const url = refUrl(current);
    if (window.location.pathname !== url) window.history.replaceState(null, "", url);
    try {
      localStorage.setItem(LAST_READ_KEY, url);
    } catch {}
    const book = getBook(current.book);
    document.title = `${book?.name ?? current.book} ${current.chapter} · Open Bible`;
  }, [current]);

  // Arriving at /read/BOOK/N#v-BOOK-N-V (e.g. from a [[ref]] link): bring that verse into view.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) columnsRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "center" });
  }, []);

  // The split lives in a CSS variable, written straight to the DOM so dragging
  // doesn't re-render every chapter.
  const setSplit = (pct: number) => columnsRef.current?.style.setProperty("--split", `${pct}%`);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SPLIT_KEY));
      if (saved) columnsRef.current?.style.setProperty("--split", `${clampSplit(saved)}%`);
    } catch {}
  }, []);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    const bar = e.currentTarget;
    const box = columnsRef.current?.getBoundingClientRect();
    if (!box) return;
    bar.setPointerCapture(e.pointerId);
    let pct = parseFloat(columnsRef.current?.style.getPropertyValue("--split") ?? "") || SPLIT_DEFAULT;
    const move = (ev: PointerEvent) => {
      pct = clampSplit(((ev.clientX - box.left) / box.width) * 100);
      setSplit(pct);
    };
    const up = () => {
      bar.removeEventListener("pointermove", move);
      try {
        localStorage.setItem(SPLIT_KEY, String(Math.round(pct)));
      } catch {}
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up, { once: true });
  }

  const addNote = useCallback(
    (book: string, chapter: number, verseStart: number, verseEnd?: number, quote?: string) => {
      notes.addDraft(book, chapter, verseStart, verseEnd, quote ?? null);
      if (!isDesktop) setSheet({ open: true, ref: { book, chapter }, verse: verseStart });
    },
    [notes, isDesktop],
  );

  const selection = useVerseSelection(columnsRef);
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    selection.clear();
  };

  const openSheet = (ref: ChapterRef, verse: number | null = null) => setSheet({ open: true, ref, verse });

  const currentBook = getBook(current.book);
  const currentNotes = notes.byChapter[refKey(current)] ?? [];

  return (
    <div className="reader-scroll min-h-dvh">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-[90rem] items-center gap-3 px-4 py-2.5 lg:px-6">
          <Link href="/" className="hidden font-serif text-lg font-semibold text-accent sm:block">
            ✝ Open Bible
          </Link>
          <button
            onClick={() => setPickerOpen(true)}
            className="rounded-lg border border-line px-3 py-1.5 font-medium transition hover:border-ink"
            aria-haspopup="dialog"
          >
            {currentBook?.name ?? current.book} {current.chapter} <span className="text-muted">▾</span>
          </button>
          <span className="flex-1" />
          <span className="hidden text-xs text-muted md:inline">{translationName}</span>
          <button
            onClick={() => openSheet(current)}
            className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-sm transition hover:border-ink lg:hidden"
            aria-label={`Notes for this chapter (${currentNotes.length})`}
          >
            ✎ <span className="text-xs">{currentNotes.length}</span>
          </button>
          <Link
            href="/settings"
            className="grid size-8 place-items-center rounded-lg border border-line transition hover:border-ink"
            aria-label="Settings"
            title="Settings"
          >
            ⚙
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] pb-[40vh] lg:px-6">
        <div
          ref={columnsRef}
          className="relative"
          style={{ "--split": `${SPLIT_DEFAULT}%` } as React.CSSProperties}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize notes column"
            onPointerDown={startResize}
            className="group absolute inset-y-0 z-10 hidden w-4 -translate-x-1/2 cursor-col-resize lg:block"
            style={{ left: "var(--split)" }}
          >
            <div className="mx-auto h-full w-px bg-line transition group-hover:w-0.5 group-hover:bg-accent" />
          </div>

          <div ref={topSentinel} aria-hidden className="h-px" />

          {chapters.map((ch) => (
            <ChapterRow
              key={refKey(ch)}
              chapter={ch}
              notes={notes.byChapter[refKey(ch)] ?? []}
              store={notes}
              highlights={highlights.byChapter[refKey(ch)] ?? []}
              onHighlightClick={(h, rect) => setActiveHl({ h, rect })}
              onAddNote={(v) => addNote(ch.book, ch.chapter, v)}
              onOpenNotes={(v) => openSheet(ch, v)}
            />
          ))}

          {error && (
            <p role="alert" className="py-6 text-center text-sm text-accent">
              {error}.{" "}
              <button className="underline" onClick={() => { setError(null); loadNext(); }}>
                Retry
              </button>
            </p>
          )}
          <div ref={bottomSentinel} aria-hidden className="h-px" />
          <div className="lg:grid lg:grid-cols-[var(--split)_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-2xl px-5 sm:px-8">
              {last.next ? (
                <p className="py-10 text-center text-sm text-muted">Loading…</p>
              ) : (
                <p className="py-16 text-center font-serif text-muted">✝ End of the Bible</p>
              )}
              <p className="border-t border-line pt-4 text-xs text-muted">{notice}</p>
            </div>
          </div>
        </div>
      </main>

      {activeHl ? (
        <ActionPopover
          rect={activeHl.rect}
          current={activeHl.h.color}
          onColor={(c) => {
            highlights.setColor(activeHl.h, c);
            setActiveHl(null);
          }}
          onNote={() => {
            const { h } = activeHl;
            setActiveHl(null);
            addNote(h.bookId, h.chapter, h.verseStart, h.verseEnd, h.quote ?? undefined);
          }}
          onRemove={() => {
            highlights.remove(activeHl.h);
            setActiveHl(null);
          }}
          onDismiss={() => setActiveHl(null)}
        />
      ) : selection.anchor ? (
        <ActionPopover
          rect={selection.anchor.rect}
          onColor={(c) => {
            const { rect: _rect, quote, ...range } = selection.anchor!;
            void _rect;
            highlights.add(range, c, quote);
            clearSelection();
          }}
          onNote={() => {
            const a = selection.anchor!;
            clearSelection();
            addNote(a.bookId, a.chapter, a.verseStart, a.verseEnd, a.quote);
          }}
          onDismiss={selection.clear}
        />
      ) : null}

      <NotesSheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        book={sheet.ref.book}
        chapter={sheet.ref.chapter}
        notes={notes.byChapter[chapterKey(sheet.ref.book, sheet.ref.chapter)] ?? []}
        focusVerse={sheet.verse}
        store={notes}
      />

      <BookPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        current={current}
        chapterCounts={chapterCounts}
      />
    </div>
  );
}

type RowProps = {
  chapter: Chapter;
  notes: ClientNote[];
  highlights: ClientHighlight[];
  onHighlightClick: (h: ClientHighlight, rect: DOMRect) => void;
  store: NotesStore;
  onAddNote: (verse: number) => void;
  onOpenNotes: (verse: number) => void;
};

/** One chapter: Bible text on the left, its notes on the right (desktop). */
function ChapterRow({ chapter, notes, highlights, onHighlightClick, store, onAddNote, onOpenNotes }: RowProps) {
  const versesRef = useRef<HTMLDivElement>(null);
  const [hoverNote, setHoverNote] = useState<ClientNote | null>(null);
  const [hoverVerse, setHoverVerse] = useState<number | null>(null);
  const isBookStart = chapter.chapter === 1;

  const noted = new Set<number>();
  for (const n of notes) for (let v = n.verseStart; v <= n.verseEnd; v++) noted.add(v);

  return (
    <section
      data-chapter={refKey(chapter)}
      className="pt-10 first-of-type:pt-8 lg:grid lg:grid-cols-[var(--split)_minmax(0,1fr)]"
    >
      <div className="mx-auto w-full max-w-2xl px-5 sm:px-8">
        {isBookStart ? (
          <h1 className="mb-8 border-b border-line pb-6 text-center font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            {chapter.bookName}
          </h1>
        ) : null}
        <h2 className="mb-4 flex items-baseline gap-3 font-serif">
          <span className="text-4xl font-semibold text-accent">{chapter.chapter}</span>
          <span className="text-xs tracking-[0.18em] text-muted uppercase">{chapter.bookName}</span>
        </h2>
        <div
          ref={versesRef}
          className="font-serif text-[1.15rem] leading-[1.8] sm:text-[1.2rem]"
          onMouseLeave={() => setHoverVerse(null)}
        >
          {chapter.verses.map((v) => {
            const inHoveredNote = hoverNote && v.n >= hoverNote.verseStart && v.n <= hoverNote.verseEnd;
            return (
              <p
                key={v.n}
                id={verseAnchor(chapter.book, chapter.chapter, v.n)}
                data-verse={v.n}
                onMouseEnter={() => setHoverVerse(v.n)}
                className={`verse relative -mx-1 mb-1.5 scroll-mt-24 rounded px-1 transition-colors ${
                  inHoveredNote ? "bg-accent-soft" : ""
                }`}
              >
                {noted.has(v.n) && (
                  <button
                    onClick={() => onOpenNotes(v.n)}
                    className="absolute top-[0.25em] -left-[1.2rem] grid size-6 place-items-center font-sans text-xs text-accent lg:hidden"
                    aria-label={`Notes on verse ${v.n}`}
                  >
                    ✎
                  </button>
                )}
                <sup
                  role="button"
                  tabIndex={0}
                  title="Add a note to this verse"
                  onClick={() => onAddNote(v.n)}
                  onKeyDown={(e) => e.key === "Enter" && onAddNote(v.n)}
                  className="cursor-pointer rounded hover:bg-accent-soft"
                >
                  {v.n}
                </sup>
                <span data-vt>
                  {segmentVerse(v.text, v.n, highlights).map((seg, i) =>
                    seg.highlight ? (
                      <mark
                        key={i}
                        data-hl={seg.highlight.key}
                        className={`hl hl-${seg.highlight.color}`}
                        onClick={(e) => {
                          if (!window.getSelection()?.isCollapsed) return; // finishing a drag, not a click
                          const h = highlights.find((x) => x.key === seg.highlight!.key);
                          if (h) onHighlightClick(h, e.currentTarget.getBoundingClientRect());
                        }}
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      seg.text
                    ),
                  )}
                </span>
              </p>
            );
          })}
        </div>
      </div>
      <aside className="hidden pr-2 pl-8 lg:block" aria-label={`Notes on ${chapter.bookName} ${chapter.chapter}`}>
        <NotesColumn
          notes={notes}
          versesRef={versesRef}
          store={store}
          activeVerse={hoverVerse}
          onHoverNote={setHoverNote}
        />
      </aside>
    </section>
  );
}
