// Loads Bible text into the `verses` table. Idempotent: re-running skips rows
// that already exist.
//   npm run db:seed                 → Douay-Rheims placeholder (data/douay-rheims.json)
//   npm run db:seed -- path/to.json → any file in the same shape (e.g. a licensed NABRE export,
//                                     which must never be committed to this public repo)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { footnotes, verses } from "../src/db/schema";
import { BOOKS } from "../src/lib/bible/books";

type TextFile = {
  translation: string;
  books: Record<
    string,
    {
      c: number;
      v: [verse: number, text: string][];
      // optional footnotes: [verse, offset in verse text | null, label | null, text]
      f?: [number, number | null, string | null, string][];
    }[]
  >;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (try: vercel env pull .env.local)");

  const file = resolve(process.argv[2] ?? "data/douay-rheims.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as TextFile;
  const known = new Set(BOOKS.map((b) => b.id));
  const unknown = Object.keys(data.books).filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown book IDs in ${file}: ${unknown.join(", ")}`);

  const rows = Object.entries(data.books).flatMap(([bookId, chapters]) =>
    chapters.flatMap(({ c, v }) =>
      v.map(([verse, text]) => ({ translation: data.translation, bookId, chapter: c, verse, text })),
    ),
  );

  const notes = Object.entries(data.books).flatMap(([bookId, chapters]) =>
    chapters.flatMap(({ c, f = [] }) =>
      f.map(([verse, offset, label, text], seq) => ({
        translation: data.translation,
        bookId,
        chapter: c,
        verse,
        seq,
        offset,
        label,
        text,
      })),
    ),
  );

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);
  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(verses).values(rows.slice(i, i + BATCH)).onConflictDoNothing();
    process.stdout.write(`\r${data.translation}: ${Math.min(i + BATCH, rows.length)} / ${rows.length} verses`);
  }
  process.stdout.write("\n");
  for (let i = 0; i < notes.length; i += BATCH) {
    await db.insert(footnotes).values(notes.slice(i, i + BATCH)).onConflictDoNothing();
  }
  if (notes.length) console.log(`${data.translation}: ${notes.length} footnotes`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
