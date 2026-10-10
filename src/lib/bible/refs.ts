import { BOOKS, getBook } from "./books";

// Parses human-typed references like "Jn 3:16", "1 Cor 13:4-7", "Genesis 1"
// into canonical refs, and formats them back. Safe on client and server.

export type VerseRef = {
  book: string;
  chapter: number;
  verse?: number;
  verseEnd?: number;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Exact keys: full names, NABRE abbreviations, and a few common alternates.
const exact = new Map<string, string>();
for (const b of BOOKS) {
  exact.set(norm(b.name), b.id);
  exact.set(norm(b.abbr), b.id);
  exact.set(norm(b.id), b.id);
}
const ALIASES: Record<string, string> = {
  psalm: "PSA",
  pss: "PSA",
  song: "SNG",
  songofsolomon: "SNG",
  canticles: "SNG",
  ecclesiasticus: "SIR",
  qoheleth: "ECC",
  acts: "ACT",
  apocalypse: "REV",
  rev: "REV",
  jas: "JAS",
  phil: "PHP",
  phlm: "PHM",
};
for (const [k, v] of Object.entries(ALIASES)) exact.set(k, v);

function resolveBook(raw: string): string | undefined {
  const key = norm(raw);
  if (!key) return undefined;
  const hit = exact.get(key);
  if (hit) return hit;
  // Otherwise accept an unambiguous prefix of a full name ("gen", "matt", "1thess").
  const matches = BOOKS.filter((b) => norm(b.name).startsWith(key));
  return matches.length === 1 ? matches[0].id : undefined;
}

const REF_RE = /^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z .]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/;

export function parseRef(input: string): VerseRef | null {
  const m = REF_RE.exec(input);
  if (!m) return null;
  const book = resolveBook(m[1]);
  if (!book) return null;
  const ref: VerseRef = { book, chapter: Number(m[2]) };
  if (m[3]) ref.verse = Number(m[3]);
  if (m[4] && Number(m[4]) > Number(m[3])) ref.verseEnd = Number(m[4]);
  return ref;
}

export function refHref(ref: VerseRef): string {
  const base = `/read/${ref.book}/${ref.chapter}`;
  return ref.verse ? `${base}#${verseAnchor(ref.book, ref.chapter, ref.verse)}` : base;
}

export function verseAnchor(book: string, chapter: number, verse: number): string {
  return `v-${book}-${chapter}-${verse}`;
}

export function formatRef(book: string, chapter: number, verseStart?: number, verseEnd?: number): string {
  const abbr = getBook(book)?.abbr ?? book;
  if (!verseStart) return `${abbr} ${chapter}`;
  return `${abbr} ${chapter}:${verseStart}${verseEnd && verseEnd !== verseStart ? `–${verseEnd}` : ""}`;
}
