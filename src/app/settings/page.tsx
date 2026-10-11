import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { passkeys } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { TRANSLATIONS, activeTranslation } from "@/lib/bible/text";
import { AddPasskeyForm, RemovePasskeyButton, SignOutButton } from "@/components/settings/PasskeyControls";
import { FootnotesToggle } from "@/components/settings/FootnotesToggle";
import { DataControls } from "@/components/settings/DataControls";

export default function SettingsPage() {
  const t = TRANSLATIONS[activeTranslation()];
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">← Back to reading</Link>
      <h1 className="mt-4 mb-8 font-serif text-3xl font-semibold">Settings</h1>

      <section className="mb-10">
        <h2 className="mb-1 text-xs font-semibold tracking-widest text-muted uppercase">Passkeys</h2>
        <p className="mb-4 text-sm text-muted">
          Each device you sign in from needs a passkey, unless it syncs them (iCloud Keychain, Google Password Manager).
        </p>
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <PasskeyList />
        </Suspense>
        <AddPasskeyForm />
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-xs font-semibold tracking-widest text-muted uppercase">Translation</h2>
        <p className="font-medium">{t.name}</p>
        <p className="mt-1 text-sm text-muted">{t.notice}</p>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">Reading</h2>
        <FootnotesToggle />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">Your data</h2>
        <DataControls />
      </section>

      <SignOutButton />
    </main>
  );
}

async function PasskeyList() {
  await connection(); // per-request: reads the session cookie and live passkey list
  const session = await getSession();
  if (session.owner !== true) redirect("/login?next=/settings");
  const rows = await getDb().select().from(passkeys).orderBy(asc(passkeys.createdAt));
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { dateStyle: "medium" }) : "never");

  return (
    <ul className="mb-4 divide-y divide-line rounded-xl border border-line">
      {rows.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {p.nickname}
              {p.id === session.passkeyId && <span className="ml-2 text-xs text-accent">this session</span>}
            </p>
            <p className="text-xs text-muted">
              Added {fmt(p.createdAt)} · last used {fmt(p.lastUsedAt)}
              {p.backedUp && " · synced"}
            </p>
          </div>
          <RemovePasskeyButton id={p.id} disabled={rows.length <= 1} />
        </li>
      ))}
    </ul>
  );
}
