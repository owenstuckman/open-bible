"use client";

import { useEffect, useState } from "react";

export type VerseSelection = {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  quote: string;
};

type Anchor = VerseSelection & { rect: DOMRect };

const MAX_QUOTE = 600;

/** Reads the current text selection as a verse range within one chapter. */
function readSelection(root: HTMLElement): Anchor | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const verseOf = (node: Node) => (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest<HTMLElement>("[data-verse]");
  const start = verseOf(range.startContainer);
  const end = verseOf(range.endContainer);
  if (!start) return null;
  const chapterEl = start.closest<HTMLElement>("[data-chapter]");
  if (!chapterEl) return null;
  const [book, ch] = chapterEl.dataset.chapter!.split(".");

  const verseStart = Number(start.dataset.verse);
  // A selection that runs into the next chapter is clamped to this one.
  const sameChapter = end && end.closest("[data-chapter]") === chapterEl;
  const lastVerse = chapterEl.querySelectorAll("[data-verse]");
  const verseEnd = sameChapter
    ? Number(end!.dataset.verse)
    : Number((lastVerse[lastVerse.length - 1] as HTMLElement).dataset.verse);

  const quote = sel.toString().replace(/\s+/g, " ").trim();
  if (!quote) return null;
  return {
    book,
    chapter: Number(ch),
    verseStart: Math.min(verseStart, verseEnd),
    verseEnd: Math.max(verseStart, verseEnd),
    quote: quote.length > MAX_QUOTE ? `${quote.slice(0, MAX_QUOTE - 1)}…` : quote,
    rect: range.getBoundingClientRect(),
  };
}

/** Floating "✎ Note" button over a text selection in the Bible text. */
export function SelectionPopover({
  rootRef,
  onNote,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  onNote: (s: VerseSelection) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setAnchor(rootRef.current ? readSelection(rootRef.current) : null));
    };
    const hide = () => setAnchor(null);
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", hide);
      cancelAnimationFrame(frame);
    };
  }, [rootRef]);

  if (!anchor) return null;
  // Touch devices put their own menu above the selection, so go below there.
  const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  const top = coarse ? anchor.rect.bottom + 10 : Math.max(64, anchor.rect.top - 46);
  const left = Math.min(Math.max(8, anchor.rect.left + anchor.rect.width / 2 - 50), window.innerWidth - 108);

  return (
    <div className="fixed z-40" style={{ top, left }}>
      <button
        onMouseDown={(e) => e.preventDefault()} // keep the selection while clicking
        onClick={() => {
          const { rect: _rect, ...s } = anchor;
          void _rect;
          window.getSelection()?.removeAllRanges();
          setAnchor(null);
          onNote(s);
        }}
        className="flex w-[100px] items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-paper shadow-lg"
      >
        ✎ Note
      </button>
    </div>
  );
}
