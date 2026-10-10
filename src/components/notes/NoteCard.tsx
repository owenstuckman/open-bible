"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatRef } from "@/lib/bible/refs";
import { Markdown } from "./Markdown";
import type { ClientNote } from "./useNotes";

type Props = {
  note: ClientNote;
  autoFocus?: boolean;
  linked?: boolean;
  onSave: (note: ClientNote, body: string) => Promise<void>;
  onDelete: (note: ClientNote) => void;
  onHover?: (on: boolean) => void;
  onFocused?: () => void;
};

type Status = "idle" | "saving" | "saved" | "error";
const AUTOSAVE_MS = 800;

/** One note: rendered Markdown, click to edit, autosaves while typing. */
export function NoteCard({ note, autoFocus, linked, onSave, onDelete, onHover, onFocused }: Props) {
  const [editing, setEditing] = useState(Boolean(autoFocus));
  const [body, setBody] = useState(note.bodyMd);
  const [status, setStatus] = useState<Status>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSaved = useRef(note.bodyMd);
  // Latest note/body for callbacks that outlive a render (debounce, blur).
  const latest = useRef({ note, body });
  useLayoutEffect(() => {
    latest.current = { note, body };
  });

  useEffect(() => {
    if (!editing || !textarea.current) return;
    const ta = textarea.current;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    onFocused?.();
    // Only when entering edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    const ta = textarea.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [body, editing]);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function flush() {
    clearTimeout(timer.current);
    const { note: n, body: b } = latest.current;
    if (b === lastSaved.current || !b.trim()) return;
    setStatus("saving");
    try {
      await onSave(n, b);
      lastSaved.current = b;
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function onChange(value: string) {
    setBody(value);
    setStatus("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  }

  function onBlur() {
    if (!latest.current.body.trim()) {
      // An emptied note has nothing worth keeping.
      clearTimeout(timer.current);
      onDelete(latest.current.note);
      return;
    }
    flush();
    setEditing(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      textarea.current?.blur();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      const ta = e.currentTarget;
      const wrap = e.key === "b" ? "**" : "*";
      const { selectionStart: a, selectionEnd: z, value } = ta;
      const next = value.slice(0, a) + wrap + value.slice(a, z) + wrap + value.slice(z);
      onChange(next);
      requestAnimationFrame(() => ta.setSelectionRange(a + wrap.length, z + wrap.length));
    }
  }

  return (
    <article
      data-note={note.key}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={`rounded-xl border bg-paper px-3.5 pt-2.5 pb-2 shadow-sm transition-colors ${
        linked || editing ? "border-accent" : "border-line"
      }`}
    >
      <header className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-accent">
          {formatRef(note.bookId, note.chapter, note.verseStart, note.verseEnd)}
        </span>
        {confirmDelete ? (
          <span className="flex gap-2">
            <button className="font-medium text-accent" onClick={() => onDelete(note)}>
              Delete
            </button>
            <button className="text-muted" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button
            className="text-muted opacity-60 hover:opacity-100"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete note"
            title="Delete note"
          >
            ✕
          </button>
        )}
      </header>
      {note.quote && (
        <blockquote className="mb-1.5 border-l-[3px] border-line pl-2 font-serif text-[13px] text-muted italic">
          “{note.quote}”
        </blockquote>
      )}
      {editing ? (
        <textarea
          ref={textarea}
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Write a note… Markdown works: **bold**, *italic*, - lists, [[Jn 3:16]]"
          aria-label="Note text (Markdown)"
          className="block w-full resize-none overflow-hidden bg-transparent font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted/70"
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("a")) setEditing(true);
          }}
          onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
          className="cursor-text text-sm leading-relaxed"
          title="Click to edit"
        >
          {body.trim() ? <Markdown source={body} /> : <span className="text-muted">Click to write…</span>}
        </div>
      )}
      <p className="mt-1 h-4 text-[11px] text-muted" aria-live="polite">
        {status === "saving" && "Saving…"}
        {status === "saved" && "✓ Saved"}
        {status === "error" && (
          <button className="text-accent" onClick={flush}>
            ⚠ Not saved. Retry
          </button>
        )}
        {status === "idle" && editing && "Esc to finish · ⌘/Ctrl+B, I"}
      </p>
    </article>
  );
}
