"use client";

import { footnotesPref } from "@/lib/prefs";

export function FootnotesToggle() {
  const on = footnotesPref.use() === "on";
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => footnotesPref.set(e.target.checked ? "on" : "off")}
        className="mt-1 size-4 accent-[var(--accent)]"
      />
      <span>
        <span className="font-medium">Show footnotes</span>
        <span className="block text-sm text-muted">
          Small letters in the text open the translation&apos;s notes; each chapter lists them at the end. Saved on this
          device.
        </span>
      </span>
    </label>
  );
}
