"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBook } from "@/lib/bible/books";
import { planStatus, type ChapterKey } from "@/lib/plans";

type Plan = {
  key: string;
  name: string;
  description: string;
  days: number;
  start: string | null;
  schedule: ChapterKey[][] | null;
};

type PlansResponse = { plans: Plan[]; completed: string[] };

async function fetchPlans(): Promise<PlansResponse | null> {
  const res = await fetch("/api/plans");
  return res.ok ? res.json() : null;
}

/** Today's date in the reader's own time zone, as YYYY-MM-DD. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const label = (key: ChapterKey) => {
  const [b, c] = key.split(".");
  return `${getBook(b)?.abbr ?? b} ${c}`;
};
const href = (key: ChapterKey) => `/read/${key.replace(".", "/")}`;

export function PlansView() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [confirmStop, setConfirmStop] = useState<string | null>(null);
  // Set in the browser along with the data, so it's the reader's own date.
  const [today, setToday] = useState("");

  const apply = useCallback((data: PlansResponse | null) => {
    if (!data) return;
    setToday(localToday());
    setPlans(data.plans);
    setCompleted(new Set(data.completed));
  }, []);
  const load = useCallback(() => fetchPlans().then(apply), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchPlans().then((d) => !cancelled && apply(d));
    return () => {
      cancelled = true;
    };
  }, [apply]);

  async function start(key: string) {
    await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, start: localToday() }),
    });
    await load();
  }

  async function stop(key: string) {
    await fetch(`/api/plans/${key}`, { method: "DELETE" });
    setConfirmStop(null);
    await load();
  }

  if (!plans) return <p className="text-sm text-muted">Loading…</p>;
  const active = plans.filter((p) => p.start && p.schedule);
  const available = plans.filter((p) => !p.start);

  return (
    <>
      {active.map((p) => {
        const s = planStatus(p.schedule!, p.start!, today, completed);
        const pct = Math.floor((s.done / s.total) * 100);
        return (
          <section key={p.key} aria-label={p.name} className="mb-6 rounded-2xl border border-line bg-paper p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold">{p.name}</h2>
              <span className="text-sm text-muted">
                {s.finished ? "Finished 🎉" : `Day ${s.day + 1} of ${s.totalDays}`}
              </span>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            {!s.finished && (
              <>
                <p className="mb-2 text-xs font-semibold tracking-widest text-muted uppercase">Today</p>
                <ul className="mb-4 flex flex-wrap gap-2" aria-label="Today's chapters">
                  {s.today.map((c) => {
                    const read = completed.has(c);
                    return (
                      <li key={c}>
                        <Link
                          href={href(c)}
                          className={`inline-block rounded-lg border px-3 py-1.5 text-sm transition ${
                            read ? "border-accent bg-accent-soft text-accent" : "border-line hover:border-ink"
                          }`}
                        >
                          {read && "✓ "}
                          {label(c)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-muted">
                {s.done} of {s.total} chapters
              </span>
              {s.behind > 0 && (
                <span className="text-accent">
                  {s.behind} chapter{s.behind === 1 ? "" : "s"} behind
                </span>
              )}
              {s.nextUnread && (
                <Link href={href(s.nextUnread)} className="font-medium text-accent hover:underline">
                  Continue with {label(s.nextUnread)} →
                </Link>
              )}
              <span className="flex-1" />
              {confirmStop === p.key ? (
                <span className="flex gap-2">
                  <button onClick={() => stop(p.key)} className="text-accent">
                    Stop plan
                  </button>
                  <button onClick={() => setConfirmStop(null)} className="text-muted">
                    Keep
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmStop(p.key)} className="text-muted hover:text-ink">
                  Stop…
                </button>
              )}
            </div>
          </section>
        );
      })}

      {available.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-widest text-muted uppercase">
            {active.length ? "Start another" : "Choose a plan"}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {available.map((p) => (
              <li key={p.key} className="flex flex-col rounded-xl border border-line p-4">
                <p className="font-medium">{p.name}</p>
                <p className="mb-3 flex-1 text-sm text-muted">{p.description}</p>
                <button
                  onClick={() => start(p.key)}
                  className="self-start rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90"
                  aria-label={`Start ${p.name}`}
                >
                  Start today
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
