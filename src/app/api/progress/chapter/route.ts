import { NextResponse, type NextRequest } from "next/server";
import { badRequest, canWrite, positiveInt, unauthorized, validBook } from "@/lib/api";
import { setChapterRead } from "@/lib/progress/server";

// POST /api/progress/chapter { book, chapter, read: boolean }: mark by hand.
export async function POST(req: NextRequest) {
  if (!(await canWrite())) return unauthorized();
  const body = await req.json().catch(() => null);
  const book = validBook(body?.book);
  if (!book || !positiveInt(body?.chapter) || typeof body?.read !== "boolean") return badRequest("Invalid chapter.");
  await setChapterRead(book, body.chapter, body.read);
  return NextResponse.json({ ok: true });
}
