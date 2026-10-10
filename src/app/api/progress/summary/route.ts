import { NextResponse } from "next/server";
import { canRead, unauthorized } from "@/lib/api";
import { getSummary } from "@/lib/progress/server";

export async function GET() {
  if (!(await canRead())) return unauthorized();
  return NextResponse.json(await getSummary(), { headers: { "Cache-Control": "private, no-store" } });
}
