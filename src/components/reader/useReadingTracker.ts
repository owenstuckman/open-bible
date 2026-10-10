"use client";

import { useEffect, useRef } from "react";
import { topVerse } from "./topVerse";

const DWELL_MS = 1500; // a verse must stay in view this long to count as read
const FLUSH_MS = 5000;

type Ref = { book: string; chapter: number; verse: number };

/**
 * Marks verses as read when they stay at least half visible (or fill half the
 * screen) for 1.5s while the tab is visible, and saves the reading position.
 * Reads are batched to the server every few seconds and on page hide.
 */
export function useReadingTracker(
  rootRef: React.RefObject<HTMLElement | null>,
  headerRef: React.RefObject<HTMLElement | null>,
  /** Changes whenever verses are added to the DOM, so new ones get observed. */
  version: unknown,
  onCompleted: (chapterKeys: string[]) => void,
) {
  const pending = useRef(new Map<string, Ref>());
  const sent = useRef(new Set<string>());
  const timers = useRef(new Map<Element, ReturnType<typeof setTimeout>>());
  const lastPosition = useRef<string | null>(null);
  const completedCb = useRef(onCompleted);
  useEffect(() => {
    completedCb.current = onCompleted;
  });

  // Observe every verse in the reader.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const timersMap = timers.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const qualifies =
            e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= window.innerHeight * 0.5);
          if (qualifies && !timersMap.has(el) && document.visibilityState === "visible") {
            timersMap.set(
              el,
              setTimeout(() => {
                timersMap.delete(el);
                const chapterEl = el.closest<HTMLElement>("[data-chapter]");
                if (!chapterEl) return;
                const [book, ch] = chapterEl.dataset.chapter!.split(".");
                const ref = { book, chapter: Number(ch), verse: Number(el.dataset.verse) };
                const key = `${book}.${ch}.${ref.verse}`;
                if (!sent.current.has(key)) pending.current.set(key, ref);
              }, DWELL_MS),
            );
          } else if (!qualifies && timersMap.has(el)) {
            clearTimeout(timersMap.get(el));
            timersMap.delete(el);
          }
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll("[data-verse]").forEach((v) => io.observe(v));
    return () => {
      io.disconnect();
      timersMap.forEach(clearTimeout);
      timersMap.clear();
    };
  }, [rootRef, version]);

  useEffect(() => {
    const currentPosition = (): Ref | null => {
      const v = topVerse(rootRef.current, headerRef.current);
      if (!v) return null;
      const [book, ch] = v.closest<HTMLElement>("[data-chapter]")!.dataset.chapter!.split(".");
      return { book, chapter: Number(ch), verse: Number(v.dataset.verse) };
    };

    const payload = () => {
      const reads = [...pending.current.values()];
      const pos = currentPosition();
      const posKey = pos && `${pos.book}.${pos.chapter}.${pos.verse}`;
      const position = posKey && posKey !== lastPosition.current ? pos : null;
      if (!reads.length && !position) return null;
      for (const k of pending.current.keys()) sent.current.add(k);
      pending.current.clear();
      if (posKey) lastPosition.current = posKey;
      return { reads, position, retry: () => reads.forEach((r) => pending.current.set(`${r.book}.${r.chapter}.${r.verse}`, r)) };
    };

    const flush = async () => {
      const p = payload();
      if (!p) return;
      try {
        const res = await fetch("/api/progress/reads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reads: p.reads, position: p.position }),
        });
        if (!res.ok) throw new Error();
        const { completed } = (await res.json()) as { completed: string[] };
        if (completed.length) completedCb.current(completed);
      } catch {
        p.retry();
        lastPosition.current = null;
      }
    };

    const beacon = () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      const p = payload();
      if (p) {
        const blob = new Blob([JSON.stringify({ reads: p.reads, position: p.position })], { type: "application/json" });
        navigator.sendBeacon("/api/progress/reads", blob);
      }
    };
    const onHide = () => document.visibilityState === "hidden" && beacon();

    const interval = setInterval(flush, FLUSH_MS);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", beacon);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", beacon);
      void flush(); // leaving the reader (client navigation): send what we have
    };
  }, [rootRef, headerRef]);
}
