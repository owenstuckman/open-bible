export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper p-8 text-center shadow-sm">
        <p className="font-serif text-2xl font-semibold text-accent">✝ Open Bible</p>
        {children}
      </div>
    </main>
  );
}

export const buttonClass =
  "w-full rounded-lg bg-ink px-4 py-2.5 font-medium text-paper transition hover:opacity-90 disabled:opacity-50";
export const inputClass =
  "w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none focus:border-accent";
