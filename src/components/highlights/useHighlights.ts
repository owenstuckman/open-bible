"use client";

import { useCallback, useRef, useState } from "react";
import type { Color, Highlight, HighlightRange } from "@/lib/highlights/types";

export type ClientHighlight = HighlightRange & { key: string; id?: string; color: Color; quote: string | null };

const ck = (book: string, chapter: number) => `${book}.${chapter}`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Highlights per loaded chapter, with optimistic create/recolor/remove. */
export function useHighlights() {
  const [byChapter, setByChapter] = useState<Record<string, ClientHighlight[]>>({});
  const requested = useRef(new Set<string>());
  const creating = useRef(new Map<string, Promise<string | undefined>>());

  const update = useCallback((chapterKey: string, fn: (hs: ClientHighlight[]) => ClientHighlight[]) => {
    setByChapter((m) => ({ ...m, [chapterKey]: fn(m[chapterKey] ?? []) }));
  }, []);

  const loadChapter = useCallback(async (book: string, chapter: number) => {
    const k = ck(book, chapter);
    if (requested.current.has(k)) return;
    requested.current.add(k);
    try {
      const rows = await api<Highlight[]>(`/api/highlights?book=${book}&chapter=${chapter}`);
      setByChapter((m) => ({
        ...m,
        [k]: [...rows.map((h) => ({ ...h, key: h.id })), ...(m[k] ?? []).filter((h) => !h.id)],
      }));
    } catch {
      requested.current.delete(k);
    }
  }, []);

  const add = useCallback(
    (range: HighlightRange, color: Color, quote: string | null) => {
      const key = `hl-${crypto.randomUUID()}`;
      const k = ck(range.bookId, range.chapter);
      update(k, (hs) => [...hs, { ...range, key, color, quote }]);
      const pending = api<Highlight>("/api/highlights", {
        method: "POST",
        body: JSON.stringify({ ...range, color, quote }),
      })
        .then((h) => {
          update(k, (hs) => hs.map((x) => (x.key === key ? { ...x, id: h.id } : x)));
          return h.id;
        })
        .catch(() => {
          update(k, (hs) => hs.filter((x) => x.key !== key)); // roll back
          return undefined;
        })
        .finally(() => creating.current.delete(key));
      creating.current.set(key, pending);
    },
    [update],
  );

  const idFor = async (h: ClientHighlight) => h.id ?? (await creating.current.get(h.key));

  const setColor = useCallback(
    async (h: ClientHighlight, color: Color) => {
      const k = ck(h.bookId, h.chapter);
      update(k, (hs) => hs.map((x) => (x.key === h.key ? { ...x, color } : x)));
      const id = await idFor(h);
      if (id) await api(`/api/highlights/${id}`, { method: "PATCH", body: JSON.stringify({ color }) }).catch(() => {});
    },
    [update],
  );

  const remove = useCallback(
    async (h: ClientHighlight) => {
      update(ck(h.bookId, h.chapter), (hs) => hs.filter((x) => x.key !== h.key));
      const id = await idFor(h);
      if (id) await api(`/api/highlights/${id}`, { method: "DELETE" }).catch(() => {});
    },
    [update],
  );

  return { byChapter, loadChapter, add, setColor, remove };
}

export type HighlightStore = ReturnType<typeof useHighlights>;
