"use client";

import { useCallback, useRef, useState } from "react";
import type { Note } from "@/lib/notes/types";

/** A note on the client. `key` is stable for React; `id` appears once saved. */
export type ClientNote = Omit<Note, "id" | "createdAt" | "updatedAt"> & {
  key: string;
  id?: string;
  updatedAt?: string;
};

export const chapterKey = (book: string, chapter: number) => `${book}.${chapter}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const sortNotes = (ns: ClientNote[]) =>
  [...ns].sort((a, b) => a.verseStart - b.verseStart || a.verseEnd - b.verseEnd);

/**
 * Notes for every chapter the reader has loaded, keyed "BOOK.chapter".
 * Creates are lazy: a new note is a local draft until its first save.
 */
export function useNotes() {
  const [byChapter, setByChapter] = useState<Record<string, ClientNote[]>>({});
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  // In-flight creates, so a save that races the first POST waits for its id.
  const creating = useRef(new Map<string, Promise<string>>());

  const patchNote = useCallback((ck: string, key: string, patch: Partial<ClientNote>) => {
    setByChapter((m) => ({ ...m, [ck]: (m[ck] ?? []).map((n) => (n.key === key ? { ...n, ...patch } : n)) }));
  }, []);

  const loadChapter = useCallback(async (book: string, chapter: number) => {
    const ck = chapterKey(book, chapter);
    if (requested.current.has(ck)) return;
    requested.current.add(ck);
    try {
      const rows = await api<Note[]>(`/api/notes?book=${book}&chapter=${chapter}`);
      setByChapter((m) => ({
        ...m,
        // Keep any drafts the reader started while this was loading.
        [ck]: sortNotes([...rows.map((n) => ({ ...n, key: n.id })), ...(m[ck] ?? []).filter((n) => !n.id)]),
      }));
    } catch {
      requested.current.delete(ck); // allow a retry on the next load
    }
  }, []);

  const addDraft = useCallback(
    (book: string, chapter: number, verseStart: number, verseEnd = verseStart, quote: string | null = null) => {
      const key = `draft-${crypto.randomUUID()}`;
      const ck = chapterKey(book, chapter);
      const draft: ClientNote = { key, bookId: book, chapter, verseStart, verseEnd, quote, bodyMd: "" };
      setByChapter((m) => ({ ...m, [ck]: sortNotes([...(m[ck] ?? []), draft]) }));
      setFocusKey(key);
      return key;
    },
    [],
  );

  /** Persists the body: POST for a draft, PATCH afterwards. */
  const save = useCallback(
    async (note: ClientNote, bodyMd: string) => {
      const ck = chapterKey(note.bookId, note.chapter);
      const id = note.id ?? (await creating.current.get(note.key));
      if (!id) {
        const pending = api<Note>("/api/notes", {
          method: "POST",
          body: JSON.stringify({ ...note, bodyMd }),
        }).then((n) => {
          patchNote(ck, note.key, { id: n.id, updatedAt: n.updatedAt, bodyMd });
          return n.id;
        });
        creating.current.set(note.key, pending);
        try {
          await pending;
        } finally {
          creating.current.delete(note.key);
        }
        return;
      }
      const n = await api<Note>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify({ bodyMd }) });
      patchNote(ck, note.key, { id, updatedAt: n.updatedAt, bodyMd });
    },
    [patchNote],
  );

  const remove = useCallback(async (note: ClientNote) => {
    const ck = chapterKey(note.bookId, note.chapter);
    setByChapter((m) => ({ ...m, [ck]: (m[ck] ?? []).filter((n) => n.key !== note.key) }));
    const id = note.id ?? (await creating.current.get(note.key)?.catch(() => undefined));
    if (id) await api(`/api/notes/${id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  return { byChapter, loadChapter, addDraft, save, remove, focusKey, setFocusKey };
}

export type NotesStore = ReturnType<typeof useNotes>;
