// Maps Douay-Rheims (Vulgate) verse numbers to the NABRE (Hebrew-based) ones,
// so notes and progress recorded on the placeholder text land on the right
// verse after the swap.
//
// Covered with confidence: the Psalms (Vulgate numbering is mostly one behind,
// with Pss 9/10, 114/115, 116 and 147 split or joined differently), Joel and
// Malachi. Both traditions count Psalm superscriptions as verses, so verse
// numbers inside a psalm carry over unchanged.
//
// Not covered: smaller chapter-boundary shifts elsewhere (listed in
// REVIEW_BOOKS). Refs there are kept as-is and the swap script reports them for
// a manual check.

export type Ref = { book: string; chapter: number; verse: number };

/** Books where Vulgate and Hebrew-based numbering differ in places this map doesn't handle. */
export const REVIEW_BOOKS: Record<string, string> = {
  NUM: "Num 16–17 chapter break",
  "1KI": "1 Kgs 4–5 (DR 3 Kings 4:21–34 = 1 Kgs 5:1–14) and 20–22",
  "2KI": "2 Kgs 11–12 chapter break",
  NEH: "Neh 3–4 (DR 2 Esdras 4:1–6 = Neh 3:33–38)",
  EST: "the Greek additions (DR 10:4–16:24; NABRE chapters A–F)",
  JOB: "Job 39–41",
  ECC: "Eccl 4–5 chapter break",
  SNG: "Song 6–7 chapter break",
  SIR: "verse numbering in several chapters",
  ISA: "Isa 63–64 chapter break",
  EZK: "Ezek 20–21 (DR 20:45–49 = Ezek 21:1–5)",
  DAN: "Dan 3–4 (DR 3:98–100 = Dan 3:31–33)",
  HOS: "Hos 11–14 chapter breaks",
  JON: "Jonah 1–2 (DR 1:17 = Jon 2:1)",
  MIC: "Mic 4–5 chapter break",
  NAM: "Nah 1–2 chapter break",
  ZEC: "Zech 1–2 (DR 1:18–21 = Zech 2:1–4)",
};

function psalm(chapter: number, verse: number): [number, number] {
  if (chapter <= 8 || chapter >= 148) return [chapter, verse];
  if (chapter === 9) return verse <= 21 ? [9, verse] : [10, verse - 21];
  if (chapter <= 112) return [chapter + 1, verse];
  if (chapter === 113) return verse <= 8 ? [114, verse] : [115, verse - 8];
  if (chapter === 114) return [116, verse]; // Heb 116:1–9
  if (chapter === 115) return [116, verse]; // DR already numbers it 10–19
  if (chapter <= 145) return [chapter + 1, verse];
  return [147, verse]; // Vg 146 = Heb 147:1–11; Vg 147 is already numbered 12–20
}

export function draToNabre(ref: Ref): Ref {
  const { book, chapter, verse } = ref;
  switch (book) {
    case "PSA": {
      const [c, v] = psalm(chapter, verse);
      return { book, chapter: c, verse: v };
    }
    case "JOL":
      if (chapter === 2 && verse >= 28) return { book, chapter: 3, verse: verse - 27 };
      if (chapter === 3) return { book, chapter: 4, verse };
      return ref;
    case "MAL":
      if (chapter === 4) return { book, chapter: 3, verse: verse + 18 };
      return ref;
    default:
      return ref;
  }
}
