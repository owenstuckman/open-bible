import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passkeys } from "@/db/schema";
import { signIn, takeChallenge } from "@/lib/auth/session";
import { fromBase64Url, relyingParty } from "@/lib/auth/webauthn";

const fail = (error = "Sign-in failed.") => NextResponse.json({ error }, { status: 401 });

export async function POST(req: NextRequest) {
  const pending = await takeChallenge();
  if (pending?.kind !== "login") return fail("Sign-in expired. Try again.");

  const { response } = (await req.json().catch(() => ({}))) as { response?: AuthenticationResponseJSON };
  if (!response?.id) return fail();
  const db = getDb();
  const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1);
  if (!passkey) return fail("This passkey isn't registered here.");

  const { origin, rpID } = relyingParty(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: fromBase64Url(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports ?? undefined,
      },
      requireUserVerification: false,
    });
  } catch {
    return fail();
  }
  if (!verification.verified) return fail();

  await db
    .update(passkeys)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(passkeys.id, passkey.id));

  await signIn(passkey.id);
  return NextResponse.json({ ok: true });
}
