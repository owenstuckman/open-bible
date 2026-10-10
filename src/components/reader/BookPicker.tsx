"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BOOKS, type Book, type BookGroup } from "@/lib/bible/books";
import type { ChapterRef } from "@/lib/bible/text";

type Props = {
  open: boolean;
  onClose: () => void;
  current: ChapterRef;
  chapterCounts: Record<string, number>;
};

const GROUPS: { testament: "OT" | "NT"; label: string; groups: BookGroup[] }[] = [
  { testament: "OT", label: "Old Testament", groups: ["Pentateuch", "Historical", "Wisdom", "Prophets"] },
  { testament: "NT", label: "New Testament", groups: ["Gospels", "Acts", "Letters", "Revelation"] },
];

export function BookPicker({ open, onClose, current, chapterCounts }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string>(current.book);
  // Phones show one pane at a time: pick a book, then its chapter.
  const [step, setStep] = useState<"books" | "chapters">("books");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setSelected(current.book);
      setStep("books");
      setQuery("");
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, current.book]);

  const available = useMemo(() => BOOKS.filter((b) => chapterCounts[b.id]), [chapterCounts]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return available.filter(
      (b) => b.name.toLowerCase().includes(q) || b.abbr.toLowerCase().replace(/\s/g, "").startsWith(q.replace(/\s/g, "")),
    );
  }, [query, available]);

  const pick = (id: string) => {
    setSelected(id);
    setStep("chapters");
  };

  const go = (book: string, chapter: number) => {
    onClose();
    router.push(`/read/${book}/${chapter}`);
  };

  const selectedBook = available.find((b) => b.id === selected);
  const count = selectedBook ? chapterCounts[selectedBook.id] : 0;

  const bookButton = (b: Book) => (
    <button
      key={b.id}
      onClick={() => (chapterCounts[b.id] === 1 ? go(b.id, 1) : pick(b.id))}
      className={`rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
        b.id === selected ? "bg-ink text-paper" : "hover:bg-accent-soft"
      }`}
    >
      {b.name}
    </button>
  );

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      className="m-auto max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-paper p-0 text-ink shadow-xl"
      aria-label="Choose a book and chapter"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches?.[0]) {
                pick(matches[0].id);
                setQuery("");
              }
            }}
            placeholder="Filter books… (e.g. “sir”, “1 cor”)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent"
          />
          <button onClick={onClose} className="grid size-9 place-items-center rounded-lg hover:bg-accent-soft" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto sm:grid-cols-[1fr_16rem]">
          <div className={`p-4 ${step === "chapters" ? "hidden sm:block" : ""}`}>
            {matches ? (
              <div className="flex flex-wrap gap-1">
                {matches.length ? matches.map(bookButton) : <p className="text-sm text-muted">No matching books.</p>}
              </div>
            ) : (
              GROUPS.map((t) => (
                <div key={t.testament} className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted uppercase">{t.label}</h3>
                  {t.groups.map((g) => {
                    const books = available.filter((b) => b.group === g);
                    if (!books.length) return null;
                    return (
                      <div key={g} className="mb-2">
                        <p className="mb-1 text-[11px] text-muted">{g}</p>
                        <div className="flex flex-wrap gap-1">{books.map(bookButton)}</div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {selectedBook && (
            <div className={`p-4 sm:border-l sm:border-line ${step === "books" ? "hidden sm:block" : ""}`}>
              <button onClick={() => setStep("books")} className="mb-2 text-sm text-muted sm:hidden">
                ← All books
              </button>
              <h3 className="mb-3 font-serif text-lg font-semibold">{selectedBook.name}</h3>
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                  const isCurrent = selectedBook.id === current.book && n === current.chapter;
                  return (
                    <button
                      key={n}
                      onClick={() => go(selectedBook.id, n)}
                      className={`aspect-square rounded-md border text-sm transition ${
                        isCurrent ? "border-accent bg-accent text-paper" : "border-line hover:border-ink"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
