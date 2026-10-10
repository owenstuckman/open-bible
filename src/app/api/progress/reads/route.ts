import { NextResponse, type NextRequest } from "next/server";
import { canWrite, unauthorized } from "@/lib/api";
import { cleanRef, cleanRefs, recordReads } from "@/lib/progress/server";

// POST /api/progress/reads { reads: [{book, chapter, verse}], position?: {book, chapter, verse} }
// Also accepts navigator.sendBeacon payloads on page hide.
export async function POST(req: NextRequest) {
  if (!(await canWrite())) return unauthorized();
  const body = await req.json().catch(() => null);
  const completed = await recordReads(cleanRefs(body?.reads), cleanRef(body?.position));
  return NextResponse.json({ completed });
}
