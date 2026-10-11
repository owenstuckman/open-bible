import { NextResponse, type NextRequest } from "next/server";
import { canRead, unauthorized } from "@/lib/api";
import { backupToMarkdown, buildBackup } from "@/lib/backup/server";

// GET /api/export?format=md|json → downloads your notes (Markdown) or a full backup (JSON).
export async function GET(req: NextRequest) {
  if (!(await canRead())) return unauthorized();
  const backup = await buildBackup();
  const day = backup.exportedAt.slice(0, 10);
  const md = req.nextUrl.searchParams.get("format") === "md";
  return new NextResponse(md ? backupToMarkdown(backup) : JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": md ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="open-bible-${md ? "notes" : "backup"}-${day}.${md ? "md" : "json"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
