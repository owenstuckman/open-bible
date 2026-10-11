import { NextResponse, type NextRequest } from "next/server";
import { badRequest, canWrite, unauthorized } from "@/lib/api";
import { restoreBackup } from "@/lib/backup/server";

// POST /api/import <backup JSON> → merges it in; existing rows are kept.
export async function POST(req: NextRequest) {
  if (!(await canWrite())) return unauthorized();
  const body = await req.json().catch(() => null);
  try {
    return NextResponse.json({ added: await restoreBackup(body) });
  } catch (e) {
    return badRequest((e as Error).message);
  }
}
