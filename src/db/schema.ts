import {
  bigint,
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Auth: one owner, any number of passkeys (phone, laptop, ...).
export const passkeys = pgTable("passkeys", {
  id: text("id").primaryKey(), // credential ID, base64url
  publicKey: text("public_key").notNull(), // base64url-encoded COSE key
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: text("transports").array(),
  deviceType: text("device_type"),
  backedUp: boolean("backed_up").notNull().default(false),
  nickname: text("nickname").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Small key/value store, e.g. which SETUP_TOKEN has already been used.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Bible text, one row per verse. `translation` lets a licensed text sit next
// to the public-domain placeholder.
export const verses = pgTable(
  "verses",
  {
    translation: text("translation").notNull(),
    bookId: text("book_id").notNull(),
    chapter: integer("chapter").notNull(),
    verse: integer("verse").notNull(),
    text: text("text").notNull(),
  },
  (t) => [primaryKey({ columns: [t.translation, t.bookId, t.chapter, t.verse] })],
);
