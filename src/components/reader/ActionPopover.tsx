"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, type Color, type HighlightRange } from "@/lib/highlights/types";

export type VerseSelection = HighlightRange & { quote: string };
type SelectionAnchor = VerseSelection & { rect: DOMRect };

const MAX_QUOTE = 600;

/** Character offset of a range boundary within a verse's text span. */
function offsetIn(verse: HTMLElement, node: Node, offset: number): number {
  const text = verse.querySelector<HTMLElement>("[data-vt]");
  if (!text) return 0;
  const whole = document.createRange();
  whole.selectNodeContents(text);
  const where = whole.comparePoint(node, offset); // -1 before, 0 inside, 1 after
  if (where < 0) return 0;
  if (where > 0) return text.textContent?.length ?? 0;
  const head = document.createRange();
  head.setStart(text, 0);
  head.setEnd(node, offset);
  return head.toString().length;
}

/** Reads the current text selection as a verse range within one chapter. */
function readSelection(root: HTMLElement): SelectionAnchor | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const verseOf = (node: Node) =>
    (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest<HTMLElement>("[data-verse]");
  const startVerse = verseOf(range.startContainer);
  if (!startVerse) return null;
  const chapterEl = startVerse.closest<HTMLElement>("[data-chapter]");
  if (!chapterEl) return null;
  const [book, ch] = chapterEl.dataset.chapter!.split(".");

  let endVerse = verseOf(range.endContainer);
  let endOffset: number;
  if (endVerse && endVerse.closest("[data-chapter]") === chapterEl) {
    endOffset = offsetIn(endVerse, range.endContainer, range.endOffset);
  } else {
    // Ran past this chapter: clamp to the end of its last verse.
    const all = chapterEl.querySelectorAll<HTMLElement>("[data-verse]");
    endVerse = all[all.length - 1];
    endOffset = endVerse.querySelector("[data-vt]")?.textContent?.length ?? 0;
  }
  const startOffset = offsetIn(startVerse, range.startContainer, range.startOffset);
  const verseStart = Number(startVerse.dataset.verse);
  const verseEnd = Number(endVerse.dataset.verse);
  if (verseEnd < verseStart || (verseEnd === verseStart && endOffset <= startOffset)) return null;

  const quote = sel.toString().replace(/\s+/g, " ").trim();
  if (!quote) return null;
  return {
    bookId: book,
    chapter: Number(ch),
    verseStart,
    startOffset,
    verseEnd,
    endOffset,
    quote: quote.length > MAX_QUOTE ? `${quote.slice(0, MAX_QUOTE - 1)}…` : quote,
    rect: range.getBoundingClientRect(),
  };
}

/**
 * Tracks the reader's text selection. Hiding is delayed slightly so a tap on
 * the popover still lands on touch devices, where tapping can clear the
 * selection first.
 */
export function useVerseSelection(rootRef: React.RefObject<HTMLElement | null>) {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  useEffect(() => {
    let frame = 0;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = rootRef.current ? readSelection(rootRef.current) : null;
        clearTimeout(hideTimer);
        if (next) setAnchor(next);
        else hideTimer = setTimeout(() => setAnchor(null), 250);
      });
    };
    const hide = () => setAnchor(null);
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", hide);
      cancelAnimationFrame(frame);
      clearTimeout(hideTimer);
    };
  }, [rootRef]);
  return { anchor, clear: () => setAnchor(null) };
}

const SWATCH: Record<Color, string> = {
  yellow: "var(--hl-yellow)",
  green: "var(--hl-green)",
  blue: "var(--hl-blue)",
  pink: "var(--hl-pink)",
};

type Props = {
  rect: DOMRect;
  current?: Color;
  onColor: (c: Color) => void;
  onNote: () => void;
  onRemove?: () => void;
  onDismiss: () => void;
};

/** Floating toolbar: highlight colors, add a note, and (for a highlight) remove. */
export function ActionPopover({ rect, current, onColor, onNote, onRemove, onDismiss }: Props) {
  const box = useRef<HTMLDivElement>(null);

  // Dismiss on outside press or Escape.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) onDismiss();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onDismiss]);

  const width = onRemove ? 296 : 224;
  // Touch devices put their own menu above a selection, so go below there.
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const wanted = coarse ? rect.bottom + 10 : rect.top - 50 < 64 ? rect.bottom + 10 : rect.top - 50;
  const top = Math.min(Math.max(8, wanted), window.innerHeight - 56); // always on screen
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);

  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault(); // don't drop the selection

  return (
    <div
      ref={box}
      role="toolbar"
      aria-label="Highlight and note"
      onPointerDown={(e) => {
        e.stopPropagation();
        keep(e);
      }}
      onMouseDown={keep}
      className="fixed z-40 flex items-center gap-1.5 rounded-xl bg-ink p-1.5 text-paper shadow-lg"
      style={{ top, left, width }}
    >
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onColor(c)}
          aria-label={`Highlight ${c}`}
          aria-pressed={current === c}
          className={`size-7 shrink-0 rounded-full border-2 transition ${current === c ? "border-paper scale-110" : "border-transparent"}`}
          style={{ background: SWATCH[c] }}
        />
      ))}
      <span className="mx-0.5 h-5 w-px bg-paper/25" aria-hidden />
      <button onClick={onNote} className="rounded-lg px-2 py-1 text-sm font-medium hover:bg-paper/15">
        ✎ Note
      </button>
      {onRemove && (
        <button onClick={onRemove} className="rounded-lg px-2 py-1 text-sm hover:bg-paper/15">
          Remove
        </button>
      )}
    </div>
  );
}
