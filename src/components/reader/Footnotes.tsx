"use client";

import { useEffect, useRef } from "react";
import type { Footnote } from "@/lib/bible/text";
import type { Segment } from "@/lib/highlights/types";

/** a, b, … z, aa, ab, … */
export function footnoteLetter(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(97 + (n % 26)) + s;
  return s;
}

export type VersePiece =
  | { kind: "text"; text: string; highlight?: Segment["highlight"] }
  | { kind: "footnote"; fn: Footnote; letter: string };

/**
 * Interleaves footnote markers into a verse's highlight segments. Markers go
 * at their offset (or the end of the verse) and carry no text of their own, so
 * selection offsets for highlights are unaffected.
 */
export function withFootnotes(
  segments: Segment[],
  notes: { fn: Footnote; letter: string }[],
  textLength: number,
): VersePiece[] {
  if (!notes.length) return segments.map((s) => ({ kind: "text", ...s }));
  const at = (n: { fn: Footnote }) => Math.min(n.fn.offset ?? textLength, textLength);
  const queue = [...notes].sort((a, b) => at(a) - at(b) || a.fn.seq - b.fn.seq);
  const out: VersePiece[] = [];
  let pos = 0;
  for (const seg of segments) {
    let rest = seg.text;
    while (queue.length && at(queue[0]) <= pos + rest.length) {
      const cut = at(queue[0]) - pos;
      if (cut > 0) out.push({ kind: "text", text: rest.slice(0, cut), highlight: seg.highlight });
      rest = rest.slice(cut);
      pos += cut;
      const n = queue.shift()!;
      out.push({ kind: "footnote", fn: n.fn, letter: n.letter });
    }
    if (rest) out.push({ kind: "text", text: rest, highlight: seg.highlight });
    pos += rest.length;
  }
  for (const n of queue) out.push({ kind: "footnote", fn: n.fn, letter: n.letter });
  return out;
}

/** Popover with one footnote's text. */
export function FootnotePopover({
  fn,
  letter,
  where,
  rect,
  onClose,
}: {
  fn: Footnote;
  letter: string;
  where: string;
  rect: DOMRect;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const scroll = () => onClose();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll);
    };
  }, [onClose]);

  const width = Math.min(380, window.innerWidth - 16);
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  const below = rect.bottom + 8;
  const fitsBelow = below + 220 < window.innerHeight;

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Footnote ${letter}`}
      className="fixed z-40 max-h-[50dvh] overflow-y-auto rounded-xl border border-line bg-paper p-4 text-sm leading-relaxed shadow-xl"
      style={{ left, width, ...(fitsBelow ? { top: below } : { bottom: window.innerHeight - rect.top + 8 }) }}
    >
      <p className="mb-1 text-[11px] font-semibold text-accent">
        <span className="mr-1 italic">{letter}</span> {where}
      </p>
      {fn.label && <p className="mb-1 font-serif font-semibold italic">{fn.label}</p>}
      <p>{fn.text}</p>
    </div>
  );
}

/** Collapsible list of a chapter's footnotes, shown under the text. */
export function ChapterFootnotes({
  notes,
  where,
}: {
  notes: { fn: Footnote; letter: string }[];
  where: (verse: number) => string;
}) {
  if (!notes.length) return null;
  return (
    <details className="mt-6 rounded-xl border border-line px-4 py-2 font-sans text-sm">
      <summary className="cursor-pointer py-1 text-xs font-semibold tracking-widest text-muted uppercase">
        Footnotes ({notes.length})
      </summary>
      <ol className="mt-2 space-y-3 pb-2">
        {notes.map(({ fn, letter }) => (
          <li key={fn.seq} className="leading-relaxed">
            <span className="mr-1.5 font-semibold text-accent italic">{letter}</span>
            <span className="mr-1.5 text-xs text-muted">{where(fn.verse)}</span>
            {fn.label && <span className="mr-1 font-serif font-semibold italic">{fn.label}:</span>}
            {fn.text}
          </li>
        ))}
      </ol>
    </details>
  );
}
