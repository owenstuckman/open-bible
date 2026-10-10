import "server-only";
import type { NextRequest } from "next/server";

export const RP_NAME = "Open Bible";

// A fixed user handle: there is exactly one user. Registering again on the same
// authenticator replaces that device's old credential instead of piling up.
export const OWNER_USER_ID = new TextEncoder().encode("open-bible-owner");

/**
 * Relying-party settings. Passkeys are bound to the RP ID (the domain), so in
 * production pin WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN to the final domain.
 */
export function relyingParty(req: NextRequest) {
  const origin = process.env.WEBAUTHN_ORIGIN ?? req.nextUrl.origin;
  const rpID = process.env.WEBAUTHN_RP_ID ?? new URL(origin).hostname;
  return { origin, rpID };
}

export const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
export const fromBase64Url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));
