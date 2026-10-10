// Shared between the notes API and the client.
export type Note = {
  id: string;
  bookId: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  quote: string | null;
  bodyMd: string;
  createdAt: string;
  updatedAt: string;
};

export const MAX_NOTE_LENGTH = 20_000;
export const MAX_QUOTE_LENGTH = 1_000;
