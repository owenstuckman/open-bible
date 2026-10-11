import Link from "next/link";
import { PlansView } from "@/components/plans/PlansView";

export const metadata = { title: "Reading plans · Open Bible" };

export default function PlansPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Back to reading
      </Link>
      <h1 className="mt-4 mb-2 font-serif text-3xl font-semibold">Reading plans</h1>
      <p className="mb-8 text-sm text-muted">
        A plan spreads a stretch of the Bible over a set number of days. Any chapter you finish, by reading it or by
        marking it read, counts toward every plan that includes it.
      </p>
      <PlansView />
    </main>
  );
}
