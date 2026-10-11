"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const button = "rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-ink";

export function DataControls() {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function restore(f: File) {
    setStatus("Restoring…");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await f.text(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      const a = data.added;
      setStatus(
        `Restored ${a.notes} notes, ${a.highlights} highlights, ${a.verseReads} verse reads and ${a.chapterProgress} finished chapters. Anything already here was kept.`,
      );
      router.refresh();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a href="/notes" className={button}>
          All notes
        </a>
        <a href="/api/export?format=md" className={button}>
          Export notes (Markdown)
        </a>
        <a href="/api/export?format=json" className={button}>
          Download full backup (JSON)
        </a>
        <button className={button} onClick={() => file.current?.click()}>
          Restore from backup…
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Backup file"
          onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
        />
      </div>
      <p className="text-sm text-muted">
        The backup holds your notes, highlights and reading progress. Restoring merges it in without overwriting
        anything.
      </p>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
    </div>
  );
}
