import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getDb } from "@/db";
import { passkeys } from "@/db/schema";
import { isOwner, saveChallenge } from "@/lib/auth/session";
import { checkSetupToken } from "@/lib/auth/setup";
import { OWNER_USER_ID, RP_NAME, relyingParty } from "@/lib/auth/webauthn";

// Allowed for a signed-in owner (adding a device) or with a valid, unused SETUP_TOKEN.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; nickname?: unknown };
  const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 60) : "";
  if (!nickname) return NextResponse.json({ error: "Give this passkey a name." }, { status: 400 });

  let setupTokenHash: string | undefined;
  if (!(await isOwner({ strict: true }))) {
    setupTokenHash = (await checkSetupToken(body.token)) ?? undefined;
    if (!setupTokenHash) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const existing = await getDb()
    .select({ id: passkeys.id, transports: passkeys.transports })
    .from(passkeys);
  const { rpID } = relyingParty(req);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: "owner",
    userDisplayName: "Open Bible owner",
    userID: OWNER_USER_ID,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });

  await saveChallenge({ kind: "register", challenge: options.challenge, nickname, setupTokenHash });
  return NextResponse.json(options);
}
