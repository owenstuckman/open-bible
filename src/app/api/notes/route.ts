import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { MAX_NOTE_LENGTH, MAX_QUOTE_LENGTH } from "@/lib/notes/types";
import { badRequest, canRead, canWrite, positiveInt, toNote, unauthorized, validBook } from "@/lib/api";

// GET /api/notes?book=JHN&chapter=1 → notes for one chapter, in verse order.
export async function GET(req: NextRequest) {
  if (!(await canRead())) return unauthorized();
  const book = validBook(req.nextUrl.searchParams.get("book"));
  const chapter = Number(req.nextUrl.searchParams.get("chapter"));
  if (!book || !positiveInt(chapter)) return badRequest("book and chapter are required.");

  const rows = await getDb()
    .select()
    .from(notes)
    .where(and(eq(notes.bookId, book), eq(notes.chapter, chapter)))
    .orderBy(asc(notes.verseStart), asc(notes.createdAt));
  return NextResponse.json(rows.map(toNote), { headers: { "Cache-Control": "private, no-store" } });
}

// POST /api/notes { bookId, chapter, verseStart, verseEnd?, quote?, bodyMd }
export async function POST(req: NextRequest) {
  if (!(await canWrite())) return unauthorized();
  const body = await req.json().catch(() => null);
  const bookId = validBook(body?.bookId);
  const { chapter, verseStart } = body ?? {};
  const verseEnd = body?.verseEnd ?? verseStart;
  if (!bookId || !positiveInt(chapter) || !positiveInt(verseStart) || !positiveInt(verseEnd) || verseEnd < verseStart) {
    return badRequest("Invalid verse reference.");
  }
  const bodyMd = typeof body.bodyMd === "string" ? body.bodyMd : "";
  if (bodyMd.length > MAX_NOTE_LENGTH) return badRequest("Note is too long.");
  const quote = typeof body.quote === "string" && body.quote.trim() ? body.quote.trim().slice(0, MAX_QUOTE_LENGTH) : null;

  const [row] = await getDb()
    .insert(notes)
    .values({ bookId, chapter, verseStart, verseEnd, quote, bodyMd })
    .returning();
  return NextResponse.json(toNote(row), { status: 201 });
}
