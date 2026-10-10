// Shared by proxy.ts and server code, so no `server-only` / `next/headers` imports here.

export const SESSION_COOKIE = "ob_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, refreshed daily by the proxy
export const SESSION_REFRESH_AFTER_MS = 1000 * 60 * 60 * 24;

export const CHALLENGE_COOKIE = "ob_challenge";
export const CHALLENGE_TTL_SECONDS = 60 * 5;

export type SessionData = {
  owner?: true;
  passkeyId?: string;
  issuedAt?: number;
};

export function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return secret;
}

export const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
