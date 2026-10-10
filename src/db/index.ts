import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Reuse one pool across hot reloads in dev and across requests on Fluid compute.
// Created lazily so builds don't need DATABASE_URL.
const g = globalThis as unknown as { openBibleDb?: Db };

export function getDb(): Db {
  if (!g.openBibleDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare: false keeps us compatible with pooled (PgBouncer) connection strings.
    g.openBibleDb = drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
  }
  return g.openBibleDb;
}
