import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { saveChallenge } from "@/lib/auth/session";
import { relyingParty } from "@/lib/auth/webauthn";

export async function POST(req: NextRequest) {
  const { rpID } = relyingParty(req);
  // No allowCredentials: passkeys are discoverable, so the browser offers whichever it has.
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await saveChallenge({ kind: "login", challenge: options.challenge });
  return NextResponse.json(options);
}
