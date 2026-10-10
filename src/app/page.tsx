import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { verseAnchor } from "@/lib/bible/refs";
import { getPosition } from "@/lib/progress/server";

// "/" picks up where you left off, on any device.
export default function Home() {
  return (
    <Suspense fallback={null}>
      <Resume />
    </Suspense>
  );
}

async function Resume(): Promise<React.ReactNode> {
  await connection();
  const pos = await getPosition().catch(() => null);
  return redirect(
    pos ? `/read/${pos.bookId}/${pos.chapter}#${verseAnchor(pos.bookId, pos.chapter, pos.verse)}` : "/read/GEN/1",
  );
}
