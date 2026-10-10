"use client";

import { useSyncExternalStore } from "react";

/**
 * A per-device preference kept in localStorage. Server render and hydration
 * always use the fallback; the stored value takes over right after.
 */
export function createPref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", cb);
    };
  };
  return {
    use: (): T => useSyncExternalStore(subscribe, read, () => fallback),
    set: (v: T) => {
      try {
        localStorage.setItem(key, v);
      } catch {}
      listeners.forEach((cb) => cb());
    },
  };
}

export const readingModePref = createPref("ob:mode", "scroll", ["scroll", "page"] as const);
export const footnotesPref = createPref("ob:footnotes", "on", ["on", "off"] as const);
