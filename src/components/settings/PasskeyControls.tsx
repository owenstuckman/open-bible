"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyError, registerPasskey } from "@/components/auth/passkey-client";
import { inputClass } from "@/components/auth/AuthCard";

const smallButton =
  "rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-ink disabled:opacity-40 disabled:hover:border-line";

export function AddPasskeyForm() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await registerPasskey({ nickname });
      setNickname("");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input
        className={`${inputClass} min-w-0 flex-1`}
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Name for a new passkey"
        maxLength={60}
        aria-label="Passkey name"
      />
      <button className={smallButton} disabled={busy || !nickname.trim()}>
        {busy ? "Waiting…" : "Add passkey"}
      </button>
      {error && <p role="alert" className="w-full text-sm text-accent">{error}</p>}
    </form>
  );
}

export function RemovePasskeyButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    await fetch(`/api/passkeys/${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    setConfirming(false);
    router.refresh();
  }

  if (disabled) {
    return <span className="text-xs text-muted" title="You can't remove your only passkey">Only passkey</span>;
  }
  return confirming ? (
    <span className="flex shrink-0 gap-2">
      <button className={`${smallButton} text-accent`} onClick={remove} disabled={busy}>Remove</button>
      <button className={smallButton} onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  ) : (
    <button className={`${smallButton} shrink-0`} onClick={() => setConfirming(true)}>Remove…</button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className={smallButton}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      Sign out
    </button>
  );
}
