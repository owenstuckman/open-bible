import { NextResponse, type NextRequest } from "next/server";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passkeys } from "@/db/schema";
import { isOwner } from "@/lib/auth/session";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isOwner({ strict: true }))) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(passkeys);
  if (total <= 1) {
    return NextResponse.json({ error: "You can't remove your only passkey." }, { status: 400 });
  }
  await db.delete(passkeys).where(eq(passkeys.id, id));
  return NextResponse.json({ ok: true });
}
