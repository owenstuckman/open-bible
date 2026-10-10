import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notes } from "@/db/schema";
import { MAX_NOTE_LENGTH } from "@/lib/notes/types";
import { badRequest, canWrite, toNote, unauthorized } from "@/lib/notes/server";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Note not found." }, { status: 404 });

// PATCH /api/notes/:id { bodyMd }
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await canWrite())) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound();
  const body = await req.json().catch(() => null);
  if (typeof body?.bodyMd !== "string") return badRequest("bodyMd is required.");
  if (body.bodyMd.length > MAX_NOTE_LENGTH) return badRequest("Note is too long.");

  const [row] = await getDb()
    .update(notes)
    .set({ bodyMd: body.bodyMd, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();
  return row ? NextResponse.json(toNote(row)) : notFound();
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await canWrite())) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound();
  await getDb().delete(notes).where(eq(notes.id, id));
  return NextResponse.json({ ok: true });
}
