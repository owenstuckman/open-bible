import "server-only";
import { NextResponse } from "next/server";
import { getBook } from "@/lib/bible/books";
import { isOwner } from "@/lib/auth/session";
import type { notes } from "@/db/schema";
import type { Note } from "./types";

export function unauthorized() {
  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Writes need a live passkey behind the session; reads only a valid session. */
export const canRead = () => isOwner();
export const canWrite = () => isOwner({ strict: true });

export function validBook(bookId: unknown): string | null {
  return typeof bookId === "string" ? (getBook(bookId)?.id ?? null) : null;
}

export const positiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1000;

export function toNote(row: typeof notes.$inferSelect): Note {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
