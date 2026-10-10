"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Chapter, ChapterRef } from "@/lib/bible/text";
import { getBook } from "@/lib/bible/books";
import { LAST_READ_KEY } from "@/components/ResumeRedirect";
import { BookPicker } from "./BookPicker";

type Props = {
  initial: Chapter;
  chapterCounts: Record<string, number>;
  translationName: string;
  notice: string;
};

const LOAD_MARGIN = "1500px 0px";
const refKey = (r: ChapterRef) => `${r.book}.${r.chapter}`;
const refUrl = (r: ChapterRef) => `/read/${r.book}/${r.chapter}`;

class SignedOutError extends Error {}

async function fetchChapter(ref: ChapterRef): Promise<Chapter> {
  const res = await fetch(`/api/chapters/${ref.book}/${ref.chapter}`);
  if (res.status === 401) throw new SignedOutError("Signed out");
  if (!res.ok) throw new Error(`Failed to load ${refKey(ref)}`);
  return res.json();
}

/**
 * Continuous-scroll reader. Starts at one chapter and streams neighbours in
 * as you approach either end; the header and URL follow the chapter in view.
 */
export function Reader({ initial, chapterCounts, translationName, notice }: Props) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Chapter[]>([initial]);
  const [current, setCurrent] = useState<ChapterRef>(initial);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topSentinel = useRef<HTMLDivElement>(null);
  const bottomSentinel = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
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
      const el = document.querySelector<HTMLElement>(`[data-chapter="${refKey(first)}"]`);
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
        const sections = document.querySelectorAll<HTMLElement>("[data-chapter]");
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

  const currentBook = getBook(current.book);

  return (
    <div className="reader-scroll min-h-dvh">
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-line bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
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

      <main className="mx-auto max-w-2xl px-5 pb-[40vh] sm:px-8">
        <div ref={topSentinel} aria-hidden className="h-px" />

        {chapters.map((ch) => (
          <ChapterView key={refKey(ch)} chapter={ch} />
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
        {last.next ? (
          <p className="py-10 text-center text-sm text-muted">Loading…</p>
        ) : (
          <p className="py-16 text-center font-serif text-muted">✝ End of the Bible</p>
        )}
        <p className="border-t border-line pt-4 text-xs text-muted">{notice}</p>
      </main>

      <BookPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        current={current}
        chapterCounts={chapterCounts}
      />
    </div>
  );
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  const isBookStart = chapter.chapter === 1;
  return (
    <section data-chapter={refKey(chapter)} className="scroll-mt-16 pt-10 first:pt-8">
      {isBookStart ? (
        <h1 className="mb-8 border-b border-line pb-6 text-center font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          {chapter.bookName}
        </h1>
      ) : null}
      <h2 className="mb-4 flex items-baseline gap-3 font-serif">
        <span className="text-4xl font-semibold text-accent">{chapter.chapter}</span>
        <span className="text-xs tracking-[0.18em] text-muted uppercase">
          {chapter.bookName}
        </span>
      </h2>
      <div className="font-serif text-[1.15rem] leading-[1.8] sm:text-[1.2rem]">
        {chapter.verses.map((v) => (
          <p key={v.n} id={`v-${chapter.book}-${chapter.chapter}-${v.n}`} className="verse mb-1.5">
            <sup>{v.n}</sup>
            {v.text}
          </p>
        ))}
      </div>
    </section>
  );
}
