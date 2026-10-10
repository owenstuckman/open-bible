import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { highlights } from "@/db/schema";
import { activeTranslation } from "@/lib/bible/text";
import { COLORS, type Color } from "@/lib/highlights/types";
import { badRequest, canRead, canWrite, positiveInt, unauthorized, validBook } from "@/lib/notes/server";

const offset = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10_000;
const toJson = (row: typeof highlights.$inferSelect) => ({ ...row, createdAt: row.createdAt.toISOString() });

// GET /api/highlights?book=JHN&chapter=1 → highlights in the active translation.
export async function GET(req: NextRequest) {
  if (!(await canRead())) return unauthorized();
  const book = validBook(req.nextUrl.searchParams.get("book"));
  const chapter = Number(req.nextUrl.searchParams.get("chapter"));
  if (!book || !positiveInt(chapter)) return badRequest("book and chapter are required.");

  const rows = await getDb()
    .select()
    .from(highlights)
    .where(
      and(eq(highlights.translation, activeTranslation()), eq(highlights.bookId, book), eq(highlights.chapter, chapter)),
    )
    .orderBy(asc(highlights.createdAt));
  return NextResponse.json(rows.map(toJson), { headers: { "Cache-Control": "private, no-store" } });
}

// POST /api/highlights { bookId, chapter, verseStart, startOffset, verseEnd, endOffset, color, quote? }
export async function POST(req: NextRequest) {
  if (!(await canWrite())) return unauthorized();
  const b = await req.json().catch(() => null);
  const bookId = validBook(b?.bookId);
  if (
    !bookId ||
    !positiveInt(b.chapter) ||
    !positiveInt(b.verseStart) ||
    !positiveInt(b.verseEnd) ||
    !offset(b.startOffset) ||
    !offset(b.endOffset) ||
    b.verseEnd < b.verseStart ||
    (b.verseEnd === b.verseStart && b.endOffset <= b.startOffset)
  ) {
    return badRequest("Invalid highlight range.");
  }
  if (!COLORS.includes(b.color)) return badRequest("Invalid color.");
  const quote = typeof b.quote === "string" ? b.quote.slice(0, 2000) : null;

  const [row] = await getDb()
    .insert(highlights)
    .values({
      translation: activeTranslation(),
      bookId,
      chapter: b.chapter,
      verseStart: b.verseStart,
      startOffset: b.startOffset,
      verseEnd: b.verseEnd,
      endOffset: b.endOffset,
      color: b.color as Color,
      quote,
    })
    .returning();
  return NextResponse.json(toJson(row), { status: 201 });
}
