import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentVerse, type Color } from "../src/lib/highlights/types";
import { footnoteLetter, withFootnotes } from "../src/components/reader/Footnotes";

const T = "In the beginning was the Word";
const hl = (key: string, vs: number, so: number, ve: number, eo: number, color: Color = "yellow") => ({
  key, bookId: "JHN", chapter: 1, verseStart: vs, startOffset: so, verseEnd: ve, endOffset: eo, color,
});
const show = (segs: { text: string; highlight?: { color: string } }[]) =>
  segs.map((s) => (s.highlight ? `[${s.highlight.color[0]}:${s.text}]` : s.text)).join("");

test("segments highlights, including overlaps and multi-verse ranges", () => {
  assert.equal(show(segmentVerse(T, 1, [])), T);
  assert.equal(show(segmentVerse(T, 1, [hl("a", 1, 3, 1, 16)])), "In [y:the beginning] was the Word");
  assert.equal(show(segmentVerse(T, 1, [hl("a", 1, 3, 1, 16), hl("b", 1, 10, 1, 29, "blue")])), "In [y:the beg][b:inning was the Word]");
  assert.equal(show(segmentVerse(T, 2, [hl("a", 1, 3, 3, 5)])), `[y:${T}]`);
  assert.equal(show(segmentVerse(T, 3, [hl("a", 1, 3, 3, 5)])), "[y:In th]e beginning was the Word");
});

test("places footnote markers without touching the text", () => {
  const fn = (seq: number, offset: number | null) => ({ fn: { verse: 1, seq, offset, label: null, text: "" }, letter: footnoteLetter(seq) });
  const render = (pieces: ReturnType<typeof withFootnotes>) =>
    pieces.map((p) => (p.kind === "footnote" ? `^${p.letter}` : p.highlight ? `[${p.text}]` : p.text)).join("");
  assert.equal(render(withFootnotes([{ text: T }], [fn(0, 16), fn(1, null)], T.length)), "In the beginning^a was the Word^b");
  assert.equal(
    render(withFootnotes([{ text: "In the " }, { text: "beginning", highlight: { key: "a", color: "yellow" } }, { text: " was the Word" }], [fn(0, 10)], T.length)),
    "In the [beg]^a[inning] was the Word",
  );
  assert.deepEqual([0, 25, 26, 27].map(footnoteLetter), ["a", "z", "aa", "ab"]);
});
