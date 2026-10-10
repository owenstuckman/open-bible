import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appMeta } from "@/db/schema";

// First-run enrollment: /setup?token=<SETUP_TOKEN> registers a passkey without
// being signed in. A successful enrollment records the token's hash, which
// closes /setup until SETUP_TOKEN is changed to a new value (lockout recovery).

export const SETUP_TOKEN_USED_KEY = "setup_token_used";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function configuredToken(): string | null {
  const token = process.env.SETUP_TOKEN;
  return token && token.length >= 16 ? token : null;
}

export async function isSetupOpen(): Promise<boolean> {
  const token = configuredToken();
  if (!token) return false;
  const [row] = await getDb()
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, SETUP_TOKEN_USED_KEY))
    .limit(1);
  return row?.value !== sha256(token);
}

/** Returns the token's hash when `given` matches an unused SETUP_TOKEN, else null. */
export async function checkSetupToken(given: unknown): Promise<string | null> {
  const token = configuredToken();
  if (!token || typeof given !== "string") return null;
  const a = Buffer.from(sha256(given));
  const b = Buffer.from(sha256(token));
  if (!timingSafeEqual(a, b)) return null;
  return (await isSetupOpen()) ? sha256(token) : null;
}
