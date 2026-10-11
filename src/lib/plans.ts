import { BOOKS } from "./bible/books";

// Built-in reading plans. Each spreads a list of chapters evenly over a number
// of days; finishing a chapter anywhere in the app counts toward the plan.

export type PlanDef = { key: string; name: string; description: string; days: number; books: (b: (typeof BOOKS)[number]) => boolean };

export const PLANS: PlanDef[] = [
  { key: "bible-year", name: "The whole Bible in a year", description: "All 73 books in order, about 4 chapters a day.", days: 365, books: () => true },
  { key: "nt-90", name: "New Testament in 90 days", description: "Matthew through Revelation, about 3 chapters a day.", days: 90, books: (b) => b.testament === "NT" },
  { key: "gospels-30", name: "The Gospels in 30 days", description: "Matthew, Mark, Luke and John, about 3 chapters a day.", days: 30, books: (b) => b.group === "Gospels" },
  { key: "psalms-30", name: "Psalms in 30 days", description: "Five psalms a day.", days: 30, books: (b) => b.id === "PSA" },
  { key: "proverbs-31", name: "Proverbs in a month", description: "One chapter a day.", days: 31, books: (b) => b.id === "PRO" },
];

export type ChapterKey = string; // "BOOK.chapter"

/** The plan's days, each a list of chapter keys, for a translation's chapter counts. */
export function schedule(plan: PlanDef, chapterCounts: Record<string, number>): ChapterKey[][] {
  const chapters = BOOKS.filter(plan.books).flatMap((b) =>
    Array.from({ length: chapterCounts[b.id] ?? 0 }, (_, i) => `${b.id}.${i + 1}`),
  );
  const days = Math.min(plan.days, chapters.length);
  return Array.from({ length: days }, (_, d) =>
    chapters.slice(Math.floor((d * chapters.length) / days), Math.floor(((d + 1) * chapters.length) / days)),
  );
}

/** Whole days from start to today (both YYYY-MM-DD), so day 0 is the start date. */
export function dayIndex(start: string, today: string): number {
  const [a, b] = [start, today].map((s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

export type PlanStatus = {
  day: number; // 0-based, clamped to the plan
  totalDays: number;
  today: ChapterKey[];
  done: number;
  total: number;
  behind: number; // chapters scheduled before today that aren't read yet
  nextUnread: ChapterKey | null;
  finished: boolean;
};

export function planStatus(days: ChapterKey[][], start: string, today: string, completed: Set<ChapterKey>): PlanStatus {
  const all = days.flat();
  const day = Math.max(0, Math.min(days.length - 1, dayIndex(start, today)));
  const before = days.slice(0, day).flat();
  const done = all.filter((c) => completed.has(c)).length;
  return {
    day,
    totalDays: days.length,
    today: days[day] ?? [],
    done,
    total: all.length,
    behind: dayIndex(start, today) < 0 ? 0 : before.filter((c) => !completed.has(c)).length,
    nextUnread: all.find((c) => !completed.has(c)) ?? null,
    finished: done === all.length,
  };
}
