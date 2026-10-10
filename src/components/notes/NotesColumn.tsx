"use client";

import { useLayoutEffect, useRef } from "react";
import { NoteCard } from "./NoteCard";
import type { ClientNote, NotesStore } from "./useNotes";

type Props = {
  notes: ClientNote[];
  /** The chapter's verse container; note cards line up with its verses. */
  versesRef: React.RefObject<HTMLElement | null>;
  store: NotesStore;
  activeVerse: number | null;
  onHoverNote: (note: ClientNote | null) => void;
};

const GAP = 12;

/**
 * Desktop notes column for one chapter. Each card sits level with its first
 * verse; when cards would overlap they stack downward.
 */
export function NotesColumn({ notes, versesRef, store, activeVerse, onHoverNote }: Props) {
  const column = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const col = column.current;
    const verses = versesRef.current;
    if (!col || !verses) return;

    let frame = 0;
    const layout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const origin = col.getBoundingClientRect().top;
        let floor = 0;
        for (const card of col.querySelectorAll<HTMLElement>("[data-note-slot]")) {
          const verse = verses.querySelector<HTMLElement>(`[data-verse="${card.dataset.noteSlot}"]`);
          const want = verse ? verse.getBoundingClientRect().top - origin : floor;
          const top = Math.max(want, floor);
          card.style.transform = `translateY(${top}px)`;
          floor = top + card.offsetHeight + GAP;
        }
        col.style.minHeight = `${floor}px`;
      });
    };

    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(verses);
    col.querySelectorAll("[data-note-slot]").forEach((el) => ro.observe(el));
    document.fonts?.ready.then(layout);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [notes, versesRef]);

  return (
    <div ref={column} className="relative">
      {notes.map((n) => (
        <div
          key={n.key}
          data-note-slot={n.verseStart}
          className="absolute inset-x-0 top-0 transition-transform duration-200"
        >
          <NoteCard
            note={n}
            autoFocus={store.focusKey === n.key}
            onFocused={() => store.setFocusKey(null)}
            linked={activeVerse !== null && activeVerse >= n.verseStart && activeVerse <= n.verseEnd}
            onSave={store.save}
            onDelete={store.remove}
            onHover={(on) => onHoverNote(on ? n : null)}
          />
        </div>
      ))}
    </div>
  );
}
