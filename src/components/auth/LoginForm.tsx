"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyError, safeNext, signInWithPasskey } from "./passkey-client";
import { buttonClass } from "./AuthCard";

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPasskey();
      router.replace(safeNext());
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mt-1 mb-6 text-sm text-muted">Private reader</p>
      <button className={buttonClass} onClick={onSignIn} disabled={busy}>
        {busy ? "Waiting for passkey…" : "🔑 Sign in with passkey"}
      </button>
      {error && <p role="alert" className="mt-4 text-sm text-accent">{error}</p>}
      <p className="mt-6 text-xs leading-relaxed text-muted">
        On a new computer, choose “use a phone or tablet” in the prompt and scan the QR code with your phone.
      </p>
    </>
  );
}
