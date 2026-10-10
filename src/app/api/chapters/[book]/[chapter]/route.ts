import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/auth/session";
import { activeTranslation, getChapter } from "@/lib/bible/text";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ book: string; chapter: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { book, chapter } = await ctx.params;
  const data = await getChapter(activeTranslation(), book, Number(chapter));
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=3600" } });
}
