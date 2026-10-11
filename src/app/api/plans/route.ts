import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { chapterProgress, readingPlans } from "@/db/schema";
import { badRequest, canRead, canWrite, unauthorized } from "@/lib/api";
import { activeTranslation, getChapterCounts } from "@/lib/bible/text";
import { PLANS, schedule } from "@/lib/plans";

// GET /api/plans → every plan, its schedule if started, and which chapters are read.
// The client works out "today" in your own time zone.
export async function GET() {
  if (!(await canRead())) return unauthorized();
  const db = getDb();
  const [counts, started, done] = await Promise.all([
    getChapterCounts(activeTranslation()),
    db.select().from(readingPlans),
    db.select({ bookId: chapterProgress.bookId, chapter: chapterProgress.chapter }).from(chapterProgress),
  ]);
  const startOf = new Map(started.map((p) => [p.planKey, p.startDate]));
  return NextResponse.json(
    {
      plans: PLANS.map((p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        days: p.days,
        start: startOf.get(p.key) ?? null,
        schedule: startOf.has(p.key) ? schedule(p, counts) : null,
      })),
      completed: done.map((d) => `${d.bookId}.${d.chapter}`),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// POST /api/plans { key, start: "YYYY-MM-DD" }: start (or restart) a plan.
export async function POST(req: NextRequest) {
  if (!(await canWrite())) return unauthorized();
  const body = await req.json().catch(() => null);
  if (!PLANS.some((p) => p.key === body?.key)) return badRequest("Unknown plan.");
  if (typeof body?.start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.start) || Number.isNaN(Date.parse(body.start))) {
    return badRequest("start must be a date (YYYY-MM-DD).");
  }
  await getDb()
    .insert(readingPlans)
    .values({ planKey: body.key, startDate: body.start })
    .onConflictDoUpdate({ target: readingPlans.planKey, set: { startDate: body.start } });
  return NextResponse.json({ ok: true });
}
