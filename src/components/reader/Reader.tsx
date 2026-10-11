"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Chapter, ChapterRef } from "@/lib/bible/text";
import { getBook } from "@/lib/bible/books";
import { verseAnchor } from "@/lib/bible/refs";
import { NotesColumn } from "@/components/notes/NotesColumn";
import { NotesSheet } from "@/components/notes/NotesSheet";
import { chapterKey, useNotes, type ClientNote, type NotesStore } from "@/components/notes/useNotes";
import { BookPicker } from "./BookPicker";
import { ActionPopover, useVerseSelection } from "./ActionPopover";
import { useHighlights, type ClientHighlight } from "@/components/highlights/useHighlights";
import { segmentVerse } from "@/lib/highlights/types";
import type { ProgressSummary } from "@/lib/progress/server";
import { formatPct } from "@/lib/progress/format";
import { useReadingTracker } from "./useReadingTracker";
import { footnotesPref, readingModePref } from "@/lib/prefs";
import { ChapterFootnotes, FootnotePopover, footnoteLetter, withFootnotes } from "./Footnotes";
import type { Footnote } from "@/lib/bible/text";
import { topVerse } from "./topVerse";

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
  const mode = readingModePref.use();
  const showFootnotes = footnotesPref.use() === "on";
  const [activeFn, setActiveFn] = useState<{ fn: Footnote; letter: string; where: string; rect: DOMRect } | null>(null);
  const pendingScroll = useRef<string | null>(null);
  const highlights = useHighlights();
  const [activeHl, setActiveHl] = useState<{ h: ClientHighlight; rect: DOMRect } | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [totalChapters, setTotalChapters] = useState(0);
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

  // Which chapters are already read (for the header bar and chapter badges).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/progress/summary")
      .then((r) => (r.ok ? (r.json() as Promise<ProgressSummary>) : null))
      .then((s) => {
        if (!s || cancelled) return;
        setCompleted(new Set(Object.entries(s.completed).flatMap(([b, chs]) => chs.map((c) => `${b}.${c}`))));
        setTotalChapters(s.totals.chapters);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useReadingTracker(columnsRef, headerRef, chapters.map(refKey).join(), (keys) =>
    setCompleted((cur) => new Set([...cur, ...keys])),
  );

  const toggleRead = useCallback((ch: ChapterRef, read: boolean) => {
    const key = refKey(ch);
    setCompleted((cur) => {
      const next = new Set(cur);
      if (read) next.add(key);
      else next.delete(key);
      return next;
    });
    fetch("/api/progress/chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book: ch.book, chapter: ch.chapter, read }),
    }).catch(() => {});
  }, []);

  // Fetch notes and highlights for every chapter as it streams in.
  const { loadChapter } = notes;
  const { loadChapter: loadHighlights } = highlights;
  useEffect(() => {
    for (const ch of chapters) {
      loadChapter(ch.book, ch.chapter);
      loadHighlights(ch.book, ch.chapter);
    }
  }, [chapters, loadChapter, loadHighlights]);

  // Load more when a sentinel gets near the viewport (scroll mode only).
  useEffect(() => {
    if (mode === "page") return;
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
  }, [loadNext, loadPrev, scrolledOnce, mode]);

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
    const book = getBook(current.book);
    document.title = `${book?.name ?? current.book} ${current.chapter} · Open Bible`;
  }, [current]);

  // Arriving at /read/BOOK/N#v-BOOK-N-V (resume, or a [[ref]] link): put that verse at the top.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) columnsRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "start" });
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

  function switchMode(next: typeof mode) {
    if (next === mode) return;
    pendingScroll.current = topVerse(columnsRef.current, headerRef.current)?.id ?? null;
    if (next === "page") {
      // Keep just the chapter you're in.
      const here = chapters.find((c) => refKey(c) === refKey(current)) ?? chapters[0];
      setChapters([here]);
    }
    readingModePref.set(next);
  }

  // After a mode switch, put the same verse back at the top.
  useLayoutEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    pendingScroll.current = null;
    columnsRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "start" });
  }, [mode, chapters]);

  const turnPage = useCallback(
    async (dir: 1 | -1) => {
      const here = chapters[0];
      const target = dir === 1 ? here.next : here.prev;
      if (!target) return;
      try {
        const ch = await fetchChapter(target);
        setChapters([ch]);
        setCurrent(ch);
        window.scrollTo(0, 0);
      } catch (e) {
        onLoadError(e);
      }
    },
    [chapters, onLoadError],
  );

  // "/" opens search from anywhere in the reader (unless you're typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      router.push("/search");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Page mode: ← / → keys and horizontal swipes turn pages.
  useEffect(() => {
    if (mode !== "page") return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey || typing(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowRight") turnPage(1);
      if (e.key === "ArrowLeft") turnPage(-1);
    };
    let start: { x: number; y: number } | null = null;
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || !window.getSelection()?.isCollapsed) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) turnPage(dx < 0 ? 1 : -1);
    };
    const main = columnsRef.current;
    window.addEventListener("keydown", onKey);
    main?.addEventListener("touchstart", onStart, { passive: true });
    main?.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      main?.removeEventListener("touchstart", onStart);
      main?.removeEventListener("touchend", onEnd);
    };
  }, [mode, turnPage]);

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
  const pct = formatPct(completed.size, totalChapters);
  const currentNotes = notes.byChapter[refKey(current)] ?? [];

  return (
    <div className="reader-scroll min-h-dvh">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-[90rem] items-center gap-2 px-4 py-2.5 sm:gap-3 lg:px-6">
          <Link href="/" className="hidden font-serif text-lg font-semibold text-accent sm:block">
            ✝ Open Bible
          </Link>
          <button
            onClick={() => setPickerOpen(true)}
            className="min-w-0 truncate rounded-lg border border-line px-3 py-1.5 font-medium whitespace-nowrap transition hover:border-ink"
            aria-haspopup="dialog"
            aria-label={`${currentBook?.name ?? current.book} ${current.chapter}, choose book and chapter`}
          >
            <span className="sm:hidden">{currentBook?.abbr ?? current.book}</span>
            <span className="hidden sm:inline">{currentBook?.name ?? current.book}</span> {current.chapter}{" "}
            <span className="text-muted">▾</span>
          </button>
          <button
            onClick={() => switchMode(mode === "scroll" ? "page" : "scroll")}
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-base sm:hidden"
            aria-label={mode === "scroll" ? "Switch to page mode" : "Switch to scroll mode"}
            title={mode === "scroll" ? "Scroll mode (tap for pages)" : "Page mode (tap for scroll)"}
          >
            {mode === "scroll" ? "↕" : "⇄"}
          </button>
          <div
            role="group"
            aria-label="Reading mode"
            className="hidden shrink-0 overflow-hidden rounded-lg border border-line text-sm sm:flex"
          >
            {(["scroll", "page"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 py-1 capitalize transition ${mode === m ? "bg-ink text-paper" : "hover:bg-accent-soft"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span className="hidden text-xs text-muted xl:inline">{translationName}</span>
          <Link
            href="/search"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line transition hover:border-ink"
            aria-label="Search"
            title="Search (/)"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4.5 4.5" strokeLinecap="round" />
            </svg>
          </Link>
          <Link
            href="/progress"
            className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-muted transition hover:border-ink"
            title="Reading progress"
            aria-label={`Reading progress: ${pct} of the Bible`}
          >
            <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-line sm:block">
              <span className="block h-full rounded-full bg-accent" style={{ width: pct }} />
            </span>
            {pct}
          </Link>
          <button
            onClick={() => openSheet(current)}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 text-sm transition hover:border-ink lg:hidden"
            aria-label={`Notes for this chapter (${currentNotes.length})`}
          >
            ✎ <span className="text-xs">{currentNotes.length}</span>
          </button>
          <Link
            href="/settings"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line transition hover:border-ink"
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
              read={completed.has(refKey(ch))}
              showFootnotes={showFootnotes}
              onFootnoteClick={(fn, letter, rect) =>
                setActiveFn({ fn, letter, rect, where: `${getBook(ch.book)?.abbr ?? ch.book} ${ch.chapter}:${fn.verse}` })
              }
              onToggleRead={(r) => toggleRead(ch, r)}
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
              {mode === "page" ? (
                <nav aria-label="Chapter navigation" className="flex items-center justify-between gap-3 py-10 text-sm">
                  <PageButton target={first.prev} dir={-1} onClick={() => turnPage(-1)} />
                  <span className="text-center text-xs whitespace-nowrap text-muted sm:text-sm">
                    {first.chapter} of {first.chapterCount}
                  </span>
                  <PageButton target={first.next} dir={1} onClick={() => turnPage(1)} />
                </nav>
              ) : last.next ? (
                <p className="py-10 text-center text-sm text-muted">Loading…</p>
              ) : (
                <p className="py-16 text-center font-serif text-muted">✝ End of the Bible</p>
              )}
              <p className="border-t border-line pt-4 text-xs text-muted">{notice}</p>
            </div>
          </div>
        </div>
      </main>

      {activeFn && (
        <FootnotePopover
          fn={activeFn.fn}
          letter={activeFn.letter}
          where={activeFn.where}
          rect={activeFn.rect}
          onClose={() => setActiveFn(null)}
        />
      )}

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

function PageButton({ target, dir, onClick }: { target: ChapterRef | null; dir: 1 | -1; onClick: () => void }) {
  if (!target) return <span className="w-28" />;
  const label = `${getBook(target.book)?.abbr ?? target.book} ${target.chapter}`;
  return (
    <button
      onClick={onClick}
      className="w-28 rounded-lg border border-line px-3 py-2 transition hover:border-ink"
      aria-label={dir === 1 ? `Next chapter, ${label}` : `Previous chapter, ${label}`}
    >
      {dir === -1 ? `← ${label}` : `${label} →`}
    </button>
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
  read: boolean;
  onToggleRead: (read: boolean) => void;
  showFootnotes: boolean;
  onFootnoteClick: (fn: Footnote, letter: string, rect: DOMRect) => void;
};

/** One chapter: Bible text on the left, its notes on the right (desktop). */
function ChapterRow({
  chapter,
  notes,
  highlights,
  onHighlightClick,
  store,
  onAddNote,
  onOpenNotes,
  read,
  onToggleRead,
  showFootnotes,
  onFootnoteClick,
}: RowProps) {
  const versesRef = useRef<HTMLDivElement>(null);
  const [hoverNote, setHoverNote] = useState<ClientNote | null>(null);
  const [hoverVerse, setHoverVerse] = useState<number | null>(null);
  const isBookStart = chapter.chapter === 1;

  const fnByVerse = new Map<number, { fn: Footnote; letter: string }[]>();
  const fnList = showFootnotes ? chapter.footnotes.map((fn, i) => ({ fn, letter: footnoteLetter(i) })) : [];
  for (const f of fnList) fnByVerse.set(f.fn.verse, [...(fnByVerse.get(f.fn.verse) ?? []), f]);

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
          <span className="flex-1" />
          <button
            onClick={() => onToggleRead(!read)}
            aria-pressed={read}
            title={read ? "Mark as unread" : "Mark as read"}
            className={`self-center rounded-full border px-2.5 py-0.5 font-sans text-xs transition ${
              read ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-ink"
            }`}
          >
            {read ? "✓ Read" : "Mark read"}
          </button>
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
                className={`verse relative -mx-1 mb-1.5 scroll-mt-[4.5rem] rounded px-1 transition-colors ${
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
                  {withFootnotes(segmentVerse(v.text, v.n, highlights), fnByVerse.get(v.n) ?? [], v.text.length).map(
                    (piece, i) =>
                      piece.kind === "footnote" ? (
                        <button
                          key={`fn${piece.fn.seq}`}
                          data-fn-label={piece.letter}
                          aria-label={`Footnote ${piece.letter}`}
                          className="fn-marker"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFootnoteClick(piece.fn, piece.letter, e.currentTarget.getBoundingClientRect());
                          }}
                        />
                      ) : piece.highlight ? (
                        <mark
                          key={i}
                          data-hl={piece.highlight.key}
                          className={`hl hl-${piece.highlight.color}`}
                          onClick={(e) => {
                            if (!window.getSelection()?.isCollapsed) return; // finishing a drag, not a click
                            const h = highlights.find((x) => x.key === piece.highlight!.key);
                            if (h) onHighlightClick(h, e.currentTarget.getBoundingClientRect());
                          }}
                        >
                          {piece.text}
                        </mark>
                      ) : (
                        piece.text
                      ),
                  )}
                </span>
              </p>
            );
          })}
        </div>
        <ChapterFootnotes notes={fnList} where={(v) => `${chapter.chapter}:${v}`} />
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
