import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passkeys } from "@/db/schema";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieDefaults,
  sessionPassword,
  type SessionData,
} from "./config";

function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: sessionPassword(),
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: cookieDefaults,
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function signIn(passkeyId: string) {
  const session = await getSession();
  session.owner = true;
  session.passkeyId = passkeyId;
  session.issuedAt = Date.now();
  await session.save();
}

/**
 * True when the request carries a valid owner session. With `strict`, also
 * checks that the passkey that created the session hasn't been revoked; use
 * that for anything that changes data.
 */
export async function isOwner({ strict = false } = {}): Promise<boolean> {
  const session = await getSession();
  if (session.owner !== true) return false;
  if (!strict) return true;
  if (!session.passkeyId) return false;
  const [row] = await getDb()
    .select({ id: passkeys.id })
    .from(passkeys)
    .where(eq(passkeys.id, session.passkeyId))
    .limit(1);
  return Boolean(row);
}

// The pending WebAuthn challenge lives in its own short-lived encrypted cookie.
export type PendingChallenge =
  | { kind: "register"; challenge: string; nickname: string; setupTokenHash?: string }
  | { kind: "login"; challenge: string };

async function challengeSession() {
  return getIronSession<{ pending?: PendingChallenge }>(await cookies(), {
    cookieName: CHALLENGE_COOKIE,
    password: sessionPassword(),
    ttl: CHALLENGE_TTL_SECONDS,
    cookieOptions: { ...cookieDefaults, sameSite: "strict" },
  });
}

export async function saveChallenge(pending: PendingChallenge) {
  const s = await challengeSession();
  s.pending = pending;
  await s.save();
}

/** Returns the pending challenge and clears it, so each one can only be used once. */
export async function takeChallenge(): Promise<PendingChallenge | undefined> {
  const s = await challengeSession();
  const pending = s.pending;
  s.destroy();
  return pending;
}
