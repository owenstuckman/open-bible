"use client";

import { useEffect, useRef } from "react";
import { getBook } from "@/lib/bible/books";
import { NoteCard } from "./NoteCard";
import type { ClientNote, NotesStore } from "./useNotes";

type Props = {
  open: boolean;
  onClose: () => void;
  book: string;
  chapter: number;
  notes: ClientNote[];
  focusVerse: number | null;
  store: NotesStore;
};

/** Phones/tablets: the chapter's notes in a bottom sheet. */
export function NotesSheet({ open, onClose, book, chapter, notes, focusVerse, store }: Props) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || focusVerse === null || !list.current) return;
    const target = notes.find((n) => focusVerse >= n.verseStart && focusVerse <= n.verseEnd);
    if (target) list.current.querySelector(`[data-note="${target.key}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, focusVerse, notes]);

  return (
    <div className={`fixed inset-0 z-30 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
      />
      <section
        role="dialog"
        aria-label="Notes"
        className={`absolute inset-x-0 bottom-0 flex max-h-[75dvh] flex-col rounded-t-2xl border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-2 pb-2">
          <span className="mx-auto mb-1 h-1 w-10 rounded-full bg-line" aria-hidden />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
            Notes · {getBook(book)?.name} {chapter}
          </h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted" aria-label="Close notes">
            ✕
          </button>
        </div>
        <div ref={list} className="space-y-3 overflow-y-auto px-4 pb-6">
          {notes.length ? (
            notes.map((n) => (
              <NoteCard
                key={n.key}
                note={n}
                autoFocus={store.focusKey === n.key}
                onFocused={() => store.setFocusKey(null)}
                onSave={store.save}
                onDelete={store.remove}
              />
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              No notes in this chapter yet. Tap a verse number or select some text to add one.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
