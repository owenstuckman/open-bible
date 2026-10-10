import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { highlights } from "@/db/schema";
import { COLORS } from "@/lib/highlights/types";
import { badRequest, canWrite, unauthorized } from "@/lib/notes/server";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "Highlight not found." }, { status: 404 });

// PATCH /api/highlights/:id { color }
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!(await canWrite())) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound();
  const body = await req.json().catch(() => null);
  if (!COLORS.includes(body?.color)) return badRequest("Invalid color.");
  const [row] = await getDb().update(highlights).set({ color: body.color }).where(eq(highlights.id, id)).returning();
  return row ? NextResponse.json({ ...row, createdAt: row.createdAt.toISOString() }) : notFound();
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  if (!(await canWrite())) return unauthorized();
  const { id } = await ctx.params;
  if (!UUID.test(id)) return notFound();
  await getDb().delete(highlights).where(eq(highlights.id, id));
  return NextResponse.json({ ok: true });
}
