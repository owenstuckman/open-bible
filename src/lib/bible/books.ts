// The 73-book Catholic canon in NABRE order. IDs are USFM codes, which are
// translation-independent: notes, highlights and progress key off them.
// Chapter counts are NOT here; they vary by translation (e.g. Joel has 3
// chapters in Douay-Rheims and 4 in NABRE), so they come from the text source.

export type Testament = "OT" | "NT";
export type BookGroup =
  | "Pentateuch"
  | "Historical"
  | "Wisdom"
  | "Prophets"
  | "Gospels"
  | "Acts"
  | "Letters"
  | "Revelation";

export type Book = {
  id: string;
  name: string;
  abbr: string;
  testament: Testament;
  group: BookGroup;
};

const b = (id: string, name: string, abbr: string, testament: Testament, group: BookGroup): Book => ({
  id,
  name,
  abbr,
  testament,
  group,
});

export const BOOKS: readonly Book[] = [
  b("GEN", "Genesis", "Gn", "OT", "Pentateuch"),
  b("EXO", "Exodus", "Ex", "OT", "Pentateuch"),
  b("LEV", "Leviticus", "Lv", "OT", "Pentateuch"),
  b("NUM", "Numbers", "Nm", "OT", "Pentateuch"),
  b("DEU", "Deuteronomy", "Dt", "OT", "Pentateuch"),
  b("JOS", "Joshua", "Jos", "OT", "Historical"),
  b("JDG", "Judges", "Jgs", "OT", "Historical"),
  b("RUT", "Ruth", "Ru", "OT", "Historical"),
  b("1SA", "1 Samuel", "1 Sm", "OT", "Historical"),
  b("2SA", "2 Samuel", "2 Sm", "OT", "Historical"),
  b("1KI", "1 Kings", "1 Kgs", "OT", "Historical"),
  b("2KI", "2 Kings", "2 Kgs", "OT", "Historical"),
  b("1CH", "1 Chronicles", "1 Chr", "OT", "Historical"),
  b("2CH", "2 Chronicles", "2 Chr", "OT", "Historical"),
  b("EZR", "Ezra", "Ezr", "OT", "Historical"),
  b("NEH", "Nehemiah", "Neh", "OT", "Historical"),
  b("TOB", "Tobit", "Tb", "OT", "Historical"),
  b("JDT", "Judith", "Jdt", "OT", "Historical"),
  b("EST", "Esther", "Est", "OT", "Historical"),
  b("1MA", "1 Maccabees", "1 Mc", "OT", "Historical"),
  b("2MA", "2 Maccabees", "2 Mc", "OT", "Historical"),
  b("JOB", "Job", "Jb", "OT", "Wisdom"),
  b("PSA", "Psalms", "Ps", "OT", "Wisdom"),
  b("PRO", "Proverbs", "Prv", "OT", "Wisdom"),
  b("ECC", "Ecclesiastes", "Eccl", "OT", "Wisdom"),
  b("SNG", "Song of Songs", "Sg", "OT", "Wisdom"),
  b("WIS", "Wisdom", "Wis", "OT", "Wisdom"),
  b("SIR", "Sirach", "Sir", "OT", "Wisdom"),
  b("ISA", "Isaiah", "Is", "OT", "Prophets"),
  b("JER", "Jeremiah", "Jer", "OT", "Prophets"),
  b("LAM", "Lamentations", "Lam", "OT", "Prophets"),
  b("BAR", "Baruch", "Bar", "OT", "Prophets"),
  b("EZK", "Ezekiel", "Ez", "OT", "Prophets"),
  b("DAN", "Daniel", "Dn", "OT", "Prophets"),
  b("HOS", "Hosea", "Hos", "OT", "Prophets"),
  b("JOL", "Joel", "Jl", "OT", "Prophets"),
  b("AMO", "Amos", "Am", "OT", "Prophets"),
  b("OBA", "Obadiah", "Ob", "OT", "Prophets"),
  b("JON", "Jonah", "Jon", "OT", "Prophets"),
  b("MIC", "Micah", "Mi", "OT", "Prophets"),
  b("NAM", "Nahum", "Na", "OT", "Prophets"),
  b("HAB", "Habakkuk", "Hb", "OT", "Prophets"),
  b("ZEP", "Zephaniah", "Zep", "OT", "Prophets"),
  b("HAG", "Haggai", "Hg", "OT", "Prophets"),
  b("ZEC", "Zechariah", "Zec", "OT", "Prophets"),
  b("MAL", "Malachi", "Mal", "OT", "Prophets"),
  b("MAT", "Matthew", "Mt", "NT", "Gospels"),
  b("MRK", "Mark", "Mk", "NT", "Gospels"),
  b("LUK", "Luke", "Lk", "NT", "Gospels"),
  b("JHN", "John", "Jn", "NT", "Gospels"),
  b("ACT", "Acts of the Apostles", "Acts", "NT", "Acts"),
  b("ROM", "Romans", "Rom", "NT", "Letters"),
  b("1CO", "1 Corinthians", "1 Cor", "NT", "Letters"),
  b("2CO", "2 Corinthians", "2 Cor", "NT", "Letters"),
  b("GAL", "Galatians", "Gal", "NT", "Letters"),
  b("EPH", "Ephesians", "Eph", "NT", "Letters"),
  b("PHP", "Philippians", "Phil", "NT", "Letters"),
  b("COL", "Colossians", "Col", "NT", "Letters"),
  b("1TH", "1 Thessalonians", "1 Thes", "NT", "Letters"),
  b("2TH", "2 Thessalonians", "2 Thes", "NT", "Letters"),
  b("1TI", "1 Timothy", "1 Tm", "NT", "Letters"),
  b("2TI", "2 Timothy", "2 Tm", "NT", "Letters"),
  b("TIT", "Titus", "Ti", "NT", "Letters"),
  b("PHM", "Philemon", "Phlm", "NT", "Letters"),
  b("HEB", "Hebrews", "Heb", "NT", "Letters"),
  b("JAS", "James", "Jas", "NT", "Letters"),
  b("1PE", "1 Peter", "1 Pt", "NT", "Letters"),
  b("2PE", "2 Peter", "2 Pt", "NT", "Letters"),
  b("1JN", "1 John", "1 Jn", "NT", "Letters"),
  b("2JN", "2 John", "2 Jn", "NT", "Letters"),
  b("3JN", "3 John", "3 Jn", "NT", "Letters"),
  b("JUD", "Jude", "Jude", "NT", "Letters"),
  b("REV", "Revelation", "Rv", "NT", "Revelation"),
];

const byId = new Map(BOOKS.map((book, i) => [book.id, { book, index: i }]));

export function getBook(id: string): Book | undefined {
  return byId.get(id.toUpperCase())?.book;
}

export function bookIndex(id: string): number {
  return byId.get(id.toUpperCase())?.index ?? -1;
}
