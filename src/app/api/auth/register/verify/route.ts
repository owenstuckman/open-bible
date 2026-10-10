import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { getDb } from "@/db";
import { appMeta, passkeys } from "@/db/schema";
import { isOwner, signIn, takeChallenge } from "@/lib/auth/session";
import { SETUP_TOKEN_USED_KEY, checkSetupToken } from "@/lib/auth/setup";
import { relyingParty, toBase64Url } from "@/lib/auth/webauthn";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    response?: RegistrationResponseJSON;
  };
  const pending = await takeChallenge();
  if (pending?.kind !== "register") {
    return NextResponse.json({ error: "Registration expired. Try again." }, { status: 400 });
  }

  // Re-authorize: the setup token must still be unused, or the owner still signed in.
  if (pending.setupTokenHash) {
    if ((await checkSetupToken(body.token)) !== pending.setupTokenHash) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }
  } else if (!(await isOwner({ strict: true }))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const response = body.response;
  if (!response) return NextResponse.json({ error: "Missing response." }, { status: 400 });
  const { origin, rpID } = relyingParty(req);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  if (!verification.verified) {
    return NextResponse.json({ error: "Passkey could not be verified." }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await getDb().transaction(async (tx) => {
    await tx
      .insert(passkeys)
      .values({
        id: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        nickname: pending.nickname,
        lastUsedAt: new Date(),
      })
      .onConflictDoNothing();
    if (pending.setupTokenHash) {
      await tx
        .insert(appMeta)
        .values({ key: SETUP_TOKEN_USED_KEY, value: pending.setupTokenHash })
        .onConflictDoUpdate({ target: appMeta.key, set: { value: pending.setupTokenHash } });
    }
  });

  await signIn(credential.id);
  return NextResponse.json({ ok: true });
}
