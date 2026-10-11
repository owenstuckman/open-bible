import { NextResponse, type NextRequest } from "next/server";
import { badRequest, canRead, unauthorized } from "@/lib/api";
import { searchNotes, searchVerses } from "@/lib/search/server";

// GET /api/search?q=…&scope=all|OT|NT|<BOOK>&offset=0 → Bible hits + note hits
export async function GET(req: NextRequest) {
  if (!(await canRead())) return unauthorized();
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return badRequest("Type at least 2 characters.");
  const scope = p.get("scope") ?? "all";
  const offset = Math.max(0, Math.min(450, Number(p.get("offset")) || 0));
  const [bible, notes] = await Promise.all([searchVerses(q, scope, 50, offset), searchNotes(q, scope, 50)]);
  return NextResponse.json({ q, bible, notes }, { headers: { "Cache-Control": "private, no-store" } });
}
