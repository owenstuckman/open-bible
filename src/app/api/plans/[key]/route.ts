import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { readingPlans } from "@/db/schema";
import { canWrite, unauthorized } from "@/lib/api";

// DELETE /api/plans/:key: stop a plan. Chapters you've read stay read.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  if (!(await canWrite())) return unauthorized();
  const { key } = await ctx.params;
  await getDb().delete(readingPlans).where(eq(readingPlans.planKey, key));
  return NextResponse.json({ ok: true });
}
