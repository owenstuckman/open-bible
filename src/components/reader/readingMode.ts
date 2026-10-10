"use client";

import { useSyncExternalStore } from "react";

// Scroll vs page mode is a per-device preference, kept in localStorage.
export type ReadingMode = "scroll" | "page";

const KEY = "ob:mode";
const listeners = new Set<() => void>();

function read(): ReadingMode {
  try {
    return localStorage.getItem(KEY) === "page" ? "page" : "scroll";
  } catch {
    return "scroll";
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function setReadingMode(mode: ReadingMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  listeners.forEach((cb) => cb());
}

/** Server render (and hydration) always starts in scroll mode. */
export function useReadingMode(): ReadingMode {
  return useSyncExternalStore(subscribe, read, () => "scroll");
}
