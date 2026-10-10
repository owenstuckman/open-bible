"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyError, registerPasskey } from "./passkey-client";
import { buttonClass, inputClass } from "./AuthCard";

export function SetupForm({ token }: { token: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await registerPasskey({ nickname, token });
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3 text-left">
      <h1 className="text-center font-semibold">Create your passkey</h1>
      <p className="text-center text-sm text-muted">
        This page works once. After your first passkey is saved it closes for good.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Name this device</span>
        <input
          className={inputClass}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. iPhone, Work laptop"
          maxLength={60}
          required
        />
      </label>
      <button className={buttonClass} disabled={busy || !nickname.trim()}>
        {busy ? "Waiting for passkey…" : "Create passkey"}
      </button>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
    </form>
  );
}
