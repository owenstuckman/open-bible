import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Registers a passkey on this device. Pass `token` during first-run setup. */
export async function registerPasskey({ nickname, token }: { nickname: string; token?: string }) {
  const optionsJSON = await post<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
    "/api/auth/register/options",
    { nickname, token },
  );
  const response = await startRegistration({ optionsJSON });
  await post("/api/auth/register/verify", { response, token });
}

export async function signInWithPasskey() {
  const optionsJSON = await post<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
    "/api/auth/login/options",
    {},
  );
  const response = await startAuthentication({ optionsJSON });
  await post("/api/auth/login/verify", { response });
}

export function friendlyError(err: unknown): string {
  const e = err as Error;
  if (e?.name === "NotAllowedError") return "The passkey prompt was cancelled or timed out.";
  if (e?.name === "InvalidStateError") return "This device already has a passkey for Open Bible.";
  return e?.message || "Something went wrong.";
}

/** Only follow same-site relative paths after sign-in. */
export function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
