export const COLORS = ["yellow", "green", "blue", "pink"] as const;
export type Color = (typeof COLORS)[number];

export type Highlight = {
  id: string;
  translation: string;
  bookId: string;
  chapter: number;
  verseStart: number;
  startOffset: number;
  verseEnd: number;
  endOffset: number;
  color: Color;
  quote: string | null;
  createdAt: string;
};

/** A highlight range before it has an id. */
export type HighlightRange = Pick<
  Highlight,
  "bookId" | "chapter" | "verseStart" | "startOffset" | "verseEnd" | "endOffset"
>;

export type Segment = { text: string; highlight?: { key: string; color: Color } };

/**
 * Splits one verse's text into plain and highlighted runs. Where highlights
 * overlap, the most recently made one wins.
 */
export function segmentVerse(
  text: string,
  verse: number,
  hs: (HighlightRange & { key: string; color: Color })[],
): Segment[] {
  const spans = hs
    .filter((h) => verse >= h.verseStart && verse <= h.verseEnd)
    .map((h) => ({
      key: h.key,
      color: h.color,
      from: verse === h.verseStart ? Math.min(h.startOffset, text.length) : 0,
      to: verse === h.verseEnd ? Math.min(h.endOffset, text.length) : text.length,
    }))
    .filter((s) => s.to > s.from);
  if (!spans.length) return [{ text }];

  const cuts = [...new Set([0, text.length, ...spans.flatMap((s) => [s.from, s.to])])].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const top = spans.findLast((s) => s.from <= a && s.to >= b);
    const prev = out[out.length - 1];
    const piece = text.slice(a, b);
    if (prev && prev.highlight?.key === top?.key) prev.text += piece;
    else out.push(top ? { text: piece, highlight: { key: top.key, color: top.color } } : { text: piece });
  }
  return out;
}
